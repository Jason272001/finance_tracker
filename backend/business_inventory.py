"""Catalog, supplier receiving and bin movements; shares the operations transaction."""
import csv
import io
import json
from decimal import Decimal, InvalidOperation
from sqlalchemy import Table, Column, String, Integer, BigInteger, Boolean, Text, UniqueConstraint, select, update
from backend.business_operations import metadata, products, identity, clean, whole, row, rows, OperationsError

masters = Table('ops_inventory_masters', metadata,
    Column('id', String(32), primary_key=True), Column('business', Integer, nullable=False),
    Column('kind', String(16), nullable=False), Column('branch', String(32), nullable=False, default=''),
    Column('name', String(120), nullable=False), Column('name_key', String(240), nullable=False),
    Column('contact', String(200), nullable=False, default=''), Column('notes', String(500), nullable=False, default=''),
    UniqueConstraint('business', 'kind', 'branch', 'name_key', name='ops_inventory_master_name'))
details = Table('ops_product_details', metadata, Column('product', String(32), primary_key=True),
    Column('business', Integer, nullable=False), Column('brand', String(32), nullable=False, default=''),
    Column('supplier', String(32), nullable=False, default=''), Column('description', String(500), nullable=False, default=''),
    Column('barcode', String(60), nullable=False, default=''), Column('cost_cents', Integer, nullable=False, default=0),
    Column('reorder_point', Integer, nullable=False, default=0))
balances = Table('ops_stock_balances', metadata, Column('product', String(32), primary_key=True),
    Column('location', String(32), primary_key=True), Column('business', Integer, nullable=False),
    Column('branch', String(32), nullable=False), Column('quantity', Integer, nullable=False))
movements = Table('ops_stock_movements', metadata, Column('id', String(32), primary_key=True),
    Column('business', Integer, nullable=False), Column('branch', String(32), nullable=False),
    Column('product', String(32), nullable=False), Column('location', String(32), nullable=False),
    Column('quantity', Integer, nullable=False), Column('reason', String(40), nullable=False),
    Column('reference', String(80), nullable=False), Column('actor', String(80), nullable=False),
    Column('created', BigInteger, nullable=False))
receipts = Table('ops_supplier_receipts', metadata, Column('id', String(32), primary_key=True),
    Column('business', Integer, nullable=False), Column('branch', String(32), nullable=False),
    Column('supplier', String(32), nullable=False), Column('invoice', String(80), nullable=False),
    Column('items', Text, nullable=False), Column('total_cents', BigInteger, nullable=False),
    Column('actor', String(80), nullable=False), Column('created', BigInteger, nullable=False),
    UniqueConstraint('business', 'branch', 'supplier', 'invoice', name='ops_received_supplier_invoice'))
extras = Table('ops_product_extras', metadata, Column('id', String(32), primary_key=True),
    Column('business', Integer, nullable=False), Column('product', String(32), nullable=False),
    Column('name', String(80), nullable=False), Column('price_cents', Integer, nullable=False),
    Column('active', Boolean, nullable=False),
    UniqueConstraint('product', 'name', name='ops_product_extra_name'))


def money(value):
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number < 0 or number > 1000000 or number.as_tuple().exponent < -2:
            raise ValueError()
        return int(number * 100)
    except (InvalidOperation, ValueError):
        raise OperationsError('Use a nonnegative amount with at most two decimal places.')


def master(c, business, kind, name, branch='', contact=None, notes=None):
    if kind not in {'supplier', 'brand', 'category', 'location'}:
        raise OperationsError('Choose supplier, brand, category or storage location.')
    name = clean(name)
    existing = row(c, masters, (masters.c.business == business) & (masters.c.kind == kind) & (masters.c.branch == branch) & (masters.c.name_key == name.casefold()))
    record = dict(id=existing['id'] if existing else identity(), business=business, kind=kind, branch=branch,
                  name=name, name_key=name.casefold(), contact=(existing.get('contact','') if existing and contact is None else str(contact or ''))[:200], notes=(existing.get('notes','') if existing and notes is None else str(notes or ''))[:500])
    c.execute(update(masters).where(masters.c.id == record['id']).values(**record) if existing else masters.insert().values(**record))
    return record['id']


def check_master(c, business, key, kind, branch=None):
    record = row(c, masters, (masters.c.id == key) & (masters.c.business == business) & (masters.c.kind == kind))
    if not record or branch is not None and record['branch'] != branch:
        raise OperationsError('Choose a valid ' + kind + ' for this business and branch.', 403)
    return record


