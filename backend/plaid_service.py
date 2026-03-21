from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional


PLAID_CLIENT_ID = str(os.getenv("PLAID_CLIENT_ID", "")).strip()
PLAID_SECRET = str(os.getenv("PLAID_SECRET", "")).strip()
PLAID_ENV = str(os.getenv("PLAID_ENV", "sandbox")).strip().lower()

PLAID_BASE_URLS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


def plaid_is_configured() -> bool:
    return bool(PLAID_CLIENT_ID and PLAID_SECRET and PLAID_ENV in PLAID_BASE_URLS)


def _plaid_base_url() -> str:
    if PLAID_ENV not in PLAID_BASE_URLS:
        raise RuntimeError("Unsupported Plaid environment.")
    return PLAID_BASE_URLS[PLAID_ENV]


def _plaid_post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not plaid_is_configured():
        raise RuntimeError("Plaid is not configured.")

    body = {
        "client_id": PLAID_CLIENT_ID,
        "secret": PLAID_SECRET,
        **payload,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{_plaid_base_url()}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(detail)
            message = payload.get("error_message") or payload.get("display_message") or detail
        except Exception:
            message = detail or str(exc)
        raise RuntimeError(message or "Plaid request failed.") from exc


def create_link_token(user_id: int, username: str, webhook_url: Optional[str] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "client_name": "KeeperBMA",
        "country_codes": ["US", "CA"],
        "language": "en",
        "products": ["transactions"],
        "user": {"client_user_id": str(user_id)},
        "transactions": {"days_requested": 730},
    }
    if username:
        payload["user"]["legal_name"] = username
    if webhook_url:
        payload["webhook"] = webhook_url
    return _plaid_post("/link/token/create", payload)


def exchange_public_token(public_token: str) -> Dict[str, Any]:
    return _plaid_post("/item/public_token/exchange", {"public_token": public_token})


def get_item(access_token: str) -> Dict[str, Any]:
    return _plaid_post("/item/get", {"access_token": access_token})


def get_institution(institution_id: str) -> Dict[str, Any]:
    return _plaid_post(
        "/institutions/get_by_id",
        {
            "institution_id": institution_id,
            "country_codes": ["US", "CA"],
        },
    )


def get_accounts(access_token: str) -> Dict[str, Any]:
    return _plaid_post("/accounts/balance/get", {"access_token": access_token})


def transactions_sync(access_token: str, cursor: Optional[str] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"access_token": access_token, "count": 100}
    if cursor:
        payload["cursor"] = cursor
    return _plaid_post("/transactions/sync", payload)
