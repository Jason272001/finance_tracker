"""Optional tenant-scoped customer tables with validated JSONB fields and invited portal access."""
import math,re,secrets
from datetime import date,datetime
from sqlalchemy import Table,Column,String,Integer,BigInteger,Boolean,JSON,UniqueConstraint,select,update,delete,func
from sqlalchemy.dialects.postgresql import JSONB
from backend.business_operations import metadata,identity,clean,row,rows,whole,digest,password_hash,password_matches,OperationsError
from backend.business_imports import boolean

json_type=JSON().with_variant(JSONB(),'postgresql')
settings=Table('ops_customer_settings',metadata,Column('business',Integer,primary_key=True),Column('enabled',Boolean,nullable=False),Column('portal_enabled',Boolean,nullable=False))
tables=Table('ops_customer_tables',metadata,Column('id',String(32),primary_key=True),Column('business',Integer,nullable=False,index=True),Column('name',String(80),nullable=False),Column('name_key',String(80),nullable=False),Column('fields',json_type,nullable=False),Column('field_types',json_type,nullable=False),UniqueConstraint('business','name_key',name='ops_customer_table_name'))
records=Table('ops_customer_records',metadata,Column('id',String(32),primary_key=True),Column('business',Integer,nullable=False,index=True),Column('collection',String(32),nullable=False),Column('branch',String(32),nullable=False),Column('external_ref',String(120),nullable=False),Column('name',String(120),nullable=False),Column('email',String(254),nullable=False),Column('phone',String(40),nullable=False),Column('data',json_type,nullable=False),Column('active',Boolean,nullable=False),Column('created',BigInteger,nullable=False),Column('updated',BigInteger,nullable=False),UniqueConstraint('business','collection','external_ref',name='ops_customer_external_ref'))
accounts=Table('ops_customer_accounts',metadata,Column('customer',String(32),primary_key=True),Column('business',Integer,nullable=False),Column('email',String(254),nullable=False),Column('password',String(180),nullable=False),UniqueConstraint('business','email',name='ops_customer_login_email'))
invites=Table('ops_customer_invites',metadata,Column('token',String(64),primary_key=True),Column('business',Integer,nullable=False),Column('customer',String(32),nullable=False),Column('expires',BigInteger,nullable=False),Column('email',String(254),nullable=False))
sessions=Table('ops_customer_sessions',metadata,Column('token',String(64),primary_key=True),Column('business',Integer,nullable=False),Column('customer',String(32),nullable=False),Column('expires',BigInteger,nullable=False))
_dummy=password_hash('unavailable-customer-account-check')
RESERVED={'id','name','email','phone','external_ref','active','branch','collection','business'}

def config(c,business):return row(c,settings,settings.c.business==business) or {'business':business,'enabled':False,'portal_enabled':False}
def enabled(c,business,portal=False):
    value=config(c,business)
    if not value['enabled'] or portal and not value['portal_enabled']:raise OperationsError('Customer access is disabled for this business.',404)
    return value

def email(value,required=False):
    value=str(value or '').strip().casefold()
    if (value or required) and (len(value)>254 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',value)):raise OperationsError('Enter a valid email address.')
    return value

def schema(incoming):
    if not isinstance(incoming,list) or len(incoming)>20:raise OperationsError('Define at most 20 custom fields per table.')
    result=[];seen=set()
    for field in incoming:
        if not isinstance(field,dict):raise OperationsError('Each field needs a key, label and type.')
        key=str(field.get('key','')).strip().lower()
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,39}',key) or key in seen or key in RESERVED:raise OperationsError('Field keys must be unique, start with a letter and use letters, numbers or underscores. Core fields are reserved.')
        seen.add(key);kind=field.get('type')
        if kind not in {'text','number','date','email','phone','boolean','select'}:raise OperationsError('Choose a supported field type.')
        options=field.get('options',[])
        if not isinstance(options,list) or len(options)>30 or any(not isinstance(v,str) or not v.strip() or len(v)>100 for v in options):raise OperationsError('Use at most 30 short choices.')
        if kind=='select' and not options:raise OperationsError('Choice fields need options.')
        result.append({'key':key,'label':clean(field.get('label'),80),'type':kind,'required':boolean(field.get('required'),False),'customer_visible':boolean(field.get('customer_visible'),False),'options':list(dict.fromkeys(options)) if kind=='select' else []})
    return result

