import copy
import unittest
from unittest import mock

import core
from backend.checkout_sessions import create_checkout, CheckoutConflict
from backend.billing_cancellations import cancel_subscription
from test_sql_storage import StorageCases


class CheckoutTests(unittest.TestCase):
    _cleanup_storage = StorageCases._cleanup_storage
    setUp = StorageCases.setUp

    def test_open_session_is_reused_and_plan_switch_is_blocked(self):
        create = mock.Mock(return_value={"id": "cs_test", "url": "https://checkout.stripe.com/test"})
        fetch = mock.Mock(return_value={"status": "open"})
        form = {"mode": "subscription", "price": "price_basic"}
        first = create_checkout(self.uid, form, create, fetch)
        self.assertEqual(create_checkout(self.uid, form, create, fetch), first)
        create.assert_called_once()
        with self.assertRaises(CheckoutConflict):
            create_checkout(self.uid, {**form, "price": "price_regular"}, create, fetch)

    def test_network_failure_retries_same_durable_idempotency_key(self):
        create = mock.Mock(side_effect=[RuntimeError("network lost"), {"id": "cs_test", "url": "https://checkout.stripe.com/test"}])
        fetch = mock.Mock()
        with self.assertRaises(RuntimeError):
            create_checkout(self.uid, {"price": "basic"}, create, fetch)
        create_checkout(self.uid, {"price": "basic"}, create, fetch)
        self.assertEqual(create.call_args_list[0].args[1], create.call_args_list[1].args[1])

    def test_completed_session_does_not_create_another_subscription(self):
        create = mock.Mock(return_value={"id": "cs_test", "url": "https://checkout.stripe.com/test"})
        fetch = mock.Mock(return_value={"status": "complete"})
        create_checkout(self.uid, {"price": "basic"}, create, fetch)
        with self.assertRaises(CheckoutConflict):
            create_checkout(self.uid, {"price": "basic"}, create, fetch)
        create.assert_called_once()

    def test_expired_session_starts_a_new_attempt(self):
        create = mock.Mock(return_value={"id": "cs_test", "url": "https://checkout.stripe.com/test"})
        fetch = mock.Mock(return_value={"status": "expired"})
        create_checkout(self.uid, {"price": "basic"}, create, fetch)
        create_checkout(self.uid, {"price": "basic"}, create, fetch)
        self.assertNotEqual(create.call_args_list[0].args[1], create.call_args_list[1].args[1])


