import hmac
import hashlib
import logging
import os
import secrets
import smtplib
import time
from datetime import datetime
from typing import Optional
from email.message import EmailMessage

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator

from core import Account, Category, DailyBalance, Transaction, User


app = FastAPI(title="KeeperBMA Backend", version="1.1.0")
TOKEN_SECRET = os.getenv("API_TOKEN_SECRET", "change-me-in-render")
TOKEN_TTL_SECONDS = int(os.getenv("API_TOKEN_TTL_SECONDS", "1800"))  # 30 minutes
STRICT_TOKEN_SECRET = str(os.getenv("STRICT_TOKEN_SECRET", "1")).strip().lower() in {"1", "true", "yes"}
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "keeperbma_session")
logger = logging.getLogger("keeperbma.api")
SMTP_HOST = str(os.getenv("SMTP_HOST", "")).strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = str(os.getenv("SMTP_USER", "")).strip()
SMTP_PASSWORD = str(os.getenv("SMTP_PASSWORD", "")).strip()
SMTP_FROM = str(os.getenv("SMTP_FROM", SMTP_USER)).strip()
SMTP_USE_TLS = str(os.getenv("SMTP_USE_TLS", "1")).strip().lower() in {"1", "true", "yes"}
RECOVERY_CODE_TTL_SECONDS = int(os.getenv("RECOVERY_CODE_TTL_SECONDS", "600"))  # 10 min
RECOVERY_MIN_RESEND_SECONDS = int(os.getenv("RECOVERY_MIN_RESEND_SECONDS", "60"))
RECOVERY_STATE = {}

_cors_raw = str(
    os.getenv(
        "CORS_ALLOW_ORIGINS",
        "https://jason272001.github.io,http://localhost:8501,http://127.0.0.1:8501,http://localhost:3000,http://127.0.0.1:3000",
    )
).strip()
CORS_ALLOW_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]
if not CORS_ALLOW_ORIGINS:
    CORS_ALLOW_ORIGINS = ["https://jason272001.github.io"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class RegisterBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=7, max_length=40)
    password: str = Field(min_length=10, max_length=200)
    coupon_code: Optional[str] = Field(default="", max_length=64)


class LoginBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    password: str


class RecoveryRequestBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str = Field(min_length=3, max_length=200)


class RecoveryConfirmBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str = Field(min_length=3, max_length=200)
    code: str = Field(min_length=4, max_length=20)
    new_password: str = Field(min_length=10, max_length=200)


class AccountCreateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    account_name: str = Field(min_length=1, max_length=120)
    account_type: str = Field(min_length=1, max_length=40)
    group_name: str = Field(min_length=1, max_length=40)
    balance: float = 0.0

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, v: str) -> str:
        allowed = {"checking", "credit_card", "credit", "saving", "savings", "cash", "asset"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid account_type")
        return key


class TxCreateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    tx_type: str = Field(min_length=1, max_length=20)
    amount: float = Field(ge=0.0, le=10_000_000.0)
    account_id: int
    category: str = Field(min_length=1, max_length=120)
    note: Optional[str] = Field(default="", max_length=500)
    date: Optional[str] = None

    @field_validator("tx_type")
    @classmethod
    def validate_tx_type(cls, v: str) -> str:
        key = str(v).strip().lower()
        if key not in {"income", "expense"}:
            raise ValueError("Invalid tx_type")
        return key


class CategoryCreateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    category_name: str = Field(min_length=1, max_length=120)


class AccountUpdateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    account_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    account_type: Optional[str] = Field(default=None, min_length=1, max_length=40)
    group_name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    balance: Optional[float] = None

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {"checking", "credit_card", "credit", "saving", "savings", "cash", "asset"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid account_type")
        return key


class TxUpdateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    tx_type: Optional[str] = Field(default=None, min_length=1, max_length=20)
    amount: Optional[float] = Field(default=None, ge=0.0, le=10_000_000.0)
    account_id: Optional[int] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=120)
    note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("tx_type")
    @classmethod
    def validate_tx_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        key = str(v).strip().lower()
        if key not in {"income", "expense"}:
            raise ValueError("Invalid tx_type")
        return key


def _issue_token(user_id: int, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"{int(user_id)}.{exp}"
    sig = hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{sig}"


def _hash_recovery_code(email: str, code: str) -> str:
    payload = f"{str(email).strip().lower()}::{str(code).strip()}"
    return hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _cleanup_recovery_state(now_ts: Optional[float] = None) -> None:
    if now_ts is None:
        now_ts = time.time()
    stale = [k for k, v in RECOVERY_STATE.items() if float(v.get("expires_at", 0)) < now_ts]
    for k in stale:
        RECOVERY_STATE.pop(k, None)


def _send_recovery_email(to_email: str, code: str) -> None:
    if not (SMTP_HOST and SMTP_FROM):
        raise ValueError("Email recovery is not configured on server.")
    msg = EmailMessage()
    msg["Subject"] = "KeeperBMA Password Recovery Code"
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(
        "Your KeeperBMA password recovery code is: "
        f"{code}\n\nThis code expires in {RECOVERY_CODE_TTL_SECONDS // 60} minutes."
    )
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USER:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


def _verify_token(token: str) -> int:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid token format")
    uid_s, exp_s, sig = parts
    try:
        uid = int(uid_s)
        exp = int(exp_s)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    payload = f"{uid}.{exp}"
    expected_sig = hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid token signature")
    if int(time.time()) > exp:
        raise HTTPException(status_code=401, detail="Token expired")
    return uid


def _extract_token(request: Request, authorization: Optional[str]) -> str:
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1].strip()
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token:
        return cookie_token
    raise HTTPException(status_code=401, detail="Missing auth token")


def _require_user(request: Request, authorization: Optional[str], expected_user_id: int) -> None:
    token = _extract_token(request, authorization)
    token_uid = _verify_token(token)
    if int(token_uid) != int(expected_user_id):
        raise HTTPException(status_code=403, detail="Forbidden user scope")


@app.on_event("startup")
def _startup_checks() -> None:
    if TOKEN_SECRET == "change-me-in-render":
        msg = "API_TOKEN_SECRET is using default value; set a strong secret in environment."
        if STRICT_TOKEN_SECRET:
            raise RuntimeError(msg)
        logger.warning(msg)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"ok": True, "ts": datetime.utcnow().isoformat() + "Z"}


