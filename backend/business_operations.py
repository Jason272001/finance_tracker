"""Persistent multi-device operations. No payment-card data is accepted here.

Separate device and operator credentials ensure a paired till never receives the
business account's bearer token. All mutations serialize per business on Postgres;
SQLite is supported for local integration tests only.
"""
STAFF_IDLE_SECONDS = 45 * 60

from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
import uuid

from sqlalchemy import (Boolean, Column, Integer, BigInteger, MetaData, String, Table, Text, Index,
                        UniqueConstraint, select, update, delete, text)


class OperationsError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def identity():
    return uuid.uuid4().hex


def digest(value):
    return hashlib.sha256(str(value).encode()).hexdigest()


def password_hash(value, salt=None, iterations=600000):
    salt = salt or secrets.token_hex(16)
    encoded = hashlib.pbkdf2_hmac("sha256", value.encode(), salt.encode(), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${encoded}"


def password_matches(value, stored):
    try:
        scheme, iterations, salt, _ = stored.split("$")
        if scheme != "pbkdf2_sha256" or not 300000 <= int(iterations) <= 2000000:
            return False
        return hmac.compare_digest(password_hash(value, salt, int(iterations)), stored)
    except (ValueError, AttributeError):
        return False


def clean(value, maximum=120):
    value = str(value or "").strip()
    if not value or len(value) > maximum:
        raise OperationsError(f"Enter a value between 1 and {maximum} characters.")
    return value


def whole(value, low=0, high=100000000):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise OperationsError(f"Use a whole number between {low} and {high}.")
    return value


metadata = MetaData()
businesses = Table("ops_businesses", metadata,
    Column("id", Integer, primary_key=True), Column("owner", Integer, nullable=False),
    Column("name", String(120), nullable=False), Column("timezone", String(80), nullable=False),
    Column("tax_bps", Integer, nullable=False, default=0), Column("source_reference", String(120), nullable=False, default=""))
branches = Table("ops_branches", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("name", String(80), nullable=False))
staff = Table("ops_staff", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("branch", String(32), nullable=False),
    Column("name", String(120), nullable=False), Column("code", String(6), nullable=False),
    Column("role", String(16), nullable=False), Column("credential", String(180), nullable=False),
    Column("active", Boolean, nullable=False), Column("epoch", Integer, nullable=False),
    Column("hourly_cents", Integer, nullable=False, default=0),
    Column("legacy_employee_id", Integer),
    UniqueConstraint("business", "code", name="ops_staff_business_code"))
PERMISSION_LABELS = {
    "checkout": "Use POS checkout", "kitchen": "Use kitchen tickets",
    "office": "Open back office", "approve": "Approve management access",
    "reports": "View sales reports", "products": "Manage products and stock",
    "schedules": "Manage schedules", "staff": "Manage team members",
    "timesheets": "View and correct timesheets", "void_sales": "Void cash sales",
    "audit": "View activity log", "all_branches": "Work across all branches",
    "devices": "Manage business devices",
    "customers": "Manage customer records",
}
DEFAULT_ROLES = {
    "manager": ("Manager", set(PERMISSION_LABELS)),
    "cashier": ("Sales team", {"checkout"}),
    "kitchen": ("Kitchen team", {"kitchen"}),
    "staff": ("Team member", set()),
}
roles = Table("ops_roles", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("name", String(80), nullable=False),
    Column("name_key", String(80), nullable=False), Column("builtin", String(16)),
    Column("permissions", Text, nullable=False),
    UniqueConstraint("business", "name_key", name="ops_role_business_name"),
    UniqueConstraint("business", "builtin", name="ops_role_business_builtin"))
role_assignments = Table("ops_staff_roles", metadata, Column("staff", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("role_id", String(32), nullable=False))

devices = Table("ops_devices", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("branch", String(32), nullable=False),
    Column("name", String(80), nullable=False), Column("mode", String(16), nullable=False),
    Column("token", String(64), unique=True), Column("expires", BigInteger),
    Column("active", Boolean, nullable=False), Column("created", BigInteger, nullable=False))
pairings = Table("ops_pairings", metadata, Column("token", String(64), primary_key=True),
    Column("device", String(32), nullable=False), Column("expires", BigInteger, nullable=False))
device_codes = Table("ops_device_codes", metadata, Column("device", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("code", String(16)),
    Column("expires", BigInteger, nullable=False), Column("used", Boolean, nullable=False, default=False),
    Column("deleted", Boolean, nullable=False, default=False))
sessions = Table("ops_sessions", metadata, Column("token", String(64), primary_key=True),
    Column("device", String(32), nullable=False, index=True), Column("staff", String(32), nullable=False),
    Column("kind", String(16), nullable=False), Column("epoch", Integer, nullable=False),
    Column("created", BigInteger, nullable=False), Column("seen", BigInteger, nullable=False), Column("expires", BigInteger, nullable=False))
limits = Table("ops_attempts", metadata, Column("key", String(64), primary_key=True),
    Column("start", BigInteger, nullable=False), Column("count", Integer, nullable=False))
products = Table("ops_products", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("branch", String(32), nullable=False),
    Column("name", String(120), nullable=False), Column("sku", String(60), nullable=False),
    Column("category", String(80), nullable=False), Column("price_cents", Integer, nullable=False),
    Column("stock", Integer, nullable=False), Column("active", Boolean, nullable=False),
    UniqueConstraint("business", "branch", "sku", name="ops_product_branch_sku"))
orders = Table("ops_orders", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("branch", String(32), nullable=False),
    Column("device", String(32), nullable=False), Column("cashier", String(32), nullable=False),
    Column("cashier_name", String(120), nullable=False), Column("request_id", String(64), nullable=False),
    Column("request_hash", String(64), nullable=False), Column("created", BigInteger, nullable=False),
    Column("items", Text, nullable=False), Column("subtotal", Integer, nullable=False),
    Column("tax", Integer, nullable=False), Column("total", Integer, nullable=False),
    Column("received", Integer, nullable=False), Column("kind", String(16), nullable=False),
    Column("fulfillment", String(16), nullable=False), Column("note", String(200), nullable=False),
    Column("ticket", String(16), nullable=False), Column("status", String(16), nullable=False),
    UniqueConstraint("business", "request_id", name="ops_order_request"))
punches = Table("ops_punches", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("branch", String(32), nullable=False),
    Column("staff", String(32), nullable=False), Column("name", String(120), nullable=False),
    Column("device", String(32), nullable=False), Column("start", BigInteger, nullable=False),
    Column("end", BigInteger), Column("hourly_cents", Integer, nullable=False),
    Column("closed_by", String(80)), Column("adjustment_note", String(200)))
schedules = Table("ops_schedules", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("branch", String(32), nullable=False),
    Column("staff", String(32), nullable=False), Column("name", String(120), nullable=False),
    Column("start", BigInteger, nullable=False), Column("end", BigInteger, nullable=False))
audit = Table("ops_audit", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("created", BigInteger, nullable=False),
    Column("actor", String(80), nullable=False), Column("device", String(32), nullable=False),
    Column("event", String(80), nullable=False), Column("reference", String(80), nullable=False))
cancelled_checkouts = Table("ops_cancelled_checkouts", metadata,
    Column("business", Integer, primary_key=True), Column("request_id", String(64), primary_key=True),
    Column("created", BigInteger, nullable=False), Column("actor", String(80), nullable=False))
Index("ops_kitchen_queue", orders.c.business, orders.c.branch, orders.c.status, orders.c.ticket)
Index("ops_daily_orders", orders.c.business, orders.c.created)
Index("ops_active_punch", punches.c.business, punches.c.staff, punches.c.end)
Index("ops_staff_schedule", schedules.c.staff, schedules.c.start, schedules.c.end)
Index("ops_recent_audit", audit.c.business, audit.c.created)


def row(connection, table, condition):
    found = connection.execute(select(table).where(condition)).mappings().first()
    return dict(found) if found else None


def rows(connection, table, condition):
    return [dict(r) for r in connection.execute(select(table).where(condition)).mappings()]


class Operations:
    def __init__(self, engine, now=time.time):
        self.engine, self.now = engine, now
        self._initialized = False
        self._schema_lock = threading.Lock()

    def initialize(self):
        with self._schema_lock:
            if self._initialized:
                return
            with self.engine.begin() as c:
                if c.dialect.name == "postgresql":
                    c.execute(text("SELECT pg_advisory_xact_lock(7438201990)"))
                elif c.dialect.name != "sqlite":
                    raise OperationsError("Operations requires PostgreSQL in production.", 503)
                metadata.create_all(c)
                for config in rows(c, businesses, businesses.c.id > 0):
                    self._ensure_roles(c, config["id"])
                for existing_product in rows(c, products, products.c.stock >= 0):
                    inventory.ensure_balance(c, existing_product)
                    industries.register(c, existing_product, row(c, inventory.details, inventory.details.c.product == existing_product["id"]) or {})
            self._initialized = True

    @contextmanager
    def tx(self, business=0):
        self.initialize()
        with self.engine.connect() as c:
            with c.begin():
                if c.dialect.name == "postgresql":
                    c.execute(text("SET LOCAL lock_timeout = '10s'"))
                    c.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 7438300000 + business})
                else:
                    c.exec_driver_sql("BEGIN IMMEDIATE")
                yield c

    @contextmanager
    def read(self):
        self.initialize()
        with self.engine.connect() as c:
            yield c

    def log(self, c, business, actor, device, event, reference=""):
        c.execute(audit.insert().values(id=identity(), business=business, created=int(self.now()),
            actor=actor, device=device, event=event, reference=reference))

    def _ensure_roles(self, c, business):
        for key, (name, permissions) in DEFAULT_ROLES.items():
            existing = row(c, roles, (roles.c.business == business) & (roles.c.builtin == key))
            if not existing:
                c.execute(roles.insert().values(id=identity(), business=business, name=name, name_key=name.casefold(), builtin=key, permissions=json.dumps(sorted(permissions))))
            elif key == "manager" and set(json.loads(existing["permissions"])) == set(PERMISSION_LABELS) - {"devices"}:
                c.execute(update(roles).where(roles.c.id == existing["id"]).values(permissions=json.dumps(sorted(permissions))))
                c.execute(update(staff).where((staff.c.business == business) & (staff.c.role == "manager")).values(epoch=staff.c.epoch + 1))

    def _role_for(self, c, person):
        assignment = row(c, role_assignments, role_assignments.c.staff == person["id"])
        if assignment:
            selected = row(c, roles, (roles.c.business == person["business"]) & (roles.c.id == assignment["role_id"]))
            if not selected:
                raise OperationsError("Staff role is unavailable. Ask the owner to review access.", 403)
            return selected
        return row(c, roles, (roles.c.business == person["business"]) & (roles.c.builtin == person["role"]))

    def permissions(self, c, person):
        if person["role"] == "owner":
            return set(PERMISSION_LABELS)
        selected = self._role_for(c, person)
        return set(json.loads(selected["permissions"])) if selected else set()

    def staff_details(self, c, person):
        selected = self._role_for(c, person) if person["role"] != "owner" else None
        return {**self.public_staff(person), "role_id": selected["id"] if selected else "owner",
                "role_name": selected["name"] if selected else "Owner" if person["role"] == "owner" else "Unassigned",
                "permissions": sorted(self.permissions(c, person))}

    def _new_staff_code(self, c, business):
        for _ in range(100):
            code = str(100000 + secrets.randbelow(900000))
            if not row(c, staff, (staff.c.business == business) & (staff.c.code == code)):
                return code
        raise OperationsError("Could not allocate a staff ID. Try again.", 409)

    def setup(self, business, owner, name, code, credential, tz="America/Los_Angeles", initial_staff=None, source_reference="", industry=None):
        self.validate_credential(code, credential, "owner")
        try:
            ZoneInfo(tz)
        except (KeyError, ValueError):
            raise OperationsError("Choose a valid business time zone.")
        with self.tx(business) as c:
            if row(c, businesses, businesses.c.id == business):
                raise OperationsError("Operations is already configured. Use owner controls to edit staff.", 409)
            branch = identity()
            c.execute(businesses.insert().values(id=business, owner=owner, name=clean(name), timezone=tz, tax_bps=0, source_reference=str(source_reference or "")))
            c.execute(branches.insert().values(id=branch, business=business, name="Main branch"))
            sid = identity()
            c.execute(staff.insert().values(id=sid, business=business, branch=branch, name="Business owner",
                code=code, role="owner", credential=password_hash(credential), active=True, epoch=1, hourly_cents=0))
            self._ensure_roles(c, business)
            if industry is not None:
                industries.set_mode(c,business,industry)
            used_codes = {code}
            for index, old in enumerate(initial_staff or []):
                proposed = str(10001 + index)
                while proposed in used_codes:
                    proposed = str(int(proposed) + 1)
                used_codes.add(proposed)
                old_role = str(old.get("role_code", "staff"))
                role = {"sales": "cashier", "cashier": "cashier", "kitchen": "kitchen", "manager": "manager"}.get(old_role, "staff")
                c.execute(staff.insert().values(id=identity(), business=business, branch=branch,
                    name=clean(old.get("employee_name")), code=proposed, role=role,
                    credential="", active=False, epoch=1, hourly_cents=0, legacy_employee_id=int(old["employee_id"])))
            self.log(c, business, "account:" + str(owner), "", "operations.setup", sid)
        return {"business_id": business, "branch": branch, "owner_staff_id": sid}

    @staticmethod
    def validate_credential(code, credential, role):
        if not re.fullmatch(r"[0-9]{5,6}", str(code)):
            raise OperationsError("Staff IDs must contain 5 or 6 digits.")
        if not isinstance(credential, str) or not re.fullmatch(r"[0-9]{4,6}", credential):
            raise OperationsError("Use a numeric PIN containing 4 to 6 digits.")

    def _branch(self, c, business, branch):
        if not row(c, branches, (branches.c.business == business) & (branches.c.id == branch)):
            raise OperationsError("Branch does not belong to this business.", 403)

    def _rate(self, c, key, maximum=5, window=300):
        key, now = digest(key), int(self.now())
        entry = row(c, limits, limits.c.key == key)
        if not entry or now - entry["start"] >= window:
            c.execute(delete(limits).where(limits.c.key == key))
            c.execute(limits.insert().values(key=key, start=now, count=1))
            return True
        c.execute(update(limits).where(limits.c.key == key).values(count=entry["count"] + 1))
        return entry["count"] < maximum

    def _device(self, c, token):
        d = row(c, devices, devices.c.token == digest(token)) if token else None
        if not d or not d["active"] or d["expires"] <= self.now():
            raise OperationsError("This device must be authorized by the owner.", 401)
        return d

    def device_business(self, token):
        with self.read() as c:
            d = self._device(c, token)
            b = row(c, businesses, businesses.c.id == d["business"])
            return {"business": b, "device": d}

    def _session(self, c, device, token, kind="staff"):
        s = row(c, sessions, sessions.c.token == digest(token)) if token else None
        idle = 120 if kind == "management" else STAFF_IDLE_SECONDS
        if not s or s["device"] != device["id"] or s["kind"] != kind or s["expires"] <= self.now() or self.now() - s["seen"] >= idle:
            raise OperationsError("Staff sign-in expired or is required.", 401)
        person = row(c, staff, staff.c.id == s["staff"])
        if not person or person["business"] != device["business"] or not person["active"] or person["epoch"] != s["epoch"]:
            raise OperationsError("Staff access has changed. Sign in again.", 401)
        permissions = self.permissions(c, person)
        required = "approve" if kind == "management" else {"cashier": "checkout", "kitchen": "kitchen", "office": "office"}.get(device["mode"])
        if required and required not in permissions:
            raise OperationsError("This role no longer has access to this device function.", 403)
        if person["branch"] != device["branch"] and "all_branches" not in permissions:
            raise OperationsError("Staff access is assigned to another branch.", 403)
        return person, s

    @staticmethod
    def public_staff(p):
        return {k: v for k, v in p.items() if k not in {"credential", "epoch"}}

    def _manager(self, c, device, staff_token, management_token):
        if management_token:
            p, s = self._session(c, device, management_token, "management")
        elif device["mode"] == "office":
            p, s = self._session(c, device, staff_token)
        else:
            raise OperationsError("Fresh management approval is required.", 403)
        return p, s

    def context(self, device_token, staff_token="", management_token=""):
        with self.read() as c:
            d = self._device(c, device_token)
            b = row(c, businesses, businesses.c.id == d["business"])
            branch = row(c, branches, branches.c.id == d["branch"])
            actor, management = None, None
            try:
                p, s = self._session(c, d, staff_token)
                actor = {**self.staff_details(c, p), "expires": s["expires"], "idle_until": s["seen"] + STAFF_IDLE_SECONDS}
            except OperationsError:
                pass
            try:
                p, s = self._session(c, d, management_token, "management")
                management = {"name": p["name"], "role": p["role"], "permissions": sorted(self.permissions(c, p)), "idle_until": s["seen"] + 120, "expires": s["expires"]}
            except OperationsError:
                pass
            return {"business": {"id": b["id"], "name": b["name"], "timezone": b["timezone"], "tax_bps": b["tax_bps"], "industry": industries.mode(c, b["id"]), "staff_idle_seconds": STAFF_IDLE_SECONDS},
                    "device": {k: d[k] for k in ["id", "name", "mode", "branch"]}, "branch": branch["name"], "staff": actor, "management": management, "server_time": int(self.now())}

    def _code_for_device(self, c, device):
        code, now = secrets.token_hex(8).upper(), int(self.now())
        if device.get("active") is False:
            c.execute(update(devices).where(devices.c.id == device["id"]).values(token=None))
            c.execute(delete(sessions).where(sessions.c.device == device["id"]))
        c.execute(delete(pairings).where(pairings.c.device == device["id"]))
        c.execute(pairings.insert().values(token=digest(code), device=device["id"], expires=now + 300))
        c.execute(delete(device_codes).where(device_codes.c.device == device["id"]))
        c.execute(device_codes.insert().values(device=device["id"], business=device["business"], code=code, expires=now + 300, used=False, deleted=False))
        c.execute(update(devices).where(devices.c.id == device["id"]).values(active=True, expires=now + 30 * 86400))
        return {"id": device["id"], "code": code, "expires": now + 300}

    def _enroll_device(self, c, business, branch, name, mode):
        if mode not in {"cashier", "kitchen", "clock", "office"}:
            raise OperationsError("Choose cashier, kitchen, clock or office.")
        self._branch(c, business, branch)
        did, now = identity(), int(self.now())
        c.execute(devices.insert().values(id=did, business=business, branch=branch, name=clean(name, 80), mode=mode, active=True, created=now, expires=now + 30 * 86400))
        return self._code_for_device(c, {"id": did, "business": business})

    def enroll(self, business, branch, name, mode, actor):
        with self.tx(business) as c:
            result = self._enroll_device(c, business, branch, name, mode)
            self.log(c, business, actor, "", "device.enrollment_created", result["id"])
            return result

    def pair(self, code, address):
        with self.tx() as c:
            allowed = self._rate(c, "pair:" + address, 30)
        if not allowed:
            raise OperationsError("Too many pairing attempts. Try again in five minutes.", 429)
        with self.read() as c:
            saved = row(c, pairings, pairings.c.token == digest(str(code).strip().upper()))
            target = row(c, devices, devices.c.id == saved["device"]) if saved else None
        with self.tx(target["business"] if target else 0) as c:
            pairing = row(c, pairings, pairings.c.token == digest(str(code).strip().upper()))
            d = row(c, devices, devices.c.id == pairing["device"]) if pairing else None
            if not pairing or pairing["expires"] <= self.now() or not d or not d["active"]:
                raise OperationsError("Pairing code is invalid or expired.", 401)
            secret = secrets.token_urlsafe(32)
            c.execute(update(devices).where(devices.c.id == d["id"]).values(token=digest(secret)))
            c.execute(delete(pairings).where(pairings.c.token == pairing["token"]))
            c.execute(delete(sessions).where(sessions.c.device == d["id"]))
            c.execute(update(device_codes).where(device_codes.c.device == d["id"]).values(used=True))
            self.log(c, d["business"], "owner-enrollment", d["id"], "device.paired")
            return secret

    def authenticate(self, device_token, code, credential, action="login", current_token=""):
        business = self.device_business(device_token)["business"]["id"]
        error, result = None, None
        with self.tx(business) as c:
            d = self._device(c, device_token)
            allowed = self._rate(c, "staff-device:" + d["id"], 30, 60)
            allowed = self._rate(c, "staff-code:" + d["id"] + ":" + str(code), 5) and allowed
            allowed = self._rate(c, "staff-business:" + str(business) + ":" + str(code), 5) and allowed
            person = row(c, staff, (staff.c.business == business) & (staff.c.code == str(code)))
            if not allowed:
                error = OperationsError("Too many sign-in attempts. Try again in five minutes.", 429)
            elif not person or not person["active"] or not re.fullmatch(r"[0-9]{4,6}", str(credential)) or not password_matches(credential, person["credential"]):
                error = OperationsError("Staff ID or PIN is incorrect.", 401)
            elif person["branch"] != d["branch"] and "all_branches" not in self.permissions(c, person):
                error = OperationsError("This staff member is assigned to another branch.", 403)
            elif action in {"in", "out"} and d["mode"] != "clock":
                error = OperationsError("Use the time-clock device for attendance.", 403)
            elif action == "management" and "approve" not in self.permissions(c, person):
                error = OperationsError("Your role cannot approve management access.", 403)
            elif action == "login" and (d["mode"] == "clock" or {"cashier": "checkout", "kitchen": "kitchen", "office": "office"}.get(d["mode"]) not in self.permissions(c, person)):
                error = OperationsError("This role cannot sign into this device mode.", 403)
            else:
                if action == "login" and current_token:
                    try:
                        self._session(c, d, current_token)
                        error = OperationsError("Sign out the current operator before switching staff.", 409)
                    except OperationsError as e:
                        if e.status != 401:
                            raise
                if not error:
                    if action in {"in", "out"}:
                        active = row(c, punches, (punches.c.business == business) & (punches.c.staff == person["id"]) & punches.c.end.is_(None))
                        if action == "in" and active:
                            error = OperationsError("You are already clocked in.", 409)
                        elif action == "out" and not active:
                            error = OperationsError("You are not clocked in.", 409)
                        else:
                            now = int(self.now())
                            if action == "in":
                                c.execute(punches.insert().values(id=identity(), business=business, branch=d["branch"], staff=person["id"], name=person["name"], device=d["id"], start=now, hourly_cents=person["hourly_cents"]))
                            else:
                                c.execute(update(punches).where(punches.c.id == active["id"]).values(end=now, closed_by=person["id"]))
                            result = {"name": person["name"], "action": action, "time": now}
                    elif action in {"login", "management"}:
                        kind = "management" if action == "management" else "staff"
                        secret, now = secrets.token_urlsafe(32), int(self.now())
                        c.execute(delete(sessions).where((sessions.c.device == d["id"]) & (sessions.c.kind == kind)))
                        c.execute(sessions.insert().values(token=digest(secret), device=d["id"], staff=person["id"], kind=kind, epoch=person["epoch"], created=now, seen=now, expires=now + 300 if kind == "management" else d["expires"]))
                        result = secret
                    else:
                        error = OperationsError("Unknown staff action.")
                    if not error:
                        self.log(c, business, person["id"], d["id"], "staff." + action)
                        c.execute(delete(limits).where(limits.c.key == digest("staff-code:" + d["id"] + ":" + str(code))))
                        c.execute(delete(limits).where(limits.c.key == digest("staff-business:" + str(business) + ":" + str(code))))
        if error:
            raise error
        return result

    def logout(self, device_token, staff_token="", management_token="", management_only=False):
        bid = self.device_business(device_token)["business"]["id"]
        with self.tx(bid) as c:
            d = self._device(c, device_token)
            tokens = [management_token] if management_only else [staff_token, management_token]
            for token in tokens:
                if token:
                    s = row(c, sessions, (sessions.c.token == digest(token)) & (sessions.c.device == d["id"]))
                    if s:
                        c.execute(delete(sessions).where(sessions.c.token == s["token"]))
                        self.log(c, bid, s["staff"], d["id"], "staff.lock" if management_only else "staff.logout")

    def admin(self, business, action, values, *, account_owner=None, device_token="", staff_token="", management_token="", _connection=None):
        with (self.tx(business) if _connection is None else nullcontext(_connection)) as c:
            config = row(c, businesses, businesses.c.id == business)
            if not config:
                raise OperationsError("Configure business operations first.", 409)
            if account_owner is not None:
                if config["owner"] != account_owner:
                    raise OperationsError("Only the business owner can perform this action.", 403)
                actor, role, did = "account:" + str(account_owner), "owner", ""
                granted, scoped_branch = set(PERMISSION_LABELS), None
            else:
                d = self._device(c, device_token)
                if d["business"] != business:
                    raise OperationsError("Business scope mismatch.", 403)
                p, session = self._manager(c, d, staff_token, management_token)
                actor, role, did = p["id"], p["role"], d["id"]
                granted = self.permissions(c, p)
                scoped_branch = None if "all_branches" in granted else d["branch"]
                if action != "snapshot":
                    c.execute(update(sessions).where(sessions.c.token == session["token"]).values(seen=int(self.now())))
            if action == "snapshot":
                return self._admin_snapshot(c, business, role, values.get("date"), granted, scoped_branch)
            needed = {"staff": "staff", "product": "products", "schedule": "schedules", "cancel_schedule": "schedules", "close_shift": "timesheets", "void_order": "void_sales", "cancel_checkout": "void_sales", "enroll_device": "devices", "renew_device": "devices", "delete_device": "devices", "revoke_device": "devices"}.get(action)
            if needed and needed not in granted:
                raise OperationsError("Your role does not have permission for this action.", 403)
            if action in {"import_preview", "import_rows"}:
                savepoint = c.begin_nested()
                try:
                    result = imports.apply(c, business, values.get("kind"), values.get("rows"), values.get("branch"), scoped_branch, granted, role == "owner", actor, self.now(), lambda nested, payload: self.admin(business, nested, payload, account_owner=account_owner, device_token=device_token, staff_token=staff_token, management_token=management_token, _connection=c), collection_id=values.get("collection"))
                    if action == "import_preview":
                        savepoint.rollback()
                    else:
                        savepoint.commit()
                except Exception:
                    if savepoint.is_active:
                        savepoint.rollback()
                    raise
            elif action.startswith("customer"):
                if "customers" not in granted:
                    raise OperationsError("Customer management permission is required.",403)
                result = customers.handle(c,business,action,values,scoped_branch,role=="owner",self.now())
            elif action == "business_type":
                if role != "owner":
                    raise OperationsError("Only the owner can choose the business type.", 403)
                result = industries.set_mode(c, business, values.get("industry"))
            elif action == "restaurant_ingredient":
                if "products" not in granted:
                    raise OperationsError("Product management permission is required.", 403)
                result = industries.save_ingredient(c, business, values, scoped_branch)
            elif action.startswith("inventory_"):
                if "products" not in granted:
                    raise OperationsError("Inventory management permission is required.", 403)
                result = inventory.handle(c, business, action, values, scoped_branch, actor, self.now())
            elif action == "assign_device":
                if "devices" not in granted:
                    raise OperationsError("Device management permission is required.", 403)
                target = row(c, devices, (devices.c.business == business) & (devices.c.id == values.get("id")))
                if not target or not target["active"] or scoped_branch and target["branch"] != scoped_branch:
                    raise OperationsError("Choose an active device you can manage.", 403)
                mode = values.get("mode")
                if mode not in {"cashier", "kitchen", "clock", "office"}:
                    raise OperationsError("Choose cashier, kitchen, clock or office.")
                if mode == "kitchen" and industries.mode(c, business) != "restaurant":
                    raise OperationsError("Kitchen devices require a Restaurant business.")
                c.execute(update(devices).where(devices.c.id == target["id"]).values(mode=mode))
                c.execute(delete(sessions).where(sessions.c.device == target["id"]))
                result = {"id": target["id"], "mode": mode}
            elif action == "enroll_device":
                if scoped_branch and values.get("branch") != scoped_branch:
                    raise OperationsError("Choose a device branch you can manage.", 403)
                result = self._enroll_device(c, business, values.get("branch"), values.get("name"), values.get("mode"))
            elif action in {"renew_device", "delete_device", "revoke_device"}:
                target = row(c, devices, (devices.c.business == business) & (devices.c.id == values.get("id")))
                saved = row(c, device_codes, device_codes.c.device == target["id"]) if target else None
                if not target or saved and saved["deleted"] or scoped_branch and target["branch"] != scoped_branch:
                    raise OperationsError("Choose a device you can manage.", 403)
                if action == "renew_device":
                    result = self._code_for_device(c, target)
                else:
                    c.execute(update(devices).where(devices.c.id == target["id"]).values(active=False, token=None))
                    c.execute(delete(pairings).where(pairings.c.device == target["id"]))
                    c.execute(delete(sessions).where(sessions.c.device == target["id"]))
                    if saved:
                        c.execute(update(device_codes).where(device_codes.c.device == target["id"]).values(deleted=action == "delete_device", used=True))
                    else:
                        c.execute(device_codes.insert().values(device=target["id"], business=business, code=None, expires=0, used=True, deleted=action == "delete_device"))
                    result = {"id": target["id"], "ok": True}
            elif action == "role":
                if role != "owner":
                    raise OperationsError("Only the owner can create or change permission roles.", 403)
                existing_role = row(c, roles, (roles.c.business == business) & (roles.c.id == values.get("id", "")))
                if values.get("id") and not existing_role:
                    raise OperationsError("Choose a role from this business.", 403)
                name = clean(values.get("name"), 80)
                if name.casefold() == "owner":
                    raise OperationsError("Owner access is reserved for the original business owner.", 403)
                permissions = values.get("permissions", [])
                if not isinstance(permissions, list) or any(not isinstance(key, str) or key not in PERMISSION_LABELS for key in permissions):
                    raise OperationsError("Choose valid business permissions.")
                permissions = set(permissions)
                if permissions - {"checkout", "kitchen", "all_branches"} and "office" not in permissions:
                    raise OperationsError("Enable back-office access for management permissions.")
                duplicate = row(c, roles, (roles.c.business == business) & (roles.c.name_key == name.casefold()))
                if duplicate and (not existing_role or duplicate["id"] != existing_role["id"]):
                    raise OperationsError("A role with this name already exists.", 409)
                rid = existing_role["id"] if existing_role else identity()
                record = dict(id=rid, business=business, name=name, name_key=name.casefold(), builtin=existing_role["builtin"] if existing_role else None, permissions=json.dumps(sorted(permissions)))
                c.execute(update(roles).where(roles.c.id == rid).values(**record) if existing_role else roles.insert().values(**record))
                assigned = [a["staff"] for a in rows(c, role_assignments, (role_assignments.c.business == business) & (role_assignments.c.role_id == rid))]
                affected = (staff.c.business == business) & ((staff.c.id.in_(assigned)) | (staff.c.role == existing_role["builtin"] if existing_role and existing_role["builtin"] else text("false"))) & (staff.c.role != "owner")
                c.execute(update(staff).where(affected).values(epoch=staff.c.epoch + 1))
                result = {"id": rid}
            elif action == "branch":
                if role != "owner":
                    raise OperationsError("Only the owner can create business branches.", 403)
                branch = identity()
                c.execute(branches.insert().values(id=branch, business=business, name=clean(values.get("name"), 80)))
                result = {"id": branch}
            elif action == "staff":
                if not isinstance(values.get("role_id", ""), str):
                    raise OperationsError("Choose a valid business role.")
                selected_role = row(c, roles, (roles.c.business == business) & (roles.c.id == values.get("role_id", ""))) if values.get("role_id") not in {None, "", "owner"} else None
                if values.get("role_id") not in {None, "", "owner"} and not selected_role:
                    raise OperationsError("Choose a role from this business.", 403)
                desired_role = (selected_role["builtin"] or "custom") if selected_role else "owner" if values.get("role_id") == "owner" else values.get("role", "staff")
                if not isinstance(desired_role, str) or desired_role not in {"manager", "cashier", "kitchen", "staff", "owner", "custom"}:
                    raise OperationsError("Choose a valid staff role.")
                existing = row(c, staff, (staff.c.business == business) & (staff.c.id == values.get("id", "")))
                if values.get("id") and not existing:
                    raise OperationsError("Choose a staff member from this business.", 403)
                if desired_role == "custom" and not selected_role:
                    raise OperationsError("Choose a custom role from this business.")
                desired_permissions = set(json.loads(selected_role["permissions"])) if selected_role else set(PERMISSION_LABELS) if desired_role == "owner" else self.permissions(c, {"id": "", "business": business, "role": desired_role})
                if scoped_branch and ((existing and existing["branch"] != scoped_branch) or values.get("branch") != scoped_branch):
                    raise OperationsError("This staff member belongs to another branch.", 403)
                if role != "owner" and (desired_permissions - granted or desired_permissions & {"office", "approve", "staff"} or existing and (self.permissions(c, existing) & {"office", "approve", "staff"} or self.permissions(c, existing) - granted)):
                    raise OperationsError("Only the owner can assign or edit privileged staff access.", 403)
                if role != "owner" and (desired_role in {"owner", "manager"} or existing and existing["role"] in {"owner", "manager"}):
                    raise OperationsError("Only the owner can manage owner or manager credentials.", 403)
                if desired_role == "owner" and (not existing or existing["role"] != "owner"):
                    raise OperationsError("The original business owner retains owner access.", 403)
                if existing and existing["role"] == "owner" and (desired_role != "owner" or values.get("active") is False):
                    raise OperationsError("The business owner cannot be disabled or demoted here.", 403)
                if existing and values.get("active") is False and row(c, punches, (punches.c.staff == existing["id"]) & punches.c.end.is_(None)):
                    raise OperationsError("Clock out this staff member before deactivating access.", 409)
                branch = values.get("branch") or (existing or {}).get("branch")
                self._branch(c, business, branch)
                code = existing["code"] if existing else self._new_staff_code(c, business)
                if existing and values.get("code") not in (None, "", existing["code"]):
                    raise OperationsError("Staff IDs are permanent and cannot be changed.")
                credential = values.get("credential", "")
                if existing and not existing["credential"] and not credential:
                    raise OperationsError("Set a PIN before activating an imported staff member.")
                if credential or not existing:
                    self.validate_credential(code, credential, desired_role)
                duplicate = row(c, staff, (staff.c.business == business) & (staff.c.code == code))
                if duplicate and (not existing or duplicate["id"] != existing["id"]):
                    raise OperationsError("That staff ID is already used.", 409)
                sid = existing["id"] if existing else identity()
                active = values.get("active", existing["active"] if existing else True)
                if not isinstance(active, bool):
                    raise OperationsError("Staff active status must be true or false.")
                record = dict(id=sid, business=business, branch=branch, name=clean(values.get("name")), code=code, role=desired_role,
                    credential=password_hash(credential) if credential else existing["credential"], active=active,
                    epoch=(existing["epoch"] + 1) if existing else 1, hourly_cents=whole(values.get("hourly_cents", 0), 0, 100000))
                if existing:
                    c.execute(update(staff).where(staff.c.id == sid).values(**record))
                else:
                    c.execute(staff.insert().values(**record))
                c.execute(delete(role_assignments).where(role_assignments.c.staff == sid))
                if selected_role:
                    c.execute(role_assignments.insert().values(staff=sid, business=business, role_id=selected_role["id"]))
                result = {"id": sid, "code": code}
            elif action == "product":
                branch = values.get("branch")
                self._branch(c, business, branch)
                if scoped_branch and branch != scoped_branch:
                    raise OperationsError("This product belongs to another branch.", 403)
                sku = clean(values.get("sku"), 60)
                existing = row(c, products, (products.c.business == business) & (products.c.id == values.get("id", "")))
                if existing and scoped_branch and existing["branch"] != scoped_branch:
                    raise OperationsError("This product belongs to another branch.", 403)
                duplicate = row(c, products, (products.c.business == business) & (products.c.branch == branch) & (products.c.sku == sku))
                if duplicate and (not existing or duplicate["id"] != existing["id"]):
                    raise OperationsError("That product code already exists in this branch.", 409)
                pid = existing["id"] if existing else identity()
                active = values.get("active", existing["active"] if existing else True)
                if not isinstance(active, bool):
                    raise OperationsError("Product active status must be true or false.")
                if existing and existing["branch"] != branch:
                    raise OperationsError("Create a separate branch product instead of moving its stock history.")
                record = dict(id=pid, business=business, branch=branch, name=clean(values.get("name")), sku=sku,
                    category=clean(values.get("category", "Products"), 80), price_cents=whole(values.get("price_cents"), 1),
                    stock=whole(values.get("stock"), 0, 1000000), active=active)
                c.execute(update(products).where(products.c.id == pid).values(**record) if existing else products.insert().values(**record))
                inventory.save_product(c, record, values, existing["stock"] if existing else 0, actor, self.now())
                result = {"id": pid}
            elif action == "schedule":
                person = row(c, staff, (staff.c.business == business) & (staff.c.id == values.get("staff")))
                if not person or not person["active"] or scoped_branch and person["branch"] != scoped_branch:
                    raise OperationsError("Choose an active staff member.")
                start, end = whole(values.get("start"), 1, 4102444800), whole(values.get("end"), 1, 4102444800)
                if not 0 < end - start <= 24 * 3600:
                    raise OperationsError("A shift must end after it starts and be no longer than 24 hours.")
                if row(c, schedules, (schedules.c.staff == person["id"]) & (schedules.c.start < end) & (schedules.c.end > start)):
                    raise OperationsError("This staff member already has an overlapping shift.", 409)
                sid = identity()
                c.execute(schedules.insert().values(id=sid, business=business, branch=person["branch"], staff=person["id"], name=person["name"], start=start, end=end))
                result = {"id": sid}
            elif action == "cancel_schedule":
                target = row(c, schedules, (schedules.c.business == business) & (schedules.c.id == values.get("id")))
                if target and scoped_branch and target["branch"] != scoped_branch:
                    raise OperationsError("This shift belongs to another branch.", 403)
                c.execute(delete(schedules).where((schedules.c.business == business) & (schedules.c.id == values.get("id"))))
                result = {"ok": True}
            elif action == "close_shift":
                shift = row(c, punches, (punches.c.business == business) & (punches.c.id == values.get("id")))
                if not shift or shift["end"] is not None or scoped_branch and shift["branch"] != scoped_branch:
                    raise OperationsError("Choose an open clock interval.", 409)
                end = whole(values.get("end"), 1, 4102444800)
                if end <= shift["start"] or end > self.now():
                    raise OperationsError("The corrected end must follow clock-in and cannot be in the future.")
                reason = clean(values.get("reason"), 200)
                c.execute(update(punches).where(punches.c.id == shift["id"]).values(end=end, closed_by=actor, adjustment_note=reason))
                result = {"id": shift["id"]}
            elif action == "config":
                if role != "owner":
                    raise OperationsError("Only the owner can change tax settings.", 403)
                c.execute(update(businesses).where(businesses.c.id == business).values(tax_bps=whole(values.get("tax_bps"), 0, 3000)))
                result = {"ok": True}
            elif action == "void_order":
                order = row(c, orders, (orders.c.business == business) & (orders.c.id == values.get("id")))
                if not order or order["status"] != "paid" or scoped_branch and order["branch"] != scoped_branch:
                    raise OperationsError("Choose a paid order that has not been voided.", 409)
                inventory.restore_sale(c, order, actor, self.now())
                for line in json.loads(order["items"]):
                    c.execute(update(products).where(products.c.id == line["id"]).values(stock=products.c.stock + line["quantity"]))
                c.execute(update(orders).where(orders.c.id == order["id"]).values(status="void", ticket="cancelled"))
                result = {"ok": True}
            elif action == "cancel_checkout":
                rid = clean(values.get("request_id"), 64)
                previous = row(c, orders, (orders.c.business == business) & (orders.c.request_id == rid))
                if previous and scoped_branch and previous["branch"] != scoped_branch:
                    raise OperationsError("This checkout belongs to another branch.", 403)
                if previous:
                    result = {"recorded": True, "order": self.public_order(previous)}
                else:
                    if scoped_branch:
                        raise OperationsError("The owner must review an unrecorded checkout reference.", 403)
                    if not row(c, cancelled_checkouts, (cancelled_checkouts.c.business == business) & (cancelled_checkouts.c.request_id == rid)):
                        c.execute(cancelled_checkouts.insert().values(business=business, request_id=rid, created=int(self.now()), actor=actor))
                    result = {"recorded": False, "cancelled": True}
            else:
                raise OperationsError("Unknown management action.")
            self.log(c, business, actor, did, "management." + action, result.get("id", values.get("id", "")))
            return result

    def _admin_snapshot(self, c, business, role, chosen_day=None, granted=None, scoped_branch=None):
        granted = set(PERMISSION_LABELS) if granted is None else granted
        config = row(c, businesses, businesses.c.id == business)
        if chosen_day:
            if not isinstance(chosen_day, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", chosen_day):
                raise OperationsError("Choose a valid report date.")
            try:
                day = datetime.strptime(chosen_day, "%Y-%m-%d").date()
            except ValueError:
                raise OperationsError("Choose a valid report date.")
            if not 1970 <= day.year <= 2100:
                raise OperationsError("Choose a report date between 1970 and 2100.")
        else:
            day = datetime.fromtimestamp(self.now(), ZoneInfo(config["timezone"])).date()
        start = int(datetime(day.year, day.month, day.day, tzinfo=ZoneInfo(config["timezone"])).timestamp())
        from datetime import timedelta
        end = int(datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=ZoneInfo(config["timezone"])).timestamp())
        today = rows(c, orders, (orders.c.business == business) & (orders.c.created >= start) & (orders.c.created < end))
        paid = [r for r in today if r["status"] == "paid"]
        result = {"role": role, "permissions": sorted(granted), "permission_labels": PERMISSION_LABELS, "business": config, "branches": rows(c, branches, branches.c.business == business),
                "staff": [self.staff_details(c, p) for p in rows(c, staff, staff.c.business == business)],
                "roles": [{**r, "permissions": json.loads(r["permissions"])} for r in rows(c, roles, roles.c.business == business)],
                "products": rows(c, products, products.c.business == business),
                "devices": [{**{k: v for k, v in d.items() if k != "token"}, "paired": bool(d["token"])} for d in rows(c, devices, devices.c.business == business)],
                "server_time": int(self.now()),
                "schedules": rows(c, schedules, (schedules.c.business == business) & (schedules.c.end > self.now() - 31 * 86400)),
                "timesheets": rows(c, punches, (punches.c.business == business) & (punches.c.start >= self.now() - 31 * 86400)),
                "orders": [self.public_order(o) for o in today],
                "report": {"date": str(day), "timezone": config["timezone"], "paid_orders": len(paid), "subtotal_cents": sum(o["subtotal"] for o in paid), "tax_cents": sum(o["tax"] for o in paid), "total_cents": sum(o["total"] for o in paid), "void_orders": len(today) - len(paid)},
                "audit": rows(c, audit, (audit.c.business == business) & (audit.c.created >= self.now() - 7 * 86400))[-200:]}

        if scoped_branch:
            for key in ["branches", "staff", "products", "schedules", "timesheets", "orders"]:
                result[key] = [r for r in result[key] if (r.get("branch") if key != "branches" else r["id"]) == scoped_branch]
            branch_devices = {device["id"] for device in result["devices"] if device["branch"] == scoped_branch}
            result["audit"] = [event for event in result["audit"] if event["device"] in branch_devices]
            paid = [o for o in result["orders"] if o["status"] == "paid"]
            result["report"].update(paid_orders=len(paid), subtotal_cents=sum(o["subtotal"] for o in paid), tax_cents=sum(o["tax"] for o in paid), total_cents=sum(o["total"] for o in paid), void_orders=len(result["orders"]) - len(paid))
        access = {"products": "products", "schedules": "schedules", "timesheets": "timesheets", "audit": "audit"}
        for key, permission in access.items():
            if permission not in granted:
                result[key] = []
        if not granted & {"reports", "void_sales"}:
            result["orders"] = []
        if "reports" not in granted:
            result["report"].update(paid_orders=0, subtotal_cents=0, tax_cents=0, total_cents=0, void_orders=0)
        if not granted & {"staff", "schedules", "timesheets"} and role != "owner":
            result["staff"] = []
        elif not granted & {"staff", "timesheets"}:
            for person in result["staff"]:
                person.pop("hourly_cents", None)
        if "devices" not in granted:
            result["devices"] = []
        else:
            saved_codes = {r["device"]: r for r in rows(c, device_codes, device_codes.c.business == business)}
            result["devices"] = [{**d, "pairing_code": saved_codes.get(d["id"], {}).get("code"), "code_expires": saved_codes.get(d["id"], {}).get("expires", 0), "code_used": saved_codes.get(d["id"], {}).get("used", False)} for d in result["devices"] if not saved_codes.get(d["id"], {}).get("deleted") and (not scoped_branch or d["branch"] == scoped_branch)]
        result["customers"] = customers.snapshot(c,business,scoped_branch,"customers" in granted)
        result["business"]["industry"] = industries.mode(c, business)
        result["products"] = industries.enrich(c, result["products"])
        result["inventory"] = inventory.snapshot(c, business, scoped_branch) if "products" in granted else {}
        imported = rows(c, imports.history, (imports.history.c.business == business) & ((imports.history.c.branch == scoped_branch) if scoped_branch else text("true")))
        result["imported_history"] = [{**r, "data": json.loads(r["data"])} for r in imported if (r["kind"] == "sales" and "reports" in granted) or (r["kind"] == "login_events" and "audit" in granted)]
        return result

    @staticmethod
    def public_order(o):
        return {**{k: v for k, v in o.items() if k not in {"request_hash", "request_id"}}, "items": json.loads(o["items"])}

    def catalog(self, device_token, staff_token):
        with self.read() as c:
            d = self._device(c, device_token)
            person, _ = self._session(c, d, staff_token)
            if d["mode"] != "cashier" or "checkout" not in self.permissions(c, person):
                raise OperationsError("Checkout is available only on cashier devices.", 403)
            selected = industries.require_mode(c, d["business"])
            items = industries.enrich(c, inventory.catalog(c, rows(c, products, (products.c.business == d["business"]) & (products.c.branch == d["branch"]) & products.c.active.is_(True))))
            return [p for p in items if p["industry"] == selected]

    def checkout(self, device_token, staff_token, values):
        bid = self.device_business(device_token)["business"]["id"]
        with self.tx(bid) as c:
            d = self._device(c, device_token)
            person, session = self._session(c, d, staff_token)
            if d["mode"] != "cashier" or "checkout" not in self.permissions(c, person):
                raise OperationsError("Cashier sign-in is required.", 403)
            if values.get("payment") != "cash":
                raise OperationsError("Card processing is not connected. Only actual cash payments can be recorded.")
            rid = clean(values.get("request_id"), 64)
            request_hash = digest(json.dumps(values, sort_keys=True))
            previous = row(c, orders, (orders.c.business == bid) & (orders.c.request_id == rid))
            if previous:
                if previous["request_hash"] != request_hash or previous["device"] != d["id"] or previous["cashier"] != person["id"]:
                    raise OperationsError("This checkout reference was already used for another sale.", 409)
                return self.public_order(previous)
            if row(c, cancelled_checkouts, (cancelled_checkouts.c.business == bid) & (cancelled_checkouts.c.request_id == rid)):
                raise OperationsError("A manager canceled this unconfirmed checkout. Recount cash before starting a new sale.", 409)
            incoming = values.get("items", [])
            if not isinstance(incoming, list) or not 1 <= len(incoming) <= 100:
                raise OperationsError("Choose between 1 and 100 order lines.")
            selected_industry = industries.require_mode(c, bid)
            if values.get("kind") != selected_industry:
                raise OperationsError("Checkout must match this business type.", 409)
            lines, requested = [], {}
            for item in incoming:
                if set(item) - {"id", "quantity", "note", "modifiers", "ingredients"}:
                    raise OperationsError("Product prices must come from the server catalog.")
                p = row(c, products, (products.c.id == item.get("id")) & (products.c.business == bid) & (products.c.branch == d["branch"]) & products.c.active.is_(True))
                if not p:
                    raise OperationsError("A product is unavailable in this branch.", 409)
                if industries.product_kind(c, p) != selected_industry:
                    raise OperationsError("This item belongs to the other business catalog.", 409)
                qty = whole(item.get("quantity"), 1, 100)
                requested[p["id"]] = requested.get(p["id"], 0) + qty
                if requested[p["id"]] > p["stock"]:
                    raise OperationsError("Insufficient stock for " + p["name"] + ".", 409)
                note = str(item.get("note", "")).strip()
                if len(note) > 200:
                    raise OperationsError("Order notes must be at most 200 characters.")
                selected = item.get("modifiers", [])
                if not isinstance(selected, list) or len(selected) > 10 or any(not isinstance(key, str) for key in selected) or len(set(selected)) != len(selected):
                    raise OperationsError("Choose up to ten different extras.")
                if selected_industry == "retail" and (selected or item.get("ingredients")):
                    raise OperationsError("Restaurant customization is unavailable in Retail checkout.")
                additions = industries.selected_ingredients(c, p, item.get("ingredients", []))
                for key in selected:
                    extra = row(c, inventory.extras, (inventory.extras.c.id == key) & (inventory.extras.c.product == p["id"]) & inventory.extras.c.active.is_(True))
                    if not extra:
                        raise OperationsError("A selected extra is unavailable. Review the order.", 409)
                    additions.append({"id": extra["id"], "name": extra["name"], "price_cents": extra["price_cents"]})
                preparation = note + (("; " if note else "") + "Extras: " + ", ".join(e["name"] for e in additions) if additions else "")
                lines.append({"id": p["id"], "sku": p["sku"], "name": p["name"], "quantity": qty, "price_cents": p["price_cents"] + sum(e["price_cents"] for e in additions), "modifiers": additions, "note": preparation})
            subtotal = sum(l["quantity"] * l["price_cents"] for l in lines)
            config = row(c, businesses, businesses.c.id == bid)
            tax = (subtotal * config["tax_bps"] + 5000) // 10000
            total, received = subtotal + tax, whole(values.get("received_cents"), 0, 100000000)
            if values.get("expected_total_cents") is not None and whole(values["expected_total_cents"]) != total:
                raise OperationsError("Prices or tax changed. Review the current total before completing this sale.", 409)
            if received < total:
                raise OperationsError("Cash received must cover the order total.")
            if values.get("kind") not in {"retail", "restaurant"} or values.get("fulfillment") not in {"takeaway", "dine-in"}:
                raise OperationsError("Choose a valid checkout and fulfillment type.")
            note = str(values.get("note", "")).strip()
            if len(note) > 200:
                raise OperationsError("Order notes must be at most 200 characters.")
            order = dict(id=identity(), business=bid, branch=d["branch"], device=d["id"], cashier=person["id"], cashier_name=person["name"], request_id=rid, request_hash=request_hash,
                created=int(self.now()), items=json.dumps(lines), subtotal=subtotal, tax=tax, total=total, received=received, kind=values["kind"], fulfillment=values["fulfillment"], note=note,
                ticket="queued" if values["kind"] == "restaurant" else "none", status="paid")
            for pid, qty in requested.items():
                inventory.consume(c, row(c, products, products.c.id == pid), qty, person["id"], self.now(), order["id"])
                c.execute(update(products).where(products.c.id == pid).values(stock=products.c.stock - qty))
            c.execute(orders.insert().values(**order))
            c.execute(update(sessions).where(sessions.c.token == session["token"]).values(seen=int(self.now())))
            self.log(c, bid, person["id"], d["id"], "sale.cash_paid", order["id"])
            return self.public_order(order)

    def kitchen(self, device_token, staff_token, ticket_id=None, status=None):
        bid = self.device_business(device_token)["business"]["id"]
        with self.tx(bid) as c:
            if industries.require_mode(c, bid) != 'restaurant':
                raise OperationsError('Kitchen tickets are available only for restaurant businesses.',403)
            d = self._device(c, device_token)
            p, session = self._session(c, d, staff_token)
            if d["mode"] != "kitchen" or "kitchen" not in self.permissions(c, p):
                raise OperationsError("Kitchen device sign-in is required.", 403)
            if ticket_id:
                o = row(c, orders, (orders.c.id == ticket_id) & (orders.c.business == bid) & (orders.c.branch == d["branch"]))
                transitions = {"queued": "preparing", "preparing": "ready", "ready": "served"}
                if not o or o["status"] != "paid" or transitions.get(o["ticket"]) != status:
                    raise OperationsError("This ticket has changed. Refresh the kitchen display.", 409)
                c.execute(update(orders).where(orders.c.id == ticket_id).values(ticket=status))
                c.execute(update(sessions).where(sessions.c.token == session["token"]).values(seen=int(self.now())))
                self.log(c, bid, p["id"], d["id"], "kitchen." + status, ticket_id)
            found = rows(c, orders, (orders.c.business == bid) & (orders.c.branch == d["branch"]) & (orders.c.status == "paid") & orders.c.ticket.in_(["queued", "preparing", "ready"]))
            # Kitchen staff see preparation details, never sales totals or reports.
            return [{k: o[k] for k in ["id", "created", "fulfillment", "note", "ticket"]} | {"items": [{k: l[k] for k in ["name", "quantity", "note"]} for l in json.loads(o["items"])]} for o in found]

    def order_status(self, device_token, staff_token, management_token, request_id):
        bid = self.device_business(device_token)["business"]["id"]
        with self.tx(bid) as c:
            d = self._device(c, device_token)
            if d["mode"] != "cashier":
                raise OperationsError("Use the original cashier device to reconcile this sale.", 403)
            try:
                person, _ = self._session(c, d, staff_token)
            except OperationsError:
                person, _ = self._manager(c, d, staff_token, management_token)
            order = row(c, orders, (orders.c.business == d["business"]) & (orders.c.request_id == request_id))
            if order and (order["device"] != d["id"] or order["cashier"] != person["id"]):
                self._manager(c, d, staff_token, management_token)
                if order["device"] != d["id"]:
                    raise OperationsError("Use the original device for this sale.", 403)
            if not order:
                raise OperationsError("No completed sale uses this checkout reference.", 404)
            return self.public_order(order)

    def activity(self, device_token, staff_token, management_token, management=False):
        bid = self.device_business(device_token)["business"]["id"]
        with self.tx(bid) as c:
            d = self._device(c, device_token)
            if management:
                _, s = self._manager(c, d, staff_token, management_token)
            else:
                _, s = self._session(c, d, staff_token)
            c.execute(update(sessions).where(sessions.c.token == s["token"]).values(seen=int(self.now())))
            return {"ok": True}

    def customer_portal(self,business,action,values=None,token='',address=''):
        error=None;result=None
        with self.tx(business) as c:
            try:
                if action in {'login','activate'}:
                    allowed=self._rate(c,'customer-ip:'+str(business)+':'+address,60,60)
                    allowed=self._rate(c,'customer-login:'+str(business)+':'+(str((values or {}).get('email','')).strip().casefold() if action=='login' else str((values or {}).get('invite',''))),5,300) and allowed
                    if not allowed:raise OperationsError('Too many attempts. Try again in five minutes.',429)
                result=customers.portal(c,business,action,values or {},token,self.now())
                customer=result.pop('_customer',None)
                if customer:self.log(c,business,'customer:'+customer,'','customer.'+action)
            except OperationsError as failure:error=failure
        if error:raise error
        return result

# Register additive inventory tables after the shared operations definitions exist.
from backend import business_inventory as inventory
from backend import business_imports as imports
from backend import business_industries as industries
from backend import business_customers as customers
