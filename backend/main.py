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

from fastapi import Cookie, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator

from backend.plan_features import feature_flags_for_plan, is_bank_sync_allowed, normalize_plan_code
from backend.plaid_service import (
    create_link_token,
    exchange_public_token,
    get_accounts,
    get_institution,
    get_item,
    plaid_is_configured,
    transactions_sync,
)
from backend.plaid_store import PlaidStore
from core import (
    Account,
    Admin1957,
    AuthSessionStore,
    Category,
    Coupon,
    DailyBalance,
    Transaction,
    User,
    WebLoginTokenStore,
)


app = FastAPI(title="KeeperBMA Backend", version="1.1.0")
TOKEN_SECRET = str(os.getenv("API_TOKEN_SECRET", "")).strip()
TOKEN_TTL_SECONDS = int(os.getenv("API_TOKEN_TTL_SECONDS", "1800"))  # 30 minutes
REFRESH_TOKEN_TTL_SECONDS = int(os.getenv("API_REFRESH_TOKEN_TTL_SECONDS", "2592000"))  # 30 days
WEB_LOGIN_TOKEN_TTL_SECONDS = int(os.getenv("WEB_LOGIN_TOKEN_TTL_SECONDS", "180"))  # 3 minutes
PENDING_PAYMENT_TOKEN_TTL_SECONDS = int(os.getenv("PENDING_PAYMENT_TOKEN_TTL_SECONDS", "2592000"))  # 30 days
STRICT_TOKEN_SECRET = str(os.getenv("STRICT_TOKEN_SECRET", "1")).strip().lower() in {"1", "true", "yes"}
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "keeperbma_session")
REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "keeperbma_refresh")
ADMIN_SESSION_COOKIE_NAME = os.getenv("ADMIN_SESSION_COOKIE_NAME", "keeperbma_admin_session")
WEB_APP_BASE_URL = str(os.getenv("WEB_APP_BASE_URL", "https://keeperbma.com")).strip().rstrip("/")
logger = logging.getLogger("keeperbma.api")
plaid_store = PlaidStore()
auth_session_store = AuthSessionStore()
web_login_token_store = WebLoginTokenStore()
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

MOBILE_SSO_DESTINATIONS = {
    "dashboard": "/index.html?app=1&mobile=1",
    "profile": "/settings.html?mobile=1",
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
    billing_cycle: str = Field(default="monthly", min_length=1, max_length=20)
    with_website: bool = False

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        return normalize_plan_code(v)

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        key = str(v).strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class LoginBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    password: str
    client: str = Field(default="web", min_length=1, max_length=20)
    device_label: Optional[str] = Field(default="", max_length=120)

    @field_validator("client")
    @classmethod
    def validate_client(cls, v: str) -> str:
        key = str(v or "web").strip().lower()
        return "mobile" if key == "mobile" else "web"


class AdminRegisterBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=7, max_length=40)
    password: str = Field(min_length=7, max_length=200)
    position: str = Field(min_length=1, max_length=80)


class AdminLoginBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    identifier: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class AdminUpdateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    email: Optional[str] = Field(default=None, min_length=3, max_length=200)
    phone: Optional[str] = Field(default=None, min_length=7, max_length=40)
    position: Optional[str] = Field(default=None, min_length=1, max_length=40)

    @field_validator("position")
    @classmethod
    def validate_position(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        key = str(v).strip().lower()
        if key not in {"owner", "manager", "support"}:
            raise ValueError("Invalid position")
        return key


class AdminResetPasswordBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    new_password: str = Field(min_length=7, max_length=200)

class AdminCouponCreateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    code: Optional[str] = Field(default="", max_length=64)
    plan_code: str = Field(min_length=1, max_length=40)
    billing_cycle: Optional[str] = Field(default="monthly", min_length=1, max_length=20)
    is_lifetime: bool = False
    max_uses: int = Field(default=1, ge=1, le=1000000)
    expires_at: Optional[str] = Field(default="", max_length=64)

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: str) -> str:
        return normalize_plan_code(v)

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: Optional[str]) -> str:
        key = str(v or "monthly").strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class AdminUserUpdateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    email: Optional[str] = Field(default=None, min_length=3, max_length=200)
    phone: Optional[str] = Field(default=None, min_length=7, max_length=40)
    email_notifications_enabled: Optional[bool] = None
    plan_code: Optional[str] = Field(default=None, min_length=1, max_length=40)
    subscription_status: Optional[str] = Field(default=None, min_length=1, max_length=40)
    payment_status: Optional[str] = Field(default=None, min_length=1, max_length=20)
    trial_status: Optional[str] = Field(default=None, min_length=1, max_length=20)
    billing_cycle: Optional[str] = Field(default=None, min_length=1, max_length=20)
    plan_with_website: Optional[bool] = None

    @field_validator("plan_code")
    @classmethod
    def validate_plan_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return normalize_plan_code(v)

    @field_validator("subscription_status")
    @classmethod
    def validate_subscription_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        allowed = {"trial", "active", "past_due", "canceled", "incomplete", "unpaid"}
        key = str(v).strip().lower()
        if key not in allowed:
            raise ValueError("Invalid subscription_status")
        return key

    @field_validator("payment_status")
    @classmethod
    def validate_payment_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        key = str(v).strip().lower()
        if key not in {"pending", "active"}:
            raise ValueError("Invalid payment_status")
        return key

    @field_validator("trial_status")
    @classmethod
    def validate_trial_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        key = str(v).strip().lower()
        if key not in {"pending", "active", "inactive"}:
            raise ValueError("Invalid trial_status")
        return key

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        key = str(v).strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class RecoveryRequestBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str = Field(min_length=3, max_length=200)


class RefreshBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    refresh_token: Optional[str] = Field(default=None, max_length=2000)


class LogoutBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    refresh_token: Optional[str] = Field(default=None, max_length=2000)


class MobileSsoBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    destination: str = Field(default="dashboard", min_length=1, max_length=40)

    @field_validator("destination")
    @classmethod
    def validate_destination(cls, v: str) -> str:
        key = str(v or "dashboard").strip().lower()
        if key not in MOBILE_SSO_DESTINATIONS:
            raise ValueError("Invalid destination")
        return key


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
        return normalize_plan_code(v)


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
        return normalize_plan_code(v)

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
        return normalize_plan_code(v)

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
        return normalize_plan_code(v)

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        key = str(v).strip().lower()
        if key not in {"monthly", "annual"}:
            raise ValueError("Invalid billing_cycle")
        return key


class PendingPaymentTokenBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    token: str = Field(min_length=10, max_length=2000)


class PendingPaymentCheckoutBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    token: str = Field(min_length=10, max_length=2000)


class PendingPaymentActivateBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    token: str = Field(min_length=10, max_length=2000)
    session_id: str = Field(min_length=4, max_length=255)


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
        return normalize_plan_code(v)

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


class BankLinkTokenBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int


class BankExchangeBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int
    public_token: str = Field(min_length=6, max_length=2000)


class BankSyncBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    user_id: int


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


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _iso_from_ts(ts: int) -> str:
    return datetime.fromtimestamp(int(ts), timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _token_signature(payload: str) -> str:
    return hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _token_digest(token: str) -> str:
    return hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        str(token or "").encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _set_user_access_cookie(response: Response, token: str, max_age: int = TOKEN_TTL_SECONDS) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=int(max_age),
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )


def _set_user_refresh_cookie(response: Response, token: str, max_age: int = REFRESH_TOKEN_TTL_SECONDS) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=int(max_age),
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )


def _clear_user_session_cookies(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=True,
        samesite="none",
    )
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/",
        secure=True,
        samesite="none",
    )


