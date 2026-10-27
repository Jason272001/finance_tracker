"""Opt-in API boundary for persistent business operations."""
import os
import threading

from fastapi import APIRouter, Header, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import JSONResponse

from backend.business_operations import Operations, OperationsError, businesses, devices, pairings, row, digest
from backend.business_operations import staff as operation_staff
from sqlalchemy import select, func, text

DEVICE_COOKIE = "keeperbma_device"
STAFF_COOKIE = "keeperbma_operator"
MANAGER_COOKIE = "keeperbma_management"
COOKIE_PATH = "/operations"


class OperationsBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        relevant = path.startswith("/operations/") or "/operations/" in path
        if scope["type"] != "http" or not relevant or scope.get("method") in {"GET", "HEAD", "OPTIONS"}:
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 65536:
                return await JSONResponse({"detail": "Operations requests are limited to 64 KB."}, 413)(scope, receive, send)
            if not message.get("more_body"):
                break
        delivered = False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()
        await self.app(scope, replay, send)


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Setup(Body):
    staff_code: str = Field(pattern=r"^[0-9]{5,6}$")
    credential: str = Field(pattern=r"^[0-9]{4,6}$", min_length=4, max_length=6)
    timezone: str = Field(default="America/Los_Angeles", max_length=80)


class Enroll(Body):
    branch: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=80)
    mode: str = Field(pattern=r"^(cashier|kitchen|clock|office)$")


class Pair(Body):
    code: str = Field(min_length=1, max_length=32)


class Login(Body):
    code: str = Field(pattern=r"^[0-9]{5,6}$")
    credential: str = Field(pattern=r"^[0-9]{4,6}$", min_length=4, max_length=6)


class Punch(Login):
    action: str = Field(pattern=r"^(in|out)$")


class Action(Body):
    action: str = Field(max_length=40)
    values: dict = Field(default_factory=dict)


class Checkout(Body):
    request_id: str = Field(min_length=8, max_length=64)
    items: list[dict] = Field(min_length=1, max_length=100)
    received_cents: int = Field(ge=0, le=100000000, strict=True)
    expected_total_cents: int = Field(ge=0, le=100000000, strict=True)
    payment: str = Field(default="cash", max_length=10)
    kind: str = Field(pattern=r"^(retail|restaurant)$")
    fulfillment: str = Field(default="takeaway", pattern=r"^(takeaway|dine-in)$")
    note: str = Field(default="", max_length=200)


class Ticket(Body):
    status: str = Field(pattern=r"^(preparing|ready|served)$")


class Activity(Body):
    management: bool = False