def product(c, business, key, scope=None):
    record = row(c, products, (products.c.id == key) & (products.c.business == business))
    if not record or scope and record['branch'] != scope:
        raise OperationsError('Choose a product from a branch you can manage.', 403)
    return record


def ensure_balance(c, p, opening=None):
    existing = rows(c, balances, balances.c.product == p['id'])
    location = master(c, p['business'], 'location', 'Main storage', p['branch'])
    if not existing:
        c.execute(balances.insert().values(product=p['id'], location=location, business=p['business'], branch=p['branch'], quantity=p['stock'] if opening is None else opening))
    return location


def move(c, p, location, quantity, reason, reference, actor, now):
    current = row(c, balances, (balances.c.product == p['id']) & (balances.c.location == location))
    old = current['quantity'] if current else 0
    if old + quantity < 0:
        raise OperationsError('This storage location does not have enough stock.', 409)
    if current:
        c.execute(update(balances).where((balances.c.product == p['id']) & (balances.c.location == location)).values(quantity=old + quantity))
    else:
        c.execute(balances.insert().values(product=p['id'], location=location, business=p['business'], branch=p['branch'], quantity=quantity))
    c.execute(movements.insert().values(id=identity(), business=p['business'], branch=p['branch'], product=p['id'], location=location, quantity=quantity, reason=reason, reference=reference, actor=actor, created=int(now)))


def consume(c, p, quantity, actor, now, reference, reason='sale'):
    ensure_balance(c, p)
    for balance in sorted(rows(c, balances, balances.c.product == p['id']), key=lambda r: r['location']):
        take = min(quantity, balance['quantity'])
        if take:
            move(c, p, balance['location'], -take, reason, reference, actor, now)
            quantity -= take
    if quantity:
        raise OperationsError('Stored inventory does not reconcile. Review stock counts.', 409)


def save_product(c, p, values, old_stock, actor, now):
    ensure_balance(c, p, old_stock)
    difference = p['stock'] - old_stock
    if difference < 0:
        consume(c, p, -difference, actor, now, p['id'], 'stock_count')
    elif difference:
        move(c, p, ensure_balance(c, p), difference, 'opening_stock' if old_stock == 0 else 'stock_count', p['id'], actor, now)
    previous = row(c, details, details.c.product == p['id']) or {}
    record = {k: values.get(k, previous.get(k, default)) for k, default in [('brand', ''), ('supplier', ''), ('description', ''), ('barcode', ''), ('cost_cents', 0), ('reorder_point', 0)]}
    for key in ['brand', 'supplier']:
        if record[key]:
            check_master(c, p['business'], record[key], key)
    record.update(description=str(record['description'])[:500], barcode=str(record['barcode'])[:60], cost_cents=whole(record['cost_cents']), reorder_point=whole(record['reorder_point'], 0, 1000000), product=p['id'], business=p['business'])
    c.execute(update(details).where(details.c.product == p['id']).values(**record) if previous else details.insert().values(**record))
    master(c, p['business'], 'category', p['category'])


def restore_sale(c, order, actor, now):
    found = rows(c, movements, (movements.c.business == order['business']) & (movements.c.reference == order['id']) & (movements.c.reason == 'sale'))
    if found:
        for item in found:
            p = product(c, order['business'], item['product'])
            move(c, p, item['location'], -item['quantity'], 'sale_void', order['id'], actor, now)
    else:
        for line in json.loads(order['items']):
            p = product(c, order['business'], line['id'])
            move(c, p, ensure_balance(c, p), line['quantity'], 'sale_void', order['id'], actor, now)


def catalog(c, items):
    for p in items:
        info = row(c, details, details.c.product == p['id']) or {}
        p.update({k: info.get(k, '') for k in ['description', 'barcode', 'brand']})
        p['extras'] = rows(c, extras, (extras.c.product == p['id']) & extras.c.active.is_(True))
    return items


