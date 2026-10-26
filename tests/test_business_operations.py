import json
import os
import uuid
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sqlalchemy import create_engine, select, text, update
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.business_operations import Operations, OperationsError, products, sessions, audit, businesses
from backend.business_operations_api import create_operations_router, OperationsBodyLimit


class OperationsFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.schema = None
        if getattr(self, "postgres", False):
            self.schema = "keeper_ops_test_" + uuid.uuid4().hex
            url = os.environ["KEEPERBMA_TEST_POSTGRES_URL"]
            self.admin_engine = create_engine(url)
            with self.admin_engine.begin() as c:
                c.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            self.engine = create_engine(url, connect_args={"options": f"-csearch_path={self.schema}"})
        else:
            self.engine = create_engine("sqlite:///" + str(Path(self.temp.name) / "operations.db").replace("\\", "/"), connect_args={"timeout": 30})
        self.tick = 1800000000
        self.ops = Operations(self.engine, now=lambda: self.tick)
        configured = self.ops.setup(1, 10, "Test shop", "90000", "owner-test-password")
        self.branch = configured["branch"]
        self.owner_id = configured["owner_staff_id"]
        self.ids = {}
        for code, name, role, credential in [("10001", "Manager", "manager", "manager-test-password"), ("10002", "Jason", "cashier", "654321"), ("10003", "Kay", "cashier", "123456"), ("10004", "Cook", "kitchen", "456789"), ("10005", "Team member", "staff", "567890")]:
            self.ids[code] = self.owner("staff", branch=self.branch, name=name, code=code, role=role, credential=credential)["id"]
        self.addCleanup(self.cleanup_operations)

    def cleanup_operations(self):
        self.engine.dispose()
        if self.schema:
            with self.admin_engine.begin() as c:
                c.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
            self.admin_engine.dispose()
        self.temp.cleanup()

    def owner(self, action, **values):
        return self.ops.admin(1, action, values, account_owner=10)

    def device(self, mode="cashier", name="Till"):
        pairing = self.ops.enroll(1, self.branch, name, mode, "account:10")
        return self.ops.pair(pairing["code"], "test-network")

    def cashier(self, code="10002", credential="654321"):
        d = self.device()
        return d, self.ops.authenticate(d, code, credential)

    def product(self, stock=10):
        return self.owner("product", branch=self.branch, name="Burger", sku="BURGER", category="Kitchen", price_cents=650, stock=stock)["id"]

    def sale(self, product, request_id="sale-request-1", **overrides):
        return {"request_id": request_id, "items": [{"id": product, "quantity": 1}], "payment": "cash", "received_cents": 1000, "kind": "restaurant", "fulfillment": "takeaway", "note": "No onions", **overrides}

