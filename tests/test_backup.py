import csv
import json
import tempfile
import unittest
from pathlib import Path

from sqlalchemy import text

from backend.scripts.backup_data import backup_postgres_tables
from test_sql_storage import StorageCases
from backend.business_operations import Operations


class BackupTests(unittest.TestCase):
    _cleanup_storage = StorageCases._cleanup_storage
    setUp = StorageCases.setUp

    def test_backup_covers_core_and_subscription_ledger(self):
        Operations(self.engine).setup(1, self.uid, "Backup test business", "90000", "456789")
        operations=Operations(self.engine)
        operations.admin(1,'customers_config',{'enabled':True},account_owner=self.uid)
        definition=operations.admin(1,'snapshot',{},account_owner=self.uid)['customers']['tables'][0]
        operations.admin(1,'customer_table',{'id':definition['id'],'name':'Customers','fields':[{'key':'note','label':'Note','type':'text'}]},account_owner=self.uid)
        operations.admin(1,'customer_record',{'collection':definition['id'],'name':'Backup customer','data':{'note':'Quoted "value"'}},account_owner=self.uid)
        with self.engine.begin() as connection:
            connection.execute(text('CREATE TABLE stripe_processed_events (event_id TEXT PRIMARY KEY)'))
            connection.execute(text("INSERT INTO stripe_processed_events VALUES ('evt_test')"))
        with tempfile.TemporaryDirectory() as destination:
            files = backup_postgres_tables(Path(destination), engine=self.engine)
            names = {Path(filename).name for filename in files}
            self.assertIn('users.csv', names)
            self.assertIn('accounts.csv', names)
            self.assertIn('stripe_processed_events.csv', names)
            self.assertIn('ops_staff.csv', names)
            self.assertIn('ops_devices.csv', names)
            self.assertIn('ops_orders.csv', names)
            self.assertIn('ops_roles.csv', names)
            self.assertIn('ops_staff_roles.csv', names)
            self.assertIn('ops_device_codes.csv', names)
            for table in ['ops_inventory_masters','ops_product_details','ops_stock_balances','ops_stock_movements','ops_supplier_receipts','ops_product_extras','ops_import_links','ops_imported_history','ops_business_industries','ops_retail_items','ops_restaurant_items','ops_restaurant_ingredients','ops_customer_settings','ops_customer_tables','ops_customer_records','ops_customer_accounts','ops_customer_invites','ops_customer_sessions']:
                self.assertIn(table+'.csv', names)
            customer_rows=list(csv.DictReader((Path(destination)/'postgres'/'ops_customer_records.csv').read_text(encoding='utf-8').splitlines()))
            self.assertEqual(json.loads(customer_rows[0]['data'])['note'],'Quoted "value"')
            self.assertIn('evt_test', (Path(destination) / 'postgres' / 'stripe_processed_events.csv').read_text())
