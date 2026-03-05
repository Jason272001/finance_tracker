import hmac
import hashlib
import logging
import os
import time
from datetime import datetime
from typing import Optional

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
    password: str = Field(min_length=10, max_length=200)


class LoginBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str
    password: str


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
        uid = User().register(body.name, body.password)
        return {"ok": True, "user_id": uid, "name": body.name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
def login(body: LoginBody, response: Response):
    u = User()
    ok = u.login(body.name, body.password)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
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
    return {"ok": True, "user_id": int(u.uid), "name": u.name, "session_minutes": TOKEN_TTL_SECONDS // 60}


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
    name = User().get_name_by_id(uid) or f"user-{uid}"
    return {"ok": True, "user_id": int(uid), "name": name}


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
        dt = body.date or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        txn_id = Transaction().add(
            data=dt,
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


@app.get("/categories")
def list_categories(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(request, authorization, user_id)
    cat = Category()
    cat.ensure_default_categories(user_id)
    cat.sync_auto_from_accounts(user_id)
    df = cat.by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


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