class OperationsTests(OperationsFixture, unittest.TestCase):
    def test_device_pairing_is_single_use_and_expires(self):
        p = self.ops.enroll(1, self.branch, "Cashier 1", "cashier", "account:10")
        d = self.ops.pair(p["code"], "test")
        with self.assertRaises(OperationsError):
            self.ops.pair(p["code"], "test")
        self.assertEqual(self.ops.context(d)["device"]["name"], "Cashier 1")
        p = self.ops.enroll(1, self.branch, "Cashier 2", "cashier", "account:10")
        self.tick += 301
        with self.assertRaises(OperationsError):
            self.ops.pair(p["code"], "test")

    def test_staff_required_and_handover_never_silently_replaces_cashier(self):
        d, s = self.cashier()
        with self.assertRaises(OperationsError):
            self.ops.authenticate(d, "10003", "123456", current_token=s)
        self.assertEqual(self.ops.context(d, s)["staff"]["name"], "Jason")
        with self.assertRaises(OperationsError):
            self.ops.checkout(d, "", self.sale(self.product()))
        self.ops.logout(d, s)
        next_s = self.ops.authenticate(d, "10003", "123456")
        self.assertEqual(self.ops.context(d, next_s)["staff"]["name"], "Kay")

    def test_cashiers_cannot_access_management_even_if_the_ui_is_bypassed(self):
        d, s = self.cashier()
        with self.assertRaises(OperationsError) as failure:
            self.ops.admin(1, "snapshot", {}, device_token=d, staff_token=s)
        self.assertEqual(failure.exception.status, 403)
        with self.assertRaises(OperationsError):
            self.ops.authenticate(d, "10002", "654321", "management")
        grant = self.ops.authenticate(d, "10001", "manager-test-password", "management")
        snapshot = self.ops.admin(1, "snapshot", {}, device_token=d, staff_token=s, management_token=grant)
        self.assertEqual(snapshot["role"], "manager")
        self.assertNotIn("credential", json.dumps(snapshot))
        with self.assertRaises(OperationsError):
            self.ops.admin(1, "staff", {"branch": self.branch, "name": "Hidden owner", "code": "99999", "role": "owner", "credential": "another-password"}, device_token=d, management_token=grant)

    def test_manager_polling_does_not_extend_an_idle_management_session(self):
        d = self.device("clock")
        grant = self.ops.authenticate(d, "10001", "manager-test-password", "management")
        self.tick += 119
        self.ops.admin(1, "snapshot", {}, device_token=d, management_token=grant)
        self.tick += 2
        with self.assertRaises(OperationsError):
            self.ops.admin(1, "snapshot", {}, device_token=d, management_token=grant)
        self.assertIsNone(self.ops.context(d, management_token=grant)["management"])

    def test_public_clock_punches_never_create_a_staff_or_manager_session(self):
        d = self.device("clock")
        self.ops.authenticate(d, "10005", "567890", "in")
        with self.assertRaises(OperationsError):
            self.ops.authenticate(d, "10005", "567890", "in")
        self.tick += 3600
        self.ops.authenticate(d, "10005", "567890", "out")
        self.assertIsNone(self.ops.context(d)["staff"])
        with self.ops.read() as c:
            self.assertEqual(len(c.execute(select(sessions)).all()), 0)
        shift = self.owner("snapshot")["timesheets"][0]
        self.assertEqual(shift["end"] - shift["start"], 3600)

    def test_bad_pin_attempts_survive_new_process_objects_and_are_rate_limited(self):
        d = self.device()
        for _ in range(5):
            with self.assertRaises(OperationsError) as failure:
                self.ops.authenticate(d, "10002", "wrong-pin")
            self.assertEqual(failure.exception.status, 401)
        another_process = Operations(self.engine, now=lambda: self.tick)
        with self.assertRaises(OperationsError) as failure:
            another_process.authenticate(d, "10002", "654321")
        self.assertEqual(failure.exception.status, 429)
        self.tick += 301
        self.assertTrue(another_process.authenticate(d, "10002", "654321"))

    def test_catalog_prices_cash_and_branch_scope_are_enforced_on_server(self):
        d, s = self.cashier()
        p = self.product()
        for sale in [self.sale(p, payment="card"), self.sale(p, received_cents=1), self.sale(p, items=[{"id": p, "quantity": 1, "price_cents": 1}])]:
            with self.assertRaises(OperationsError):
                self.ops.checkout(d, s, sale)
        other = self.owner("branch", name="Other branch")["id"]
        foreign = self.owner("product", branch=other, name="Private product", sku="PRIVATE", category="Food", price_cents=100, stock=1)["id"]
        with self.assertRaises(OperationsError):
            self.ops.checkout(d, s, self.sale(foreign))
        self.assertEqual(self.owner("snapshot")["products"][0]["stock"], 10)

    def test_checkout_is_idempotent_and_audits_the_actual_cashier(self):
        d, s = self.cashier()
        p = self.product()
        first = self.ops.checkout(d, s, self.sale(p))
        second = self.ops.checkout(d, s, self.sale(p))
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["cashier_name"], "Jason")
        self.assertEqual(self.owner("snapshot")["products"][0]["stock"], 9)
        with self.assertRaises(OperationsError):
            self.ops.checkout(d, s, self.sale(p, received_cents=2000))
        report = self.owner("snapshot")["report"]
        self.assertEqual(report["paid_orders"], 1)
        self.assertEqual(report["total_cents"], 650)

    def test_simultaneous_cashiers_cannot_sell_the_same_last_unit(self):
        one, two = self.cashier(), self.cashier("10003", "123456")
        p = self.product(stock=1)
        def checkout(args):
            d, s, rid = args
            try:
                return self.ops.checkout(d, s, self.sale(p, rid))["id"]
            except OperationsError as e:
                return e.status
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(checkout, [(one[0], one[1], "first-request"), (two[0], two[1], "second-request")]))
        self.assertEqual(sum(isinstance(r, str) for r in results), 1)
        self.assertIn(409, results)
        self.assertEqual(self.owner("snapshot")["products"][0]["stock"], 0)

    def test_kitchen_sees_another_devices_ticket_without_financial_or_staff_data(self):
        d, s = self.cashier()
        order = self.ops.checkout(d, s, self.sale(self.product()))
        kd = self.device("kitchen")
        ks = self.ops.authenticate(kd, "10004", "456789")
        another_process = Operations(self.engine, now=lambda: self.tick)
        tickets = another_process.kitchen(kd, ks)
        self.assertEqual(tickets[0]["id"], order["id"])
        self.assertNotIn("price_cents", json.dumps(tickets))
        self.assertNotIn("cashier", json.dumps(tickets))
        with self.assertRaises(OperationsError):
            another_process.kitchen(kd, ks, order["id"], "served")
        for state in ["preparing", "ready", "served"]:
            another_process.kitchen(kd, ks, order["id"], state)
        self.assertEqual(another_process.kitchen(kd, ks), [])

    def test_credential_changes_and_device_revocation_take_effect_on_existing_sessions(self):
        d, s = self.cashier()
        self.owner("staff", id=self.ids["10002"], branch=self.branch, name="Jason", code="10002", role="cashier", credential="new-pin-123")
        with self.assertRaises(OperationsError):
            self.ops.catalog(d, s)
        new_s = self.ops.authenticate(d, "10002", "new-pin-123")
        did = self.ops.context(d, new_s)["device"]["id"]
        self.owner("revoke_device", id=did)
        with self.assertRaises(OperationsError):
            self.ops.context(d, new_s)

    def test_manager_can_schedule_staff_but_cannot_change_owner_or_overlap_shifts(self):
        d = self.device("office")
        s = self.ops.authenticate(d, "10001", "manager-test-password")
        values = {"staff": self.ids["10002"], "start": self.tick + 3600, "end": self.tick + 7200}
        self.ops.admin(1, "schedule", values, device_token=d, staff_token=s)
        with self.assertRaises(OperationsError):
            self.ops.admin(1, "schedule", values, device_token=d, staff_token=s)
        with self.assertRaises(OperationsError):
            self.ops.admin(1, "staff", {"id": self.owner_id, "branch": self.branch, "name": "Owner", "code": "90000", "role": "owner", "active": False}, device_token=d, staff_token=s)

    def test_sales_report_uses_selected_business_date_and_rejects_invalid_dates(self):
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo
        d, session = self.cashier()
        self.ops.checkout(d, session, self.sale(self.product()))
        today = datetime.fromtimestamp(self.tick, ZoneInfo("America/Los_Angeles")).date()
        self.assertEqual(self.owner("snapshot", date=str(today))["report"]["paid_orders"], 1)
        self.assertEqual(self.owner("snapshot", date=str(today - timedelta(days=1)))["report"]["paid_orders"], 0)
        for value in ["invalid", "2026-02-30", "9999-01-01"]:
            with self.assertRaises(OperationsError):
                self.owner("snapshot", date=value)
        office = self.device("office")
        manager = self.ops.authenticate(office, "10001", "manager-test-password")
        with self.assertRaises(OperationsError):
            self.ops.admin(1, "branch", {"name": "Unauthorized branch"}, device_token=office, staff_token=manager)

    def test_manager_corrects_a_missed_clock_out_with_an_attributed_reason(self):
        device = self.device("clock")
        self.ops.authenticate(device, "10005", "567890", "in")
        interval = self.owner("snapshot")["timesheets"][0]
        self.tick += 7200
        self.owner("close_shift", id=interval["id"], end=self.tick - 3600, reason="Staff forgot to clock out at end of shift")
        result = self.owner("snapshot")["timesheets"][0]
        self.assertEqual(result["end"] - result["start"], 3600)
        self.assertEqual(result["closed_by"], "account:10")
        self.assertIn("forgot", result["adjustment_note"])
        with self.assertRaises(OperationsError):
            self.owner("close_shift", id=interval["id"], end=self.tick, reason="Cannot overwrite a closed interval")

    def test_void_restores_stock_once_and_updates_daily_report(self):
        d, s = self.cashier()
        order = self.ops.checkout(d, s, self.sale(self.product()))
        self.owner("void_order", id=order["id"])
        with self.assertRaises(OperationsError):
            self.owner("void_order", id=order["id"])
        snapshot = self.owner("snapshot")
        self.assertEqual(snapshot["products"][0]["stock"], 10)
        self.assertEqual(snapshot["report"]["paid_orders"], 0)
        self.assertEqual(snapshot["report"]["void_orders"], 1)

    def test_manager_can_cancel_an_unconfirmed_reference_before_a_late_retry(self):
        d, s = self.cashier()
        product = self.product()
        self.owner("cancel_checkout", request_id="aborted-request")
        with self.assertRaises(OperationsError):
            self.ops.checkout(d, s, self.sale(product, "aborted-request"))
        self.assertEqual(self.owner("snapshot")["products"][0]["stock"], 10)
        paid = self.ops.checkout(d, s, self.sale(product, "paid-request"))
        resolution = self.owner("cancel_checkout", request_id="paid-request")
        self.assertTrue(resolution["recorded"])
        self.assertEqual(resolution["order"]["id"], paid["id"])

    def test_price_changes_require_cashier_to_review_the_new_total(self):
        d, s = self.cashier()
        product = self.product()
        with self.assertRaises(OperationsError) as failure:
            self.ops.checkout(d, s, self.sale(product, expected_total_cents=1))
        self.assertEqual(failure.exception.status, 409)
        self.assertEqual(self.owner("snapshot")["products"][0]["stock"], 10)

    def test_imported_staff_have_no_default_device_credential(self):
        config = self.ops.setup(2, 20, "Imported shop", "90000", "another-owner-password", initial_staff=[{"employee_id": 77, "employee_name": "Existing cashier", "role_code": "sales"}])
        imported = self.ops.admin(2, "snapshot", {}, account_owner=20)["staff"]
        person = next(p for p in imported if p["role"] != "owner")
        self.assertFalse(person["active"])
        self.assertEqual(person["legacy_employee_id"], 77)
        self.assertNotIn("credential", person)
        pairing = self.ops.enroll(2, config["branch"], "Imported till", "cashier", "account:20")
        device = self.ops.pair(pairing["code"], "test")
        with self.assertRaises(OperationsError):
            self.ops.authenticate(device, person["code"], "111111")

    def test_cross_business_sessions_and_product_ids_do_not_grant_access(self):
        d, s = self.cashier()
        config = self.ops.setup(2, 20, "Other company", "90000", "another-owner-password")
        pairing = self.ops.enroll(2, config["branch"], "Other till", "cashier", "account:20")
        other = self.ops.pair(pairing["code"], "test")
        with self.assertRaises(OperationsError):
            self.ops.catalog(other, s)
        grant = self.ops.authenticate(d, "90000", "owner-test-password", "management")
        with self.assertRaises(OperationsError):
            self.ops.admin(2, "snapshot", {}, device_token=d, management_token=grant)