class CancellationTests(unittest.TestCase):
    _cleanup_storage = StorageCases._cleanup_storage

    def setUp(self):
        StorageCases.setUp(self)
        core.User().update_billing_subscription(self.uid, billing_subscription_id="sub_test")
        self.subscription = {"id": "sub_test", "status": "active", "current_period_end": 2100000000}
        self.load = mock.Mock(side_effect=lambda sid: copy.deepcopy(self.subscription))
        self.payment = mock.Mock(return_value=("ch_test", 1000, 1000, "usd"))
        self.policy = mock.Mock(return_value=(1000, "full_7_day_refund"))
        def cancel(sid):
            self.subscription.update(status="canceled", canceled_at=2000000000, ended_at=2000000000)
            return copy.deepcopy(self.subscription)
        self.cancel = mock.Mock(side_effect=cancel)
        self.find = mock.Mock(return_value=None)
        self.refund = mock.Mock(return_value={"id": "re_test", "amount": 1000, "status": "succeeded"})

    def run_cancel(self):
        from backend.main import _iso_from_unix_ts
        return cancel_subscription(self.uid, "sub_test", self.load, self.payment, self.policy,
                                   self.cancel, self.find, self.refund, _iso_from_unix_ts)

    def test_repeat_cancellation_returns_saved_result_without_another_refund(self):
        result = self.run_cancel()
        self.assertEqual(result["refund_amount"], 10)
        self.assertEqual(self.run_cancel(), result)
        self.refund.assert_called_once()
        self.cancel.assert_called_once()

    def test_failed_refund_remains_retryable_after_cancellation(self):
        self.refund.side_effect = [RuntimeError("network failed"), {"id": "re_test", "amount": 1000, "status": "succeeded"}]
        with self.assertRaises(RuntimeError):
            self.run_cancel()
        self.assertEqual(core.User().get_user_by_id(self.uid)["subscription_status"], "canceled")
        self.assertEqual(self.run_cancel()["refund_id"], "re_test")
        self.assertEqual(self.refund.call_args_list[0].args[0]["intent_key"], self.refund.call_args_list[1].args[0]["intent_key"])
        self.cancel.assert_called_once()

    def test_lost_refund_response_is_reconciled_from_provider_metadata(self):
        self.refund.side_effect = RuntimeError("provider response lost after success")
        with self.assertRaises(RuntimeError):
            self.run_cancel()
        self.find.return_value = {"id": "re_existing", "amount": 1000, "status": "succeeded"}
        self.assertEqual(self.run_cancel()["refund_id"], "re_existing")
        self.refund.assert_called_once()

    def test_immediate_cancellation_does_not_grant_refunded_period_access(self):
        self.run_cancel()
        from backend.main import _iso_from_unix_ts
        self.assertEqual(core.User().get_user_by_id(self.uid)["subscription_ends_at"], _iso_from_unix_ts(2000000000))

    def test_pending_refund_is_described_as_requested(self):
        self.refund.return_value["status"] = "pending"
        self.assertIn("Refund requested", self.run_cancel()["message"])

    def test_complex_invoice_can_cancel_with_manual_refund_review(self):
        self.payment.side_effect = ValueError("Multiple payments")
        result = self.run_cancel()
        self.assertEqual(result["refund_status"], "manual_review")
        self.assertEqual(core.User().get_user_by_id(self.uid)["subscription_status"], "canceled")
        self.refund.assert_not_called()


class ProviderFormatTests(unittest.TestCase):
    def test_modern_invoice_payment_and_latest_charge_format(self):
        import backend.main as api
        responses = {
            '/v1/invoice_payments': {'data': [{'status': 'paid', 'payment': {'payment_intent': 'pi_test'}}]},
            '/v1/payment_intents/pi_test': {'amount_received': 1000, 'currency': 'usd', 'latest_charge': 'ch_test'},
            '/v1/charges/ch_test': {'id': 'ch_test', 'amount': 1000, 'amount_refunded': 200},
        }
        with mock.patch.object(api, '_stripe_api_get', side_effect=lambda path, **kwargs: responses[path]):
            self.assertEqual(api._stripe_extract_latest_payment({'latest_invoice': {'id': 'in_test', 'amount_paid': 1000}}), ('ch_test', 1000, 800, 'usd'))

    def test_legacy_direct_charge_format(self):
        import backend.main as api
        invoice = {'id': 'in_test', 'amount_paid': 1000, 'charge': {'id': 'ch_test', 'amount': 1000, 'amount_refunded': 0}}
        with mock.patch.object(api, '_stripe_api_get') as get:
            self.assertEqual(api._stripe_extract_latest_payment({'latest_invoice': invoice}), ('ch_test', 1000, 1000, 'usd'))
            get.assert_not_called()

    def test_https_recovery_email_delivery_contract(self):
        import backend.main as api
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"id":"email_test"}'
        with mock.patch.object(api, 'RESEND_API_KEY', 'test_key'), mock.patch.object(api, 'RECOVERY_EMAIL_FROM', 'sender@example.com'), mock.patch.object(api.urllib.request, 'urlopen', return_value=response) as send:
            api._send_recovery_email('recipient@example.com', '123456')
        request = send.call_args.args[0]
        self.assertEqual(request.full_url, 'https://api.resend.com/emails')
        self.assertIn(b'123456', request.data)