def snapshot(c, business, scope=None):
    scoped = lambda table: (table.c.business == business) & (table.c.branch == scope) if scope else table.c.business == business
    return {'masters': [r for r in rows(c, masters, masters.c.business == business) if not r['branch'] or not scope or r['branch'] == scope],
            'details': [r for r in rows(c, details, details.c.business == business) if not scope or product(c, business, r['product'])['branch'] == scope],
            'balances': rows(c, balances, scoped(balances)), 'movements': sorted(rows(c, movements, scoped(movements)), key=lambda r: r['created'], reverse=True)[:500],
            'receipts': [{**r, 'items': json.loads(r['items'])} for r in rows(c, receipts, scoped(receipts))],
            'extras': [r for r in rows(c, extras, extras.c.business == business) if not scope or product(c, business, r['product'])['branch'] == scope]}


def handle(c, business, action, values, scope, actor, now):
    if action == 'inventory_master':
        branch = values.get('branch', '') if values.get('kind') == 'location' else ''
        from backend.business_operations import branches
        if values.get('kind') == 'location' and not branch or branch and not row(c, branches, (branches.c.business == business) & (branches.c.id == branch)) or scope and branch and branch != scope:
            raise OperationsError('Choose an allowed branch.', 403)
        return {'id': master(c, business, values.get('kind'), values.get('name'), branch, values.get('contact', ''), values.get('notes', ''))}
    if action == 'inventory_extra':
        p = product(c, business, values.get('product'), scope)
        name = clean(values.get('name'), 80)
        existing = row(c, extras, (extras.c.product == p['id']) & (extras.c.name == name))
        record = dict(id=existing['id'] if existing else identity(), business=business, product=p['id'], name=name, price_cents=whole(values.get('price_cents')), active=values.get('active', True))
        if not isinstance(record['active'], bool):
            raise OperationsError('Extra active status must be true or false.')
        c.execute(update(extras).where(extras.c.id == record['id']).values(**record) if existing else extras.insert().values(**record))
        return {'id': record['id']}
    if action == 'inventory_transfer':
        p = product(c, business, values.get('product'), scope)
        source, target = values.get('source'), values.get('target')
        for key in [source, target]:
            check_master(c, business, key, 'location', p['branch'])
        if source == target:
            raise OperationsError('Choose different storage locations.')
        quantity = whole(values.get('quantity'), 1, 1000000)
        ensure_balance(c, p)
        reference = identity()
        move(c, p, source, -quantity, 'transfer_out', reference, actor, now)
        move(c, p, target, quantity, 'transfer_in', reference, actor, now)
        return {'id': reference}
    if action == 'inventory_receive':
        supplier = check_master(c, business, values.get('supplier'), 'supplier')
        invoice = clean(values.get('invoice'), 80)
        lines = values.get('items', [])
        if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
            raise OperationsError('Add 1–100 received product lines.')
        found, branch, total = [], None, 0
        for line in lines:
            p = product(c, business, line.get('product'), scope)
            if branch and branch != p['branch']:
                raise OperationsError('Receive one branch per purchase.')
            branch = p['branch']
            location = line.get('location') or ensure_balance(c, p)
            check_master(c, business, location, 'location', branch)
            quantity, cost = whole(line.get('quantity'), 1, 1000000), whole(line.get('cost_cents'))
            found.append({'product': p['id'], 'name': p['name'], 'sku': p['sku'], 'location': location, 'quantity': quantity, 'cost_cents': cost})
            total += quantity * cost
        if row(c, receipts, (receipts.c.business == business) & (receipts.c.branch == branch) & (receipts.c.supplier == supplier['id']) & (receipts.c.invoice == invoice)):
            raise OperationsError('This supplier invoice was already received.', 409)
        totals = {}
        for line in found:
            totals[line['product']] = totals.get(line['product'], 0) + line['quantity']
        for key, quantity in totals.items():
            if product(c, business, key)['stock'] + quantity > 1000000:
                raise OperationsError('Receiving would exceed the supported stock count.')
        if total > 9007199254740991:
            raise OperationsError('The purchase total is too large.')
        rid = identity()
        for line in found:
            p = product(c, business, line['product'], scope)
            ensure_balance(c, p)
            move(c, p, line['location'], line['quantity'], 'supplier_receipt', rid, actor, now)
            c.execute(update(products).where(products.c.id == p['id']).values(stock=products.c.stock + line['quantity']))
        c.execute(receipts.insert().values(id=rid, business=business, branch=branch, supplier=supplier['id'], invoice=invoice, items=json.dumps(found), total_cents=total, actor=actor, created=int(now)))
        return {'id': rid, 'total_cents': total}
    if action == 'inventory_import':
        return import_csv(c, business, values, scope, actor, now)
    raise OperationsError('Unknown inventory action.')


