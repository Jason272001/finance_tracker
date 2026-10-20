import copy
import unittest
from unittest import mock

import core
from backend.bank_sync import connect_bank, apply_bank_sync, public_connection
from backend.plaid_store import PlaidStore
from backend.plaid_service import PlaidRequestError, transactions_sync
from test_sql_storage import StorageCases


class BankSyncTests(unittest.TestCase):
    _cleanup_storage = StorageCases._cleanup_storage

    def setUp(self):
        StorageCases.setUp(self)
        self.accounts = [{"account_id": "bank_1", "name": "Checking", "type": "depository", "subtype": "checking",
                          "balances": {"current": 100, "available": 90, "iso_currency_code": "USD"}}]
        result = connect_bank(self.uid, "access-private-test", "item_test", "ins_test", "Sample Bank", self.accounts)
        self.connection_id = result["connection"]["connection_id"]
        self.bank_account = result["accounts"][0]["keeper_account_id"]
        self.row = {"transaction_id": "plaid_tx_1", "account_id": "bank_1", "amount": 20,
                    "date": "2026-10-01", "name": "Software", "pending": False, "iso_currency_code": "USD",
                    "personal_finance_category": {"primary": "GENERAL_MERCHANDISE"}}

    def sync(self, cursor="", next_cursor="cursor_1", added=None, modified=None, removed=None):
        return apply_bank_sync(self.uid, self.connection_id, cursor,
                               {"next_cursor": next_cursor, "added": added or [], "modified": modified or [], "removed": removed or []}, self.accounts)

    def test_import_does_not_double_post_snapshot_balance(self):
        result = self.sync(added=[self.row])
        self.assertEqual(result["transactions_created"], 1)
        self.assertEqual(core.Account().get(self.bank_account, user_id=self.uid)["balance"], 100)
        row = core.Transaction().by_user(self.uid).iloc[0]
        self.assertEqual(row["amount"], 20)
        self.assertEqual(row["date"], "2026-10-01 00:00:00")
        self.assertEqual(row["origin"], "bank")

    def test_retries_and_overlapping_cursors_cannot_duplicate_import(self):
        self.sync(added=[self.row])
        self.assertTrue(self.sync(added=[self.row])["superseded"])
        self.assertEqual(self.sync(cursor="cursor_1", next_cursor="cursor_2", added=[self.row])["transactions_created"], 0)
        self.assertEqual(len(core.Transaction().by_user(self.uid)), 1)

    def test_modified_and_removed_history_does_not_change_bank_snapshot(self):
        self.sync(added=[self.row])
        modified = copy.deepcopy(self.row)
        modified["amount"] = 40
        self.sync(cursor="cursor_1", next_cursor="cursor_2", modified=[modified])
        self.assertEqual(core.Transaction().by_user(self.uid).iloc[0]["amount"], 40)
        self.sync(cursor="cursor_2", next_cursor="cursor_3", removed=[{"transaction_id": "plaid_tx_1"}])
        self.assertTrue(core.Transaction().by_user(self.uid).empty)
        self.assertEqual(core.Account().get(self.bank_account, user_id=self.uid)["balance"], 100)

    def test_failed_cursor_write_rolls_back_all_local_imports(self):
        self.accounts[0]["balances"]["current"] = 125
        with mock.patch.object(PlaidStore, "update_connection_cursor", side_effect=RuntimeError("database failure")):
            with self.assertRaises(RuntimeError):
                self.sync(added=[self.row])
        self.assertTrue(core.Transaction().by_user(self.uid).empty)
        self.assertEqual(core.Account().get(self.bank_account, user_id=self.uid)["balance"], 100)
        self.assertEqual(PlaidStore().get_connection(self.connection_id)["cursor"], "")

    def test_bank_import_is_not_manually_editable(self):
        self.sync(added=[self.row])
        tid = int(core.Transaction().by_user(self.uid).iloc[0]["txn_id"])
        with self.assertRaises(ValueError):
            core.Transaction().update(tid, user_id=self.uid, amount=1)
        with self.assertRaises(ValueError):
            core.Transaction().delete(tid, user_id=self.uid)

    def test_public_connection_does_not_contain_secrets(self):
        internal = PlaidStore().get_connection(self.connection_id)
        public = public_connection(internal)
        self.assertNotIn("access_token", public)
        self.assertNotIn("cursor", public)
        self.assertNotIn("access-private-test", str(public))

    def test_non_usd_snapshot_rolls_back_new_connection(self):
        self.accounts[0]["balances"]["iso_currency_code"] = "CAD"
        with self.assertRaises(ValueError):
            connect_bank(self.uid, "other-private-test", "item_other", "ins_test", "Sample Bank", self.accounts)
        self.assertEqual(len(PlaidStore().list_connections(self.uid)), 1)

    def test_bank_transfers_are_excluded_from_income_and_expenses(self):
        self.row["personal_finance_category"]["primary"] = "TRANSFER_IN"
        self.row["amount"] = -10
        self.sync(added=[self.row])
        self.assertEqual(core.Transaction().by_user(self.uid).iloc[0]["type"], "transfer")

    def test_credit_card_payments_are_transfers(self):
        self.row["personal_finance_category"] = {"primary": "LOAN_PAYMENTS", "detailed": "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"}
        self.sync(added=[self.row])
        self.assertEqual(core.Transaction().by_user(self.uid).iloc[0]["type"], "transfer")

    def test_same_account_name_does_not_merge_distinct_accounts(self):
        second = copy.deepcopy(self.accounts[0])
        second["account_id"] = "bank_2"
        result = connect_bank(self.uid, "access-private-test", "item_test", "ins_test", "Sample Bank", [*self.accounts, second])
        ids = [row["keeper_account_id"] for row in result["accounts"]]
        self.assertEqual(len(set(ids)), 2)


class PlaidPaginationTests(unittest.TestCase):
    def test_all_pages_are_fetched_before_returning_cursor(self):
        pages = [
            {"added": [{"transaction_id": "one"}], "next_cursor": "page1", "has_more": True},
            {"modified": [{"transaction_id": "two"}], "next_cursor": "page2", "has_more": False},
        ]
        with mock.patch("backend.plaid_service._plaid_post", side_effect=pages) as fetch:
            result = transactions_sync("private", cursor="original")
        self.assertEqual(result["next_cursor"], "page2")
        self.assertEqual(len(result["added"]), 1)
        self.assertEqual(len(result["modified"]), 1)
        self.assertEqual(fetch.call_args_list[1].args[1]["cursor"], "page1")

    def test_pagination_mutation_restarts_from_original_cursor(self):
        pages = [
            {"added": [{"transaction_id": "discarded"}], "next_cursor": "page1", "has_more": True},
            PlaidRequestError("restart", "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"),
            {"added": [{"transaction_id": "kept"}], "next_cursor": "done", "has_more": False},
        ]
        with mock.patch("backend.plaid_service._plaid_post", side_effect=pages) as fetch:
            result = transactions_sync("private", cursor="original")
        self.assertEqual(result["added"], [{"transaction_id": "kept"}])
        self.assertEqual(fetch.call_args_list[2].args[1]["cursor"], "original")
