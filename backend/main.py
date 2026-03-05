from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core import Account, Category, Transaction, User


app = FastAPI(title="KeeperBMA Backend", version="1.0.0")

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
    return {"ok": True, "user_id": int(u.uid), "name": u.name}


@app.get("/accounts")
def list_accounts(user_id: int):
    df = Account().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/accounts")
def create_account(body: AccountCreateBody):
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
def list_transactions(user_id: int):
    df = Transaction().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/transactions")
def create_transaction(body: TxCreateBody):
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
def list_categories(user_id: int):
    cat = Category()
    cat.seed_defaults_for_user(user_id)
    cat.sync_auto_from_accounts(user_id)
    df = cat.by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/categories")
def create_category(body: CategoryCreateBody):
    try:
        cid = Category().add(category_name=body.category_name, user_id=body.user_id)
        return {"ok": True, "category_id": int(cid)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
