import csv
import json
import os
import unittest
from pathlib import Path
from sqlalchemy import select
from test_business_operations import OperationsFixture
from backend.business_operations import OperationsError, products, staff, sessions
from backend import business_inventory as inventory
from backend import business_imports as imports

class ImportCases(OperationsFixture, unittest.TestCase):
    def test_complete_sample_pack_preview_is_atomic_and_all_tables_import(self):
        folder=Path(__file__).resolve().parents[1]/'assets/business-test-data'
        self.tick = 1793059200  # 2026-10-27, sample history remains within the report window
        manifest=json.loads((folder/'manifest.json').read_text())
        for item in manifest:
            with (folder/item['file']).open(encoding='utf-8-sig',newline='') as source:
                records=list(csv.DictReader(source))
            self.assertEqual(len(records),item['rows'])
            with self.engine.connect() as c:
                before={table.name:len(c.execute(select(table)).all()) for table in [products,staff,imports.links,inventory.receipts]}
            values={'kind':item['kind'],'branch':self.branch,'rows':records}
            self.owner('import_preview',**values)
            with self.engine.connect() as c:
                after={table.name:len(c.execute(select(table)).all()) for table in [products,staff,imports.links,inventory.receipts]}
            self.assertEqual(before,after,item['file'])
            self.owner('import_rows',**values)
        data=self.owner('snapshot')
        self.assertEqual(len(data['products']),200)
        self.assertEqual(len([m for m in data['inventory']['masters'] if m['kind']=='category']),100)
        self.assertEqual(len(data['inventory']['receipts']),10)
        self.assertEqual(len(data['inventory']['extras']),100)
        self.assertEqual(len(data['timesheets']),20)
        self.assertEqual(len(data['imported_history']),140)
        self.assertEqual(data['orders'],[])
        self.assertTrue(all(m['contact'].endswith('@example.test') for m in data['inventory']['masters'] if m['kind']=='supplier'))
        stocks={p['sku']:p['stock'] for p in data['products']}
        self.assertEqual([stocks['RT001'],stocks['RT030'],stocks['RT090']],[57,55,50])
        with self.engine.connect() as c:
            self.assertEqual(len(c.execute(select(sessions)).all()),0)
        rows_in=list(csv.DictReader((folder/'staff.csv').read_text(encoding='utf-8-sig').splitlines()))
        result=self.owner('import_rows',kind='staff',branch=self.branch,rows=rows_in)
        self.assertEqual(result['unchanged'],10)

    def test_invalid_batch_rolls_back_and_restricted_imports_cannot_escalate(self):
        values={'kind':'products','branch':self.branch,'rows':[{'sku':'ONE','name':'One','price':'2.50','stock':'2'},{'sku':'BAD','name':'Bad','price':'not-money','stock':'1'}]}
        with self.assertRaises(OperationsError):self.owner('import_rows',**values)
        self.assertEqual(self.owner('snapshot')['products'],[])
        office=self.device('office');manager=self.ops.authenticate(office,'10001','7351')
        with self.assertRaises(OperationsError) as error:
            self.ops.admin(1,'import_rows',{'kind':'roles','branch':self.branch,'rows':[{'external_ref':'X','name':'Owner'}]},device_token=office,staff_token=manager)
        self.assertEqual(error.exception.status,403)

    def test_receiving_transfer_checkout_and_void_reconcile_the_same_stock(self):
        pid=self.product()
        supplier=self.owner('inventory_master',kind='supplier',name='Supplier')['id']
        cold=self.owner('inventory_master',kind='location',name='Cold room',branch=self.branch)['id']
        values={'supplier':supplier,'invoice':'INV-1','items':[{'product':pid,'quantity':8,'cost_cents':250}]}
        self.owner('inventory_receive',**values)
        with self.assertRaises(OperationsError):self.owner('inventory_receive',**values)
        main=next(m['id'] for m in self.owner('snapshot')['inventory']['masters'] if m['name']=='Main storage')
        self.owner('inventory_transfer',product=pid,source=main,target=cold,quantity=3)
        initial={b['location']:b['quantity'] for b in self.owner('snapshot')['inventory']['balances']}
        d,token=self.cashier();order=self.ops.checkout(d,token,self.sale(pid,items=[{'id':pid,'quantity':5}],received_cents=5000))
        self.assertEqual(self.owner('snapshot')['products'][0]['stock'],13)
        self.owner('void_order',id=order['id'])
        data=self.owner('snapshot')
        self.assertEqual(data['products'][0]['stock'],18)
        self.assertEqual({b['location']:b['quantity'] for b in data['inventory']['balances']},initial)

    def test_optional_extras_are_priced_by_server_and_reach_kitchen(self):
        pid=self.product();extra=self.owner('inventory_extra',product=pid,name='Extra patty',price_cents=150)['id']
        d,token=self.cashier();order=self.ops.checkout(d,token,self.sale(pid,items=[{'id':pid,'quantity':2,'modifiers':[extra]}],received_cents=2000,expected_total_cents=1600))
        self.assertEqual(order['total'],1600)
        self.assertIn('Extra patty',order['items'][0]['note'])
        with self.assertRaises(OperationsError):self.ops.checkout(d,token,self.sale(pid,'unknown-extra',items=[{'id':pid,'quantity':1,'modifiers':['forged']}]))

    def test_every_staff_station_expires_after_five_idle_minutes_but_active_shift_can_continue(self):
        kitchen=self.device('kitchen');session=self.ops.authenticate(kitchen,'10004','456789')
        self.tick+=300
        with self.assertRaises(OperationsError):self.ops.kitchen(kitchen,session)
        office=self.device('office');session=self.ops.authenticate(office,'10001','7351')
        for _ in range(110):
            self.tick+=299
            self.ops.activity(office,session,'')
        self.assertTrue(self.ops.context(office,session)['staff'])
        self.tick+=300
        self.assertIsNone(self.ops.context(office,session)['staff'])

@unittest.skipUnless(os.environ.get('KEEPERBMA_TEST_POSTGRES_URL'),'Disposable PostgreSQL URL not configured')
class PostgreSQLImportCases(ImportCases):
    postgres=True
