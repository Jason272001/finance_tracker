"""Validated imports reuse normal authorization and keep external references idempotent."""
import csv
import hashlib
import io
import json
from datetime import datetime
from sqlalchemy import Table, Column, String, Integer, BigInteger, Text, UniqueConstraint, update
from backend.business_operations import metadata, branches, staff, roles, devices, device_codes, sessions, punches, products, identity, clean, whole, row, rows, OperationsError
from backend import business_inventory as inventory

links = Table('ops_import_links', metadata, Column('id', String(32), primary_key=True),
    Column('business', Integer, nullable=False), Column('kind', String(30), nullable=False),
    Column('external_ref', String(120), nullable=False), Column('record', String(32), nullable=False),
    Column('payload_hash', String(64), nullable=False),
    UniqueConstraint('business', 'kind', 'external_ref', name='ops_import_external_reference'))
history = Table('ops_imported_history', metadata, Column('id', String(32), primary_key=True),
    Column('business', Integer, nullable=False), Column('branch', String(32), nullable=False),
    Column('kind', String(30), nullable=False), Column('external_ref', String(120), nullable=False),
    Column('data', Text, nullable=False), Column('imported_by', String(80), nullable=False),
    Column('created', BigInteger, nullable=False))
PERMISSIONS = {'products':'products','category':'products','brand':'products','supplier':'products','location':'products',
               'extras':'products','purchases':'products','stock_movements':'products','stock_counts':'products','staff':'staff','devices':'devices',
               'schedules':'schedules','timesheets':'timesheets','sales':'reports','login_events':'audit',
               'roles':None,'branches':None}


def boolean(value, default=False):
    if value in ('', None):
        return default
    if str(value).strip().lower() in {'true','yes','1'}:
        return True
    if str(value).strip().lower() in {'false','no','0'}:
        return False
    raise OperationsError('Use true/false for permission and active columns.')


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z','+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        return int(parsed.timestamp())
    except (ValueError, OverflowError):
        raise OperationsError('Use an ISO timestamp including a UTC offset, for example 2026-10-20T16:00:00Z.')


