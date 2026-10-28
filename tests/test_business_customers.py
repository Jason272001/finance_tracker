import os,unittest
from sqlalchemy import select
from test_business_operations import OperationsFixture
from backend.business_operations import OperationsError
from backend import business_customers as customers

class CustomerCases(OperationsFixture,unittest.TestCase):
    def enable(self,portal=False):
        self.owner('customers_config',enabled=True,portal_enabled=portal)
        return self.owner('snapshot')['customers']['tables'][0]['id']
    def person(self,table,**extra):
        return self.owner('customer_record',collection=table,name='Sample customer',email='person@example.test',data={},**extra)['id']
    def test_optional_custom_tables_validate_types_and_preserve_hidden_values(self):
        self.assertFalse(self.owner('snapshot')['customers']['enabled'])
        table=self.enable();fields=[{'key':'level','label':'Level','type':'select','options':['VIP','Standard'],'required':True},{'key':'budget','label':'Budget','type':'number'}]
        self.owner('customer_table',id=table,name='Members',fields=fields)
        person=self.owner('customer_record',collection=table,name='Member',email='',data={'level':'VIP','budget':'25.50'})['id']
        data=self.owner('snapshot')['customers']['records'][0];self.assertEqual(data['data']['budget'],25.5)
        with self.assertRaises(OperationsError):self.owner('customer_record',id=person,collection=table,name='Member',data={'level':'Unknown'})
        with self.assertRaises(OperationsError):self.owner('customer_table',id=table,name='Members',fields=[{'key':'level','label':'Level','type':'number'}])
        self.owner('customer_table',id=table,name='Members',fields=[fields[0]])
        self.owner('customer_record',id=person,collection=table,name='Member',data={'level':'Standard'})
        self.assertEqual(self.owner('snapshot')['customers']['records'][0]['data']['budget'],25.5)
    def test_customer_import_preview_rolls_back_and_bad_batch_is_atomic(self):
        table=self.enable();values={'kind':'customer_records','collection':table,'branch':self.branch,'rows':[{'external_ref':'A','name':'First','email':'one@example.test'}]}
        self.owner('import_preview',**values);self.assertEqual(self.owner('snapshot')['customers']['records'],[])
        self.owner('import_rows',**values);self.assertEqual(len(self.owner('snapshot')['customers']['records']),1)
        values['rows']=[{'external_ref':'B','name':'Second'},{'external_ref':'C','name':'Bad','email':'bad-address'}]
        with self.assertRaises(OperationsError):self.owner('import_rows',**values)
        self.assertEqual(len(self.owner('snapshot')['customers']['records']),1)
    def test_customer_records_and_table_ids_never_cross_businesses(self):
        table=self.enable();person=self.person(table)
        self.ops.setup(2,20,'Other','90000','987654');self.ops.admin(2,'customers_config',{'enabled':True},account_owner=20)
        for action,values in [('customer_record',{'id':person,'collection':table,'name':'Attack'}),('customer_table',{'id':table,'name':'Attack','fields':[]})]:
            with self.assertRaises(OperationsError):self.ops.admin(2,action,values,account_owner=20)
    def test_private_invitation_one_time_signin_and_only_visible_fields_return(self):
        table=self.enable(True);self.owner('customer_table',id=table,name='Customers',fields=[{'key':'favorite','label':'Favorite','type':'text','customer_visible':True},{'key':'internal','label':'Internal','type':'text'}])
        person=self.owner('customer_record',collection=table,name='Member',email='member@example.test',data={'favorite':'Coffee','internal':'Private staff note'})['id']
        invitation=self.owner('customer_invite',id=person)['invite'];self.ops.customer_portal(1,'activate',{'invite':invitation,'password':'Customer test 123!'})
        with self.assertRaises(OperationsError):self.ops.customer_portal(1,'activate',{'invite':invitation,'password':'Customer test 123!'})
        secret=self.ops.customer_portal(1,'login',{'email':'member@example.test','password':'Customer test 123!'})['token'];profile=self.ops.customer_portal(1,'me',token=secret)
        self.assertEqual([f['key'] for f in profile['fields']],['favorite']);self.assertNotIn('password',str(profile))
        self.owner('customers_config',enabled=False,portal_enabled=False)
        with self.assertRaises(OperationsError):self.ops.customer_portal(1,'me',token=secret)
        self.owner('customers_config',enabled=True,portal_enabled=False);self.assertEqual(len(self.owner('snapshot')['customers']['records']),1)
    def test_customer_login_failure_counters_survive_failed_transactions(self):
        self.enable(True)
        for _ in range(5):
            with self.assertRaises(OperationsError) as failure:self.ops.customer_portal(1,'login',{'email':'none@example.test','password':'Wrong password 123'},address='test')
            self.assertEqual(failure.exception.status,401)
        with self.assertRaises(OperationsError) as failure:self.ops.customer_portal(1,'login',{'email':'none@example.test','password':'Wrong password 123'},address='test')
        self.assertEqual(failure.exception.status,429)
    def test_branch_staff_cannot_edit_global_customers_or_change_definitions(self):
        table=self.enable();person=self.person(table)
        role=self.owner('role',name='Customer clerk',permissions=['office','customers'])['id'];member=self.owner('staff',name='Clerk',branch=self.branch,role_id=role,credential='1234')
        device=self.device('office');token=self.ops.authenticate(device,member['code'],'1234')
        data=self.ops.admin(1,'snapshot',{},device_token=device,staff_token=token);self.assertEqual(data['customers']['records'],[])
        with self.assertRaises(OperationsError):self.ops.admin(1,'customer_record',{'id':person,'collection':table,'name':'No'},device_token=device,staff_token=token)
        with self.assertRaises(OperationsError):self.ops.admin(1,'customer_table',{'id':table,'name':'No','fields':[]},device_token=device,staff_token=token)

@unittest.skipUnless(os.environ.get('KEEPERBMA_TEST_POSTGRES_URL'),'Disposable PostgreSQL URL not configured')
class PostgreSQLCustomerCases(CustomerCases):postgres=True
