import hmac
import hashlib
import json
import logging
import math
import os
import secrets
import smtplib
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional
from email.message import EmailMessage

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator

from core import Account, Category, DailyBalance, SPECIAL_COUPON_CODE, Transaction, User


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
STRIPE_SECRET_KEY = str(os.getenv("STRIPE_SECRET_KEY", "")).strip()
STRIPE_PUBLISHABLE_KEY = str(os.getenv("STRIPE_PUBLISHABLE_KEY", "")).strip()
STRIPE_WEBHOOK_SECRET = str(os.getenv("STRIPE_WEBHOOK_SECRET", "")).strip()
STRIPE_PRICE_BASIC = str(os.getenv("STRIPE_PRICE_BASIC", "")).strip()
STRIPE_PRICE_REGULAR = str(os.getenv("STRIPE_PRICE_REGULAR", "")).strip()
STRIPE_PRICE_BUSINESS = str(os.getenv("STRIPE_PRICE_BUSINESS", "")).strip()
STRIPE_PRICE_PREMIUM_PLUS = str(os.getenv("STRIPE_PRICE_PREMIUM_PLUS", "")).strip()
STRIPE_PRICE_PREMIUM_PLUS_WEBSITE = str(os.getenv("STRIPE_PRICE_PREMIUM_PLUS_WEBSITE", "")).strip()
STRIPE_PRICE_BASIC_ANNUAL = str(os.getenv("STRIPE_PRICE_BASIC_ANNUAL", "")).strip()
STRIPE_PRICE_REGULAR_ANNUAL = str(os.getenv("STRIPE_PRICE_REGULAR_ANNUAL", "")).strip()
STRIPE_PRICE_BUSINESS_ANNUAL = str(os.getenv("STRIPE_PRICE_BUSINESS_ANNUAL", "")).strip()
STRIPE_PRICE_PREMIUM_PLUS_ANNUAL = str(os.getenv("STRIPE_PRICE_PREMIUM_PLUS_ANNUAL", "")).strip()
STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL = str(os.getenv("STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL", "")).strip()
BILLING_SUCCESS_URL = str(os.getenv("BILLING_SUCCESS_URL", "https://keeperbma.com/settings.html?billing=success")).strip()
BILLING_CANCEL_URL = str(os.getenv("BILLING_CANCEL_URL", "https://keeperbma.com/settings.html?billing=cancel")).strip()
BILLING_RETURN_URL = str(os.getenv("BILLING_RETURN_URL", "https://keeperbma.com/settings.html")).strip()
REFUND_FULL_WINDOW_DAYS = int(os.getenv("REFUND_FULL_WINDOW_DAYS", "7"))
BILLING_TRIAL_DAYS = int(os.getenv("BILLING_TRIAL_DAYS", "60"))
_billing_hosts_raw = str(
    os.getenv(
        "BILLING_ALLOWED_HOSTS",
        "keeperbma.com,www.keeperbma.com,jason272001.github.io,localhost,127.0.0.1",
    )
).strip()
BILLING_ALLOWED_HOSTS = {h.strip().lower() for h in _billing_hosts_raw.split(",") if h.strip()}
if not BILLING_ALLOWED_HOSTS:
    BILLING_ALLOWED_HOSTS = {
        "keeperbma.com",
        "www.keeperbma.com",
        "jason272001.github.io",
        "localhost",
        "127.0.0.1",
    }

