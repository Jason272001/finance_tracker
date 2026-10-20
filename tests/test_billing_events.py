import copy
import unittest
from unittest import mock

from sqlalchemy import select, text

import core
from backend.billing_events import process_event
from test_sql_storage import StorageCases


class BillingEventsTests(unittest.TestCase):
    _cleanup_storage = StorageCases._cleanup_storage

    def setUp(self):
        StorageCases.setUp(self)
        core.User().update_billing_subscription(self.uid, billing_customer_id="cus_test", billing_subscription_id="sub_current")
        self.subscription = {"id": "sub_current", "customer": "cus_test", "created": 200,
                             "status": "active", "current_period_end": 2000000000,
                             "items": {"data": [{"price": {"id": "price_basic"}}]}}
        self.fetch = mock.Mock(side_effect=lambda sid: copy.deepcopy(self.subscription))
        self.checkout = mock.Mock(return_value={"id": "cs_test", "customer": "cus_test", "subscription": "sub_current",
                                                "status": "complete", "mode": "subscription", "metadata": {"user_id": str(self.uid)}})

    def event(self, kind="customer.subscription.updated", event_id="evt_test", subscription="sub_current", created=500):
        obj = {"id": subscription, "customer": "cus_test"}
        if kind.startswith("invoice."):
            obj.update(id="in_test", subscription=subscription)
        if kind.startswith("checkout."):
            obj.update(id="cs_test", subscription=subscription)
        return {"id": event_id, "type": kind, "created": created, "data": {"object": obj}}

    def process(self, event):
        from backend.main import _stripe_status_to_subscription_status, _iso_from_unix_ts
        return process_event(event, self.fetch, self.checkout,
                             lambda price: {"plan_code": "basic", "billing_cycle": "monthly", "with_website": False} if price == "price_basic" else {},
                             _stripe_status_to_subscription_status, _iso_from_unix_ts)

    def profile(self):
        return core.User().get_user_by_id(self.uid)

    def test_duplicate_delivery_is_recorded_once(self):
        self.assertFalse(self.process(self.event())["ignored"])
        self.assertTrue(self.process(self.event())["duplicate"])
        self.fetch.assert_called_once()
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT COUNT(*) FROM stripe_processed_events")).scalar(), 1)

    def test_old_payload_uses_current_canceled_state(self):
        self.subscription["status"] = "canceled"
        self.process(self.event())
        self.assertEqual(self.profile()["subscription_status"], "canceled")
        self.process(self.event(event_id="evt_older", created=100))
        self.assertEqual(self.profile()["subscription_status"], "canceled")

    def test_old_subscription_cannot_revoke_current_access(self):
        self.assertTrue(self.process(self.event(kind="invoice.payment_failed", subscription="sub_old"))["ignored"])
        self.fetch.assert_not_called()
        self.assertEqual(self.profile()["subscription_status"], "active")

    def test_failed_payment_event_after_recovery_keeps_canonical_active_state(self):
        self.process(self.event(kind="invoice.payment_failed"))
        self.assertEqual(self.profile()["subscription_status"], "active")

    def test_remote_failure_can_be_retried(self):
        self.fetch.side_effect = RuntimeError("Stripe unavailable")
        with self.assertRaises(RuntimeError):
            self.process(self.event())
        self.fetch.side_effect = lambda sid: copy.deepcopy(self.subscription)
        self.assertFalse(self.process(self.event())["ignored"])

    def test_database_failure_does_not_acknowledge_event(self):
        with mock.patch.object(core.User, "update_billing_subscription", side_effect=RuntimeError("database write failed")):
            with self.assertRaises(RuntimeError):
                self.process(self.event())
        self.assertFalse(self.process(self.event())["ignored"])

    def test_unknown_price_does_not_grant_access(self):
        self.subscription["items"]["data"][0]["price"]["id"] = "price_unconfigured"
        with self.assertRaises(ValueError):
            self.process(self.event())

    def test_unknown_subscription_status_fails_closed(self):
        self.subscription["status"] = "paused"
        self.process(self.event())
        self.assertEqual(self.profile()["subscription_status"], "incomplete")

    def test_old_checkout_cannot_replace_new_subscription(self):
        old = copy.deepcopy(self.subscription)
        old.update(id="sub_old", created=100, status="canceled")
        self.checkout.return_value["subscription"] = "sub_old"
        self.fetch.side_effect = lambda sid: old if sid == "sub_old" else copy.deepcopy(self.subscription)
        self.assertTrue(self.process(self.event(kind="checkout.session.completed"))["ignored"])
        self.assertEqual(self.profile()["billing_subscription_id"], "sub_current")

    def test_new_checkout_can_attach_new_subscription(self):
        new = copy.deepcopy(self.subscription)
        new.update(id="sub_new", created=300)
        self.checkout.return_value["subscription"] = "sub_new"
        self.fetch.side_effect = lambda sid: new if sid == "sub_new" else copy.deepcopy(self.subscription)
        self.assertFalse(self.process(self.event(kind="checkout.session.completed"))["ignored"])
        self.assertEqual(self.profile()["billing_subscription_id"], "sub_new")

    def test_later_old_subscription_event_does_not_block_newer_subscription_checkout(self):
        self.process(self.event(event_id="evt_old_sub_update", created=900))
        new = copy.deepcopy(self.subscription)
        new.update(id="sub_new", created=300)
        self.checkout.return_value["subscription"] = "sub_new"
        self.fetch.side_effect = lambda sid: new if sid == "sub_new" else copy.deepcopy(self.subscription)
        self.assertFalse(self.process(self.event(kind="checkout.session.completed", event_id="evt_delayed_checkout", created=500))["ignored"])
        self.assertEqual(self.profile()["billing_subscription_id"], "sub_new")

    def test_stripe_item_period_end_is_supported(self):
        self.subscription.pop("current_period_end")
        self.subscription["items"]["data"][0]["current_period_end"] = 2000000000
        self.process(self.event())
        self.assertTrue(self.profile()["next_charge_at"].startswith("2033-"))
