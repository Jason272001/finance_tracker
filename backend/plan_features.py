from __future__ import annotations

from typing import Dict


ALLOWED_PLAN_CODES = {"basic", "regular", "business", "premium_plus", "diamond", "lifetime"}


LIFETIME_FEATURE_FLAGS = {
    "manual_tracking": True,
    "auto_sync": True,
    "analytics": True,
    "business_tools": True,
    "ai_insights": True,
    "website_bundle": True,
    "bank_sync": True,
}


def normalize_plan_code(value: str) -> str:
    key = str(value or "").strip().lower()
    if key not in ALLOWED_PLAN_CODES:
        raise ValueError("Invalid plan_code")
    return key


def is_bank_sync_allowed(plan_code: str, is_lifetime: bool = False) -> bool:
    key = normalize_plan_code(plan_code)
    if is_lifetime or key == "lifetime":
        return True
    return key in {"regular", "business", "premium_plus", "diamond"}


def feature_flags_for_plan(plan_code: str, is_lifetime: bool = False, with_website: bool = False) -> Dict[str, bool]:
    key = normalize_plan_code(plan_code)
    if is_lifetime or key == "lifetime":
        return dict(LIFETIME_FEATURE_FLAGS)

    is_regular_plus = key in {"regular", "business", "premium_plus", "diamond"}
    is_business_plus = key in {"business", "premium_plus", "diamond"}
    is_premium_plus = key in {"premium_plus", "diamond"}

    return {
        "manual_tracking": True,
        "auto_sync": is_regular_plus,
        "analytics": is_regular_plus,
        "business_tools": is_business_plus,
        "ai_insights": is_premium_plus,
        "website_bundle": bool(with_website) or key == "diamond",
        "bank_sync": is_regular_plus,
    }
