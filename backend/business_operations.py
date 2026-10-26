"""Persistent multi-device operations. No payment-card data is accepted here.

Separate device and operator credentials ensure a paired till never receives the
business account's bearer token. All mutations serialize per business on Postgres;
SQLite is supported for local integration tests only.
"""
from contextlib import contextmanager
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
devices = Table("ops_devices", metadata, Column("id", String(32), primary_key=True),
    Column("business", Integer, nullable=False, index=True), Column("branch", String(32), nullable=False),
    Column("name", String(80), nullable=False), Column("mode", String(16), nullable=False),
    Column("token", String(64), unique=True), Column("expires", BigInteger),
    Column("active", Boolean, nullable=False), Column("created", BigInteger, nullable=False))
pairings = Table("ops_pairings", metadata, Column("token", String(64), primary_key=True),
    Column("device", String(32), nullable=False), Column("expires", BigInteger, nullable=False))
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

    def setup(self, business, owner, name, code, credential, tz="America/Los_Angeles", initial_staff=None, source_reference=""):
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
        if role == "owner" and isinstance(credential, str) and re.fullmatch(r"[0-9]{6}", credential):
            return
        minimum = 12 if role in {"owner", "manager"} else 6
        if not isinstance(credential, str) or not minimum <= len(credential) <= 128:
            raise OperationsError("Use a six-digit owner PIN or a password of at least 12 characters." if role == "owner" else f"Use at least {minimum} characters for this role's credential.")

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
        idle = 120 if kind == "management" else 1800 if device["mode"] == "kitchen" else 300
        if not s or s["device"] != device["id"] or s["kind"] != kind or s["expires"] <= self.now() or self.now() - s["seen"] >= idle:
            raise OperationsError("Staff sign-in expired or is required.", 401)
        person = row(c, staff, staff.c.id == s["staff"])
        if not person or person["business"] != device["business"] or not person["active"] or person["epoch"] != s["epoch"]:
            raise OperationsError("Staff access has changed. Sign in again.", 401)
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
            raise OperationsError("Fresh manager or owner approval is required.", 403)
        if p["role"] not in {"owner", "manager"}:
            raise OperationsError("Manager or owner permission is required.", 403)
        return p, s

    def context(self, device_token, staff_token="", management_token=""):
        with self.read() as c:
            d = self._device(c, device_token)
            b = row(c, businesses, businesses.c.id == d["business"])
            branch = row(c, branches, branches.c.id == d["branch"])
            actor, management = None, None
            try:
                p, s = self._session(c, d, staff_token)
                actor = {**self.public_staff(p), "expires": s["expires"], "idle_until": s["seen"] + (1800 if d["mode"] == "kitchen" else 300)}
            except OperationsError:
                pass
            try:
                p, s = self._session(c, d, management_token, "management")
                management = {"name": p["name"], "role": p["role"], "idle_until": s["seen"] + 120, "expires": s["expires"]}
            except OperationsError:
                pass
            return {"business": {"id": b["id"], "name": b["name"], "timezone": b["timezone"], "tax_bps": b["tax_bps"]},
                    "device": {k: d[k] for k in ["id", "name", "mode", "branch"]}, "branch": branch["name"], "staff": actor, "management": management, "server_time": int(self.now())}

    def enroll(self, business, branch, name, mode, actor):
        if mode not in {"cashier", "kitchen", "clock", "office"}:
            raise OperationsError("Choose cashier, kitchen, clock or office.")
        with self.tx(business) as c:
            self._branch(c, business, branch)
            did, code, now = identity(), secrets.token_hex(8).upper(), int(self.now())
            c.execute(devices.insert().values(id=did, business=business, branch=branch, name=clean(name, 80),
                mode=mode, active=True, created=now, expires=now + 30 * 86400))
            c.execute(pairings.insert().values(token=digest(code), device=did, expires=now + 300))
            self.log(c, business, actor, "", "device.enrollment_created", did)
        return {"id": did, "code": code, "expires": now + 300}

    def pair(self, code, address):
        error, result = None, None
        with self.tx() as c:
            if not self._rate(c, "pair:" + address, 30):
                error = OperationsError("Too many pairing attempts. Try again in five minutes.", 429)
            else:
                pairing = row(c, pairings, pairings.c.token == digest(str(code).strip().upper()))
                d = row(c, devices, devices.c.id == pairing["device"]) if pairing else None
                if not pairing or pairing["expires"] <= self.now() or not d or not d["active"]:
                    error = OperationsError("Pairing code is invalid or expired.", 401)
                else:
                    secret = secrets.token_urlsafe(32)
                    c.execute(update(devices).where(devices.c.id == d["id"]).values(token=digest(secret)))
                    c.execute(delete(pairings).where(pairings.c.token == pairing["token"]))
                    self.log(c, d["business"], "owner-enrollment", d["id"], "device.paired")
                    result = secret
        if error:
            raise error
        return result

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
            elif not person or not person["active"] or not password_matches(credential, person["credential"]):
                error = OperationsError("Staff ID or credential is incorrect.", 401)
            elif person["branch"] != d["branch"] and person["role"] not in {"manager", "owner"}:
                error = OperationsError("This staff member is assigned to another branch.", 403)
            elif action == "management" and person["role"] not in {"owner", "manager"}:
                error = OperationsError("Manager or owner approval is required.", 403)
            elif action == "login" and (d["mode"] == "clock" or person["role"] not in ({"cashier", "manager", "owner"} if d["mode"] == "cashier" else {"kitchen", "manager", "owner"} if d["mode"] == "kitchen" else {"manager", "owner"})):
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
                        c.execute(sessions.insert().values(token=digest(secret), device=d["id"], staff=person["id"], kind=kind, epoch=person["epoch"], created=now, seen=now, expires=now + (300 if kind == "management" else 8 * 3600)))
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

    def admin(self, business, action, values, *, account_owner=None, device_token="", staff_token="", management_token=""):
        with self.tx(business) as c:
            config = row(c, businesses, businesses.c.id == business)
            if not config:
                raise OperationsError("Configure business operations first.", 409)
            if account_owner is not None:
                if config["owner"] != account_owner:
                    raise OperationsError("Only the business owner can perform this action.", 403)
                actor, role, did = "account:" + str(account_owner), "owner", ""
            else:
                d = self._device(c, device_token)
                if d["business"] != business:
                    raise OperationsError("Business scope mismatch.", 403)
                p, session = self._manager(c, d, staff_token, management_token)
                actor, role, did = p["id"], p["role"], d["id"]
                if action != "snapshot":
                    c.execute(update(sessions).where(sessions.c.token == session["token"]).values(seen=int(self.now())))
            if action == "snapshot":
                return self._admin_snapshot(c, business, role, values.get("date"))
            if action == "branch":
                if role != "owner":
                    raise OperationsError("Only the owner can create business branches.", 403)
                branch = identity()
                c.execute(branches.insert().values(id=branch, business=business, name=clean(values.get("name"), 80)))
                result = {"id": branch}
            elif action == "staff":
                desired_role = values.get("role", "staff")
                if not isinstance(desired_role, str) or desired_role not in {"manager", "cashier", "kitchen", "staff", "owner"}:
                    raise OperationsError("Choose a valid staff role.")
                existing = row(c, staff, (staff.c.business == business) & (staff.c.id == values.get("id", "")))
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
                code = str(values.get("code", ""))
                credential = values.get("credential", "")
                if existing and not existing["credential"] and not credential:
                    raise OperationsError("Set a credential before activating an imported staff member.")
                self.validate_credential(code, credential or ("x" * 12 if existing else ""), desired_role)
                if existing and desired_role in {"manager", "owner"} and desired_role != existing["role"] and not credential:
                    raise OperationsError("Set a new manager password when promoting staff.")
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
                result = {"id": sid}
            elif action == "product":
                branch = values.get("branch")
                self._branch(c, business, branch)
                sku = clean(values.get("sku"), 60)
                existing = row(c, products, (products.c.business == business) & (products.c.id == values.get("id", "")))
                duplicate = row(c, products, (products.c.business == business) & (products.c.branch == branch) & (products.c.sku == sku))
                if duplicate and (not existing or duplicate["id"] != existing["id"]):
                    raise OperationsError("That product code already exists in this branch.", 409)
                pid = existing["id"] if existing else identity()
                active = values.get("active", existing["active"] if existing else True)
                if not isinstance(active, bool):
                    raise OperationsError("Product active status must be true or false.")
                record = dict(id=pid, business=business, branch=branch, name=clean(values.get("name")), sku=sku,
                    category=clean(values.get("category", "Products"), 80), price_cents=whole(values.get("price_cents"), 1),
                    stock=whole(values.get("stock"), 0, 1000000), active=active)
                c.execute(update(products).where(products.c.id == pid).values(**record) if existing else products.insert().values(**record))
                result = {"id": pid}
            elif action == "schedule":
                person = row(c, staff, (staff.c.business == business) & (staff.c.id == values.get("staff")))
                if not person or not person["active"]:
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
                c.execute(delete(schedules).where((schedules.c.business == business) & (schedules.c.id == values.get("id"))))
                result = {"ok": True}
            elif action == "close_shift":
                shift = row(c, punches, (punches.c.business == business) & (punches.c.id == values.get("id")))
                if not shift or shift["end"] is not None:
                    raise OperationsError("Choose an open clock interval.", 409)
                end = whole(values.get("end"), 1, 4102444800)
                if end <= shift["start"] or end > self.now():
                    raise OperationsError("The corrected end must follow clock-in and cannot be in the future.")
                reason = clean(values.get("reason"), 200)
                c.execute(update(punches).where(punches.c.id == shift["id"]).values(end=end, closed_by=actor, adjustment_note=reason))
                result = {"id": shift["id"]}
            elif action == "revoke_device":
                if role != "owner":
                    raise OperationsError("Only the owner can revoke devices.", 403)
                c.execute(update(devices).where((devices.c.business == business) & (devices.c.id == values.get("id"))).values(active=False))
                result = {"ok": True}
            elif action == "config":
                if role != "owner":
                    raise OperationsError("Only the owner can change tax settings.", 403)
                c.execute(update(businesses).where(businesses.c.id == business).values(tax_bps=whole(values.get("tax_bps"), 0, 3000)))
                result = {"ok": True}
            elif action == "void_order":
                order = row(c, orders, (orders.c.business == business) & (orders.c.id == values.get("id")))
                if not order or order["status"] != "paid":
                    raise OperationsError("Choose a paid order that has not been voided.", 409)
                for line in json.loads(order["items"]):
                    c.execute(update(products).where(products.c.id == line["id"]).values(stock=products.c.stock + line["quantity"]))
                c.execute(update(orders).where(orders.c.id == order["id"]).values(status="void", ticket="cancelled"))
                result = {"ok": True}
            elif action == "cancel_checkout":
                rid = clean(values.get("request_id"), 64)
                previous = row(c, orders, (orders.c.business == business) & (orders.c.request_id == rid))
                if previous:
                    result = {"recorded": True, "order": self.public_order(previous)}
                else:
                    if not row(c, cancelled_checkouts, (cancelled_checkouts.c.business == business) & (cancelled_checkouts.c.request_id == rid)):
                        c.execute(cancelled_checkouts.insert().values(business=business, request_id=rid, created=int(self.now()), actor=actor))
                    result = {"recorded": False, "cancelled": True}
            else:
                raise OperationsError("Unknown management action.")
            self.log(c, business, actor, did, "management." + action, result.get("id", values.get("id", "")))
            return result

    def _admin_snapshot(self, c, business, role, chosen_day=None):
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
        return {"role": role, "business": config, "branches": rows(c, branches, branches.c.business == business),
                "staff": [self.public_staff(p) for p in rows(c, staff, staff.c.business == business)],
                "products": rows(c, products, products.c.business == business),
                "devices": [{**{k: v for k, v in d.items() if k != "token"}, "paired": bool(d["token"])} for d in rows(c, devices, devices.c.business == business)],
                "server_time": int(self.now()),
                "schedules": rows(c, schedules, (schedules.c.business == business) & (schedules.c.end > self.now() - 31 * 86400)),
                "timesheets": rows(c, punches, (punches.c.business == business) & (punches.c.start >= self.now() - 31 * 86400)),
                "orders": [self.public_order(o) for o in today],
                "report": {"date": str(day), "timezone": config["timezone"], "paid_orders": len(paid), "subtotal_cents": sum(o["subtotal"] for o in paid), "tax_cents": sum(o["tax"] for o in paid), "total_cents": sum(o["total"] for o in paid), "void_orders": len(today) - len(paid)},
                "audit": rows(c, audit, (audit.c.business == business) & (audit.c.created >= self.now() - 7 * 86400))[-200:]}

    @staticmethod
    def public_order(o):
        return {**{k: v for k, v in o.items() if k not in {"request_hash", "request_id"}}, "items": json.loads(o["items"])}

    def catalog(self, device_token, staff_token):
        with self.read() as c:
            d = self._device(c, device_token)
            self._session(c, d, staff_token)
            if d["mode"] != "cashier":
                raise OperationsError("Checkout is available only on cashier devices.", 403)
            return rows(c, products, (products.c.business == d["business"]) & (products.c.branch == d["branch"]) & products.c.active.is_(True))

    def checkout(self, device_token, staff_token, values):
        bid = self.device_business(device_token)["business"]["id"]
        with self.tx(bid) as c:
            d = self._device(c, device_token)
            person, session = self._session(c, d, staff_token)
            if d["mode"] != "cashier" or person["role"] not in {"cashier", "manager", "owner"}:
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
            lines, requested = [], {}
            for item in incoming:
                if set(item) - {"id", "quantity", "note"}:
                    raise OperationsError("Product prices must come from the server catalog.")
                p = row(c, products, (products.c.id == item.get("id")) & (products.c.business == bid) & (products.c.branch == d["branch"]) & products.c.active.is_(True))
                if not p:
                    raise OperationsError("A product is unavailable in this branch.", 409)
                qty = whole(item.get("quantity"), 1, 100)
                requested[p["id"]] = requested.get(p["id"], 0) + qty
                if requested[p["id"]] > p["stock"]:
                    raise OperationsError("Insufficient stock for " + p["name"] + ".", 409)
                note = str(item.get("note", "")).strip()
                if len(note) > 200:
                    raise OperationsError("Order notes must be at most 200 characters.")
                lines.append({"id": p["id"], "sku": p["sku"], "name": p["name"], "quantity": qty, "price_cents": p["price_cents"], "note": note})
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
                c.execute(update(products).where(products.c.id == pid).values(stock=products.c.stock - qty))
            c.execute(orders.insert().values(**order))
            c.execute(update(sessions).where(sessions.c.token == session["token"]).values(seen=int(self.now())))
            self.log(c, bid, person["id"], d["id"], "sale.cash_paid", order["id"])
            return self.public_order(order)

    def kitchen(self, device_token, staff_token, ticket_id=None, status=None):
        bid = self.device_business(device_token)["business"]["id"]
        with self.tx(bid) as c:
            d = self._device(c, device_token)
            p, session = self._session(c, d, staff_token)
            if d["mode"] != "kitchen" or p["role"] not in {"kitchen", "manager", "owner"}:
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