def collection(c,business,key):
    found=row(c,tables,(tables.c.id==key)&(tables.c.business==business))
    if not found:raise OperationsError('Choose a customer table from this business.',403)
    return found

def validate_data(definition,incoming,previous):
    if not isinstance(incoming,dict):raise OperationsError('Custom values must be a field/value object.')
    fields={f['key']:f for f in definition}
    if set(incoming)-set(fields):raise OperationsError('A custom field is not defined in this table.')
    result={**previous}
    for key,field in fields.items():
        value=incoming.get(key,previous.get(key))
        if value in (None,''):
            if field['required']:raise OperationsError(field['label']+' is required.')
            result[key]=None;continue
        kind=field['type']
        if kind=='boolean':value=boolean(value)
        elif kind=='number':
            if isinstance(value,bool):raise OperationsError(field['label']+' needs a number.')
            try:value=float(value)
            except (TypeError,ValueError):raise OperationsError(field['label']+' needs a number.')
            if not math.isfinite(value) or abs(value)>1e12:raise OperationsError('Use a finite number within the supported range.')
        else:
            if isinstance(value,(list,dict)):raise OperationsError('Use a single value for '+field['label']+'.')
            value=str(value).strip()
            if len(value)>1000:raise OperationsError('Custom values are limited to 1000 characters.')
            if kind=='date':
                try:value=(date.fromisoformat(value) if len(value)==10 else datetime.fromisoformat(value.replace('Z','+00:00')).date()).isoformat()
                except ValueError:raise OperationsError('Use YYYY-MM-DD for '+field['label']+'.')
            elif kind=='email':value=email(value)
            elif kind=='select' and value not in field['options']:raise OperationsError('Choose a configured value for '+field['label']+'.')
            elif kind=='phone' and len(value)>40:raise OperationsError('Phone values are limited to 40 characters.')
        result[key]=value
    return result

def snapshot(c,business,scope,permitted):
    value=config(c,business)
    if not value['enabled'] or not permitted:return {**value,'tables':[],'records':[]}
    definitions=rows(c,tables,tables.c.business==business)
    condition=(records.c.business==business)&((records.c.branch==scope) if scope else True)
    found=[dict(r) for r in c.execute(select(records).where(condition).order_by(records.c.updated.desc()).limit(1000)).mappings()]
    account_ids={a['customer'] for a in rows(c,accounts,accounts.c.business==business)}
    for record in found:record['has_login']=record['id'] in account_ids
    return {**value,'tables':definitions,'records':found,'display_limit':1000,'total':c.execute(select(func.count()).select_from(records).where(condition)).scalar_one()}