def create_operations_router(engine_getter, owner_guard, subscription_guard, *, enabled=None, allowed_origins=None, owner_cookie="keeperbma_session"):
    """Callbacks authorize the existing business account, never a client role claim.

    owner_guard(request, authorization, business_id, user_id) -> business row.
    subscription_guard(owner_user_id, business_id) -> raises if inactive/transferred.
    """
    router = APIRouter()
    lock, stores = threading.Lock(), {}
    enabled = enabled or (lambda: os.getenv("BUSINESS_OPERATIONS_ENABLED", "1").lower() in {"1", "true"})
    allowed = set(allowed_origins or ["https://www.keeperbma.com", "https://keeperbma.com", "http://127.0.0.1:8766", "http://localhost:8766"])

    def check(request):
        origin = request.headers.get("origin")
        if origin and origin not in allowed:
            raise HTTPException(403, "Operations requests must come from the application.")
        if not enabled():
            raise HTTPException(503, "Business device operations are not enabled on this server.")

    def store(request):
        check(request)
        engine = engine_getter()
        if engine is None:
            raise HTTPException(503, "A transactional database is required for business devices.")
        with lock:
            key = id(engine)
            if key not in stores:
                stores[key] = Operations(engine)
            return stores[key]

    def call(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except OperationsError as error:
            raise HTTPException(error.status, str(error)) from error

    def tokens(request):
        return (request.cookies.get(DEVICE_COOKIE, ""), request.cookies.get(STAFF_COOKIE, ""), request.cookies.get(MANAGER_COOKIE, ""))

    def device_store(request):
        ops = store(request)
        if request.cookies.get(owner_cookie):
            raise HTTPException(409, "Sign out of the business account on this browser before using a restricted staff device.")
        context = call(ops.device_business, tokens(request)[0])
        reference = subscription_guard(context["business"]["owner"], context["business"]["id"])
        if context["business"].get("source_reference") and context["business"]["source_reference"] != reference:
            raise HTTPException(403, "Business identity changed. The owner must review device authorization.")
        return ops, context

    def guard_owner(request, authorization, business_id, user_id):
        business = owner_guard(request, authorization, business_id, user_id)
        ops = store(request)
        with ops.read() as c:
            config = row(c, businesses, businesses.c.id == business_id)
        if config and (config["owner"] != user_id or config.get("source_reference") and config["source_reference"] != str(business.get("created_at", ""))):
            raise HTTPException(403, "Business identity changed. Review existing operations data before reauthorizing.")
        return business

    def cookie(response, request, name, token, ttl):
        response.set_cookie(name, token, max_age=ttl, path=COOKIE_PATH, httponly=True,
            secure=request.url.hostname not in {"localhost", "127.0.0.1"}, samesite="strict")
        response.headers["Cache-Control"] = "no-store"

    @router.get("/operations/capabilities")
    def capabilities():
        try:
            available = bool(enabled()) and engine_getter() is not None
        except Exception:
            available = False
        return {"available": available, "api_version": 1, "custom_staff_roles": True, "automatic_staff_ids": True, "saved_device_codes": True}

    @router.get("/operations/ready")
    def ready(request: Request, response: Response):
        check(request)
        engine = engine_getter()
        if engine is None:
            raise HTTPException(503, "Operations database is not configured.")
        try:
            with engine.connect() as c:
                c.execute(text("SELECT 1"))
        except Exception:
            raise HTTPException(503, "Operations database is not ready.")
        response.headers["Cache-Control"] = "no-store"
        return {"ok": True, "storage": engine.dialect.name, "api_version": 1}

    @router.get("/businesses/{business_id}/operations/status")
    def owner_status(business_id: int, user_id: int, request: Request, response: Response, authorization: str | None = Header(default=None)):
        check(request)
        guard_owner(request, authorization, business_id, user_id)
        ops = store(request)
        with ops.read() as c:
            exists = row(c, businesses, businesses.c.id == business_id)
            staff_count = c.execute(select(func.count()).select_from(operation_staff).where((operation_staff.c.business == business_id) & operation_staff.c.active.is_(True))).scalar_one() if exists else 0
            device_count = c.execute(select(func.count()).select_from(devices).where((devices.c.business == business_id) & devices.c.active.is_(True) & devices.c.token.is_not(None))).scalar_one() if exists else 0
        response.headers["Cache-Control"] = "no-store"
        return {"configured": bool(exists), "staff_count": staff_count, "device_count": device_count}

    @router.post("/businesses/{business_id}/operations/setup")
    def owner_setup(business_id: int, user_id: int, body: Setup, request: Request, authorization: str | None = Header(default=None)):
        check(request)
        business = guard_owner(request, authorization, business_id, user_id)
        return call(store(request).setup, business_id, user_id, business["business_name"], body.staff_code, body.credential, body.timezone, business.get("operations_initial_staff", []), business.get("created_at", ""))

    @router.post("/businesses/{business_id}/operations/enroll")
    def owner_enroll(business_id: int, user_id: int, body: Enroll, request: Request, authorization: str | None = Header(default=None)):
        check(request)
        guard_owner(request, authorization, business_id, user_id)
        return call(store(request).enroll, business_id, body.branch, body.name, body.mode, "account:" + str(user_id))

    @router.get("/businesses/{business_id}/operations/admin")
    def owner_snapshot(business_id: int, user_id: int, request: Request, response: Response, date: str = "", authorization: str | None = Header(default=None)):
        check(request)
        guard_owner(request, authorization, business_id, user_id)
        response.headers["Cache-Control"] = "no-store"
        return call(store(request).admin, business_id, "snapshot", {"date": date}, account_owner=user_id)

    @router.post("/businesses/{business_id}/operations/admin")
    def owner_action(business_id: int, user_id: int, body: Action, request: Request, authorization: str | None = Header(default=None)):
        check(request)
        guard_owner(request, authorization, business_id, user_id)
        return call(store(request).admin, business_id, body.action, body.values, account_owner=user_id)

    @router.post("/operations/device/pair")
    def pair_device(body: Pair, request: Request, response: Response):
        ops = store(request)
        if request.cookies.get(owner_cookie):
            raise HTTPException(409, "Sign out of the business account on this browser before connecting a restricted staff device.")
        # Check billing/ownership before consuming the one-time owner authorization.
        with ops.read() as c:
            pairing = row(c, pairings, pairings.c.token == digest(body.code.strip().upper()))
            d = row(c, devices, devices.c.id == pairing["device"]) if pairing else None
            b = row(c, businesses, businesses.c.id == d["business"]) if d else None
        if b:
            reference = subscription_guard(b["owner"], b["id"])
            if b.get("source_reference") and b["source_reference"] != reference:
                raise HTTPException(403, "Business identity changed. Request fresh owner authorization.")
        secret = call(ops.pair, body.code, request.client.host if request.client else "unknown")
        cookie(response, request, DEVICE_COOKIE, secret, 30 * 86400)
        response.delete_cookie(STAFF_COOKIE, path=COOKIE_PATH)
        response.delete_cookie(MANAGER_COOKIE, path=COOKIE_PATH)
        return {"ok": True}

    @router.get("/operations/device")
    def device_context(request: Request, response: Response):
        ops, _ = device_store(request)
        response.headers["Cache-Control"] = "no-store"
        return call(ops.context, *tokens(request))

    @router.post("/operations/staff/login")
    def login(body: Login, request: Request, response: Response):
        ops, _ = device_store(request)
        device, staff_token, _ = tokens(request)
        secret = call(ops.authenticate, device, body.code, body.credential, "login", staff_token)
        cookie(response, request, STAFF_COOKIE, secret, 8 * 3600)
        return {"ok": True}

    @router.post("/operations/management/unlock")
    def unlock(body: Login, request: Request, response: Response):
        ops, _ = device_store(request)
        secret = call(ops.authenticate, tokens(request)[0], body.code, body.credential, "management")
        cookie(response, request, MANAGER_COOKIE, secret, 300)
        return {"ok": True}

    @router.post("/operations/management/lock")
    def management_lock(request: Request, response: Response):
        ops, _ = device_store(request)
        call(ops.logout, *tokens(request), management_only=True)
        response.delete_cookie(MANAGER_COOKIE, path=COOKIE_PATH)
        return {"ok": True}

    @router.post("/operations/staff/logout")
    def logout(request: Request, response: Response):
        ops, _ = device_store(request)
        call(ops.logout, *tokens(request))
        response.delete_cookie(STAFF_COOKIE, path=COOKIE_PATH)
        response.delete_cookie(MANAGER_COOKIE, path=COOKIE_PATH)
        return {"ok": True}

    @router.post("/operations/clock")
    def punch(body: Punch, request: Request):
        ops, context = device_store(request)
        if context["device"]["mode"] != "clock":
            raise HTTPException(403, "Use the time-clock device for attendance.")
        return call(ops.authenticate, tokens(request)[0], body.code, body.credential, body.action)

    @router.get("/operations/catalog")
    def catalog(request: Request, response: Response):
        ops, _ = device_store(request)
        response.headers["Cache-Control"] = "no-store"
        return {"items": call(ops.catalog, *tokens(request)[:2])}

    @router.post("/operations/orders")
    def checkout(body: Checkout, request: Request):
        ops, _ = device_store(request)
        return call(ops.checkout, *tokens(request)[:2], body.model_dump())

    @router.get("/operations/orders/status/{request_id}")
    def order_status(request_id: str, request: Request, response: Response):
        ops, _ = device_store(request)
        response.headers["Cache-Control"] = "no-store"
        return call(ops.order_status, *tokens(request), request_id)

    @router.get("/operations/kitchen")
    def kitchen(request: Request, response: Response):
        ops, _ = device_store(request)
        response.headers["Cache-Control"] = "no-store"
        return {"items": call(ops.kitchen, *tokens(request)[:2])}

    @router.post("/operations/kitchen/{ticket_id}")
    def ticket(ticket_id: str, body: Ticket, request: Request):
        ops, _ = device_store(request)
        return {"items": call(ops.kitchen, *tokens(request)[:2], ticket_id, body.status)}

    @router.get("/operations/admin")
    def manager_snapshot(request: Request, response: Response, date: str = ""):
        ops, context = device_store(request)
        device, staff_token, management_token = tokens(request)
        response.headers["Cache-Control"] = "no-store"
        return call(ops.admin, context["business"]["id"], "snapshot", {"date": date}, device_token=device, staff_token=staff_token, management_token=management_token)

    @router.post("/operations/admin")
    def manager_action(body: Action, request: Request):
        ops, context = device_store(request)
        device, staff_token, management_token = tokens(request)
        return call(ops.admin, context["business"]["id"], body.action, body.values, device_token=device, staff_token=staff_token, management_token=management_token)

    @router.post("/operations/activity")
    def activity(body: Activity, request: Request):
        ops, _ = device_store(request)
        return call(ops.activity, *tokens(request), body.management)

    return router
