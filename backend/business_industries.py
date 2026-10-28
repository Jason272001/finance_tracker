"""Industry-specific records share tenant identity and inventory, never cashier catalogs."""
from sqlalchemy import Table,Column,String,Integer,Boolean,UniqueConstraint,delete,update
from backend.business_operations import metadata,products,businesses,orders,identity,clean,whole,row,rows,OperationsError
from backend import business_inventory as inventory

settings=Table('ops_business_industries',metadata,Column('business',Integer,primary_key=True),Column('industry',String(16),nullable=False))
retail=Table('ops_retail_items',metadata,Column('product',String(32),primary_key=True),Column('business',Integer,nullable=False))
restaurant=Table('ops_restaurant_items',metadata,Column('product',String(32),primary_key=True),Column('business',Integer,nullable=False))
ingredients=Table('ops_restaurant_ingredients',metadata,Column('id',String(32),primary_key=True),Column('business',Integer,nullable=False),Column('product',String(32),nullable=False),Column('name',String(80),nullable=False),Column('extra_price_cents',Integer,nullable=False),Column('active',Boolean,nullable=False),UniqueConstraint('product','name',name='ops_menu_ingredient_name'))

def mode(c,business):
    found=row(c,settings,settings.c.business==business)
    return found['industry'] if found else 'unconfigured'

def product_kind(c,p):
    for kind,table in [('retail',retail),('restaurant',restaurant)]:
        if row(c,table,(table.c.product==p['id'])&(table.c.business==p['business'])):return kind
    return 'unclassified'

def register(c,p,values):
    selected=values.get('industry') or product_kind(c,p)
    if selected=='unclassified':
        description=str(values.get('description',''))
        if description.startswith('Fictional ') and 'retail' in description.lower():selected='retail'
        elif description.startswith('Fictional ') and 'menu item' in description.lower():selected='restaurant'
        else:selected=mode(c,p['business'])
    if selected in {'unclassified','unconfigured'}:return
    if selected not in {'retail','restaurant'}:raise OperationsError('Choose Retail or Restaurant for this product.')
    target,other=(retail,restaurant) if selected=='retail' else (restaurant,retail)
    c.execute(delete(other).where((other.c.product==p['id'])&(other.c.business==p['business'])))
    if not row(c,target,target.c.product==p['id']):c.execute(target.insert().values(product=p['id'],business=p['business']))

def set_mode(c,business,industry):
    if industry not in {'retail','restaurant'}:raise OperationsError('Choose Retail or Restaurant.')
    if industry=='retail' and row(c,orders,(orders.c.business==business)&(orders.c.kind=='restaurant')&(orders.c.status=='paid')&orders.c.ticket.in_(['queued','preparing','ready'])):
        raise OperationsError('Finish open kitchen tickets before switching to Retail.',409)
    existing=row(c,settings,settings.c.business==business)
    c.execute(update(settings).where(settings.c.business==business).values(industry=industry) if existing else settings.insert().values(business=business,industry=industry))
    for p in rows(c,products,products.c.business==business):
        info=row(c,inventory.details,inventory.details.c.product==p['id']) or {}
        register(c,p,info)
    return {'industry':industry}

def require_mode(c,business):
    selected=mode(c,business)
    if selected=='unconfigured':raise OperationsError('Ask the owner to choose Retail or Restaurant in Store settings before using checkout.',409)
    return selected

def enrich(c,items):
    if not items:return items
    ids=[p['id'] for p in items]
    retail_ids={r['product'] for r in rows(c,retail,retail.c.product.in_(ids))}
    restaurant_ids={r['product'] for r in rows(c,restaurant,restaurant.c.product.in_(ids))}
    options={}
    for record in rows(c,ingredients,ingredients.c.product.in_(ids)&ingredients.c.active.is_(True)):
        options.setdefault(record['product'],[]).append(record)
    for p in items:
        p['industry']='restaurant' if p['id'] in restaurant_ids else 'retail' if p['id'] in retail_ids else 'unclassified'
        p['ingredients']=options.get(p['id'],[]) if p['industry']=='restaurant' else []
    return items


def save_ingredient(c,business,values,scope):
    p=inventory.product(c,business,values.get('product'),scope)
    if product_kind(c,p)!='restaurant':raise OperationsError('Ingredient options belong to restaurant menu items.')
    name=clean(values.get('name'),80)
    found=row(c,ingredients,(ingredients.c.product==p['id'])&(ingredients.c.name==name))
    active=values.get('active',found['active'] if found else True)
    if not isinstance(active,bool):raise OperationsError('Active must be true or false.')
    record=dict(id=found['id'] if found else identity(),business=business,product=p['id'],name=name,extra_price_cents=whole(values.get('extra_price_cents',0),0,100000000),active=active)
    c.execute(update(ingredients).where(ingredients.c.id==record['id']).values(**record) if found else ingredients.insert().values(**record))
    return {'id':record['id']}

def selected_ingredients(c,p,incoming):
    if not isinstance(incoming,list) or len(incoming)>20:raise OperationsError('Choose at most 20 ingredient changes.')
    chosen=[];seen=set()
    for entry in incoming:
        if not isinstance(entry,dict) or set(entry)!={'id','choice'} or entry.get('choice') not in {'none','extra'} or not isinstance(entry.get('id'),str) or entry['id'] in seen:
            raise OperationsError('Choose one valid change for each ingredient.')
        seen.add(entry['id']);option=row(c,ingredients,(ingredients.c.id==entry['id'])&(ingredients.c.product==p['id'])&(ingredients.c.business==p['business'])&ingredients.c.active.is_(True))
        if not option:raise OperationsError('An ingredient option changed. Review the item.',409)
        chosen.append({'id':option['id'],'choice':entry['choice'],'name':('No ' if entry['choice']=='none' else 'Extra ')+option['name'],'price_cents':option['extra_price_cents'] if entry['choice']=='extra' else 0})
    return chosen