_cors_raw = str(
    os.getenv(
        "CORS_ALLOW_ORIGINS",
        "https://keeperbma.com,https://www.keeperbma.com,https://jason272001.github.io,http://localhost:8501,http://127.0.0.1:8501,http://localhost:3000,http://127.0.0.1:3000",
    )
).strip()
CORS_ALLOW_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]
_required_cors = ["https://keeperbma.com", "https://www.keeperbma.com", "https://jason272001.github.io"]
for _origin in _required_cors:
    if _origin not in CORS_ALLOW_ORIGINS:
        CORS_ALLOW_ORIGINS.append(_origin)

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
    plan_code: str = Field(min_length=1, max_length=40)
    checkout_session_id: Optional[str] = Field(default="", max_length=255)

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        allowed = {"basic", "regular", "business", "premium_plus"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid plan_code")
        return key


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


class SubscriptionUpdateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    plan_code: str = Field(min_length=1, max_length=40)

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        allowed = {"basic", "regular", "business", "premium_plus"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid plan_code")
        return key


class BillingCheckoutBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    plan_code: str = Field(min_length=1, max_length=40)
    billing_cycle: str = Field(default="monthly", min_length=1, max_length=20)
    with_website: bool = False
    success_url: Optional[str] = Field(default=None, max_length=1000)
    cancel_url: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        allowed = {"basic", "regular", "business", "premium_plus"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid plan_code")
        return key

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        key = str(v).strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class BillingPortalBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    return_url: Optional[str] = Field(default=None, max_length=1000)


class BillingCancelBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int


class BillingPrecheckoutBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    plan_code: str = Field(min_length=1, max_length=40)
    billing_cycle: str = Field(default="monthly", min_length=1, max_length=20)
    with_website: bool = False
    coupon_code: Optional[str] = Field(default="", max_length=64)
    success_url: Optional[str] = Field(default=None, max_length=1000)
    cancel_url: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        allowed = {"basic", "regular", "business", "premium_plus"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid plan_code")
        return key

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        key = str(v).strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class BillingPrecheckoutEmbeddedBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    plan_code: str = Field(min_length=1, max_length=40)
    billing_cycle: str = Field(default="monthly", min_length=1, max_length=20)
    with_website: bool = False
    coupon_code: Optional[str] = Field(default="", max_length=64)
    email: str = Field(min_length=3, max_length=200)
    return_url: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        allowed = {"basic", "regular", "business", "premium_plus"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid plan_code")
        return key

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        key = str(v).strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class BillingEmbeddedCheckoutBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    plan_code: str = Field(min_length=1, max_length=40)
    billing_cycle: str = Field(default="monthly", min_length=1, max_length=20)
    with_website: bool = False
    return_url: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        allowed = {"basic", "regular", "business", "premium_plus"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid plan_code")
        return key

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        key = str(v).strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class ProfileUpdateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    email: Optional[str] = Field(default=None, min_length=3, max_length=200)
    phone: Optional[str] = Field(default=None, min_length=7, max_length=40)
    email_notifications_enabled: Optional[bool] = None
    profile_image_url: Optional[str] = Field(default=None, max_length=2_000_000)


class PasswordUpdateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    current_password: str = Field(min_length=1, max_length=200)
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


class AccountTransferBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    from_account_id: int
    to_account_id: int
    amount: float = Field(gt=0.0, le=10_000_000.0)


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


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    s = str(value or "").strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _build_subscription_payload(profile: dict) -> dict:
    is_lifetime = bool(profile.get("is_lifetime", False))
    plan_code = str(profile.get("plan_code", "")).strip().lower()
    if not plan_code:
        plan_code = "lifetime" if is_lifetime else "basic"
    status = str(profile.get("subscription_status", "")).strip().lower()
    if not status:
        status = "active" if is_lifetime else "active"
    trial_ends_at = str(profile.get("trial_ends_at", "")).strip()
    trial_days_remaining = 0
    if status == "trial" and trial_ends_at:
        trial_dt = _parse_iso_datetime(trial_ends_at)
        if trial_dt is not None:
            now_dt = datetime.utcnow()
            delta_s = (trial_dt.replace(tzinfo=None) - now_dt).total_seconds()
            if delta_s > 0:
                trial_days_remaining = max(1, int(math.ceil(delta_s / 86400.0)))
    return {
        "plan_code": plan_code,
        "subscription_status": status,
        "trial_ends_at": trial_ends_at,
        "trial_days_remaining": int(trial_days_remaining),
        "is_lifetime": is_lifetime,
        "billing_provider": str(profile.get("billing_provider", "")).strip().lower(),
        "billing_customer_id": str(profile.get("billing_customer_id", "")).strip(),
        "billing_subscription_id": str(profile.get("billing_subscription_id", "")).strip(),
        "billing_price_id": str(profile.get("billing_price_id", "")).strip(),
    }


def _build_profile_payload(profile: dict) -> dict:
    return {
        "name": str(profile.get("name", "")).strip(),
        "email": str(profile.get("email", "")).strip(),
        "phone": str(profile.get("phone", "")).strip(),
        "email_notifications_enabled": bool(profile.get("email_notifications_enabled", True)),
        "profile_image_url": str(profile.get("profile_image_url", "")).strip(),
    }


SUBSCRIPTION_PLANS = [
    {
        "plan_code": "basic",
        "label": "Basic",
        "price_monthly": 2,
        "price_annual": 20,
        "features": [
            "Manual financial tracking",
            "Manual transaction entry",
            "Manual account management",
        ],
    },
    {
        "plan_code": "regular",
        "label": "Regular",
        "price_monthly": 5,
        "price_annual": 50,
        "features": [
            "Automatic transaction sync (API integration ready)",
            "Automatic categorization",
            "Financial analytics dashboard",
        ],
    },
    {
        "plan_code": "business",
        "label": "Business",
        "price_monthly": 25,
        "price_annual": 250,
        "features": [
            "All Regular features",
            "POS and inventory foundation",
            "Sales and expense analytics",
        ],
    },
    {
        "plan_code": "premium_plus",
        "label": "Premium Plus",
        "price_monthly": 50,
        "price_annual": 500,
        "price_with_website_monthly": 70,
        "price_with_website_annual": 700,
        "features": [
            "All Business features",
            "Advanced analytics",
            "AI insights foundation",
            "Optional portfolio website package",
        ],
    },
    {
        "plan_code": "lifetime",
        "label": "Lifetime Access",
        "price_monthly": 0,
        "features": [
            "Unlocked by admin coupon",
            "All currently enabled features",
        ],
    },
]


def _stripe_price_for_plan(plan_code: str, with_website: bool = False, billing_cycle: str = "monthly") -> str:
    key = str(plan_code or "").strip().lower()
    cycle = str(billing_cycle or "").strip().lower()
    if cycle not in {"monthly", "annual"}:
        cycle = "monthly"
    if key == "basic":
        return STRIPE_PRICE_BASIC_ANNUAL if cycle == "annual" else STRIPE_PRICE_BASIC
    if key == "regular":
        return STRIPE_PRICE_REGULAR_ANNUAL if cycle == "annual" else STRIPE_PRICE_REGULAR
    if key == "business":
        return STRIPE_PRICE_BUSINESS_ANNUAL if cycle == "annual" else STRIPE_PRICE_BUSINESS
    if key == "premium_plus":
        if cycle == "annual":
            if with_website and STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL:
                return STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL
            return STRIPE_PRICE_PREMIUM_PLUS_ANNUAL
        if with_website and STRIPE_PRICE_PREMIUM_PLUS_WEBSITE:
            return STRIPE_PRICE_PREMIUM_PLUS_WEBSITE
        return STRIPE_PRICE_PREMIUM_PLUS
    return ""


def _stripe_plan_from_price(price_id: str) -> Optional[str]:
    pid = str(price_id or "").strip()
    if not pid:
        return None
    mapping = {
        STRIPE_PRICE_BASIC: "basic",
        STRIPE_PRICE_BASIC_ANNUAL: "basic",
        STRIPE_PRICE_REGULAR: "regular",
        STRIPE_PRICE_REGULAR_ANNUAL: "regular",
        STRIPE_PRICE_BUSINESS: "business",
        STRIPE_PRICE_BUSINESS_ANNUAL: "business",
        STRIPE_PRICE_PREMIUM_PLUS: "premium_plus",
        STRIPE_PRICE_PREMIUM_PLUS_ANNUAL: "premium_plus",
        STRIPE_PRICE_PREMIUM_PLUS_WEBSITE: "premium_plus",
        STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL: "premium_plus",
    }
    return mapping.get(pid)


def _stripe_status_to_subscription_status(status: str) -> str:
    s = str(status or "").strip().lower()
    if s in {"trialing"}:
        return "trial"
    if s in {"active"}:
        return "active"
    if s in {"past_due", "incomplete", "unpaid"}:
        return s
    if s in {"canceled", "incomplete_expired"}:
        return "canceled"
    return "active"


def _iso_from_unix_ts(value) -> str:
    try:
        n = int(value)
    except Exception:
        return ""
    if n <= 0:
        return ""
    return datetime.fromtimestamp(n, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _stripe_api_request_raw(
    method: str,
    path: str,
    form: Optional[dict] = None,
    query: Optional[object] = None,
) -> dict:
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured.")
    endpoint = f"https://api.stripe.com{path}"
    if query:
        endpoint = f"{endpoint}?{urllib.parse.urlencode(query, doseq=True)}"
    data = None
    headers = {"Authorization": f"Bearer {STRIPE_SECRET_KEY}"}
    if form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(
        endpoint,
        data=data,
        method=method.upper(),
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = {}
        try:
            payload = json.loads(e.read().decode("utf-8"))
        except Exception:
            payload = {}
        msg = (
            payload.get("error", {}).get("message")
            or payload.get("detail")
            or f"Stripe API error ({e.code})"
        )
        raise HTTPException(status_code=400, detail=str(msg))
    except Exception:
        logger.exception("Stripe request failed for method=%s path=%s", method, path)
        raise HTTPException(status_code=503, detail="Stripe request failed.")


def _stripe_api_request(path: str, form: dict) -> dict:
    return _stripe_api_request_raw("POST", path, form=form)


def _stripe_api_get(path: str, query: Optional[object] = None) -> dict:
    return _stripe_api_request_raw("GET", path, query=query)


def _stripe_api_delete(path: str, form: Optional[dict] = None) -> dict:
    return _stripe_api_request_raw("DELETE", path, form=form)


def _stripe_extract_latest_payment(subscription: dict) -> tuple[str, int, int, str]:
    latest_invoice = subscription.get("latest_invoice") or {}
    if isinstance(latest_invoice, str):
        latest_invoice = _stripe_api_get(
            f"/v1/invoices/{latest_invoice}",
            query=[("expand[]", "payment_intent"), ("expand[]", "charge")],
        )
    payment_intent = latest_invoice.get("payment_intent") or {}
    if isinstance(payment_intent, str):
        payment_intent = _stripe_api_get(
            f"/v1/payment_intents/{payment_intent}",
            query=[("expand[]", "charges.data.balance_transaction")],
        )

    charge_obj = {}
    charges = ((payment_intent.get("charges") or {}).get("data") or [])
    if charges:
        charge_obj = charges[0] or {}
    elif isinstance(latest_invoice.get("charge"), dict):
        charge_obj = latest_invoice.get("charge") or {}
    elif isinstance(latest_invoice.get("charge"), str):
        charge_obj = _stripe_api_get(f"/v1/charges/{latest_invoice.get('charge')}")

    charge_id = str(charge_obj.get("id", "")).strip()
    currency = str(
        payment_intent.get("currency")
        or latest_invoice.get("currency")
        or charge_obj.get("currency")
        or "usd"
    ).strip().lower() or "usd"
    amount_paid = int(
        payment_intent.get("amount_received")
        or latest_invoice.get("amount_paid")
        or charge_obj.get("amount")
        or 0
    )
    max_refundable = int(
        max(
            0,
            int(charge_obj.get("amount", amount_paid) or amount_paid)
            - int(charge_obj.get("amount_refunded", 0) or 0),
        )
    )
    return charge_id, amount_paid, max_refundable, currency


def _stripe_compute_refund_for_cancel(subscription: dict, amount_paid: int, max_refundable: int) -> tuple[int, str]:
    now_ts = int(time.time())
    start_ts = int(subscription.get("start_date") or subscription.get("current_period_start") or now_ts)
    if start_ts > 0 and now_ts <= (start_ts + (REFUND_FULL_WINDOW_DAYS * 86400)):
        return min(int(amount_paid), int(max_refundable)), "full_7_day_refund"

    items = ((subscription.get("items") or {}).get("data") or [])
    first_price = ((items[0] or {}).get("price") or {}) if items else {}
    interval = str(((first_price.get("recurring") or {}).get("interval") or "")).strip().lower()
    if interval != "year":
        return 0, "no_refund"

    current_start = int(subscription.get("current_period_start") or start_ts or 0)
    current_end = int(subscription.get("current_period_end") or 0)
    if current_end <= now_ts or current_end <= current_start:
        return 0, "no_refund"

    cycle_seconds = int(current_end - current_start)
    remaining_seconds = int(current_end - now_ts)
    if cycle_seconds <= 0 or remaining_seconds <= 0:
        return 0, "no_refund"

    prorated = int(math.floor((int(amount_paid) * float(remaining_seconds)) / float(cycle_seconds)))
    if prorated <= 0:
        return 0, "no_refund"
    return min(prorated, int(max_refundable)), "annual_prorated_refund"


def _sanitize_billing_redirect_url(raw_url: Optional[str], fallback_url: str) -> str:
    def _is_allowed(parsed) -> bool:
        host = str(parsed.hostname or "").strip().lower()
        scheme = str(parsed.scheme or "").strip().lower()
        if not host or host not in BILLING_ALLOWED_HOSTS:
            return False
        if scheme == "https":
            return True
        if scheme == "http" and host in {"localhost", "127.0.0.1"}:
            return True
        return False

    candidates = [str(raw_url or "").strip(), str(fallback_url or "").strip()]
    for candidate in candidates:
        if not candidate:
            continue
        try:
            parsed = urllib.parse.urlparse(candidate)
        except Exception:
            continue
        if _is_allowed(parsed):
            safe = parsed._replace(fragment="")
            return urllib.parse.urlunparse(safe)
    raise HTTPException(status_code=400, detail="Invalid billing redirect URL.")


def _append_query_params(url: str, params: dict[str, str]) -> str:
    parsed = urllib.parse.urlparse(str(url or "").strip())
    existing = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    for key, value in params.items():
        existing.append((str(key), str(value)))
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(existing, doseq=True))
    )


def _coupon_grants_lifetime(coupon_code: Optional[str]) -> bool:
    return str(coupon_code or "").strip() == SPECIAL_COUPON_CODE


def _stripe_fetch_checkout_session(session_id: str) -> dict:
    sid = str(session_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="Checkout session is required.")
    return _stripe_api_get(
        f"/v1/checkout/sessions/{urllib.parse.quote(sid, safe='')}",
        query=[
            ("expand[]", "subscription"),
            ("expand[]", "subscription.items.data.price"),
        ],
    )


def _stripe_verified_precheckout_session(session_id: str, expected_plan_code: Optional[str] = None) -> dict:
    session = _stripe_fetch_checkout_session(session_id)
    metadata = session.get("metadata") or {}
    if str(metadata.get("signup_flow", "")).strip().lower() != "precheckout":
        raise HTTPException(status_code=400, detail="Invalid billing session.")
    if str(session.get("status", "")).strip().lower() != "complete":
        raise HTTPException(status_code=400, detail="Billing setup is not complete yet.")

    plan_code = str(metadata.get("plan_code", "")).strip().lower()
    if expected_plan_code and plan_code != str(expected_plan_code).strip().lower():
        raise HTTPException(status_code=400, detail="Billing plan does not match selected plan.")

    subscription_obj = session.get("subscription") or {}
    if isinstance(subscription_obj, str):
        subscription_obj = _stripe_api_get(
            f"/v1/subscriptions/{urllib.parse.quote(subscription_obj, safe='')}",
            query=[("expand[]", "items.data.price")],
        )
    subscription_id = str(subscription_obj.get("id", "") or session.get("subscription", "")).strip()
    if not subscription_id:
        raise HTTPException(status_code=400, detail="Stripe subscription was not created.")

    items = ((subscription_obj.get("items", {}) or {}).get("data", []) or [])
    first_item = items[0] if items else {}
    price_id = str(((first_item.get("price", {}) or {}).get("id", ""))).strip()
    customer_email = str(
        ((session.get("customer_details") or {}).get("email"))
        or session.get("customer_email")
        or ""
    ).strip().lower()
    customer_id = str(session.get("customer", "")).strip()

    return {
        "session_id": str(session.get("id", "")).strip(),
        "plan_code": plan_code,
        "billing_cycle": str(metadata.get("billing_cycle", "")).strip().lower(),
        "with_website": str(metadata.get("with_website", "")).strip().lower() in {"1", "true", "yes", "on"},
        "customer_email": customer_email,
        "customer_id": customer_id,
        "subscription_id": subscription_id,
        "price_id": price_id,
        "subscription_status": _stripe_status_to_subscription_status(
            str(subscription_obj.get("status", "")).strip().lower()
        ),
        "trial_ends_at": _iso_from_unix_ts(subscription_obj.get("trial_end")),
        "subscription_started_at": (
            _iso_from_unix_ts(subscription_obj.get("start_date"))
            or _iso_from_unix_ts(subscription_obj.get("current_period_start"))
        ),
    }


def _parse_stripe_signature(sig_header: str) -> tuple[Optional[int], Optional[str]]:
    if not sig_header:
        return None, None
    ts = None
    v1 = None
    for chunk in str(sig_header).split(","):
        k, _, v = chunk.partition("=")
        if k == "t":
            try:
                ts = int(v)
            except Exception:
                ts = None
        elif k == "v1":
            v1 = v
    return ts, v1


def _verify_stripe_webhook_signature(payload: bytes, sig_header: str) -> bool:
    if not STRIPE_WEBHOOK_SECRET:
        return False
    ts, provided_v1 = _parse_stripe_signature(sig_header)
    if ts is None or not provided_v1:
        return False
    # Stripe recommends short tolerance to limit replay risk.
    if abs(int(time.time()) - int(ts)) > 300:
        return False
    signed_payload = f"{ts}.{payload.decode('utf-8')}".encode("utf-8")
    expected = hmac.new(
        STRIPE_WEBHOOK_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, provided_v1)


def _extract_token(request: Request, authorization: Optional[str]) -> str:
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token:
        return cookie_token
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1].strip()
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
        is_lifetime_coupon = _coupon_grants_lifetime(body.coupon_code)
        checkout_info = None
        if not is_lifetime_coupon:
            checkout_info = _stripe_verified_precheckout_session(
                body.checkout_session_id,
                expected_plan_code=body.plan_code,
            )
            if checkout_info.get("customer_email"):
                body_email = str(body.email or "").strip().lower()
                if body_email != str(checkout_info["customer_email"]).strip().lower():
                    raise HTTPException(
                        status_code=400,
                        detail="Account email must match the billing email used in checkout.",
                    )
            existing_billing_user = User().get_user_by_billing_customer_id(
                checkout_info.get("customer_id", "")
            )
            if existing_billing_user:
                raise HTTPException(
                    status_code=400,
                    detail="This billing session is already linked to an account.",
                )
        uid = User().register(
            name=body.name,
            pw=body.password,
            email=body.email,
            phone=body.phone,
            coupon_code=body.coupon_code or "",
            plan_code=body.plan_code,
        )
        if checkout_info:
            User().update_billing_subscription(
                user_id=uid,
                plan_code=body.plan_code,
                subscription_status=checkout_info.get("subscription_status") or "trial",
                trial_ends_at=checkout_info.get("trial_ends_at") or "",
                subscription_started_at=checkout_info.get("subscription_started_at") or "",
                subscription_ends_at="",
                billing_provider="stripe",
                billing_customer_id=checkout_info.get("customer_id") or "",
                billing_subscription_id=checkout_info.get("subscription_id") or "",
                billing_price_id=checkout_info.get("price_id") or "",
            )
        profile = User().get_user_by_id(uid) or {}
        subscription = _build_subscription_payload(profile)
        profile_payload = _build_profile_payload(profile)
        return {
            "ok": True,
            "user_id": uid,
            "name": profile_payload.get("name") or body.email,
            "email": profile_payload.get("email") or body.email,
            "phone": profile_payload.get("phone") or body.phone,
            "email_notifications_enabled": bool(profile_payload.get("email_notifications_enabled", True)),
            "profile_image_url": profile_payload.get("profile_image_url", ""),
            "lifetime_access": bool(subscription.get("is_lifetime", False)),
            **subscription,
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
    subscription = _build_subscription_payload(profile)
    profile_payload = _build_profile_payload(profile)
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
        "name": profile_payload.get("name") or u.name,
        "email": profile_payload.get("email", ""),
        "phone": profile_payload.get("phone", ""),
        "email_notifications_enabled": bool(profile_payload.get("email_notifications_enabled", True)),
        "profile_image_url": profile_payload.get("profile_image_url", ""),
        "lifetime_access": bool(subscription.get("is_lifetime", False)),
        "session_minutes": TOKEN_TTL_SECONDS // 60,
        "token": token,
        **subscription,
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
    subscription = _build_subscription_payload(profile)
    profile_payload = _build_profile_payload(profile)
    name = profile_payload.get("name") or profile_payload.get("email") or f"user-{uid}"
    return {
        "ok": True,
        "user_id": int(uid),
        "name": name,
        "email": profile_payload.get("email", ""),
        "phone": profile_payload.get("phone", ""),
        "email_notifications_enabled": bool(profile_payload.get("email_notifications_enabled", True)),
        "profile_image_url": profile_payload.get("profile_image_url", ""),
        "lifetime_access": bool(subscription.get("is_lifetime", False)),
        **subscription,
    }


@app.get("/billing/plans")
def list_billing_plans():
    return SUBSCRIPTION_PLANS


@app.get("/billing/config")
def billing_config(
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, user_id)
    plan_price_ids = {
        "monthly": {
            "basic": STRIPE_PRICE_BASIC,
            "regular": STRIPE_PRICE_REGULAR,
            "business": STRIPE_PRICE_BUSINESS,
            "premium_plus": STRIPE_PRICE_PREMIUM_PLUS,
            "premium_plus_website": STRIPE_PRICE_PREMIUM_PLUS_WEBSITE,
        },
        "annual": {
            "basic": STRIPE_PRICE_BASIC_ANNUAL,
            "regular": STRIPE_PRICE_REGULAR_ANNUAL,
            "business": STRIPE_PRICE_BUSINESS_ANNUAL,
            "premium_plus": STRIPE_PRICE_PREMIUM_PLUS_ANNUAL,
            "premium_plus_website": STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL,
        },
    }
    configured_price_keys = []
    configured_plans = set()
    for cycle_name, cycle_map in plan_price_ids.items():
        for plan_name, price_id in cycle_map.items():
            if str(price_id).strip():
                configured_price_keys.append(f"{cycle_name}:{plan_name}")
                configured_plans.add(plan_name)
    return {
        "ok": True,
        "stripe_enabled": bool(STRIPE_SECRET_KEY),
        "embedded_checkout_enabled": bool(STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY),
        "portal_enabled": bool(STRIPE_SECRET_KEY),
        "webhook_configured": bool(STRIPE_WEBHOOK_SECRET),
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "configured_plans": sorted(configured_plans),
        "configured_price_keys": configured_price_keys,
        "prices": plan_price_ids,
    }


@app.post("/billing/precheckout")
def billing_precheckout(body: BillingPrecheckoutBody):
    plan_code = str(body.plan_code).strip().lower()
    billing_cycle = str(body.billing_cycle).strip().lower()
    if _coupon_grants_lifetime(body.coupon_code):
        return {
            "ok": True,
            "skip_checkout": True,
            "lifetime_access": True,
        }

    price_id = _stripe_price_for_plan(plan_code, bool(body.with_website), billing_cycle=billing_cycle)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price not configured for plan '{plan_code}' ({billing_cycle}).",
        )

    success_url = _sanitize_billing_redirect_url(body.success_url, BILLING_SUCCESS_URL)
    cancel_url = _sanitize_billing_redirect_url(body.cancel_url, BILLING_CANCEL_URL)
    success_url = _append_query_params(
        success_url,
        {
            "mode": "signup",
            "billing": "success",
            "plan": plan_code,
            "cycle": billing_cycle,
            "website": "1" if body.with_website else "0",
            "checkout_session_id": "{CHECKOUT_SESSION_ID}",
        },
    )
    cancel_url = _append_query_params(
        cancel_url,
        {
            "plan": plan_code,
            "cycle": billing_cycle,
            "website": "1" if body.with_website else "0",
        },
    )

    form = {
        "mode": "subscription",
        "payment_method_collection": "always",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": "true",
        "metadata[signup_flow]": "precheckout",
        "metadata[plan_code]": plan_code,
        "metadata[billing_cycle]": billing_cycle,
        "metadata[with_website]": "1" if body.with_website else "0",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
    }
    if BILLING_TRIAL_DAYS > 0:
        form["subscription_data[trial_period_days]"] = str(int(BILLING_TRIAL_DAYS))
        form["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "cancel"

    out = _stripe_api_request("/v1/checkout/sessions", form)
    checkout_url = str(out.get("url", "")).strip()
    if not checkout_url:
        raise HTTPException(status_code=503, detail="Stripe checkout session did not return URL.")
    return {
        "ok": True,
        "skip_checkout": False,
        "session_id": str(out.get("id", "")).strip(),
        "url": checkout_url,
    }


@app.post("/billing/precheckout/embedded")
def billing_precheckout_embedded(body: BillingPrecheckoutEmbeddedBody):
    plan_code = str(body.plan_code).strip().lower()
    billing_cycle = str(body.billing_cycle).strip().lower()
    if _coupon_grants_lifetime(body.coupon_code):
        return {
            "ok": True,
            "skip_checkout": True,
            "lifetime_access": True,
            "trial_days": int(BILLING_TRIAL_DAYS),
        }

    if not STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Stripe embedded checkout is not configured.")

    email = str(body.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required for billing setup.")

    price_id = _stripe_price_for_plan(plan_code, bool(body.with_website), billing_cycle=billing_cycle)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price not configured for plan '{plan_code}' ({billing_cycle}).",
        )

    return_url = _sanitize_billing_redirect_url(body.return_url, BILLING_RETURN_URL)
    return_url = _append_query_params(
        return_url,
        {
            "mode": "signup",
            "billing": "success",
            "plan": plan_code,
            "cycle": billing_cycle,
            "website": "1" if body.with_website else "0",
            "checkout_session_id": "{CHECKOUT_SESSION_ID}",
        },
    )

    form = {
        "mode": "subscription",
        "ui_mode": "embedded",
        "payment_method_collection": "always",
        "return_url": return_url,
        "allow_promotion_codes": "true",
        "customer_email": email,
        "metadata[signup_flow]": "precheckout",
        "metadata[plan_code]": plan_code,
        "metadata[billing_cycle]": billing_cycle,
        "metadata[with_website]": "1" if body.with_website else "0",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
    }
    if BILLING_TRIAL_DAYS > 0:
        form["subscription_data[trial_period_days]"] = str(int(BILLING_TRIAL_DAYS))
        form["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "cancel"

    out = _stripe_api_request("/v1/checkout/sessions", form)
    session_id = str(out.get("id", "")).strip()
    client_secret = str(out.get("client_secret", "")).strip()
    if not client_secret:
        raise HTTPException(status_code=503, detail="Stripe embedded checkout did not return client_secret.")
    return {
        "ok": True,
        "skip_checkout": False,
        "session_id": session_id,
        "client_secret": client_secret,
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "trial_days": int(BILLING_TRIAL_DAYS),
    }


@app.get("/billing/precheckout/session")
def billing_precheckout_session(
    session_id: str,
    plan_code: Optional[str] = None,
):
    info = _stripe_verified_precheckout_session(session_id, expected_plan_code=plan_code)
    return {
        "ok": True,
        "session_id": info["session_id"],
        "plan_code": info["plan_code"],
        "billing_cycle": info["billing_cycle"],
        "with_website": bool(info["with_website"]),
        "customer_email": info["customer_email"],
    }


@app.post("/billing/checkout")
def billing_checkout(
    body: BillingCheckoutBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    profile = User().get_user_by_id(body.user_id) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    if bool(profile.get("is_lifetime", False)):
        raise HTTPException(status_code=400, detail="Lifetime users do not need checkout.")
    plan_code = str(body.plan_code).strip().lower()
    billing_cycle = str(body.billing_cycle).strip().lower()
    price_id = _stripe_price_for_plan(plan_code, bool(body.with_website), billing_cycle=billing_cycle)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price not configured for plan '{plan_code}' ({billing_cycle}).",
        )
    success_url = _sanitize_billing_redirect_url(body.success_url, BILLING_SUCCESS_URL)
    cancel_url = _sanitize_billing_redirect_url(body.cancel_url, BILLING_CANCEL_URL)
    email = str(profile.get("email", "")).strip()
    if not email:
        raise HTTPException(status_code=400, detail="User email is required for billing.")
    existing_subscription_id = str(profile.get("billing_subscription_id", "")).strip()
    subscription_status = str(profile.get("subscription_status", "")).strip().lower()
    apply_trial = bool(
        BILLING_TRIAL_DAYS > 0
        and not existing_subscription_id
        and subscription_status in {"", "trial", "incomplete"}
    )

    form = {
        "mode": "subscription",
        "payment_method_collection": "always",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": "true",
        "client_reference_id": str(body.user_id),
        "metadata[user_id]": str(body.user_id),
        "metadata[plan_code]": plan_code,
        "metadata[billing_cycle]": billing_cycle,
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
    }
    if apply_trial:
        form["subscription_data[trial_period_days]"] = str(int(BILLING_TRIAL_DAYS))
        form["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "cancel"
    customer_id = str(profile.get("billing_customer_id", "")).strip()
    if customer_id:
        form["customer"] = customer_id
    else:
        form["customer_email"] = email

    out = _stripe_api_request("/v1/checkout/sessions", form)
    session_id = str(out.get("id", "")).strip()
    checkout_url = str(out.get("url", "")).strip()
    if not checkout_url:
        raise HTTPException(status_code=503, detail="Stripe checkout session did not return URL.")
    return {"ok": True, "session_id": session_id, "url": checkout_url}


@app.post("/billing/checkout/embedded")
def billing_checkout_embedded(
    body: BillingEmbeddedCheckoutBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    if not STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Stripe embedded checkout is not configured.")
    profile = User().get_user_by_id(body.user_id) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    if bool(profile.get("is_lifetime", False)):
        raise HTTPException(status_code=400, detail="Lifetime users do not need checkout.")
    plan_code = str(body.plan_code).strip().lower()
    billing_cycle = str(body.billing_cycle).strip().lower()
    price_id = _stripe_price_for_plan(plan_code, bool(body.with_website), billing_cycle=billing_cycle)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price not configured for plan '{plan_code}' ({billing_cycle}).",
        )
    return_url = _sanitize_billing_redirect_url(body.return_url, BILLING_RETURN_URL)
    email = str(profile.get("email", "")).strip()
    if not email:
        raise HTTPException(status_code=400, detail="User email is required for billing.")
    existing_subscription_id = str(profile.get("billing_subscription_id", "")).strip()
    subscription_status = str(profile.get("subscription_status", "")).strip().lower()
    apply_trial = bool(
        BILLING_TRIAL_DAYS > 0
        and not existing_subscription_id
        and subscription_status in {"", "trial", "incomplete"}
    )

    form = {
        "mode": "subscription",
        "ui_mode": "embedded",
        "payment_method_collection": "always",
        "return_url": return_url,
        "allow_promotion_codes": "true",
        "client_reference_id": str(body.user_id),
        "metadata[user_id]": str(body.user_id),
        "metadata[plan_code]": plan_code,
        "metadata[billing_cycle]": billing_cycle,
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
    }
    if apply_trial:
        form["subscription_data[trial_period_days]"] = str(int(BILLING_TRIAL_DAYS))
        form["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "cancel"
    customer_id = str(profile.get("billing_customer_id", "")).strip()
    if customer_id:
        form["customer"] = customer_id
    else:
        form["customer_email"] = email

    out = _stripe_api_request("/v1/checkout/sessions", form)
    session_id = str(out.get("id", "")).strip()
    client_secret = str(out.get("client_secret", "")).strip()
    if not client_secret:
        raise HTTPException(status_code=503, detail="Stripe embedded checkout did not return client_secret.")
    return {
        "ok": True,
        "session_id": session_id,
        "client_secret": client_secret,
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
    }


@app.post("/billing/portal")
def billing_portal(
    body: BillingPortalBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    profile = User().get_user_by_id(body.user_id) or {}
    customer_id = str(profile.get("billing_customer_id", "")).strip()
    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found for this user.")
    return_url = _sanitize_billing_redirect_url(body.return_url, BILLING_RETURN_URL)
    out = _stripe_api_request("/v1/billing_portal/sessions", {
        "customer": customer_id,
        "return_url": return_url,
    })
    portal_url = str(out.get("url", "")).strip()
    if not portal_url:
        raise HTTPException(status_code=503, detail="Stripe billing portal did not return URL.")
    return {"ok": True, "url": portal_url}


@app.post("/billing/cancel")
def billing_cancel(
    body: BillingCancelBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    profile = User().get_user_by_id(body.user_id) or {}
    subscription_id = str(profile.get("billing_subscription_id", "")).strip()
    if not subscription_id:
        raise HTTPException(status_code=400, detail="No Stripe subscription found for this user.")

    sub = _stripe_api_get(
        f"/v1/subscriptions/{subscription_id}",
        query=[("expand[]", "latest_invoice.payment_intent"), ("expand[]", "items.data.price")],
    )
    sub_status = str(sub.get("status", "")).strip().lower()
    if sub_status in {"canceled", "incomplete_expired"}:
        raise HTTPException(status_code=400, detail="Subscription is already canceled.")

    charge_id, amount_paid, max_refundable, currency = _stripe_extract_latest_payment(sub)
    refund_cents, refund_policy = _stripe_compute_refund_for_cancel(sub, amount_paid, max_refundable)

    canceled_sub = _stripe_api_delete(f"/v1/subscriptions/{subscription_id}")
    canceled_at_iso = _iso_from_unix_ts(canceled_sub.get("canceled_at") or int(time.time()))
    ended_at_iso = _iso_from_unix_ts(canceled_sub.get("current_period_end") or canceled_sub.get("canceled_at"))
    if not ended_at_iso:
        ended_at_iso = canceled_at_iso

    refund_obj = {}
    if refund_cents > 0 and charge_id:
        refund_obj = _stripe_api_request(
            "/v1/refunds",
            {
                "charge": charge_id,
                "amount": str(int(refund_cents)),
                "reason": "requested_by_customer",
                "metadata[user_id]": str(body.user_id),
                "metadata[policy]": refund_policy,
            },
        )

    User().update_billing_subscription(
        user_id=body.user_id,
        subscription_status="canceled",
        trial_ends_at="",
        subscription_ends_at=ended_at_iso,
        subscription_started_at=str(profile.get("subscription_started_at", "")).strip() or canceled_at_iso,
        billing_provider="stripe",
        billing_subscription_id=subscription_id,
    )

    refund_amount = round(float(refund_cents) / 100.0, 2)
    message = "Subscription canceled."
    if refund_policy == "full_7_day_refund" and refund_amount > 0:
        message = f"Subscription canceled. Full refund issued (${refund_amount:.2f})."
    elif refund_policy == "annual_prorated_refund" and refund_amount > 0:
        message = f"Subscription canceled. Prorated annual refund issued (${refund_amount:.2f})."
    elif refund_policy == "no_refund":
        message = "Subscription canceled. No refund is available based on policy."

    return {
        "ok": True,
        "subscription_id": subscription_id,
        "subscription_status": "canceled",
        "refund_policy": refund_policy,
        "refund_issued": bool(refund_obj),
        "refund_amount": refund_amount,
        "refund_currency": currency.upper(),
        "refund_id": str(refund_obj.get("id", "")).strip(),
        "message": message,
    }


@app.get("/profile")
def get_profile(
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, user_id)
    profile = User().get_user_by_id(user_id) or {}
    subscription = _build_subscription_payload(profile)
    return {"ok": True, "user_id": int(user_id), **_build_profile_payload(profile), **subscription}


@app.put("/profile")
def update_profile(
    body: ProfileUpdateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    if (
        body.name is None
        and body.email is None
        and body.phone is None
        and body.email_notifications_enabled is None
        and body.profile_image_url is None
    ):
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        User().update_profile(
            user_id=body.user_id,
            name=body.name,
            email=body.email,
            phone=body.phone,
            email_notifications_enabled=body.email_notifications_enabled,
            profile_image_url=body.profile_image_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    profile = User().get_user_by_id(body.user_id) or {}
    subscription = _build_subscription_payload(profile)
    return {"ok": True, "user_id": int(body.user_id), **_build_profile_payload(profile), **subscription}


@app.put("/profile/password")
def update_profile_password(
    body: PasswordUpdateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    try:
        User().change_password(
            user_id=body.user_id,
            current_password=body.current_password,
            new_password=body.new_password,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@app.get("/billing/subscription")
def get_billing_subscription(
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, user_id)
    profile = User().get_user_by_id(user_id) or {}
    return {"ok": True, "user_id": int(user_id), **_build_subscription_payload(profile)}


@app.put("/billing/subscription")
def update_billing_subscription(
    body: SubscriptionUpdateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    try:
        User().set_subscription_plan(user_id=body.user_id, plan_code=body.plan_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    profile = User().get_user_by_id(body.user_id) or {}
    return {"ok": True, "user_id": int(body.user_id), **_build_subscription_payload(profile)}


@app.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(default=None, alias="Stripe-Signature"),
):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Stripe webhook is not configured.")
    payload = await request.body()
    if not _verify_stripe_webhook_signature(payload, stripe_signature or ""):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.")
    try:
        event = json.loads(payload.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = str(event.get("type", "")).strip()
    data_obj = (event.get("data", {}) or {}).get("object", {}) or {}
    users = User()

    if event_type == "checkout.session.completed":
        metadata = data_obj.get("metadata", {}) or {}
        uid_raw = metadata.get("user_id") or data_obj.get("client_reference_id")
        customer_id = str(data_obj.get("customer", "")).strip()
        subscription_id = str(data_obj.get("subscription", "")).strip()
        plan_code = str(metadata.get("plan_code", "")).strip().lower()
        try:
            uid = int(uid_raw)
        except Exception:
            uid = 0
        if uid > 0:
            users.update_billing_subscription(
                user_id=uid,
                plan_code=plan_code or None,
                subscription_status="active",
                trial_ends_at="",
                subscription_started_at=datetime.utcnow().isoformat() + "Z",
                subscription_ends_at="",
                billing_provider="stripe",
                billing_customer_id=customer_id or None,
                billing_subscription_id=subscription_id or None,
            )
        elif customer_id:
            u = users.get_user_by_billing_customer_id(customer_id)
            if u:
                users.update_billing_subscription(
                    user_id=int(u["user_id"]),
                    plan_code=plan_code or None,
                    subscription_status="active",
                    trial_ends_at="",
                    subscription_started_at=datetime.utcnow().isoformat() + "Z",
                    subscription_ends_at="",
                    billing_provider="stripe",
                    billing_subscription_id=subscription_id or None,
                )

    elif event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        customer_id = str(data_obj.get("customer", "")).strip()
        subscription_id = str(data_obj.get("id", "")).strip()
        status = _stripe_status_to_subscription_status(str(data_obj.get("status", "")).strip().lower())
        items = ((data_obj.get("items", {}) or {}).get("data", []) or [])
        first_item = items[0] if items else {}
        price_id = str(((first_item.get("price", {}) or {}).get("id", ""))).strip()
        plan_code = _stripe_plan_from_price(price_id)
        started_at = _iso_from_unix_ts(data_obj.get("start_date"))
        ended_at = _iso_from_unix_ts(data_obj.get("ended_at") or data_obj.get("cancel_at"))
        if status == "canceled" and not ended_at:
            ended_at = _iso_from_unix_ts(data_obj.get("current_period_end"))

        if customer_id:
            u = users.get_user_by_billing_customer_id(customer_id)
            if u:
                users.update_billing_subscription(
                    user_id=int(u["user_id"]),
                    plan_code=plan_code,
                    subscription_status=status,
                    trial_ends_at="" if status in {"active", "canceled"} else None,
                    subscription_started_at=started_at or None,
                    subscription_ends_at=ended_at if status == "canceled" else "",
                    billing_provider="stripe",
                    billing_customer_id=customer_id,
                    billing_subscription_id=subscription_id or None,
                    billing_price_id=price_id or None,
                )

    elif event_type == "invoice.payment_failed":
        customer_id = str(data_obj.get("customer", "")).strip()
        if customer_id:
            u = users.get_user_by_billing_customer_id(customer_id)
            if u:
                users.update_billing_subscription(
                    user_id=int(u["user_id"]),
                    subscription_status="past_due",
                )

    return {"ok": True}


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


@app.post("/accounts/transfer")
def transfer_between_accounts(
    body: AccountTransferBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(request, authorization, body.user_id)
    if int(body.from_account_id) == int(body.to_account_id):
        raise HTTPException(status_code=400, detail="Source and destination accounts must be different.")
    ok = Account().transfer(
        from_account_id=body.from_account_id,
        to_account_id=body.to_account_id,
        amount=body.amount,
        user_id=body.user_id,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Transfer failed.")
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