def apply(c, business, kind, incoming, target_branch, scope, granted, owner, actor, now, act):
    if kind not in PERMISSIONS:
        raise OperationsError('Choose a supported import table.')
    required = PERMISSIONS[kind]
    if required is None and not owner or required and required not in granted:
        raise OperationsError('Your role cannot import this table.', 403)
    if not isinstance(incoming, list) or not 1 <= len(incoming) <= 100 or any(not isinstance(r, dict) for r in incoming):
        raise OperationsError('Upload 1–100 rows at a time.')
    records = [{str(k).strip().lower(): str(v).strip() if v is not None else '' for k,v in r.items()} for r in incoming]

    def branch_for(r):
        name = r.get('branch','')
        found = row(c, branches, (branches.c.business == business) & ((branches.c.name == name) if name else (branches.c.id == target_branch)))
        if not found or scope and found['id'] != scope:
            raise OperationsError('Choose an existing branch you can manage, or import branches first.', 403)
        return found['id']

    def person_for(r):
        found = row(c, staff, (staff.c.business == business) & (staff.c.code == r.get('staff_id',''))) if r.get('staff_id') else None
        if not found and r.get('staff_ref'):
            linked = row(c, links, (links.c.business == business) & (links.c.kind == 'staff') & (links.c.external_ref == r['staff_ref']))
            found = row(c, staff, staff.c.id == linked['record']) if linked else None
        if not found or scope and found['branch'] != scope:
            raise OperationsError('Import the referenced staff member first, or use an existing staff ID.', 403)
        return found

    if kind in {'products','category','brand','supplier','location','extras','purchases'}:
        normalized_branch = branch_for({})
        output = io.StringIO()
        headers = list(dict.fromkeys(key for r in records for key in r))
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader(); writer.writerows(records)
        return inventory.import_csv(c, business, {'kind':kind,'branch':normalized_branch,'csv':output.getvalue()}, scope, actor, now)

    changed, skipped, seen = 0, 0, set()
    for number, r in enumerate(records, 2):
        try:
            ref = clean(r.get('external_ref') or r.get('name') or r.get('invoice'), 120)
            if ref in seen:
                raise OperationsError('Duplicate external_ref in this file.')
            seen.add(ref)
            if any(len(value)>1000 for value in r.values()):
                raise OperationsError('A cell exceeds 1000 characters.')
            digest = hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()
            previous = row(c, links, (links.c.business == business) & (links.c.kind == kind) & (links.c.external_ref == ref))
            if previous and previous['payload_hash'] == digest:
                skipped += 1
                continue
            existing_id = previous['record'] if previous else ''
            if kind == 'branches':
                existing = row(c, branches, (branches.c.business == business) & (branches.c.name == r.get('name')))
                result = {'id':existing_id or existing['id']} if existing_id or existing else act('branch',{'name':r.get('name')})
                if existing_id:
                    c.execute(update(branches).where((branches.c.id==existing_id)&(branches.c.business==business)).values(name=clean(r.get('name'),80)))
            elif kind == 'roles':
                from backend.business_operations import PERMISSION_LABELS
                selected = row(c, roles, (roles.c.business == business) & (roles.c.name_key == r.get('name','').casefold()))
                result = act('role',{'id':existing_id or (selected['id'] if selected else ''),'name':r.get('name'), 'permissions':[key for key in PERMISSION_LABELS if boolean(r.get(key))]})
            elif kind == 'staff':
                selected = row(c, roles, (roles.c.business == business) & (roles.c.name_key == r.get('role','Team member').casefold()))
                if not selected:
                    raise OperationsError('Import or create the named role first.')
                result = act('staff',{'id':existing_id,'name':r.get('name'),'branch':branch_for(r),'role_id':selected['id'],
                    'credential':r.get('pin',''),'active':boolean(r.get('active'),True),'hourly_cents':inventory.money(r.get('hourly_rate') or 0)})
            elif kind == 'devices':
                if r.get('device_code') or r.get('token'):
                    raise OperationsError('Leave device codes and tokens blank. The system generates connection codes.')
                branch = branch_for(r)
                if not existing_id:
                    result = act('enroll_device',{'name':r.get('name'),'branch':branch,'mode':r.get('mode')})
                else:
                    d = row(c, devices, (devices.c.id == existing_id) & (devices.c.business == business))
                    saved=row(c,device_codes,device_codes.c.device==existing_id)
                    if not d or saved and saved['deleted'] or scope and d['branch'] != scope:
                        raise OperationsError('The referenced device is not available.',403)
                    if r.get('mode') not in {'cashier','kitchen','clock','office'}:
                        raise OperationsError('Choose a valid station mode.')
                    changed=d['branch'] != branch or d['mode'] != r.get('mode')
                    c.execute(update(devices).where(devices.c.id == d['id']).values(name=clean(r.get('name'),80),branch=branch,mode=r.get('mode'),token=None if changed else d['token']))
                    if changed:
                        c.execute(sessions.delete().where(sessions.c.device==d['id']))
                        act('renew_device',{'id':d['id']})
                    result = {'id':d['id']}
            elif kind == 'schedules':
                person = person_for(r)
                if existing_id:
                    act('cancel_schedule',{'id':existing_id})
                result = act('schedule',{'staff':person['id'],'start':timestamp(r.get('start')),'end':timestamp(r.get('end'))})
            elif kind == 'timesheets':
                old = row(c,punches,(punches.c.id==existing_id)&(punches.c.business==business)) if existing_id else None
                if existing_id and (not old or scope and old['branch']!=scope):
                    raise OperationsError('This timesheet belongs to another branch.',403)
                person = person_for(r)
                start,end = timestamp(r.get('start')),timestamp(r.get('end'))
                if start >= end or end > now:
                    raise OperationsError('Historical clock-out must follow clock-in and cannot be in the future.')
                overlap = row(c,punches,(punches.c.staff==person['id']) & (punches.c.id!=existing_id) & (punches.c.start<end) & ((punches.c.end>start) | punches.c.end.is_(None)))
                if overlap:
                    raise OperationsError('This interval overlaps an existing timesheet.',409)
                record=dict(id=existing_id or identity(),business=business,branch=person['branch'],staff=person['id'],name=person['name'],device='historical-import',start=start,end=end,hourly_cents=inventory.money(r.get('hourly_rate') or person['hourly_cents']/100),closed_by=actor,adjustment_note='Imported historical interval: '+ref[:120])
                c.execute(update(punches).where(punches.c.id==existing_id).values(**record) if existing_id else punches.insert().values(**record))
                result={'id':record['id']}
            elif kind in {'stock_movements','stock_counts'}:
                if previous:
                    raise OperationsError('Stock movements cannot be rewritten. Use a new reference for a correction.')
                branch=branch_for(r)
                p=row(c,products,(products.c.business==business)&(products.c.branch==branch)&(products.c.sku==r.get('product_sku')))
                if not p:
                    raise OperationsError('Import the referenced product first.')
                location=inventory.master(c,business,'location',r.get('location') or 'Main storage',branch)
                inventory.ensure_balance(c,p)
                balance=row(c,inventory.balances,(inventory.balances.c.product==p['id'])&(inventory.balances.c.location==location))
                quantity=whole(int(r.get('counted_quantity') or 0),0,1000000)-(balance['quantity'] if balance else 0) if kind=='stock_counts' else int(r.get('quantity','0'))
                if kind=='stock_movements' and not quantity or abs(quantity)>1000000 or not 0 <= p['stock']+quantity <= 1000000:
                    raise OperationsError('Use a nonzero stock change that does not make inventory negative.')
                location=inventory.master(c,business,'location',r.get('location') or 'Main storage',branch)
                inventory.ensure_balance(c,p)
                inventory.move(c,p,location,quantity,'csv_count' if kind=='stock_counts' else 'csv_adjustment',ref,actor,now)
                c.execute(update(products).where(products.c.id==p['id']).values(stock=products.c.stock+quantity))
                result={'id':ref[:32]}
            else:
                # Uploaded audit/sales history is explicitly marked reference data.
                if any(r.get(k) for k in ['pin','password','token','auth_token','device_code']):
                    raise OperationsError('Do not import PINs or authorization tokens into history files.')
                if kind=='sales':
                    subtotal,tax,total=inventory.money(r.get('subtotal')),inventory.money(r.get('tax') or 0),inventory.money(r.get('total'))
                    if subtotal+tax!=total:
                        raise OperationsError('Sales total must equal subtotal plus tax.')
                else:
                    timestamp(r.get('timestamp'))
                branch=branch_for(r)
                old = row(c,history,(history.c.id==existing_id)&(history.c.business==business)) if existing_id else None
                if existing_id and (not old or scope and old['branch']!=scope):
                    raise OperationsError('This history belongs to another branch.',403)
                record=dict(id=existing_id or identity(),business=business,branch=branch,kind=kind,external_ref=ref,data=json.dumps(r),imported_by=actor,created=int(now))
                c.execute(update(history).where(history.c.id==existing_id).values(**record) if existing_id else history.insert().values(**record))
                result={'id':record['id']}
            record=dict(id=previous['id'] if previous else identity(),business=business,kind=kind,external_ref=ref,record=result['id'],payload_hash=digest)
            c.execute(update(links).where(links.c.id==record['id']).values(**record) if previous else links.insert().values(**record))
            changed += 1
        except (ValueError,TypeError,OperationsError) as error:
            raise OperationsError(f'Import row {number}: {error}',getattr(error,'status',400)) from error
    return {'imported':changed,'unchanged':skipped}