@app.post("/auth/register")
def register(body: RegisterBody):
    try:
        uid = User().register(
            name=body.name,
            pw=body.password,
            email=body.email,
            phone=body.phone,
            coupon_code=body.coupon_code or "",
        )
        profile = User().get_user_by_id(uid) or {}
        return {
            "ok": True,
            "user_id": uid,
            "name": profile.get("name") or body.email,
            "email": profile.get("email") or body.email,
            "phone": profile.get("phone") or body.phone,
            "lifetime_access": bool(profile.get("is_lifetime", False)),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
def login(body: LoginBody, response: Response):
    u = User()
    ok = u.login(body.name, body.password)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    profile = User().get_user_by_id(int(u.uid)) or {}
    token = _issue_token(int(u.uid))
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=TOKEN_TTL_SECONDS,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return {
        "ok": True,
        "user_id": int(u.uid),
        "name": profile.get("name") or u.name,
        "email": profile.get("email", ""),
        "phone": profile.get("phone", ""),
        "lifetime_access": bool(profile.get("is_lifetime", False)),
        "session_minutes": TOKEN_TTL_SECONDS // 60,
        "token": token,
    }


@app.post("/auth/recover/request")
def recover_request(body: RecoveryRequestBody):
    email = str(body.email).strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = User().get_user_by_email(email)
    if not user:
        # Prevent user enumeration.
        return {"ok": True, "sent": True}

    now_ts = time.time()
    _cleanup_recovery_state(now_ts)
    state = RECOVERY_STATE.get(email)
    if state:
        last_sent = float(state.get("last_sent_at", 0))
        if (now_ts - last_sent) < RECOVERY_MIN_RESEND_SECONDS:
            raise HTTPException(status_code=429, detail="Please wait before requesting another code.")

    code = f"{secrets.randbelow(1000000):06d}"
    try:
        _send_recovery_email(email, code)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        logger.exception("Failed to send recovery email")
        raise HTTPException(status_code=503, detail="Failed to send recovery email")

    RECOVERY_STATE[email] = {
        "user_id": int(user["user_id"]),
        "code_hash": _hash_recovery_code(email, code),
        "expires_at": now_ts + RECOVERY_CODE_TTL_SECONDS,
        "attempts": 0,
        "last_sent_at": now_ts,
    }
    return {"ok": True, "sent": True, "expires_minutes": RECOVERY_CODE_TTL_SECONDS // 60}


@app.post("/auth/recover/confirm")
def recover_confirm(body: RecoveryConfirmBody):
    email = str(body.email).strip().lower()
    code = str(body.code).strip()
    if not email or not code:
        raise HTTPException(status_code=400, detail="Email and code are required")

    now_ts = time.time()
    _cleanup_recovery_state(now_ts)
    state = RECOVERY_STATE.get(email)
    if not state:
        raise HTTPException(status_code=400, detail="Recovery code expired or invalid.")
    if float(state.get("expires_at", 0)) < now_ts:
        RECOVERY_STATE.pop(email, None)
        raise HTTPException(status_code=400, detail="Recovery code expired or invalid.")
    if int(state.get("attempts", 0)) >= 5:
        RECOVERY_STATE.pop(email, None)
        raise HTTPException(status_code=400, detail="Too many attempts. Request a new code.")

    expected = str(state.get("code_hash", ""))
    got = _hash_recovery_code(email, code)
    if not hmac.compare_digest(expected, got):
        state["attempts"] = int(state.get("attempts", 0)) + 1
        RECOVERY_STATE[email] = state
        raise HTTPException(status_code=400, detail="Recovery code expired or invalid.")

    try:
        User().set_password_by_user_id(state["user_id"], body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        RECOVERY_STATE.pop(email, None)
    return {"ok": True}


@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=True,
        samesite="none",
    )
    return {"ok": True}


@app.get("/auth/session")
def auth_session(request: Request, authorization: Optional[str] = Header(default=None)):
    token = _extract_token(request, authorization)
    uid = _verify_token(token)
    profile = User().get_user_by_id(uid) or {}
    name = profile.get("name") or profile.get("email") or f"user-{uid}"
    return {
        "ok": True,
        "user_id": int(uid),
        "name": name,
        "email": profile.get("email", ""),
        "phone": profile.get("phone", ""),
        "lifetime_access": bool(profile.get("is_lifetime", False)),
    }


@app.get("/accounts")
def list_accounts(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, user_id)
    df = Account().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/accounts")
def create_account(body: AccountCreateBody, request: Request, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, body.user_id)
    try:
        aid = Account().add(
            account_name=body.account_name,
            account_type=body.account_type,
            group_name=body.group_name,
            balance=body.balance,
            user_id=body.user_id,
        )
        return {"ok": True, "account_id": int(aid)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/accounts/{account_id}")
def update_account(
    account_id: int,
    body: AccountUpdateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    changes = {}
    if body.account_name is not None:
        changes["account_name"] = body.account_name
    if body.account_type is not None:
        changes["account_type"] = body.account_type
    if body.group_name is not None:
        changes["group"] = body.group_name
    if body.balance is not None:
        changes["balance"] = body.balance
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    ok = Account().update(account_id=account_id, user_id=body.user_id, **changes)
    if not ok:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


@app.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, user_id)
    ok = Account().delete(account_id=account_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


@app.post("/accounts/{account_id}/delete")
def delete_account_post(
    account_id: int,
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    return delete_account(
        account_id=account_id,
        request=request,
        user_id=user_id,
        authorization=authorization,
    )


@app.get("/transactions")
def list_transactions(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, user_id)
    df = Transaction().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/transactions")
def create_transaction(body: TxCreateBody, request: Request, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, body.user_id)
    try:
        txn_id = Transaction().add(
            t_type=body.tx_type,
            amount=body.amount,
            account_id=body.account_id,
            category=body.category,
            note=body.note,
            user_id=body.user_id,
        )
        return {"ok": True, "txn_id": int(txn_id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/transactions/{txn_id}")
def update_transaction(
    txn_id: int,
    body: TxUpdateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    changes = {}
    if body.tx_type is not None:
        changes["type"] = body.tx_type
    if body.amount is not None:
        changes["amount"] = body.amount
    if body.account_id is not None:
        changes["account_id"] = body.account_id
    if body.category is not None:
        changes["category"] = body.category
    if body.note is not None:
        changes["note"] = body.note
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    ok = Transaction().update(txn_id=txn_id, user_id=body.user_id, **changes)
    if not ok:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}


@app.delete("/transactions/{txn_id}")
def delete_transaction(
    txn_id: int,
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, user_id)
    ok = Transaction().delete(txn_id=txn_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}


@app.post("/transactions/{txn_id}/delete")
def delete_transaction_post(
    txn_id: int,
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    return delete_transaction(
        txn_id=txn_id,
        request=request,
        user_id=user_id,
        authorization=authorization,
    )


@app.get("/categories")
def list_categories(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, user_id)
    try:
        cat = Category()
        cat.ensure_default_categories(user_id)
        cat.sync_auto_from_accounts(user_id)
        df = cat.by_user(user_id)
        if df is None or df.empty:
            return []
        return df.fillna("").to_dict(orient="records")
    except Exception:
        logger.exception("Category load failed for user_id=%s", user_id)
        return []


@app.post("/categories")
def create_category(body: CategoryCreateBody, request: Request, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, body.user_id)
    try:
        cid = Category().add(category_name=body.category_name, user_id=body.user_id)
        return {"ok": True, "category_id": int(cid)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/daily_balances")
def list_daily_balances(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, user_id)
    df = DailyBalance().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")