def save_record(c,business,values,scope,now):
    enabled(c,business);table=collection(c,business,values.get('collection'));ref=str(values.get('external_ref') or values.get('id') or identity()).strip();clean(ref,120)
    old=row(c,records,(records.c.id==values.get('id'))&(records.c.business==business)) if values.get('id') else row(c,records,(records.c.business==business)&(records.c.collection==table['id'])&(records.c.external_ref==ref))
    if values.get('id') and not old:raise OperationsError('Choose an existing customer in this business.',403)
    if old and (old['collection']!=table['id'] or scope and old['branch']!=scope):raise OperationsError('Customer belongs to another table or branch.',403)
    branch=values.get('branch',old['branch'] if old else scope or '')
    if scope and branch!=scope:raise OperationsError('Choose your assigned branch.',403)
    if branch:
        from backend.business_operations import branches
        if not row(c,branches,(branches.c.id==branch)&(branches.c.business==business)):raise OperationsError('Choose a branch from this business.',403)
    active=boolean(values.get('active'),old['active'] if old else True)
    phone=str(values.get('phone',old['phone'] if old else '') or '').strip()
    if len(phone)>40:raise OperationsError('Phone values are limited to 40 characters.')
    record=dict(id=old['id'] if old else identity(),business=business,collection=table['id'],branch=branch,external_ref=old['external_ref'] if old else ref,name=clean(values.get('name')),email=email(values.get('email',old['email'] if old else '')),phone=phone,data=validate_data(table['fields'],values.get('data',{}),old['data'] if old else {}),active=active,created=old['created'] if old else int(now),updated=int(now))
    c.execute(update(records).where(records.c.id==record['id']).values(**record) if old else records.insert().values(**record))
    if old and old['email'] != record['email']:
        c.execute(delete(accounts).where((accounts.c.business==business)&(accounts.c.customer==record['id'])))
    if not active or old and old['email'] != record['email']:
        for table_ in [sessions,invites]:c.execute(delete(table_).where((table_.c.business==business)&(table_.c.customer==record['id'])))
    return {'id':record['id']}

def handle(c,business,action,values,scope,owner,now):
    if action=='customers_config':
        if not owner:raise OperationsError('Only the owner can enable customer features.',403)
        value=dict(business=business,enabled=boolean(values.get('enabled')),portal_enabled=boolean(values.get('portal_enabled')))
        if not value['enabled']:value['portal_enabled']=False
        c.execute(update(settings).where(settings.c.business==business).values(**value) if row(c,settings,settings.c.business==business) else settings.insert().values(**value))
        if not value['portal_enabled']:
            for table_ in [sessions,invites]:c.execute(delete(table_).where(table_.c.business==business))
        if value['enabled'] and not row(c,tables,tables.c.business==business):c.execute(tables.insert().values(id=identity(),business=business,name='Customers',name_key='customers',fields=[],field_types={}))
        return value
    enabled(c,business)
    if action=='customer_table':
        if not owner:raise OperationsError('Only the owner can define customer tables and fields.',403)
        old=collection(c,business,values['id']) if values.get('id') else None
        name=clean(values.get('name'),80);fields=schema(values.get('fields',[]))
        duplicate=row(c,tables,(tables.c.business==business)&(tables.c.name_key==name.casefold()))
        if duplicate and (not old or duplicate['id']!=old['id']):raise OperationsError('A table with this name already exists.',409)
        if not old and len(rows(c,tables,tables.c.business==business))>=20:raise OperationsError('Use at most 20 customer tables.')
        if old and row(c,records,records.c.collection==old['id']):
            previous=old['field_types']
            if any(f['key'] in previous and f['type']!=previous[f['key']] for f in fields):raise OperationsError('Existing field types cannot change while records exist. Add a new field instead.')
        value=dict(id=old['id'] if old else identity(),business=business,name=name,name_key=name.casefold(),fields=fields,field_types={**(old['field_types'] if old else {}),**{f['key']:f['type'] for f in fields}})
        c.execute(update(tables).where(tables.c.id==value['id']).values(**value) if old else tables.insert().values(**value));return {'id':value['id']}
    if action=='customer_record':return save_record(c,business,values,scope,now)
    if action=='customer_invite':
        if not owner:raise OperationsError('Only the owner can invite a customer to sign in.',403)
        enabled(c,business,True);person=row(c,records,(records.c.business==business)&(records.c.id==values.get('id'))&records.c.active.is_(True))
        if not person:raise OperationsError('Choose an active customer.',404)
        email(person['email'],True)
        existing=row(c,accounts,(accounts.c.business==business)&(accounts.c.email==person['email']))
        if existing and existing['customer']!=person['id']:raise OperationsError('This email already has a customer login.',409)
        token=secrets.token_urlsafe(32);c.execute(delete(invites).where((invites.c.business==business)&(invites.c.customer==person['id'])));c.execute(invites.insert().values(token=digest(token),business=business,customer=person['id'],expires=int(now)+1800,email=person['email']));return {'id':person['id'],'invite':token,'expires':int(now)+1800}
    raise OperationsError('Unknown customer action.')