class OperationsApiTests(OperationsFixture, unittest.TestCase):
    # Only API tests in this class; inherited domain cases also exercise the fixture.
    def client(self, enabled=True):
        app = FastAPI()
        app.add_middleware(OperationsBodyLimit)
        def owner(request, authorization, business, user):
            if authorization != "Bearer test-owner" or user != 10 or business != 1:
                raise HTTPException(403, "Owner required")
            return {"business_name": "Test shop"}
        app.include_router(create_operations_router(lambda: self.engine, owner, lambda owner, business: None, enabled=lambda: enabled))
        return TestClient(app, base_url="https://testserver")

    def test_api_fails_closed_when_disabled_and_protects_owner_endpoints(self):
        with self.client(False) as client:
            self.assertFalse(client.get("/operations/capabilities").json()["available"])
            self.assertEqual(client.get("/operations/device").status_code, 503)
        with self.client() as client:
            self.assertEqual(client.get("/businesses/1/operations/admin?user_id=10").status_code, 403)
            result = client.get("/businesses/1/operations/admin?user_id=10", headers={"Authorization": "Bearer test-owner"})
            self.assertEqual(result.status_code, 200)
            self.assertNotIn("credential", result.text)

    def test_api_issues_http_only_scoped_cookies_and_blocks_foreign_origins(self):
        with self.client() as client:
            pairing = self.ops.enroll(1, self.branch, "Till", "cashier", "account:10")
            r = client.post("/operations/device/pair", json={"code": pairing["code"]})
            self.assertEqual(r.status_code, 200)
            cookie = r.headers.get_list("set-cookie")[0]
            self.assertIn("HttpOnly", cookie)
            self.assertIn("Secure", cookie)
            self.assertIn("Path=/operations", cookie)
            self.assertIn("SameSite=strict", cookie)
            self.assertEqual(client.post("/operations/staff/login", json={"code": "10002", "credential": "654321"}).status_code, 200)
            self.assertEqual(client.get("/operations/admin").status_code, 403)
            self.assertEqual(client.post("/operations/staff/logout", headers={"Origin": "https://evil.example"}).status_code, 403)
            self.assertEqual(client.post("/operations/staff/logout").status_code, 200)
            self.assertIsNone(client.get("/operations/device").json()["staff"])

    def test_api_bounds_request_body_before_json_parsing(self):
        with self.client() as client:
            r = client.post("/operations/device/pair", content=b"x" * 70000, headers={"Content-Type": "application/json"})
            self.assertEqual(r.status_code, 413)

    def test_reused_business_identifier_cannot_expose_previous_operations_data(self):
        with self.ops.tx(1) as c:
            c.execute(update(businesses).where(businesses.c.id == 1).values(source_reference="previous-business-record"))
        with self.client() as client:
            r = client.get("/businesses/1/operations/admin?user_id=10", headers={"Authorization": "Bearer test-owner"})
            self.assertEqual(r.status_code, 403)

    def test_shared_device_cannot_keep_an_owner_account_cookie(self):
        with self.client() as client:
            pairing = self.ops.enroll(1, self.branch, "Till", "cashier", "account:10")
            client.cookies.set("keeperbma_session", "owner-account-cookie", domain="testserver.local", path="/")
            r = client.post("/operations/device/pair", json={"code": pairing["code"]})
            self.assertEqual(r.status_code, 409)


@unittest.skipUnless(os.environ.get("KEEPERBMA_TEST_POSTGRES_URL"), "Disposable PostgreSQL URL not configured")
class PostgreSQLOperationsTests(OperationsTests):
    postgres = True


if __name__ == "__main__":
    unittest.main()