def _build_auth_payload(
    user_id: int,
    access_token: Optional[str] = None,
    refresh_token: Optional[str] = None,
    include_refresh_token: bool = False,
) -> dict:
    profile = User().get_user_by_id(int(user_id)) or {}
    subscription = _build_subscription_payload(profile)
    profile_payload = _build_profile_payload(profile)
    name = profile_payload.get("name") or profile_payload.get("email") or f"user-{int(user_id)}"
    payload = {
        "ok": True,
        "user_id": int(user_id),
        "name": name,
        "email": profile_payload.get("email", ""),
        "phone": profile_payload.get("phone", ""),
        "email_notifications_enabled": bool(profile_payload.get("email_notifications_enabled", True)),
        "profile_image_url": profile_payload.get("profile_image_url", ""),
        "lifetime_access": bool(subscription.get("is_lifetime", False)),
        "session_minutes": TOKEN_TTL_SECONDS // 60,
        "refresh_session_days": max(1, REFRESH_TOKEN_TTL_SECONDS // 86400),
        **subscription,
    }
    if access_token:
        payload["token"] = access_token
    if include_refresh_token and refresh_token:
        payload["refresh_token"] = refresh_token
    return payload


def _issue_access_token(user_id: int, session_id: str, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"access.{int(user_id)}.{str(session_id).strip()}.{exp}"
    return f"{payload}.{_token_signature(payload)}"


def _issue_token(user_id: int, ttl_seconds: int = TOKEN_TTL_SECONDS, session_id: str = "") -> str:
    session_key = str(session_id or "").strip()
    if session_key:
        return _issue_access_token(int(user_id), session_key, ttl_seconds=ttl_seconds)
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"{int(user_id)}.{exp}"
    return f"{payload}.{_token_signature(payload)}"


def _issue_refresh_token(
    user_id: int,
    session_id: str,
    ttl_seconds: int = REFRESH_TOKEN_TTL_SECONDS,
) -> tuple[str, str]:
    exp = int(time.time()) + int(ttl_seconds)
    nonce = secrets.token_urlsafe(24)
    payload = f"refresh.{int(user_id)}.{str(session_id).strip()}.{exp}.{nonce}"
    token = f"{payload}.{_token_signature(payload)}"
    return token, _iso_from_ts(exp)


def _issue_user_session(
    user_id: int,
    response: Optional[Response] = None,
    session_kind: str = "web",
    user_agent: str = "",
    device_label: str = "",
) -> dict:
    now_iso = _utc_now_iso()
    session_id = secrets.token_urlsafe(18)
    access_token = _issue_access_token(user_id, session_id)
    refresh_token, refresh_expires_at = _issue_refresh_token(user_id, session_id)
    auth_session_store.create(
        session_id=session_id,
        user_id=int(user_id),
        session_kind=str(session_kind or "web").strip().lower(),
        refresh_token_hash=_token_digest(refresh_token),
        refresh_expires_at=refresh_expires_at,
        created_at=now_iso,
        last_used_at=now_iso,
        user_agent=str(user_agent or "").strip(),
        device_label=str(device_label or "").strip(),
    )
    if response is not None:
        _set_user_access_cookie(response, access_token)
        _set_user_refresh_cookie(response, refresh_token)
    return {
        "session_id": session_id,
        "token": access_token,
        "refresh_token": refresh_token,
        "refresh_expires_at": refresh_expires_at,
    }


def _is_iso_expired(value: str) -> bool:
    dt = _as_utc(_parse_iso_datetime(value))
    if dt is None:
        return False
    return dt <= _utc_now()


def _verify_access_token(token: str) -> dict:
    parts = str(token or "").split(".")
    if len(parts) == 3:
        uid_s, exp_s, sig = parts
        try:
            uid = int(uid_s)
            exp = int(exp_s)
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        payload = f"{uid}.{exp}"
        expected_sig = _token_signature(payload)
        if not hmac.compare_digest(sig, expected_sig):
            raise HTTPException(status_code=401, detail="Invalid token signature")
        if int(time.time()) > exp:
            raise HTTPException(status_code=401, detail="Token expired")
        return {"user_id": uid, "session_id": "", "legacy": True}

    if len(parts) != 5 or parts[0] != "access":
        raise HTTPException(status_code=401, detail="Invalid token format")
    _, uid_s, session_id, exp_s, sig = parts
    try:
        uid = int(uid_s)
        exp = int(exp_s)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    payload = f"access.{uid}.{session_id}.{exp}"
    expected_sig = _token_signature(payload)
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid token signature")
    if int(time.time()) > exp:
        raise HTTPException(status_code=401, detail="Token expired")
    session = auth_session_store.get(session_id)
    if not session or int(session.get("user_id") or 0) != int(uid):
        raise HTTPException(status_code=401, detail="Session expired")
    if str(session.get("revoked_at", "")).strip():
        raise HTTPException(status_code=401, detail="Session expired")
    return {"user_id": uid, "session_id": session_id, "legacy": False, "session": session}


def _verify_refresh_token(token: str) -> dict:
    parts = str(token or "").split(".")
    if len(parts) != 6 or parts[0] != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token format")
    _, uid_s, session_id, exp_s, nonce, sig = parts
    try:
        uid = int(uid_s)
        exp = int(exp_s)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token payload")
    payload = f"refresh.{uid}.{session_id}.{exp}.{nonce}"
    expected_sig = _token_signature(payload)
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid refresh token signature")
    if int(time.time()) > exp:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    return {"user_id": uid, "session_id": session_id, "expires_at": _iso_from_ts(exp)}


def _issue_web_login_token(user_id: int, source_session_id: str, redirect_path: str) -> str:
    exp = int(time.time()) + int(WEB_LOGIN_TOKEN_TTL_SECONDS)
    token_id = secrets.token_urlsafe(18)
    nonce = secrets.token_urlsafe(18)
    payload = f"weblogin.{int(user_id)}.{token_id}.{exp}.{nonce}"
    token = f"{payload}.{_token_signature(payload)}"
    web_login_token_store.create(
        token_id=token_id,
        user_id=int(user_id),
        source_session_id=str(source_session_id or "").strip(),
        token_hash=_token_digest(token),
        redirect_path=str(redirect_path or "").strip(),
        expires_at=_iso_from_ts(exp),
        created_at=_utc_now_iso(),
    )
    return token


def _verify_web_login_token(token: str) -> dict:
    parts = str(token or "").split(".")
    if len(parts) != 6 or parts[0] != "weblogin":
        raise HTTPException(status_code=401, detail="Invalid web login token format")
    _, uid_s, token_id, exp_s, nonce, sig = parts
    try:
        uid = int(uid_s)
        exp = int(exp_s)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid web login token payload")
    payload = f"weblogin.{uid}.{token_id}.{exp}.{nonce}"
    expected_sig = _token_signature(payload)
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid web login token signature")
    if int(time.time()) > exp:
        raise HTTPException(status_code=401, detail="Web login token expired")
    return {"user_id": uid, "token_id": token_id, "expires_at": _iso_from_ts(exp)}


def _refresh_session_payload(refresh_token: str, response: Optional[Response] = None) -> dict:
    token_payload = _verify_refresh_token(refresh_token)
    session_id = str(token_payload.get("session_id") or "").strip()
    user_id = int(token_payload.get("user_id") or 0)
    session = auth_session_store.get(session_id)
    if not session or int(session.get("user_id") or 0) != user_id:
        raise HTTPException(status_code=401, detail="Refresh session not found")
    if str(session.get("revoked_at", "")).strip():
        raise HTTPException(status_code=401, detail="Refresh session expired")
    if _is_iso_expired(str(session.get("refresh_expires_at", "")).strip()):
        auth_session_store.revoke(session_id, _utc_now_iso())
        raise HTTPException(status_code=401, detail="Refresh session expired")
    new_access_token = _issue_access_token(user_id, session_id)
    new_refresh_token, refresh_expires_at = _issue_refresh_token(user_id, session_id)
    rotate_result = auth_session_store.rotate(
        session_id=session_id,
        current_hash=_token_digest(refresh_token),
        new_hash=_token_digest(new_refresh_token),
        refresh_expires_at=refresh_expires_at,
        when_iso=_utc_now_iso(),
    )
    if not rotate_result.get("ok"):
        if rotate_result.get("reason") == "replay":
            raise HTTPException(status_code=401, detail="Refresh session revoked")
        raise HTTPException(status_code=401, detail="Refresh session expired")
    if response is not None:
        _set_user_access_cookie(response, new_access_token)
        _set_user_refresh_cookie(response, new_refresh_token)
    payload = _build_auth_payload(
        user_id=user_id,
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        include_refresh_token=True,
    )
    payload["session_id"] = session_id
    return payload


def _issue_admin_token(admin_id: int, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"admin.{int(admin_id)}.{exp}"
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
    return int(_verify_access_token(token).get("user_id") or 0)


def _verify_admin_token(token: str) -> int:
    parts = str(token or "").split(".")
    if len(parts) != 4 or parts[0] != "admin":
        raise HTTPException(status_code=401, detail="Invalid admin token format")
    _, aid_s, exp_s, sig = parts
    try:
        aid = int(aid_s)
        exp = int(exp_s)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid admin token payload")
    payload = f"admin.{aid}.{exp}"
    expected_sig = hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid admin token signature")
    if int(time.time()) > exp:
        raise HTTPException(status_code=401, detail="Admin token expired")
    return aid


def _issue_pending_payment_token(user_id: int, ttl_seconds: int = PENDING_PAYMENT_TOKEN_TTL_SECONDS) -> str:
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"pending.{int(user_id)}.{exp}"
    sig = hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{sig}"


def _verify_pending_payment_token(token: str) -> int:
    parts = str(token or "").split(".")
    if len(parts) != 4 or parts[0] != "pending":
        raise HTTPException(status_code=401, detail="Invalid pending payment token.")
    _, uid_s, exp_s, sig = parts
    try:
        uid = int(uid_s)
        exp = int(exp_s)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid pending payment token.")
    payload = f"pending.{uid}.{exp}"
    expected_sig = hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid pending payment token.")
    if int(time.time()) > exp:
        raise HTTPException(status_code=401, detail="Pending payment token expired.")
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


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _stripe_price_metadata(price_id: str) -> dict:
    pid = str(price_id or "").strip()
    if not pid:
        return {}
    mapping = {
        STRIPE_PRICE_BASIC: {"plan_code": "basic", "billing_cycle": "monthly", "with_website": False},
        STRIPE_PRICE_BASIC_ANNUAL: {"plan_code": "basic", "billing_cycle": "annual", "with_website": False},
        STRIPE_PRICE_REGULAR: {"plan_code": "regular", "billing_cycle": "monthly", "with_website": False},
        STRIPE_PRICE_REGULAR_ANNUAL: {"plan_code": "regular", "billing_cycle": "annual", "with_website": False},
        STRIPE_PRICE_BUSINESS: {"plan_code": "business", "billing_cycle": "monthly", "with_website": False},
        STRIPE_PRICE_BUSINESS_ANNUAL: {"plan_code": "business", "billing_cycle": "annual", "with_website": False},
        STRIPE_PRICE_PREMIUM_PLUS: {"plan_code": "premium_plus", "billing_cycle": "monthly", "with_website": False},
        STRIPE_PRICE_PREMIUM_PLUS_ANNUAL: {"plan_code": "premium_plus", "billing_cycle": "annual", "with_website": False},
        STRIPE_PRICE_PREMIUM_PLUS_WEBSITE: {"plan_code": "premium_plus", "billing_cycle": "monthly", "with_website": True},
        STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL: {"plan_code": "premium_plus", "billing_cycle": "annual", "with_website": True},
    }
    return mapping.get(pid, {})


def _subscription_feature_flags(plan_code: str, is_lifetime: bool = False, with_website: bool = False) -> dict:
    return feature_flags_for_plan(
        plan_code=plan_code,
        is_lifetime=is_lifetime,
        with_website=with_website,
    )


def _subscription_access_details(
    status: str,
    is_lifetime: bool,
    trial_ends_at: str,
    subscription_ends_at: str,
) -> tuple[bool, str]:
    if is_lifetime:
        return True, "Lifetime access is active."
    now_dt = datetime.now(timezone.utc)
    key = str(status or "").strip().lower()
    if key == "trial":
        trial_dt = _as_utc(_parse_iso_datetime(trial_ends_at))
        if trial_dt and trial_dt > now_dt:
            return True, f"Free trial active until {trial_dt.date().isoformat()}."
        return False, "Your free trial has ended. Update billing to continue."
    if key == "active":
        return True, "Subscription active."
    if key == "canceled":
        end_dt = _as_utc(_parse_iso_datetime(subscription_ends_at))
        if end_dt and end_dt > now_dt:
            return True, f"Subscription canceled. Access remains until {end_dt.date().isoformat()}."
        return False, "Subscription canceled. Reactivate billing to continue."
    if key == "past_due":
        return False, "Payment is past due. Update billing to continue."
    if key == "unpaid":
        return False, "Subscription is unpaid. Update billing to continue."
    if key == "incomplete":
        return False, "Billing setup is incomplete. Complete checkout to continue."
    return False, "Subscription inactive. Update billing to continue."


def _build_subscription_payload(profile: dict) -> dict:
    plan_code = str(profile.get("plan_code", "")).strip().lower()
    is_lifetime = bool(profile.get("is_lifetime", False)) or plan_code == "lifetime"
    if not plan_code:
        plan_code = "lifetime" if is_lifetime else "basic"
    status = str(profile.get("subscription_status", "")).strip().lower()
    if not status:
        status = "active" if is_lifetime else "active"
    payment_status = str(profile.get("payment_status", "")).strip().lower()
    if not payment_status:
        payment_status = "active" if is_lifetime else "active"
    trial_status = str(profile.get("trial_status", "")).strip().lower()
    if not trial_status:
        trial_status = "active" if is_lifetime else "inactive"
    trial_ends_at = str(profile.get("trial_ends_at", "")).strip()
    subscription_started_at = str(profile.get("subscription_started_at", "")).strip()
    subscription_ends_at = str(profile.get("subscription_ends_at", "")).strip()
    billing_cycle = str(profile.get("billing_cycle", "")).strip().lower()
    if billing_cycle not in {"monthly", "annual"}:
        billing_cycle = ""
    plan_with_website = bool(profile.get("plan_with_website", False))
    next_charge_at = str(profile.get("next_charge_at", "")).strip()
    trial_days_remaining = 0
    if status == "trial" and trial_ends_at:
        trial_dt = _as_utc(_parse_iso_datetime(trial_ends_at))
        if trial_dt is not None:
            now_dt = datetime.now(timezone.utc)
            delta_s = (trial_dt - now_dt).total_seconds()
            if delta_s > 0:
                trial_days_remaining = max(1, int(math.ceil(delta_s / 86400.0)))
    if not next_charge_at and status == "trial" and trial_ends_at:
        next_charge_at = trial_ends_at
    access_active, access_reason = _subscription_access_details(
        status=status,
        is_lifetime=is_lifetime,
        trial_ends_at=trial_ends_at,
        subscription_ends_at=subscription_ends_at,
    )
    if not is_lifetime and payment_status != "active":
        access_active = False
        access_reason = "Payment information is required to activate your account. You will not be charged until the trial period ends."
    return {
        "plan_code": plan_code,
        "subscription_status": status,
        "payment_status": payment_status,
        "trial_status": trial_status,
        "trial_ends_at": trial_ends_at,
        "trial_days_remaining": int(trial_days_remaining),
        "is_lifetime": is_lifetime,
        "subscription_started_at": subscription_started_at,
        "subscription_ends_at": subscription_ends_at,
        "billing_provider": str(profile.get("billing_provider", "")).strip().lower(),
        "billing_customer_id": str(profile.get("billing_customer_id", "")).strip(),
        "billing_subscription_id": str(profile.get("billing_subscription_id", "")).strip(),
        "billing_price_id": str(profile.get("billing_price_id", "")).strip(),
        "billing_cycle": billing_cycle,
        "plan_with_website": plan_with_website,
        "next_charge_at": next_charge_at,
        "access_active": bool(access_active),
        "access_reason": access_reason,
        "feature_flags": _subscription_feature_flags(
            plan_code=plan_code,
            is_lifetime=is_lifetime,
            with_website=plan_with_website,
        ),
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
        "price_monthly": 7,
        "price_annual": 70,
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
        "plan_code": "diamond",
        "label": "Diamond",
        "price_monthly": 70,
        "price_annual": 700,
        "features": [
            "All Premium Plus features",
            "Portfolio website included",
            "Bank sync and advanced analytics",
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
    if key == "diamond":
        if cycle == "annual":
            return STRIPE_PRICE_PREMIUM_PLUS_WEBSITE_ANNUAL
        return STRIPE_PRICE_PREMIUM_PLUS_WEBSITE
    return ""


def _stripe_plan_from_price(price_id: str) -> Optional[str]:
    meta = _stripe_price_metadata(price_id)
    return str(meta.get("plan_code", "")).strip().lower() or None


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


def _append_query_params_preserve_checkout_id(url: str, params: dict[str, str]) -> str:
    out = _append_query_params(url, params)
    return out.replace(
        urllib.parse.quote("{CHECKOUT_SESSION_ID}", safe=""),
        "{CHECKOUT_SESSION_ID}",
    )


def _payment_page_base_url() -> str:
    parsed = urllib.parse.urlparse(_sanitize_billing_redirect_url(BILLING_RETURN_URL, BILLING_RETURN_URL))
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/payment", "", "", ""))


def _payment_page_url(token: str, billing: Optional[str] = None, session_id: Optional[str] = None) -> str:
    params = {"token": str(token or "").strip()}
    if billing:
        params["billing"] = str(billing).strip()
    if session_id:
        params["checkout_session_id"] = str(session_id).strip()
    return _append_query_params_preserve_checkout_id(_payment_page_base_url(), params)


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
    price_obj = first_item.get("price", {}) or {}
    price_id = str((price_obj.get("id", ""))).strip()
    derived_meta = _stripe_price_metadata(price_id)
    customer_email = str(
        ((session.get("customer_details") or {}).get("email"))
        or session.get("customer_email")
        or ""
    ).strip().lower()
    customer_id = str(session.get("customer", "")).strip()
    billing_cycle = str(metadata.get("billing_cycle", "")).strip().lower()
    if billing_cycle not in {"monthly", "annual"}:
        billing_cycle = str(derived_meta.get("billing_cycle", "")).strip().lower()
    plan_with_website = str(metadata.get("with_website", "")).strip().lower() in {"1", "true", "yes", "on"}
    if not plan_with_website:
        plan_with_website = bool(derived_meta.get("with_website", False))
    next_charge_at = (
        _iso_from_unix_ts(subscription_obj.get("trial_end"))
        or _iso_from_unix_ts(subscription_obj.get("current_period_end"))
    )

    return {
        "session_id": str(session.get("id", "")).strip(),
        "plan_code": plan_code or str(derived_meta.get("plan_code", "")).strip().lower(),
        "billing_cycle": billing_cycle,
        "with_website": bool(plan_with_website),
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
        "next_charge_at": next_charge_at,
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


def _extract_refresh_token(request: Request, body_refresh_token: Optional[str] = None) -> str:
    provided = str(body_refresh_token or "").strip()
    if provided:
        return provided
    cookie_token = str(request.cookies.get(REFRESH_COOKIE_NAME) or "").strip()
    if cookie_token:
        return cookie_token
    raise HTTPException(status_code=401, detail="Missing refresh token")


def _safe_web_redirect_path(path: str) -> str:
    cleaned = str(path or "").strip()
    if cleaned in MOBILE_SSO_DESTINATIONS.values():
        return cleaned
    return MOBILE_SSO_DESTINATIONS["dashboard"]


def _require_user(request: Request, authorization: Optional[str], expected_user_id: int) -> None:
    token = _extract_token(request, authorization)
    token_uid = _verify_access_token(token).get("user_id")
    if int(token_uid) != int(expected_user_id):
        raise HTTPException(status_code=403, detail="Forbidden user scope")


def _require_app_access(request: Request, authorization: Optional[str], expected_user_id: int) -> dict:
    _require_user(request, authorization, expected_user_id)
    profile = User().get_user_by_id(expected_user_id) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")
    subscription = _build_subscription_payload(profile)
    if not bool(subscription.get("access_active", False)):
        raise HTTPException(
            status_code=402,
            detail=str(subscription.get("access_reason") or "Subscription inactive. Update billing to continue."),
        )
    return profile


def _require_bank_sync_access(request: Request, authorization: Optional[str], expected_user_id: int) -> dict:
    profile = _require_app_access(request, authorization, expected_user_id)
    subscription = _build_subscription_payload(profile)
    feature_flags = subscription.get("feature_flags") or {}
    if not bool(feature_flags.get("bank_sync")):
        raise HTTPException(
            status_code=403,
            detail="Secure bank connection is available on Regular and above, including Lifetime.",
        )
    if not plaid_is_configured():
        raise HTTPException(
            status_code=503,
            detail="Bank sync is not configured yet. Add Plaid credentials to the backend.",
        )
    return profile


def _plaid_account_type_to_keeper(account_type: str, subtype: str) -> str:
    atype = str(account_type or "").strip().lower()
    sub = str(subtype or "").strip().lower()
    if atype == "depository":
        return "saving" if sub == "savings" else "checking"
    if atype in {"credit", "loan"}:
        return "credit"
    if atype == "investment":
        return "asset"
    return "asset"


def _extract_admin_token(request: Request, authorization: Optional[str]) -> str:
    cookie_token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)
    if cookie_token:
        return cookie_token
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1].strip()
    raise HTTPException(status_code=401, detail="Missing admin auth token")


def _require_admin(request: Request, authorization: Optional[str] = None) -> dict:
    token = _extract_admin_token(request, authorization)
    admin_id = _verify_admin_token(token)
    admin = Admin1957().get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(status_code=401, detail="Admin session is invalid.")
    return admin


def _admin_position_key(admin_or_position) -> str:
    if isinstance(admin_or_position, dict):
        raw = admin_or_position.get("position", "")
    else:
        raw = admin_or_position
    return str(raw or "").strip().lower()


def _build_admin_permissions(admin: dict) -> dict:
    role = _admin_position_key(admin)
    return {
        "can_manage_admins": role == "owner",
        "can_manage_users": role in {"owner", "manager"},
        "read_only": role == "support",
    }


def _require_admin_roles(
    request: Request,
    authorization: Optional[str] = None,
    allowed_positions: tuple[str, ...] = ("owner",),
) -> dict:
    admin = _require_admin(request, authorization)
    allowed = {str(item).strip().lower() for item in allowed_positions}
    if _admin_position_key(admin) not in allowed:
        raise HTTPException(status_code=403, detail="Admin permission denied.")
    return admin


def _build_admin_payload(admin: dict) -> dict:
    return {
        "id": int(admin.get("id", 0) or 0),
        "name": str(admin.get("name", "")).strip(),
        "email": str(admin.get("email", "")).strip(),
        "phone": str(admin.get("phone", "")).strip(),
        "position": str(admin.get("position", "")).strip(),
        "created_at": str(admin.get("created_at", "")).strip(),
        "permissions": _build_admin_permissions(admin),
    }


def _records_from_frame(df) -> list[dict]:
    if df is None:
        return []
    safe = df.copy()
    safe = safe.where(safe.notna(), "")
    records = []
    for _, row in safe.iterrows():
        item = {}
        for col in safe.columns:
            value = row[col]
            if hasattr(value, "item"):
                try:
                    value = value.item()
                except Exception:
                    pass
            item[str(col)] = value
        records.append(item)
    return records


def _coerce_int(value, default=0) -> int:
    try:
        if value in ("", None):
            return default
        return int(float(value))
    except Exception:
        return default


def _coerce_float(value, default=0.0) -> float:
    try:
        if value in ("", None):
            return default
        return float(value)
    except Exception:
        return default


def _coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def _build_admin_category_records(category_rows: list[dict]) -> list[dict]:
    out = []
    for row in category_rows or []:
        linked_account_id = _coerce_int(row.get("linked_account_id"), 0)
        is_auto = _coerce_bool(row.get("is_auto"))
        out.append(
            {
                "category_id": _coerce_int(row.get("category_id"), 0),
                "user_id": _coerce_int(row.get("user_id"), 0),
                "name": str((row.get("category_name") or row.get("name") or "")).strip(),
                "type": "account_linked" if linked_account_id > 0 else "custom",
                "is_auto": is_auto,
                "account_linked": linked_account_id > 0,
                "linked_account_id": linked_account_id,
            }
        )
    out.sort(key=lambda item: (item["user_id"], item["category_id"]))
    return out


def _build_admin_daily_balance_records(daily_rows: list[dict], transaction_rows: list[dict]) -> list[dict]:
    grouped: dict[tuple[int, str], dict] = {}

    for row in daily_rows or []:
        user_id = _coerce_int(row.get("user_id"), 0)
        date_value = str(row.get("date", "") or "").strip()
        if user_id <= 0 or not date_value:
            continue
        key = (user_id, date_value)
        item = grouped.setdefault(
            key,
            {
                "dailyb_id": _coerce_int(row.get("dailyB_id"), 0),
                "user_id": user_id,
                "date": date_value,
                "income": 0.0,
                "expense": 0.0,
                "net": 0.0,
                "snapshot": 0.0,
            },
        )
        item["snapshot"] += _coerce_float(row.get("balance"), 0.0)
        dailyb_id = _coerce_int(row.get("dailyB_id"), 0)
        if item["dailyb_id"] == 0 or (dailyb_id and dailyb_id < item["dailyb_id"]):
            item["dailyb_id"] = dailyb_id

    for row in transaction_rows or []:
        user_id = _coerce_int(row.get("user_id"), 0)
        date_raw = str(row.get("date", "") or "").strip()
        if user_id <= 0 or not date_raw:
            continue
        date_value = date_raw.split(" ")[0]
        key = (user_id, date_value)
        item = grouped.setdefault(
            key,
            {
                "dailyb_id": 0,
                "user_id": user_id,
                "date": date_value,
                "income": 0.0,
                "expense": 0.0,
                "net": 0.0,
                "snapshot": 0.0,
            },
        )
        amount = _coerce_float(row.get("amount"), 0.0)
        tx_type = str(row.get("type", "") or "").strip().lower()
        if tx_type == "income":
            item["income"] += amount
        elif tx_type == "expense":
            item["expense"] += amount

    out = []
    for item in grouped.values():
        item["net"] = item["income"] - item["expense"]
        out.append(
            {
                "dailyb_id": item["dailyb_id"],
                "user_id": item["user_id"],
                "date": item["date"],
                "income": round(item["income"], 2),
                "expense": round(item["expense"], 2),
                "net": round(item["net"], 2),
                "snapshot": round(item["snapshot"], 2),
            }
        )
    out.sort(key=lambda item: (item["user_id"], item["date"], item["dailyb_id"]))
    return out


@app.on_event("startup")
def _startup_checks() -> None:
    if not TOKEN_SECRET or len(TOKEN_SECRET) < 32:
        msg = "API_TOKEN_SECRET must be set to a strong secret (32+ chars)."
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
        coupon_ctx = _resolve_coupon_context(body.coupon_code, body.plan_code, body.billing_cycle)
        coupon_code = _normalize_coupon_code(body.coupon_code)
        if coupon_code and not bool(coupon_ctx.get("valid")):
            raise HTTPException(status_code=400, detail=str(coupon_ctx.get("error") or "Invalid coupon code."))

        uid = User().register(
            name=body.name,
            pw=body.password,
            email=body.email,
            phone=body.phone,
            coupon_code=coupon_code,
            plan_code=body.plan_code,
            billing_cycle=body.billing_cycle,
            plan_with_website=body.with_website,
            activate_without_payment=bool(coupon_ctx.get("valid") and coupon_ctx.get("bypass_payment") and not coupon_ctx.get("is_lifetime")),
            force_plan_code=coupon_ctx.get("plan_code") if coupon_ctx.get("valid") else None,
            force_lifetime=bool(coupon_ctx.get("valid") and coupon_ctx.get("is_lifetime")),
        )
        if bool(coupon_ctx.get("generated")) and bool(coupon_ctx.get("valid")):
            Coupon().mark_used(coupon_ctx.get("code") or "")

        profile = User().get_user_by_id(uid) or {}
        subscription = _build_subscription_payload(profile)
        profile_payload = _build_profile_payload(profile)
        payment_required = not bool(coupon_ctx.get("valid") and coupon_ctx.get("bypass_payment"))
        payment_token = ""
        payment_url = ""
        if payment_required:
            payment_token = _issue_pending_payment_token(uid)
            payment_url = _payment_page_url(payment_token)
        return {
            "ok": True,
            "user_id": uid,
            "name": profile_payload.get("name") or body.email,
            "email": profile_payload.get("email") or body.email,
            "phone": profile_payload.get("phone") or body.phone,
            "email_notifications_enabled": bool(profile_payload.get("email_notifications_enabled", True)),
            "profile_image_url": profile_payload.get("profile_image_url", ""),
            "lifetime_access": bool(subscription.get("is_lifetime", False)),
            "payment_required": payment_required,
            "payment_token": payment_token,
            "payment_url": payment_url,
            "coupon_applied": bool(coupon_ctx.get("valid")),
            "coupon_code": coupon_ctx.get("code") or "",
            **subscription,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
def login(body: LoginBody, request: Request, response: Response):
    u = User()
    ok = u.login(body.name, body.password)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    profile = User().get_user_by_id(int(u.uid)) or {}
    subscription = _build_subscription_payload(profile)
    profile_payload = _build_profile_payload(profile)
    if not bool(subscription.get("is_lifetime", False)) and str(subscription.get("payment_status", "")).strip().lower() != "active":
        payment_token = _issue_pending_payment_token(int(u.uid))
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Payment information is required to activate your account. You will not be charged until the trial period ends.",
                "payment_required": True,
                "payment_status": str(subscription.get("payment_status", "")).strip().lower() or "pending",
                "payment_url": _payment_page_url(payment_token),
            },
        )
    session_kind = "mobile" if body.client == "mobile" else "web"
    session_tokens = _issue_user_session(
        user_id=int(u.uid),
        response=response,
        session_kind=session_kind,
        user_agent=request.headers.get("user-agent", ""),
        device_label=body.device_label if session_kind == "mobile" else "",
    )
    return _build_auth_payload(
        user_id=int(u.uid),
        access_token=session_tokens.get("token"),
        refresh_token=session_tokens.get("refresh_token"),
        include_refresh_token=session_kind == "mobile",
    )


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


@app.post("/auth/refresh")
def auth_refresh(
    request: Request,
    response: Response,
    body: Optional[RefreshBody] = None,
):
    refresh_token = _extract_refresh_token(request, body.refresh_token if body else None)
    payload = _refresh_session_payload(refresh_token, response=response)
    if not (body and body.refresh_token):
        payload.pop("refresh_token", None)
    return payload


@app.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    body: Optional[LogoutBody] = None,
    authorization: Optional[str] = Header(default=None),
):
    session_ids = set()
    try:
        access_payload = _verify_access_token(_extract_token(request, authorization))
        session_id = str(access_payload.get("session_id") or "").strip()
        if session_id:
            session_ids.add(session_id)
    except HTTPException:
        pass

    try:
        refresh_payload = _verify_refresh_token(_extract_refresh_token(request, body.refresh_token if body else None))
        session_id = str(refresh_payload.get("session_id") or "").strip()
        if session_id:
            session_ids.add(session_id)
    except HTTPException:
        pass

    now_iso = _utc_now_iso()
    for session_id in session_ids:
        auth_session_store.revoke(session_id, now_iso)

    _clear_user_session_cookies(response)
    return {"ok": True}


@app.get("/auth/session")
def auth_session(request: Request, authorization: Optional[str] = Header(default=None)):
    token = _extract_token(request, authorization)
    uid = _verify_access_token(token).get("user_id")
    return _build_auth_payload(user_id=int(uid))


@app.post("/auth/mobile-sso")
def auth_mobile_sso(
    body: MobileSsoBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    access_payload = _verify_access_token(_extract_token(request, authorization))
    user_id = int(access_payload.get("user_id") or 0)
    session_id = str(access_payload.get("session_id") or "").strip()
    session = access_payload.get("session")
    if session_id and session and str(session.get("session_kind", "")).strip().lower() != "mobile":
        raise HTTPException(status_code=403, detail="Mobile SSO requires a mobile app session")
    redirect_path = MOBILE_SSO_DESTINATIONS.get(body.destination, MOBILE_SSO_DESTINATIONS["dashboard"])
    one_time_token = _issue_web_login_token(user_id, session_id, redirect_path)
    launch_url = f"{str(request.base_url).rstrip('/')}/auth/mobile-sso/consume?token={urllib.parse.quote(one_time_token, safe='')}"
    return {
        "ok": True,
        "launch_url": launch_url,
        "expires_in": WEB_LOGIN_TOKEN_TTL_SECONDS,
        "destination": body.destination,
    }


@app.get("/auth/mobile-sso/consume")
def auth_mobile_sso_consume(token: str, request: Request):
    verified = _verify_web_login_token(token)
    token_id = str(verified.get("token_id") or "").strip()
    user_id = int(verified.get("user_id") or 0)
    row = web_login_token_store.get(token_id)
    if not row or int(row.get("user_id") or 0) != user_id:
        raise HTTPException(status_code=401, detail="Web login token invalid")
    if str(row.get("revoked_at", "")).strip():
        raise HTTPException(status_code=401, detail="Web login token revoked")
    if str(row.get("used_at", "")).strip():
        raise HTTPException(status_code=401, detail="Web login token already used")
    if _is_iso_expired(str(row.get("expires_at", "")).strip()):
        raise HTTPException(status_code=401, detail="Web login token expired")

    consume_result = web_login_token_store.consume(
        token_id=token_id,
        token_hash=_token_digest(token),
        used_at=_utc_now_iso(),
        used_by_ip=request.client.host if request.client else "",
    )
    if not consume_result.get("ok"):
        raise HTTPException(status_code=401, detail="Web login token invalid")

    redirect_path = _safe_web_redirect_path(str(row.get("redirect_path") or ""))
    target_url = urllib.parse.urljoin(f"{WEB_APP_BASE_URL}/", redirect_path.lstrip("/"))
    response = RedirectResponse(url=target_url, status_code=303)
    _issue_user_session(
        user_id=user_id,
        response=response,
        session_kind="web",
        user_agent=request.headers.get("user-agent", ""),
    )
    return response


@app.post("/admin1957/register")
def admin1957_register(
    body: AdminRegisterBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    admins = Admin1957()
    if admins.count() > 0:
        _require_admin_roles(request, authorization, ("owner",))
    try:
        admin = admins.register(
            name=body.name,
            email=body.email,
            phone=body.phone,
            password=body.password,
            position=body.position,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "admin": _build_admin_payload(admin)}


@app.post("/admin1957/login")
def admin1957_login(body: AdminLoginBody, response: Response):
    admins = Admin1957()
    if not admins.login(body.identifier, body.password):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    admin = admins.get_admin_by_id(int(admins.admin_id)) or {}
    token = _issue_admin_token(int(admins.admin_id))
    response.set_cookie(
        key=ADMIN_SESSION_COOKIE_NAME,
        value=token,
        max_age=TOKEN_TTL_SECONDS,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return {
        "ok": True,
        "admin": _build_admin_payload(admin),
        "token": token,
        "session_minutes": TOKEN_TTL_SECONDS // 60,
    }


@app.post("/admin1957/logout")
def admin1957_logout(response: Response):
    response.delete_cookie(
        key=ADMIN_SESSION_COOKIE_NAME,
        path="/",
        secure=True,
        samesite="none",
    )
    return {"ok": True}


@app.get("/admin1957/session")
def admin1957_session(request: Request, authorization: Optional[str] = Header(default=None)):
    token = _extract_admin_token(request, authorization)
    admin = _require_admin(request, authorization)
    return {
        "ok": True,
        "admin": _build_admin_payload(admin),
        "token": token,
        "session_minutes": TOKEN_TTL_SECONDS // 60,
    }


@app.get("/admin1957/dashboard")
def admin1957_dashboard(request: Request, authorization: Optional[str] = Header(default=None)):
    admin = _require_admin(request, authorization)
    users_model = User()
    accounts_model = Account()
    tx_model = Transaction()
    categories_model = Category()
    daily_model = DailyBalance()
    admins_model = Admin1957()
    coupons_model = Coupon()

    users = users_model.list_all()
    accounts = _records_from_frame(accounts_model._load())
    transactions = _records_from_frame(tx_model._load())
    categories = _build_admin_category_records(_records_from_frame(categories_model._load()))
    daily_balances = _build_admin_daily_balance_records(_records_from_frame(daily_model._load()), transactions)
    admins = admins_model.list_all()
    coupons = coupons_model.list_all()

    return {
        "ok": True,
        "admin": _build_admin_payload(admin),
        "metrics": {
            "admins": len(admins),
            "users": len(users),
            "accounts": len(accounts),
            "transactions": len(transactions),
            "categories": len(categories),
            "daily_balances": len(daily_balances),
            "coupons": len(coupons),
        },
        "admins": admins,
        "users": users,
        "accounts": accounts,
        "transactions": transactions,
        "categories": categories,
        "daily_balances": daily_balances,
        "coupons": coupons,
    }


@app.put("/admin1957/users/{user_id}")
def admin1957_update_user(
    user_id: int,
    body: AdminUserUpdateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_admin_roles(request, authorization, ("owner", "manager"))
    users_model = User()
    try:
        if any(
            value is not None
            for value in [
                body.name,
                body.email,
                body.phone,
                body.email_notifications_enabled,
            ]
        ):
            users_model.update_profile(
                user_id,
                name=body.name,
                email=body.email,
                phone=body.phone,
                email_notifications_enabled=body.email_notifications_enabled,
            )

        if any(
            value is not None
            for value in [
                body.plan_code,
                body.subscription_status,
                body.payment_status,
                body.trial_status,
                body.billing_cycle,
                body.plan_with_website,
            ]
        ):
            users_model.update_billing_subscription(
                user_id,
                plan_code=body.plan_code,
                subscription_status=body.subscription_status,
                payment_status=body.payment_status,
                trial_status=body.trial_status,
                billing_cycle=body.billing_cycle,
                plan_with_website=body.plan_with_website,
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    profile = users_model.get_user_by_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")
    return {
        "ok": True,
        "user": {
            "user_id": int(profile["user_id"]),
            **_build_profile_payload(profile),
            **_build_subscription_payload(profile),
        },
    }


@app.put("/admin1957/admins/{admin_id}")
def admin1957_update_admin(
    admin_id: int,
    body: AdminUpdateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    admin = _require_admin_roles(request, authorization, ("owner",))
    admins_model = Admin1957()
    try:
        updated = admins_model.update_admin(
            admin_id,
            name=body.name,
            email=body.email,
            phone=body.phone,
            position=body.position,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "ok": True,
        "admin": _build_admin_payload(updated),
        "actor": _build_admin_payload(admin),
    }


@app.delete("/admin1957/admins/{admin_id}")
def admin1957_delete_admin(
    admin_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    admin = _require_admin_roles(request, authorization, ("owner",))
    actor_id = int(admin.get("id", 0) or 0)
    if actor_id == int(admin_id):
        raise HTTPException(status_code=400, detail="Use another owner account to remove this admin.")
    admins_model = Admin1957()
    try:
        admins_model.delete_admin(admin_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@app.post("/admin1957/admins/{admin_id}/reset-password")
def admin1957_reset_admin_password(
    admin_id: int,
    body: AdminResetPasswordBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_admin_roles(request, authorization, ("owner",))
    admins_model = Admin1957()
    try:
        updated = admins_model.set_password(admin_id, body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "admin": _build_admin_payload(updated)}


@app.post("/admin1957/coupons")
def admin1957_create_coupon(
    body: AdminCouponCreateBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    admin = _require_admin_roles(request, authorization, ("owner",))
    is_lifetime = bool(body.is_lifetime or normalize_plan_code(body.plan_code) == "lifetime")
    try:
        coupon = Coupon().create(
            code=body.code or "",
            plan_code="lifetime" if is_lifetime else body.plan_code,
            billing_cycle=body.billing_cycle,
            is_lifetime=is_lifetime,
            max_uses=int(body.max_uses),
            expires_at=body.expires_at or "",
            created_by_admin_id=admin.get("id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "coupon": coupon}


@app.post("/admin1957/coupons/{coupon_id}/deactivate")
def admin1957_deactivate_coupon(
    coupon_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_admin_roles(request, authorization, ("owner",))
    coupon = Coupon().deactivate(coupon_id)
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found.")
    return {"ok": True, "coupon": coupon}


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


@app.post("/billing/pending/context")
def billing_pending_context(body: PendingPaymentTokenBody):
    user_id = _verify_pending_payment_token(body.token)
    profile = User().get_user_by_id(user_id) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")
    subscription = _build_subscription_payload(profile)
    return {
        "ok": True,
        "user_id": int(user_id),
        "name": str(profile.get("name", "")).strip(),
        "email": str(profile.get("email", "")).strip(),
        "phone": str(profile.get("phone", "")).strip(),
        "plan_code": str(subscription.get("plan_code", "")).strip().lower(),
        "billing_cycle": str(subscription.get("billing_cycle", "")).strip().lower() or "monthly",
        "plan_with_website": bool(subscription.get("plan_with_website", False)),
        "payment_status": str(subscription.get("payment_status", "")).strip().lower() or "pending",
        "trial_status": str(subscription.get("trial_status", "")).strip().lower() or "pending",
        "trial_days": int(BILLING_TRIAL_DAYS),
        "already_active": bool(subscription.get("payment_status") == "active"),
        "message": "You will not be charged until the free trial period ends.",
    }


@app.post("/billing/pending/checkout")
def billing_pending_checkout(body: PendingPaymentCheckoutBody):
    user_id = _verify_pending_payment_token(body.token)
    profile = User().get_user_by_id(user_id) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")
    subscription = _build_subscription_payload(profile)
    if bool(subscription.get("is_lifetime", False)):
        return {"ok": True, "already_active": True, "payment_required": False}
    if str(subscription.get("payment_status", "")).strip().lower() == "active":
        return {"ok": True, "already_active": True, "payment_required": False}

    plan_code = str(subscription.get("plan_code", "")).strip().lower() or "basic"
    billing_cycle = str(subscription.get("billing_cycle", "")).strip().lower() or "monthly"
    with_website = bool(subscription.get("plan_with_website", False))
    price_id = _stripe_price_for_plan(plan_code, with_website, billing_cycle=billing_cycle)
    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price not configured for plan '{plan_code}' ({billing_cycle}).",
        )

    success_url = _payment_page_url(body.token, billing="success", session_id="{CHECKOUT_SESSION_ID}")
    cancel_url = _payment_page_url(body.token, billing="cancel")
    email = str(profile.get("email", "")).strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="User email is required for billing.")
    customer_id = str(profile.get("billing_customer_id", "")).strip()
    existing_subscription_id = str(profile.get("billing_subscription_id", "")).strip()
    subscription_status = str(profile.get("subscription_status", "")).strip().lower()
    apply_trial = bool(
        BILLING_TRIAL_DAYS > 0
        and not existing_subscription_id
        and subscription_status in {"", "trial", "incomplete", "canceled"}
    )

    form = {
        "mode": "subscription",
        "payment_method_collection": "always",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": "true",
        "client_reference_id": str(user_id),
        "metadata[signup_flow]": "pending_payment",
        "metadata[user_id]": str(user_id),
        "metadata[plan_code]": plan_code,
        "metadata[billing_cycle]": billing_cycle,
        "metadata[with_website]": "1" if with_website else "0",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
    }
    if customer_id:
        form["customer"] = customer_id
    else:
        form["customer_email"] = email
    if apply_trial:
        form["subscription_data[trial_period_days]"] = str(int(BILLING_TRIAL_DAYS))
        form["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "cancel"

    out = _stripe_api_request("/v1/checkout/sessions", form)
    checkout_url = str(out.get("url", "")).strip()
    session_id = str(out.get("id", "")).strip()
    if not checkout_url or not session_id:
        raise HTTPException(status_code=503, detail="Stripe checkout session did not return URL.")
    return {
        "ok": True,
        "url": checkout_url,
        "session_id": session_id,
        "trial_days": int(BILLING_TRIAL_DAYS),
        "message": "You will not be charged until the free trial period ends.",
    }


@app.post("/billing/pending/activate")
def billing_pending_activate(body: PendingPaymentActivateBody):
    user_id = _verify_pending_payment_token(body.token)
    profile = User().get_user_by_id(user_id) or {}
    if not profile:
        raise HTTPException(status_code=404, detail="User not found.")
    if bool(profile.get("is_lifetime", False)):
        return {"ok": True, "already_active": True, "login_url": "/auth?mode=signin"}

    session = _stripe_fetch_checkout_session(body.session_id)
    metadata = session.get("metadata") or {}
    if str(metadata.get("signup_flow", "")).strip().lower() != "pending_payment":
        raise HTTPException(status_code=400, detail="Invalid payment session.")
    if str(session.get("status", "")).strip().lower() != "complete":
        raise HTTPException(status_code=400, detail="Payment setup is not complete yet.")

    try:
        session_user_id = int(metadata.get("user_id") or session.get("client_reference_id") or 0)
    except Exception:
        session_user_id = 0
    if session_user_id != int(user_id):
        raise HTTPException(status_code=403, detail="Payment session does not match this user.")

    customer_id = str(session.get("customer", "")).strip()
    existing_billing_user = User().get_user_by_billing_customer_id(customer_id) if customer_id else None
    if existing_billing_user and int(existing_billing_user.get("user_id", 0)) != int(user_id):
        raise HTTPException(status_code=400, detail="This Stripe customer is already linked to another account.")

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
    price_obj = first_item.get("price", {}) or {}
    price_id = str(price_obj.get("id", "")).strip()
    price_meta = _stripe_price_metadata(price_id)
    plan_code = str(metadata.get("plan_code", "")).strip().lower() or str(price_meta.get("plan_code", "")).strip().lower()
    billing_cycle = str(metadata.get("billing_cycle", "")).strip().lower()
    if billing_cycle not in {"monthly", "annual"}:
        billing_cycle = str(price_meta.get("billing_cycle", "")).strip().lower()
    with_website = str(metadata.get("with_website", "")).strip().lower() in {"1", "true", "yes", "on"}
    if not with_website:
        with_website = bool(price_meta.get("with_website", False))
    subscription_status = _stripe_status_to_subscription_status(str(subscription_obj.get("status", "")).strip().lower())
    trial_ends_at = _iso_from_unix_ts(subscription_obj.get("trial_end"))
    subscription_started_at = (
        _iso_from_unix_ts(subscription_obj.get("start_date"))
        or _iso_from_unix_ts(subscription_obj.get("current_period_start"))
        or datetime.utcnow().isoformat() + "Z"
    )
    subscription_ends_at = _iso_from_unix_ts(subscription_obj.get("ended_at") or subscription_obj.get("cancel_at"))
    next_charge_at = trial_ends_at or _iso_from_unix_ts(subscription_obj.get("current_period_end"))
    if subscription_status not in {"trial", "active"}:
        subscription_status = "trial" if trial_ends_at else "active"

    User().update_billing_subscription(
        user_id=user_id,
        plan_code=plan_code or None,
        subscription_status=subscription_status,
        trial_ends_at=trial_ends_at or "",
        subscription_started_at=subscription_started_at or "",
        subscription_ends_at=subscription_ends_at or "",
        billing_provider="stripe",
        billing_customer_id=customer_id or "",
        billing_subscription_id=subscription_id or "",
        billing_price_id=price_id or "",
        billing_cycle=billing_cycle or "",
        plan_with_website=with_website,
        next_charge_at=next_charge_at or "",
        payment_status="active",
        trial_status="active",
    )
    return {
        "ok": True,
        "user_id": int(user_id),
        "payment_status": "active",
        "trial_status": "active",
        "login_url": "/auth?mode=signin&payment=success",
        "message": "Payment information saved. You will not be charged until the free trial period ends.",
    }


@app.post("/billing/precheckout")
def billing_precheckout(body: BillingPrecheckoutBody):
    plan_code = str(body.plan_code).strip().lower()
    billing_cycle = str(body.billing_cycle).strip().lower()
    coupon_ctx = _resolve_coupon_context(body.coupon_code, plan_code, billing_cycle)
    coupon_code = _normalize_coupon_code(body.coupon_code)
    if coupon_code and not bool(coupon_ctx.get("valid")):
        raise HTTPException(status_code=400, detail=str(coupon_ctx.get("error") or "Invalid coupon code."))
    if bool(coupon_ctx.get("valid") and coupon_ctx.get("bypass_payment")):
        return {
            "ok": True,
            "skip_checkout": True,
            "coupon_applied": True,
            "lifetime_access": bool(coupon_ctx.get("is_lifetime")),
            "plan_code": coupon_ctx.get("plan_code") or plan_code,
            "billing_cycle": coupon_ctx.get("billing_cycle") or billing_cycle,
            "message": "Coupon applied. No payment information is required.",
            "payment_token": "",
            "payment_url": "",
            "trial_days": int(BILLING_TRIAL_DAYS),
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
    coupon_ctx = _resolve_coupon_context(body.coupon_code, plan_code, billing_cycle)
    coupon_code = _normalize_coupon_code(body.coupon_code)
    if coupon_code and not bool(coupon_ctx.get("valid")):
        raise HTTPException(status_code=400, detail=str(coupon_ctx.get("error") or "Invalid coupon code."))
    if bool(coupon_ctx.get("valid") and coupon_ctx.get("bypass_payment")):
        return {
            "ok": True,
            "skip_checkout": True,
            "coupon_applied": True,
            "lifetime_access": bool(coupon_ctx.get("is_lifetime")),
            "plan_code": coupon_ctx.get("plan_code") or plan_code,
            "billing_cycle": coupon_ctx.get("billing_cycle") or billing_cycle,
            "client_secret": "",
            "session_id": "",
            "publishable_key": STRIPE_PUBLISHABLE_KEY,
            "message": "Coupon applied. No payment information is required.",
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
    token: Optional[str] = None,
):
    _verify_pending_payment_token(str(token or "").strip())
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
    if STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=400,
            detail="Direct plan updates are disabled. Use the Stripe billing checkout flow.",
        )
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
        billing_cycle = str(metadata.get("billing_cycle", "")).strip().lower()
        plan_with_website = str(metadata.get("with_website", "")).strip().lower() in {"1", "true", "yes", "on"}
        subscription_status = "active"
        trial_ends_at = ""
        subscription_started_at = datetime.utcnow().isoformat() + "Z"
        subscription_ends_at = ""
        billing_price_id = ""
        next_charge_at = ""
        if subscription_id:
            try:
                sub = _stripe_api_get(
                    f"/v1/subscriptions/{subscription_id}",
                    query=[("expand[]", "items.data.price")],
                )
                items = ((sub.get("items", {}) or {}).get("data", []) or [])
                first_item = items[0] if items else {}
                price_obj = first_item.get("price", {}) or {}
                billing_price_id = str(price_obj.get("id", "")).strip()
                derived_meta = _stripe_price_metadata(billing_price_id)
                if not plan_code:
                    plan_code = str(derived_meta.get("plan_code", "")).strip().lower()
                if billing_cycle not in {"monthly", "annual"}:
                    billing_cycle = str(derived_meta.get("billing_cycle", "")).strip().lower()
                if not plan_with_website:
                    plan_with_website = bool(derived_meta.get("with_website", False))
                subscription_status = _stripe_status_to_subscription_status(str(sub.get("status", "")).strip().lower())
                trial_ends_at = _iso_from_unix_ts(sub.get("trial_end"))
                subscription_started_at = (
                    _iso_from_unix_ts(sub.get("start_date"))
                    or _iso_from_unix_ts(sub.get("current_period_start"))
                    or subscription_started_at
                )
                subscription_ends_at = _iso_from_unix_ts(sub.get("ended_at") or sub.get("cancel_at"))
                next_charge_at = (
                    _iso_from_unix_ts(sub.get("trial_end"))
                    or _iso_from_unix_ts(sub.get("current_period_end"))
                )
            except Exception:
                logger.exception("Failed to enrich checkout.session.completed subscription %s", subscription_id)
        try:
            uid = int(uid_raw)
        except Exception:
            uid = 0
        if uid > 0:
            users.update_billing_subscription(
                user_id=uid,
                plan_code=plan_code or None,
                subscription_status=subscription_status,
                trial_ends_at=trial_ends_at,
                subscription_started_at=subscription_started_at,
                subscription_ends_at=subscription_ends_at,
                billing_provider="stripe",
                billing_customer_id=customer_id or None,
                billing_subscription_id=subscription_id or None,
                billing_price_id=billing_price_id or None,
                billing_cycle=billing_cycle or None,
                plan_with_website=plan_with_website,
                next_charge_at=next_charge_at or None,
                payment_status="active",
                trial_status="active",
            )
        elif customer_id:
            u = users.get_user_by_billing_customer_id(customer_id)
            if u:
                users.update_billing_subscription(
                    user_id=int(u["user_id"]),
                    plan_code=plan_code or None,
                    subscription_status=subscription_status,
                    trial_ends_at=trial_ends_at,
                    subscription_started_at=subscription_started_at,
                    subscription_ends_at=subscription_ends_at,
                    billing_provider="stripe",
                    billing_customer_id=customer_id,
                    billing_subscription_id=subscription_id or None,
                    billing_price_id=billing_price_id or None,
                    billing_cycle=billing_cycle or None,
                    plan_with_website=plan_with_website,
                    next_charge_at=next_charge_at or None,
                    payment_status="active",
                    trial_status="active",
                )

    elif event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        customer_id = str(data_obj.get("customer", "")).strip()
        subscription_id = str(data_obj.get("id", "")).strip()
        status = _stripe_status_to_subscription_status(str(data_obj.get("status", "")).strip().lower())
        items = ((data_obj.get("items", {}) or {}).get("data", []) or [])
        first_item = items[0] if items else {}
        price_obj = first_item.get("price", {}) or {}
        price_id = str((price_obj.get("id", ""))).strip()
        price_meta = _stripe_price_metadata(price_id)
        plan_code = str(price_meta.get("plan_code", "")).strip().lower() or _stripe_plan_from_price(price_id)
        recurring = price_obj.get("recurring", {}) or {}
        interval = str(recurring.get("interval", "")).strip().lower()
        billing_cycle = str(price_meta.get("billing_cycle", "")).strip().lower()
        if billing_cycle not in {"monthly", "annual"}:
            if interval == "year":
                billing_cycle = "annual"
            elif interval == "month":
                billing_cycle = "monthly"
            else:
                billing_cycle = ""
        plan_with_website = bool(price_meta.get("with_website", False))
        started_at = _iso_from_unix_ts(data_obj.get("start_date"))
        ended_at = _iso_from_unix_ts(data_obj.get("ended_at") or data_obj.get("cancel_at"))
        trial_ends_at = _iso_from_unix_ts(data_obj.get("trial_end"))
        next_charge_at = trial_ends_at or _iso_from_unix_ts(data_obj.get("current_period_end"))
        if status == "canceled" and not ended_at:
            ended_at = _iso_from_unix_ts(data_obj.get("current_period_end"))

        if customer_id:
            u = users.get_user_by_billing_customer_id(customer_id)
            if u:
                users.update_billing_subscription(
                    user_id=int(u["user_id"]),
                    plan_code=plan_code,
                    subscription_status=status,
                    trial_ends_at=trial_ends_at if status == "trial" else "",
                    subscription_started_at=started_at or None,
                    subscription_ends_at=ended_at if status == "canceled" else "",
                    billing_provider="stripe",
                    billing_customer_id=customer_id,
                    billing_subscription_id=subscription_id or None,
                    billing_price_id=price_id or None,
                    billing_cycle=billing_cycle or None,
                    plan_with_website=plan_with_website,
                    next_charge_at=next_charge_at or "",
                    payment_status="active" if status in {"trial", "active"} else None,
                    trial_status="active" if status in {"trial", "active"} else ("inactive" if status == "canceled" else None),
                )

    elif event_type == "invoice.payment_failed":
        customer_id = str(data_obj.get("customer", "")).strip()
        if customer_id:
            u = users.get_user_by_billing_customer_id(customer_id)
            if u:
                users.update_billing_subscription(
                    user_id=int(u["user_id"]),
                    subscription_status="past_due",
                    payment_status="active",
                )

    return {"ok": True}


@app.get("/accounts")
def list_accounts(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_app_access(request, authorization, user_id)
    df = Account().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/accounts")
def create_account(body: AccountCreateBody, request: Request, authorization: Optional[str] = Header(default=None)):
    _require_app_access(request, authorization, body.user_id)
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
    _require_app_access(request, authorization, body.user_id)
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
    _require_app_access(request, authorization, user_id)
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
    _require_app_access(request, authorization, body.user_id)
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


@app.post("/bank/plaid/link-token")
def create_plaid_link_token(
    body: BankLinkTokenBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    profile = _require_bank_sync_access(request, authorization, body.user_id)
    host = request.url.hostname or ""
    webhook_url = None
    if host:
        webhook_url = f"{request.url.scheme}://{host}/plaid/webhook"
    try:
        out = create_link_token(
            user_id=int(body.user_id),
            username=str(profile.get("name", "")).strip() or str(profile.get("email", "")).strip() or f"user-{body.user_id}",
            webhook_url=webhook_url,
        )
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Plaid link token creation failed for user_id=%s", body.user_id)
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/bank/connections")
def list_bank_connections(
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    _require_bank_sync_access(request, authorization, user_id)
    return plaid_store.list_connections(user_id=user_id)


@app.get("/bank/accounts")
def list_bank_accounts(
    request: Request,
    user_id: int,
    authorization: Optional[str] = Header(default=None),
):
    _require_bank_sync_access(request, authorization, user_id)
    accounts = plaid_store.list_linked_accounts(user_id=user_id)
    if not accounts:
        return []
    local_accounts = Account().by_user(user_id)
    name_by_id = {}
    if local_accounts is not None and not local_accounts.empty:
        for _, row in local_accounts.iterrows():
            try:
                name_by_id[int(row.get("account_id"))] = str(row.get("account_name", "")).strip()
            except Exception:
                continue
    for row in accounts:
        keeper_id = row.get("keeper_account_id")
        if keeper_id:
            try:
                row["keeper_account_name"] = name_by_id.get(int(keeper_id), "")
            except Exception:
                row["keeper_account_name"] = ""
        else:
            row["keeper_account_name"] = ""
    return accounts


@app.post("/plaid/webhook")
async def plaid_webhook(request: Request):
    payload = await request.json()
    logger.info(
        "Plaid webhook received: %s/%s",
        payload.get("webhook_type"),
        payload.get("webhook_code"),
    )
    return {"ok": True}


@app.post("/bank/plaid/exchange")
def exchange_plaid_public_token(
    body: BankExchangeBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_bank_sync_access(request, authorization, body.user_id)
    try:
        exchange = exchange_public_token(body.public_token)
        access_token = str(exchange.get("access_token", "")).strip()
        item_id = str(exchange.get("item_id", "")).strip()
        item = get_item(access_token)
        institution_id = str(item.get("institution_id", "")).strip()
        institution_name = ""
        institution = {}
        if institution_id:
            institution = get_institution(institution_id) or {}
            institution_name = str(institution.get("name", "")).strip()
        connection = plaid_store.upsert_connection(
            user_id=body.user_id,
            item_id=item_id,
            access_token=access_token,
            institution_id=institution_id,
            institution_name=institution_name,
            status="active",
        )

        accounts_payload = get_accounts(access_token)
        accounts = accounts_payload.get("accounts", []) or []
        local_df = Account().by_user(body.user_id)
        existing_by_name = {}
        if local_df is not None and not local_df.empty:
            for _, row in local_df.iterrows():
                existing_by_name[str(row.get("account_name", "")).strip().lower()] = int(row.get("account_id"))

        linked_rows = []
        for account in accounts:
            provider_account_id = str(account.get("account_id", "")).strip()
            name = str(account.get("name", "")).strip()
            official_name = str(account.get("official_name", "")).strip()
            display_name = official_name or name or provider_account_id
            subtype = str(account.get("subtype", "")).strip().lower()
            account_type = _plaid_account_type_to_keeper(account.get("type", ""), subtype)
            balances = account.get("balances", {}) or {}
            current_balance = balances.get("current")
            available_balance = balances.get("available")
            group_name = "bank"
            if str(account.get("type", "")).strip().lower() in {"credit", "loan"}:
                group_name = "debt"
            keeper_account_id = existing_by_name.get(display_name.lower())
            if not keeper_account_id:
                keeper_account_id = Account().add(
                    account_name=display_name,
                    account_type=account_type,
                    group_name=group_name,
                    balance=float(current_balance or 0.0),
                    user_id=body.user_id,
                )
                existing_by_name[display_name.lower()] = int(keeper_account_id)
            linked_rows.append(
                {
                    "provider_account_id": provider_account_id,
                    "account_name": display_name,
                    "account_type": account_type,
                    "account_subtype": subtype,
                    "mask": str(account.get("mask", "")).strip(),
                    "institution_name": institution_name,
                    "current_balance": current_balance,
                    "available_balance": available_balance,
                    "keeper_account_id": int(keeper_account_id),
                }
            )
        plaid_store.upsert_linked_accounts(
            user_id=body.user_id,
            item_id=item_id,
            institution_name=institution_name,
            accounts=linked_rows,
        )
        return {
            "ok": True,
            "connection": connection,
            "accounts": plaid_store.list_linked_accounts(body.user_id),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Plaid exchange failed for user_id=%s", body.user_id)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/bank/plaid/sync")
def sync_plaid_transactions(
    body: BankSyncBody,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    _require_bank_sync_access(request, authorization, body.user_id)
    connections = plaid_store.list_connections(body.user_id)
    if not connections:
        return {"ok": True, "connections": 0, "imported": 0, "transactions_created": 0}

    imported_count = 0
    created_count = 0
    for connection in connections:
        access_token = str(connection.get("access_token", "")).strip()
        item_id = str(connection.get("item_id", "")).strip()
        cursor = str(connection.get("cursor", "")).strip() or None
        if not access_token or not item_id:
            continue
        sync_out = transactions_sync(access_token, cursor=cursor)
        plaid_store.update_connection_cursor(body.user_id, item_id, sync_out.get("next_cursor", ""))
        linked_accounts = plaid_store.list_linked_accounts(body.user_id)
        linked_by_provider_id = {
            str(row.get("provider_account_id", "")).strip(): row for row in linked_accounts
        }
        for txn in sync_out.get("added", []) or []:
            transaction_id = str(txn.get("transaction_id", "")).strip()
            if not transaction_id:
                continue
            imported_count += 1
            provider_account_id = str(txn.get("account_id", "")).strip()
            linked = linked_by_provider_id.get(provider_account_id) or {}
            plaid_store.upsert_imported_transaction(
                user_id=body.user_id,
                transaction_id=transaction_id,
                item_id=item_id,
                provider_account_id=provider_account_id,
                amount=txn.get("amount"),
                iso_date=txn.get("date"),
                pending=txn.get("pending"),
                merchant_name=txn.get("merchant_name"),
                description=txn.get("name"),
                category_primary=((txn.get("personal_finance_category") or {}).get("primary") or ""),
                raw_payload=txn,
            )
            if bool(txn.get("pending")):
                continue
            imported = plaid_store.find_imported_transaction(body.user_id, transaction_id)
            if imported and imported.get("keeper_txn_id"):
                continue
            keeper_account_id = linked.get("keeper_account_id")
            if not keeper_account_id:
                continue
            try:
                amount_value = abs(float(txn.get("amount") or 0.0))
            except Exception:
                amount_value = 0.0
            if amount_value <= 0:
                continue
            tx_type = "expense" if float(txn.get("amount") or 0.0) >= 0 else "income"
            category_primary = str(((txn.get("personal_finance_category") or {}).get("primary") or "")).strip()
            category_name = category_primary.replace("_", " ").title() if category_primary else "Other"
            if category_name:
                try:
                    Category().add(category_name=category_name, user_id=body.user_id)
                except Exception:
                    pass
            note = str(txn.get("merchant_name") or txn.get("name") or "").strip()
            keeper_txn_id = Transaction().add(
                t_type=tx_type,
                amount=amount_value,
                account_id=int(keeper_account_id),
                category=category_name or "Other",
                note=note,
                user_id=body.user_id,
            )
            plaid_store.mark_keeper_txn(body.user_id, transaction_id, keeper_txn_id)
            created_count += 1

    return {
        "ok": True,
        "connections": len(connections),
        "imported": imported_count,
        "transactions_created": created_count,
        "linked_accounts": plaid_store.list_linked_accounts(body.user_id),
    }


@app.get("/transactions")
def list_transactions(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_app_access(request, authorization, user_id)
    df = Transaction().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")


@app.post("/transactions")
def create_transaction(body: TxCreateBody, request: Request, authorization: Optional[str] = Header(default=None)):
    _require_app_access(request, authorization, body.user_id)
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
    _require_app_access(request, authorization, body.user_id)
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
    _require_app_access(request, authorization, user_id)
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
    _require_app_access(request, authorization, user_id)
    try:
        cat = Category()
        cat.sync_auto_from_accounts(user_id)
        df = cat.visible_by_user(user_id)
        if df is None or df.empty:
            return []
        return df.fillna("").to_dict(orient="records")
    except Exception:
        logger.exception("Category load failed for user_id=%s", user_id)
        return []


@app.post("/categories")
def create_category(body: CategoryCreateBody, request: Request, authorization: Optional[str] = Header(default=None)):
    _require_app_access(request, authorization, body.user_id)
    try:
        cid = Category().add(category_name=body.category_name, user_id=body.user_id)
        return {"ok": True, "category_id": int(cid)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/daily_balances")
def list_daily_balances(request: Request, user_id: int, authorization: Optional[str] = Header(default=None)):
    _require_app_access(request, authorization, user_id)
    df = DailyBalance().by_user(user_id)
    if df is None or df.empty:
        return []
    return df.fillna("").to_dict(orient="records")



