import hmac
import hashlib
import os
import time
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core import Account, Category, Transaction, User


app = FastAPI(title="KeeperBMA Backend", version="1.0.0")
TOKEN_SECRET = os.getenv("API_TOKEN_SECRET", "change-me-in-render")
TOKEN_TTL_SECONDS = int(os.getenv("API_TOKEN_TTL_SECONDS", "43200"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=10, max_length=200)


class LoginBody(BaseModel):
    name: str
    password: str


class AccountCreateBody(BaseModel):
    user_id: int
    account_name: str
    account_type: str
    group_name: str
    balance: float = 0.0


class TxCreateBody(BaseModel):
    user_id: int
    tx_type: str
    amount: float
    account_id: int
    category: str
    note: Optional[str] = ""
    date: Optional[str] = None


class CategoryCreateBody(BaseModel):
    user_id: int
    category_name: str


def _issue_token(user_id: int, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"{int(user_id)}.{exp}"
    sig = hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{sig}"


def _verify_token(authorization: Optional[str]) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
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


def _require_user(authorization: Optional[str], expected_user_id: int) -> None:
    token_uid = _verify_token(authorization)
    if int(token_uid) != int(expected_user_id):
        raise HTTPException(status_code=403, detail="Forbidden user scope")


@app.get("/health")
def health():
    return {"ok": True, "ts": datetime.utcnow().isoformat() + "Z"}


@app.post("/auth/register")
def register(body: RegisterBody):
    try:
        uid = User().register(body.name, body.password)
        return {"ok": True, "user_id": uid, "name": body.name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
def login(body: LoginBody):
    u = User()
    ok = u.login(body.name, body.password)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = _issue_token(int(u.uid))
    return {"ok": True, "user_id": int(u.uid), "name": u.name, "token": token}


@app.get("/accounts")
def list_accounts(user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(authorization, user_id)
    df = Account().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/accounts")
def create_account(body: AccountCreateBody, authorization: Optional[str] = Header(default=None)):
    _require_user(authorization, body.user_id)
    try:
        aid = Account().add(
            account_name=body.account_name,
            account_type=body.account_type,
            group_name=body.group_name,
            balance=body.balance,
            user_id=body.user_id,
        )
        return {"ok": True, "account_id": int(aid)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/transactions")
def list_transactions(user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(authorization, user_id)
    df = Transaction().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/transactions")
def create_transaction(body: TxCreateBody, authorization: Optional[str] = Header(default=None)):
    _require_user(authorization, body.user_id)
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/categories")
def list_categories(user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_user(authorization, user_id)
    cat = Category()
    cat.ensure_default_categories(user_id)
    cat.sync_auto_from_accounts(user_id)
    df = cat.by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/categories")
def create_category(body: CategoryCreateBody, authorization: Optional[str] = Header(default=None)):
    _require_user(authorization, body.user_id)
    try:
        cid = Category().add(category_name=body.category_name, user_id=body.user_id)
        return {"ok": True, "category_id": int(cid)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
