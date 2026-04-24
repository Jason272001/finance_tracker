from __future__ import annotations

from typing import Dict


ALLOWED_PLAN_CODES = {"basic", "regular", "business", "premium_plus", "diamond", "lifetime"}


LIFETIME_FEATURE_FLAGS = {
    "manual_tracking": True,
    "auto_sync": True,
    "analytics": True,
    "business_tools": True,
    "business_profile": True,
    "business_page": True,
    "business_website": True,
    "employee_management": True,
    "sales_tools": True,
    "purchase_tools": True,
    "customer_records": True,
    "supplier_records": True,
    "product_catalog": True,
    "ai_insights": True,
    "ai_business_tools": True,
    "image_optimization": True,
    "advanced_reports": True,
    "advanced_employee_roles": True,
    "full_website_bundle": True,
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
    is_diamond = key == "diamond"
    has_business_website = is_business_plus or bool(with_website) or is_diamond

    return {
        "manual_tracking": True,
        "auto_sync": is_regular_plus,
        "analytics": is_regular_plus,
        "business_tools": is_business_plus,
        "business_profile": is_business_plus,
        "business_page": is_business_plus,
        "business_website": has_business_website,
        "employee_management": is_business_plus,
        "sales_tools": is_business_plus,
        "purchase_tools": is_business_plus,
        "customer_records": is_business_plus,
        "supplier_records": is_business_plus,
        "product_catalog": is_business_plus,
        "ai_insights": is_premium_plus,
        "ai_business_tools": is_premium_plus,
        "image_optimization": is_premium_plus,
        "advanced_reports": is_premium_plus,
        "advanced_employee_roles": is_diamond,
        "full_website_bundle": bool(with_website) or is_diamond,
        "website_bundle": has_business_website,
        "bank_sync": is_regular_plus,
    }