def import_rows(c,business,incoming,collection_id,target_branch,scope,now):
    enabled(c,business);table=collection(c,business,collection_id)
    if not isinstance(incoming,list) or not 1<=len(incoming)<=100:raise OperationsError('Import 1–100 customer rows.')
    seen=set()
    for index,entry in enumerate(incoming,2):
        try:
            ref=clean(entry.get('external_ref'),120)
            if ref in seen:raise OperationsError('Duplicate external_ref in this file.')
            seen.add(ref);data={field['key']:entry[field['key']] for field in table['fields'] if field['key'] in entry}
            allowed=RESERVED|set(data)
            if set(entry)-allowed:raise OperationsError('Unknown column: '+', '.join(sorted(set(entry)-allowed)))
            save_record(c,business,{**entry,'collection':table['id'],'branch':target_branch or scope or '', 'data':data},scope,now)
        except OperationsError as error:raise OperationsError(f'Customer row {index}: {error}',error.status) from error
    return {'imported':len(incoming),'unchanged':0}

def portal(c,business,action,values,token,now):
    enabled(c,business,True)
    if action=='activate':
        invitation=row(c,invites,(invites.c.token==digest(values.get('invite','')))&(invites.c.business==business)&(invites.c.expires>now))
        person=row(c,records,(records.c.business==business)&(records.c.id==invitation['customer'])&records.c.active.is_(True)) if invitation else None
        if not person or invitation['email'] != person['email']:raise OperationsError('Invitation is invalid or expired.',401)
        password=values.get('password','')
        if not isinstance(password,str) or not password.strip() or not 12<=len(password)<=128:raise OperationsError('Customer passwords must contain 12–128 characters.')
        existing=row(c,accounts,(accounts.c.business==business)&(accounts.c.email==person['email']))
        if existing and existing['customer']!=person['id']:raise OperationsError('This email already has a customer login.',409)
        value=dict(customer=person['id'],business=business,email=person['email'],password=password_hash(password));c.execute(update(accounts).where(accounts.c.customer==person['id']).values(**value) if row(c,accounts,accounts.c.customer==person['id']) else accounts.insert().values(**value))
        for table_ in [sessions,invites]:c.execute(delete(table_).where((table_.c.business==business)&(table_.c.customer==person['id'])))
        return {'activated':True,'_customer':person['id']}
    if action=='login':
        account=row(c,accounts,(accounts.c.business==business)&(accounts.c.email==str(values.get('email','')).strip().casefold()))
        matched=password_matches(str(values.get('password','')),account['password'] if account else _dummy)
        person=row(c,records,(records.c.id==account['customer'])&(records.c.business==business)&records.c.active.is_(True)) if account else None
        if not matched or not person:raise OperationsError('Email or password is incorrect.',401)
        c.execute(delete(sessions).where((sessions.c.business==business)&(sessions.c.customer==person['id'])))
        secret=secrets.token_urlsafe(32);c.execute(sessions.insert().values(token=digest(secret),business=business,customer=person['id'],expires=int(now)+86400));return {'token':secret,'_customer':person['id']}
    session=row(c,sessions,(sessions.c.token==digest(token))&(sessions.c.business==business)&(sessions.c.expires>now))
    person=row(c,records,(records.c.id==session['customer'])&(records.c.business==business)&records.c.active.is_(True)) if session else None
    if not person:raise OperationsError('Customer sign-in is required.',401)
    if action=='logout':c.execute(delete(sessions).where(sessions.c.token==session['token']));return {'signed_out':True}
    if action=='me':
        table=collection(c,business,person['collection']);visible={f['key'] for f in table['fields'] if f['customer_visible']}
        return {'name':person['name'],'email':person['email'],'fields':[{**f,'value':person['data'].get(f['key'])} for f in table['fields'] if f['key'] in visible]}
    raise OperationsError('Unknown customer portal action.')
