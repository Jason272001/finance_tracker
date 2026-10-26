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
            self.assertIn('evt_test', (Path(destination) / 'postgres' / 'stripe_processed_events.csv').read_text())
