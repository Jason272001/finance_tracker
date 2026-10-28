import os,unittest
from sqlalchemy import delete,select
from test_business_operations import OperationsFixture
from backend.business_operations import OperationsError,products
from backend import business_industries as industry

class IndustryCases(OperationsFixture,unittest.TestCase):
    def test_45_minute_idle_boundary_and_polling_never_extends_it(self):
        d,s=self.cashier();self.tick+=2699
        self.assertIsNotNone(self.ops.context(d,s)['staff'])
        self.tick+=1
        self.assertIsNone(self.ops.context(d,s)['staff'])
        with self.assertRaises(OperationsError):self.ops.catalog(d,s)

    def test_retail_and_restaurant_catalogs_are_enforced_on_the_server(self):
        menu=self.product();retail=self.owner('product',name='Retail item',sku='RT',branch=self.branch,price_cents=300,stock=10,industry='retail')['id']
        d,s=self.cashier();self.assertEqual([p['id'] for p in self.ops.catalog(d,s)],[menu])
        with self.assertRaises(OperationsError):self.ops.checkout(d,s,self.sale(retail))
        self.owner('business_type',industry='retail')
        self.assertEqual([p['id'] for p in self.ops.catalog(d,s)],[retail])
        with self.assertRaises(OperationsError):self.ops.checkout(d,s,self.sale(menu,kind='retail'))
        with self.assertRaises(OperationsError):self.ops.checkout(d,s,self.sale(retail,kind='restaurant'))
        self.assertEqual(self.ops.checkout(d,s,self.sale(retail,kind='retail'))['kind'],'retail')
        with self.engine.connect() as c:
            self.assertEqual(len(c.execute(select(industry.retail)).all()),1)
            self.assertEqual(len(c.execute(select(industry.restaurant)).all()),1)

    def test_ingredient_changes_price_and_kitchen_notes_and_reject_tampering(self):
        p=self.product();pickles=self.owner('restaurant_ingredient',product=p,name='Pickles',extra_price_cents=25)['id'];cheese=self.owner('restaurant_ingredient',product=p,name='Cheese',extra_price_cents=150)['id']
        d,s=self.cashier();item={'id':p,'quantity':2,'ingredients':[{'id':pickles,'choice':'none'},{'id':cheese,'choice':'extra'}]}
        order=self.ops.checkout(d,s,self.sale(p,items=[item],received_cents=2000,expected_total_cents=1600))
        self.assertEqual(order['total'],1600);self.assertIn('No Pickles',order['items'][0]['note']);self.assertIn('Extra Cheese',order['items'][0]['note'])
        for invalid in [[{'id':cheese,'choice':'extra','price_cents':0}],[{'id':pickles,'choice':'none'},{'id':pickles,'choice':'extra'}],[{'id':'foreign','choice':'none'}]]:
            with self.assertRaises(OperationsError):self.ops.checkout(d,s,self.sale(p,'invalid-'+str(len(invalid)),items=[{'id':p,'quantity':1,'ingredients':invalid}]))
        with self.assertRaises(OperationsError):self.owner('business_type',industry='retail')

    def test_business_type_owner_only_and_unconfigured_checkout_blocks(self):
        d=self.device('office');s=self.ops.authenticate(d,'10001','7351')
        with self.assertRaises(OperationsError):self.ops.admin(1,'business_type',{'industry':'retail'},device_token=d,staff_token=s)
        with self.engine.begin() as c:c.execute(delete(industry.settings).where(industry.settings.c.business==1))
        d,s=self.cashier()
        with self.assertRaises(OperationsError):self.ops.catalog(d,s)

@unittest.skipUnless(os.environ.get('KEEPERBMA_TEST_POSTGRES_URL'),'Disposable PostgreSQL URL not configured')
class PostgreSQLIndustryCases(IndustryCases):postgres=True