def import_csv(c, business, values, scope, actor, now):
    from backend.business_operations import branches
    branch = values.get('branch')
    if not row(c, branches, (branches.c.business == business) & (branches.c.id == branch)) or scope and scope != branch:
        raise OperationsError('Choose an allowed target branch.', 403)
    source = values.get('csv', '')
    if not isinstance(source, str) or len(source.encode('utf-8')) > 50000:
        raise OperationsError('Import a CSV smaller than 50 KB.')
    try:
        reader = csv.DictReader(io.StringIO(source.lstrip('\ufeff')), strict=True)
        headers = [str(x).strip().lower() for x in (reader.fieldnames or [])]
        if len(headers) != len(set(headers)):
            raise OperationsError('CSV headers must be unique.')
        records = list(reader)
    except csv.Error as error:
        raise OperationsError('Malformed CSV: '+str(error)) from error
    if not 1 <= len(records) <= 100:
        raise OperationsError('Import 1–100 rows at a time.')
    kind = values.get('kind')
    if kind == 'purchases':
        grouped = {}
        for number, r in enumerate(records, 2):
            try:
                quantity = whole(int(r.get('quantity') or 0), 1, 1000000)
                cost = money(r.get('cost') or 0)
            except (ValueError, TypeError, OperationsError) as error:
                raise OperationsError(f'CSV row {number}: {error}') from error
            key = (r.get('supplier','').strip(), r.get('invoice','').strip())
            supplier_id = master(c,business,'supplier',key[0])
            p = row(c,products,(products.c.business==business)&(products.c.branch==branch)&(products.c.sku==r.get('product_sku')))
            if not p:
                raise OperationsError('Import the purchase product SKU first.')
            location = master(c,business,'location',r.get('location') or 'Main storage',branch)
            grouped.setdefault(key,{'supplier':supplier_id,'invoice':key[1],'items':[]})['items'].append({'product':p['id'],'location':location,'quantity':quantity,'cost_cents':cost})
        for receipt in grouped.values():
            handle(c,business,'inventory_receive',receipt,scope,actor,now)
        return {'imported':len(records),'receipts':len(grouped)}
    seen = set()
    for index, raw in enumerate(records, 2):
        if None in raw:
            raise OperationsError(f'CSV row {index} has too many columns.')
        r = {str(k).strip().lower(): v.strip() for k, v in raw.items() if k is not None and v is not None}
        try:
            if kind in {'supplier', 'brand', 'category', 'location'}:
                master(c, business, kind, r.get('name'), branch if kind == 'location' else '', r.get('contact', ''), r.get('notes', ''))
            elif kind == 'products':
                sku = clean(r.get('sku'), 60)
                if sku in seen:
                    raise OperationsError('Duplicate SKU in this file.')
                seen.add(sku)
                existing = row(c, products, (products.c.business == business) & (products.c.branch == branch) & (products.c.sku == sku))
                p = dict(id=existing['id'] if existing else identity(), business=business, branch=branch, sku=sku, name=clean(r.get('name')), category=clean(r.get('category') or 'Products', 80), price_cents=money(r.get('price')), stock=existing['stock'] if existing else whole(int(r.get('stock') or 0), 0, 1000000), active=True)
                if not p['price_cents']:
                    raise OperationsError('The selling price must be greater than zero.')
                c.execute(update(products).where(products.c.id == p['id']).values(**p) if existing else products.insert().values(**p))
                info = dict(description=r.get('description', ''), barcode=r.get('barcode', ''), cost_cents=money(r.get('cost') or 0), reorder_point=int(r.get('reorder_point') or 0))
                for key in ['brand', 'supplier']:
                    info[key] = master(c, business, key, r[key]) if r.get(key) else ''
                save_product(c, p, info, existing['stock'] if existing else 0, actor, now)
            elif kind == 'extras':
                p = row(c, products, (products.c.business == business) & (products.c.branch == branch) & (products.c.sku == r.get('product_sku')))
                if not p:
                    raise OperationsError('Import the referenced product SKU first.')
                handle(c, business, 'inventory_extra', {'product': p['id'], 'name': r.get('name'), 'price_cents': money(r.get('price') or 0)}, scope, actor, now)
            else:
                raise OperationsError('Choose a supported catalog import type.')
        except (ValueError, OperationsError) as error:
            raise OperationsError(f'CSV row {index}: {error}') from error
    return {'imported': len(records)}
