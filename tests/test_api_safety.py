import hashlib
import hmac
import json
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest import mock

from fastapi.testclient import TestClient

import core
import backend.main as api
from test_sql_storage import StorageCases


class ApiSafetyTests(unittest.TestCase):
    _cleanup_storage = StorageCases._cleanup_storage

    def setUp(self):
        StorageCases.setUp(self)
        settings = mock.patch.multiple(api, TOKEN_SECRET="test-signing-secret-" * 3,
                                      ADMIN_BOOTSTRAP_SECRET="", ALLOW_DIRECT_PLAN_UPDATES=False,
                                      STRIPE_SECRET_KEY="", STRIPE_WEBHOOK_SECRET="whsec_test")
        settings.start()
        self.addCleanup(settings.stop)
        self.client = TestClient(api.app)
        self.addCleanup(self.client.close)
        self.headers = {"Authorization": "Bearer " + api._issue_token(self.uid)}

    def test_finance_requires_authentication_and_matching_user(self):
        self.assertEqual(self.client.get("/accounts", params={"user_id": self.uid}).status_code, 401)
        self.assertEqual(self.client.get("/accounts", params={"user_id": self.uid + 1}, headers=self.headers).status_code, 403)
        response = self.client.get("/accounts", params={"user_id": self.uid}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_transaction_cannot_reference_another_users_account(self):
        other = core.User().register("Other", "secretpass123", email="other@example.com", phone="5557654321", plan_code="basic", activate_without_payment=True)
        other_account = core.Account().add("Private", "asset", "bank", user_id=other)
        response = self.client.post("/transactions", headers=self.headers, json={
            "user_id": self.uid, "tx_type": "income", "amount": 100,
            "account_id": other_account, "category": "Freelance",
        })
        self.assertEqual(response.status_code, 400)
        self.assertTrue(core.Transaction().by_user(self.uid).empty)
        self.assertEqual(core.Account().get(other_account, user_id=other)["balance"], 0)

    def test_past_due_subscription_cannot_write(self):
        core.User().update_billing_subscription(self.uid, subscription_status="past_due")
        response = self.client.post("/categories", headers=self.headers, json={"user_id": self.uid, "category_name": "Creator"})
        self.assertEqual(response.status_code, 402)

    def test_direct_plan_upgrade_is_disabled_without_stripe(self):
        response = self.client.put("/billing/subscription", headers=self.headers, json={"user_id": self.uid, "plan_code": "diamond"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(core.User().get_user_by_id(self.uid)["plan_code"], "basic")

    def test_first_admin_cannot_be_claimed_publicly(self):
        response = self.client.post("/admin1957/register", json={
            "name": "PublicOwner", "email": "owner@example.com", "phone": "5551112222",
            "password": "secretpass123", "position": "owner",
        })
        self.assertEqual(response.status_code, 403)
        self.assertEqual(core.Admin1957().count(), 0)

    def test_admin_bootstrap_requires_matching_secret(self):
        with mock.patch.object(api, "ADMIN_BOOTSTRAP_SECRET", "test-operator-bootstrap-secret"):
            response = self.client.post("/admin1957/register", headers={"X-Admin-Bootstrap-Secret": "test-operator-bootstrap-secret"}, json={
                "name": "AuthorizedOwner", "email": "owner@example.com", "phone": "5551112222",
                "password": "secretpass123", "position": "owner",
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(core.Admin1957().count_owners(), 1)

    def test_account_with_history_returns_clear_conflict(self):
        core.Transaction().add("income", 100, self.account, user_id=self.uid)
        response = self.client.delete(f"/accounts/{self.account}", params={"user_id": self.uid}, headers=self.headers)
        self.assertEqual(response.status_code, 409)
        self.assertIsNotNone(core.Account().get(self.account, user_id=self.uid))

    def test_transfer_history_cannot_be_edited_or_deleted(self):
        target = core.Account().add("Savings", "saving", "bank", user_id=self.uid)
        core.Account().transfer(self.account, target, 10, user_id=self.uid)
        tid = int(core.Transaction().by_user(self.uid).iloc[0]["txn_id"])
        response = self.client.put(f"/transactions/{tid}", headers=self.headers, json={"user_id": self.uid, "amount": 1})
        self.assertEqual(response.status_code, 400)
        response = self.client.delete(f"/transactions/{tid}", headers=self.headers, params={"user_id": self.uid})
        self.assertEqual(response.status_code, 409)

    def test_webhook_accepts_any_valid_rotating_signature(self):
        payload = json.dumps({"id": "evt_ignored", "type": "unhandled.event", "created": int(time.time()), "data": {"object": {}}}).encode()
        timestamp = int(time.time())
        signature = hmac.new(b"whsec_test", str(timestamp).encode() + b"." + payload, hashlib.sha256).hexdigest()
        response = self.client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": f"t={timestamp},v1={signature},v1=old-key-signature"})
        self.assertEqual(response.status_code, 200)

    def test_expired_or_invalid_webhook_signatures_are_rejected(self):
        payload = b"{}"
        timestamp = int(time.time()) - 600
        signature = hmac.new(b"whsec_test", str(timestamp).encode() + b"." + payload, hashlib.sha256).hexdigest()
        response = self.client.post("/billing/webhook", content=payload, headers={"Stripe-Signature": f"t={timestamp},v1={signature}"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(api._verify_stripe_webhook_signature(b"\xff", "t=bad,v1=wrong"))

    def test_recovery_survives_worker_memory_reset(self):
        with mock.patch.object(api, "_send_recovery_email"), mock.patch.object(api.secrets, "randbelow", return_value=123456):
            response = self.client.post("/auth/recover/request", json={"email": "creator@example.com"})
        self.assertEqual(response.status_code, 200)
        api.RECOVERY_STATE.clear()
        response = self.client.post("/auth/recover/confirm", json={"email": "creator@example.com", "code": "123456", "new_password": "newsecretpass123"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(core.User().login("creator@example.com", "newsecretpass123"))
        self.assertFalse(core.User().login("creator@example.com", "secretpass123"))

    def test_recovery_failed_attempt_limit_is_committed(self):
        with mock.patch.object(api, "_send_recovery_email"), mock.patch.object(api.secrets, "randbelow", return_value=123456):
            self.client.post("/auth/recover/request", json={"email": "creator@example.com"})
        for _ in range(5):
            response = self.client.post("/auth/recover/confirm", json={"email": "creator@example.com", "code": "000000", "new_password": "newsecretpass123"})
            self.assertEqual(response.status_code, 400)
        response = self.client.post("/auth/recover/confirm", json={"email": "creator@example.com", "code": "123456", "new_password": "newsecretpass123"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Too many attempts", response.json()["detail"])
        response = self.client.post("/auth/recover/request", json={"email": "creator@example.com"})
        self.assertEqual(response.status_code, 429)

    def test_sql_login_lockout_is_shared_across_identifiers_and_instances(self):
        now = time.time()
        with mock.patch("core.time.time", return_value=now):
            for _ in range(5):
                self.assertFalse(core.User().login("Creator", "wrongpassword"))
            core.User._login_attempts.clear()  # simulate another worker
            self.assertFalse(core.User().login("creator@example.com", "secretpass123"))
        with mock.patch("core.time.time", return_value=now + 5):
            self.assertTrue(core.User().login("creator@example.com", "secretpass123"))

    def test_admin_login_has_shared_account_lockout(self):
        core.Admin1957().register("Owner", "owner@example.com", "5551112222", "secretpass123", "owner")
        now = time.time()
        with mock.patch("core.time.time", return_value=now):
            for _ in range(5):
                self.assertFalse(core.Admin1957().login("Owner", "wrongpassword"))
            core.Admin1957._login_attempts.clear()
            self.assertFalse(core.Admin1957().login("owner@example.com", "secretpass123"))

    def test_single_use_coupon_is_atomic_during_simultaneous_signups(self):
        core.Coupon().create(code="ONETEST", plan_code="basic", max_uses=1)
        def signup(index):
            with TestClient(api.app) as client:
                return client.post("/auth/register", json={"name": f"New{index}", "email": f"new{index}@example.com",
                    "phone": f"555123450{index}", "password": "secretpass123", "plan_code": "basic", "coupon_code": "ONETEST"}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(signup, [1, 2]))
        self.assertEqual(sorted(statuses), [200, 400])
        self.assertEqual(core.Coupon().get_by_code("ONETEST")["used_count"], 1)

    def test_canceled_pending_checkout_cannot_reactivate_access(self):
        session = {"id": "cs_test", "status": "complete", "customer": "cus_test",
                   "metadata": {"signup_flow": "pending_payment", "user_id": str(self.uid), "plan_code": "basic"},
                   "subscription": {"id": "sub_test", "status": "canceled", "items": {"data": [{"price": {"id": "price_basic"}}]}}}
        with mock.patch.object(api, "_stripe_fetch_checkout_session", return_value=session), mock.patch.object(api, "STRIPE_PRICE_BASIC", "price_basic"):
            response = self.client.post("/billing/pending/activate", json={"token": api._issue_pending_payment_token(self.uid), "session_id": "cs_test"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(core.User().get_user_by_id(self.uid)["billing_subscription_id"], "")

    def test_bank_disconnect_is_private_and_available_after_subscription_expiry(self):
        from backend.bank_sync import connect_bank
        from backend.plaid_store import PlaidStore
        linked = connect_bank(self.uid, "private-bank-token", "item_test", "ins_test", "Sample Bank", [
            {"account_id": "provider_1", "name": "Checking", "type": "depository", "balances": {"current": 100, "iso_currency_code": "USD"}},
        ])
        cid = linked["connection"]["connection_id"]
        core.User().update_billing_subscription(self.uid, subscription_status="past_due")
        response = self.client.get("/bank/connections", headers=self.headers, params={"user_id": self.uid})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("private-bank-token", response.text)
        with mock.patch.object(api, "remove_item", return_value={"removed": True}) as remove:
            denied = self.client.delete(f"/bank/connections/{cid}", headers=self.headers, params={"user_id": self.uid + 1})
            self.assertEqual(denied.status_code, 403)
            remove.assert_not_called()
            response = self.client.delete(f"/bank/connections/{cid}", headers=self.headers, params={"user_id": self.uid})
            self.assertEqual(response.status_code, 200)
        self.assertEqual(PlaidStore().list_connections(self.uid), [])

    def test_bank_linked_accounts_are_identified_and_cannot_accept_manual_postings(self):
        from backend.bank_sync import connect_bank
        linked = connect_bank(self.uid, "private-bank-token", "item_test", "ins_test", "Sample Bank", [
            {"account_id": "provider_1", "name": "Checking", "type": "depository", "balances": {"current": 100, "iso_currency_code": "USD"}},
        ])
        aid = linked["accounts"][0]["keeper_account_id"]
        accounts = self.client.get("/accounts", params={"user_id": self.uid}, headers=self.headers).json()
        self.assertTrue(next(row for row in accounts if row["account_id"] == aid)["bank_linked"])
        response = self.client.post("/transactions", headers=self.headers, json={"user_id": self.uid, "tx_type": "income", "amount": 10, "account_id": aid, "category": "Freelance"})
        self.assertEqual(response.status_code, 400)
        response = self.client.put(f"/accounts/{aid}", headers=self.headers, json={"user_id": self.uid, "balance": 999})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(core.Account().get(aid, user_id=self.uid)["balance"], 100)

    def test_fractional_cent_input_is_rejected_before_persistence(self):
        response = self.client.post("/transactions", headers=self.headers, json={"user_id": self.uid, "tx_type": "income", "amount": 1.005, "account_id": self.account, "category": "Freelance"})
        self.assertEqual(response.status_code, 422)
        self.assertTrue(core.Transaction().by_user(self.uid).empty)

    def test_existing_subscription_cannot_start_a_second_checkout(self):
        core.User().update_billing_subscription(self.uid, billing_subscription_id="sub_existing")
        with mock.patch.object(api, "STRIPE_PRICE_BASIC", "price_basic"), mock.patch.object(api, "_stripe_api_request") as create:
            response = self.client.post("/billing/checkout", headers=self.headers, json={"user_id": self.uid, "plan_code": "basic"})
        self.assertEqual(response.status_code, 409)
        create.assert_not_called()

    def test_unused_anonymous_precheckout_is_disabled(self):
        response = self.client.post("/billing/precheckout", json={"plan_code": "basic"})
        self.assertEqual(response.status_code, 410)
