import re
from typing import Callable, Optional


SUPPORT_EMAIL = "support@keeperbma.com"


def _normalize_text(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _tokenize(value: str) -> set[str]:
    return {token for token in _normalize_text(value).split(" ") if token}


def _plan_label(subscription: dict) -> str:
    plan_code = str(subscription.get("plan_code", "")).strip().lower()
    if bool(subscription.get("is_lifetime")) or plan_code == "lifetime":
        return "Lifetime (via website)"
    if plan_code == "premium_plus" and bool(subscription.get("plan_with_website")):
        return "Premium (Web)"
    labels = {
        "basic": "Basic",
        "regular": "Regular",
        "business": "Business",
        "premium_plus": "Premium Plus",
        "diamond": "Diamond",
    }
    return labels.get(plan_code, "Basic")


def _surface_label(surface: str) -> str:
    return "mobile app" if str(surface or "").strip().lower() == "mobile" else "web app"


def _default_suggestions() -> list[str]:
    return [
        "Why is my data not showing?",
        "How do I reset my password?",
        "How do coupons and billing work?",
    ]


def _make_context(profile: Optional[dict], subscription: Optional[dict], surface: str) -> dict:
    safe_profile = profile or {}
    safe_subscription = subscription or {}
    feature_flags = safe_subscription.get("feature_flags") or {}
    return {
        "profile": safe_profile,
        "subscription": safe_subscription,
        "surface": str(surface or "web").strip().lower() or "web",
        "surface_label": _surface_label(surface),
        "plan_label": _plan_label(safe_subscription),
        "payment_status": str(safe_subscription.get("payment_status", "")).strip().lower(),
        "access_active": bool(safe_subscription.get("access_active", False)),
        "access_reason": str(safe_subscription.get("access_reason", "")).strip(),
        "billing_cycle": str(safe_subscription.get("billing_cycle", "")).strip().lower() or "monthly",
        "bank_sync_allowed": bool(
            safe_subscription.get("is_lifetime")
            or feature_flags.get("bank_sync")
        ),
        "name": str(safe_profile.get("name", "")).strip() or "there",
    }


def _issue_signal(message: str) -> bool:
    text = _normalize_text(message)
    triggers = {
        "error",
        "bug",
        "broken",
        "crash",
        "stuck",
        "blank",
        "missing",
        "not working",
        "can t",
        "cannot",
        "failed",
        "wrong",
        "issue",
        "problem",
    }
    return any(trigger in text for trigger in triggers)


def _build_login_reply(ctx: dict) -> dict:
    return {
        "reply": (
            f"It sounds like you need sign-in or password help on the {ctx['surface_label']}. "
            "KeeperBMA signs you in with your current account session, and the safest next step is to use the built-in recovery flow instead of trying new passwords repeatedly."
        ),
        "steps": [
            "Check that you are using the correct username, email, or phone number tied to the account.",
            "Use the Recover or Forgot Password flow if you cannot remember the password.",
            "If the app keeps saying the session expired, sign out once, reopen the app, and sign in again.",
            f"If the problem continues, email {SUPPORT_EMAIL} with the username, device, and a screenshot of the exact error.",
        ],
        "suggestions": [
            "Why does my session keep expiring?",
            "How do I recover my account?",
            "Why am I seeing a login error?",
        ],
        "escalate": False,
        "escalation_message": "",
    }


def _build_billing_reply(ctx: dict) -> dict:
    access_reason = ctx["access_reason"] or "Your billing details may need attention."
    coupon_note = (
        "Valid coupons can activate supported access without asking for billing details when the coupon itself allows that flow."
    )
    return {
        "reply": (
            f"Your account is currently on {ctx['plan_label']} with a {ctx['billing_cycle']} billing cycle. "
            f"{access_reason} Billing and subscription changes are managed securely on the website."
        ),
        "steps": [
            "Open the website billing or profile area and review your current plan, payment status, and trial state.",
            "If you are using a coupon, apply the coupon first before adding payment details.",
            coupon_note,
            "If you were charged unexpectedly, gather the date, amount, and email on the account before contacting support.",
        ],
        "suggestions": [
            "Why is my plan locked?",
            "How do coupons work?",
            "Why is billing asking for payment info?",
        ],
        "escalate": not ctx["access_active"],
        "escalation_message": (
            f"If billing still looks wrong after checking the website, contact {SUPPORT_EMAIL} with the charge amount, date, and account email."
        ),
    }


def _build_bank_sync_reply(ctx: dict) -> dict:
    if ctx["bank_sync_allowed"]:
        reply = (
            "Bank sync is available on your account, and it is managed securely on the website. "
            "If transactions are not importing, the usual causes are a disconnected institution, a sync that has not been rerun yet, or a timing delay from the bank."
        )
        steps = [
            "Open the website bank sync area and confirm the institution still shows connected.",
            "Run Sync Transactions again from the website.",
            "Refresh the mobile or web dashboard after the sync completes.",
            f"If a specific institution still fails, send the institution name and screenshot to {SUPPORT_EMAIL}.",
        ]
    else:
        reply = (
            f"Bank sync is not active on your current {ctx['plan_label']} plan. "
            "Those connections are managed on the website for eligible plans."
        )
        steps = [
            "Review your current plan on the website.",
            "Upgrade on the website if you need secure bank connection and automatic import.",
            "Use manual transaction entry in the meantime so your records stay current.",
        ]
    return {
        "reply": reply,
        "steps": steps,
        "suggestions": [
            "Why are my bank transactions not importing?",
            "How do I reconnect a bank?",
            "Why is bank sync unavailable?",
        ],
        "escalate": False,
        "escalation_message": "",
    }


def _build_data_reply(ctx: dict) -> dict:
    return {
        "reply": (
            "Missing or delayed data is usually caused by filters, date ranges, the selected account, or a sync that has not been refreshed yet. "
            "We can troubleshoot this systematically."
        ),
        "steps": [
            "Refresh the screen first and make sure you are signed into the correct account.",
            "Check account, category, keyword, and date filters before assuming the data is gone.",
            "If the data came from a bank connection, sync it again on the website and then refresh the app.",
            f"If a specific transaction or account is still missing, contact {SUPPORT_EMAIL} with the account name, expected date range, and screenshots.",
        ],
        "suggestions": [
            "Why is my transaction history blank?",
            "Why are my accounts missing?",
            "How do I refresh synced data?",
        ],
        "escalate": True,
        "escalation_message": (
            f"If the data should already be there and still is not showing, email {SUPPORT_EMAIL} with the missing item, date range, and whether the issue is on mobile, web, or both."
        ),
    }


def _build_transaction_reply(ctx: dict) -> dict:
    return {
        "reply": (
            "KeeperBMA supports manual income, expense, and transfer entry with notes and date-time fields. "
            "If something around transactions or transfers feels off, the quickest fix is usually checking the selected account, amount, category, and date."
        ),
        "steps": [
            "For transactions, choose the correct type, amount, account, category, and optional note.",
            "For transfers, make sure the from and to accounts are different and that the amount is greater than zero.",
            "Use the date and time field if you need a past transaction instead of the current timestamp.",
            "Refresh the history screen after saving so filters and totals recalculate.",
        ],
        "suggestions": [
            "How do I create a transfer?",
            "Why is my transaction not saving?",
            "Can I add a note and date to a transaction?",
        ],
        "escalate": False,
        "escalation_message": "",
    }


def _build_account_reply(ctx: dict) -> dict:
    return {
        "reply": (
            "Account setup is intentionally narrow so balances stay clean across mobile and web. "
            "Right now the main account types are Asset, Credit (Debt), and Saving."
        ),
        "steps": [
            "Create the account with the closest matching type.",
            "Use Asset for checking, cash, or general positive-balance accounts.",
            "Use Credit (Debt) for liabilities or cards you owe.",
            "Use Saving for savings-focused balances you want tracked separately.",
        ],
        "suggestions": [
            "Which account type should I choose?",
            "How do I add a new account?",
            "Why does my account type matter?",
        ],
        "escalate": False,
        "escalation_message": "",
    }


def _build_report_reply(ctx: dict) -> dict:
    return {
        "reply": (
            "Summary exports and history views depend on the filters and date range you have applied. "
            "If a report looks wrong, it is often because the current filter set is narrower than expected."
        ),
        "steps": [
            "Reset or widen the active date range and filters first.",
            "Confirm you are exporting from the correct account or history view.",
            "Regenerate the PDF or summary after updating the filters.",
            f"If totals still look incorrect, send the report screenshot and expected range to {SUPPORT_EMAIL}.",
        ],
        "suggestions": [
            "Why is my PDF report missing transactions?",
            "How do I export a summary?",
            "Why are filtered totals wrong?",
        ],
        "escalate": False,
        "escalation_message": "",
    }


def _build_security_reply(ctx: dict) -> dict:
    return {
        "reply": (
            "KeeperBMA avoids sending raw passwords to the browser for website handoff and uses authenticated sessions for protected data. "
            "For sensitive account changes, the safest move is to use the built-in authenticated flows instead of sharing credentials."
        ),
        "steps": [
            "Use the in-app website buttons so the secure session handoff can sign you in safely.",
            "Change your password immediately if you believe someone else accessed your account.",
            "Use the delete-account and privacy pages on the website for policy details.",
            f"If you suspect unauthorized access, contact {SUPPORT_EMAIL} right away with the account email and the time the issue started.",
        ],
        "suggestions": [
            "How is my data protected?",
            "How do I delete my account?",
            "What should I do if I think someone accessed my account?",
        ],
        "escalate": True,
        "escalation_message": f"For suspected unauthorized access, email {SUPPORT_EMAIL} immediately so the team can help secure the account.",
    }


def _build_refund_reply(ctx: dict) -> dict:
    return {
        "reply": (
            "For charge and refund questions, the fastest resolution comes from matching the account email, charge amount, and billing date. "
            "That lets support verify the payment record safely."
        ),
        "steps": [
            "Check the website billing area first to confirm the current subscription state.",
            "Write down the exact charge amount, date, and account email.",
            f"Contact {SUPPORT_EMAIL} with those details and explain whether the charge looks unexpected, duplicate, or after cancellation.",
        ],
        "suggestions": [
            "I was charged twice",
            "How do I cancel my plan?",
            "How do refunds work?",
        ],
        "escalate": True,
        "escalation_message": f"Billing disputes and refund reviews should be sent to {SUPPORT_EMAIL} with the charge amount, date, and account email.",
    }


def _build_mobile_web_reply(ctx: dict) -> dict:
    return {
        "reply": (
            f"KeeperBMA uses the same secure backend for the mobile app and the web app. "
            "The website buttons in mobile can open the website with a secure one-time handoff so you do not need to type your credentials again."
        ),
        "steps": [
            "Use Open Web Dashboard or Manage Profile on Website from mobile settings when you want the web experience.",
            "Refresh the screen after important account or billing changes so the latest server data is pulled back in.",
            "If something differs between mobile and web, note which screen and which date range you used.",
        ],
        "suggestions": [
            "Why does web show different data than mobile?",
            "How does the website sign-in from mobile work?",
            "Where should I manage billing?",
        ],
        "escalate": False,
        "escalation_message": "",
    }


def _build_bug_reply(ctx: dict) -> dict:
    return {
        "reply": (
            "That sounds like a typical app issue rather than a normal usage question. "
            "The quickest way to narrow it down is to capture the exact screen, action, and message before retrying too many times."
        ),
        "steps": [
            "Refresh or reopen the app or page once.",
            "Take a screenshot of the exact error or wrong state.",
            "Note the account, transaction, date range, or screen involved.",
            f"If it still fails, email {SUPPORT_EMAIL} with the screenshot, device or browser, and the exact steps to reproduce it.",
        ],
        "suggestions": [
            "Why is the app crashing?",
            "Why is the page stuck loading?",
            "How do I report a bug?",
        ],
        "escalate": True,
        "escalation_message": f"If the issue keeps happening, send the screenshot and steps to {SUPPORT_EMAIL} so the team can reproduce it.",
    }


SupportBuilder = Callable[[dict], dict]


SUPPORT_TOPICS: list[dict[str, object]] = [
    {
        "id": "login",
        "title": "Login and password help",
        "keywords": ["login", "sign in", "password", "recover", "reset", "forgot", "session", "expired", "locked out"],
        "examples": [
            "I cannot sign in",
            "How do I reset my password?",
            "Why does my session keep expiring?",
        ],
        "builder": _build_login_reply,
    },
    {
        "id": "billing",
        "title": "Billing, coupons, and subscriptions",
        "keywords": ["billing", "payment", "plan", "trial", "subscription", "coupon", "charge", "checkout", "lifetime"],
        "examples": [
            "Why is billing asking for payment information?",
            "How does a coupon work?",
            "Why is my plan locked?",
        ],
        "builder": _build_billing_reply,
    },
    {
        "id": "bank_sync",
        "title": "Bank sync and imports",
        "keywords": ["bank", "plaid", "sync", "institution", "import", "connect bank", "reconnect", "transactions import"],
        "examples": [
            "Why are my bank transactions not importing?",
            "How do I reconnect my bank?",
            "Why is bank sync unavailable?",
        ],
        "builder": _build_bank_sync_reply,
    },
    {
        "id": "data",
        "title": "Missing or delayed data",
        "keywords": ["missing", "blank", "empty", "not showing", "not loading", "fetch", "data", "history", "dashboard", "accounts missing"],
        "examples": [
            "My data is not showing",
            "Why is the dashboard blank?",
            "Where did my transactions go?",
        ],
        "builder": _build_data_reply,
    },
    {
        "id": "transactions",
        "title": "Transactions and transfers",
        "keywords": ["transaction", "transfer", "income", "expense", "category", "note", "date", "time", "save transaction"],
        "examples": [
            "How do I create a transfer?",
            "Why is my transaction not saving?",
            "Can I add a note and date?",
        ],
        "builder": _build_transaction_reply,
    },
    {
        "id": "accounts",
        "title": "Accounts and setup",
        "keywords": ["account", "asset", "saving", "credit", "debt", "create account", "account type"],
        "examples": [
            "Which account type should I choose?",
            "How do I add an account?",
            "What is the difference between asset and credit?",
        ],
        "builder": _build_account_reply,
    },
    {
        "id": "reports",
        "title": "Reports, summaries, and exports",
        "keywords": ["report", "summary", "pdf", "export", "download", "filtered totals"],
        "examples": [
            "Why is my report wrong?",
            "How do I export a summary?",
            "Why is the PDF missing transactions?",
        ],
        "builder": _build_report_reply,
    },
    {
        "id": "security",
        "title": "Security, privacy, and account protection",
        "keywords": ["security", "privacy", "safe", "delete account", "unauthorized", "hacked", "protected"],
        "examples": [
            "How is my data protected?",
            "How do I delete my account?",
            "I think someone accessed my account",
        ],
        "builder": _build_security_reply,
    },
    {
        "id": "refunds",
        "title": "Refunds and unexpected charges",
        "keywords": ["refund", "charged", "charged twice", "unexpected charge", "cancel", "invoice", "billing dispute"],
        "examples": [
            "I was charged twice",
            "How do refunds work?",
            "Why was I billed after canceling?",
        ],
        "builder": _build_refund_reply,
    },
    {
        "id": "cross_platform",
        "title": "Mobile and web handoff",
        "keywords": ["mobile", "website", "web", "dashboard", "manage profile", "handoff", "open website"],
        "examples": [
            "Why is the website different from mobile?",
            "How does website sign in from mobile work?",
            "Where do I manage billing?",
        ],
        "builder": _build_mobile_web_reply,
    },
    {
        "id": "bug",
        "title": "Typical app issues",
        "keywords": ["bug", "error", "crash", "stuck", "broken", "not working", "wrong", "issue", "problem", "slow", "freeze"],
        "examples": [
            "The app crashed",
            "This page is not working",
            "How do I report a bug?",
        ],
        "builder": _build_bug_reply,
    },
]


def _score_topic(message_text: str, history_text: str, topic: dict[str, object]) -> float:
    combined = f"{message_text} {history_text}".strip()
    message_tokens = _tokenize(message_text)
    combined_tokens = _tokenize(combined)
    score = 0.0

    for keyword in topic.get("keywords", []):
        key = _normalize_text(str(keyword))
        if not key:
            continue
        if " " in key:
            if key in message_text:
                score += 4.0
            elif key in combined:
                score += 2.0
        else:
            if key in message_tokens:
                score += 2.5
            elif key in combined_tokens:
                score += 1.0

    for example in topic.get("examples", []):
        example_tokens = _tokenize(str(example))
        overlap = len(example_tokens & message_tokens)
        score += overlap * 0.35

    return score


def _unknown_reply(ctx: dict, message: str) -> dict:
    escalation = _issue_signal(message)
    return {
        "reply": (
            "I can help with common KeeperBMA questions about login, billing, coupons, missing data, bank sync, transactions, transfers, reports, and typical app issues. "
            "I’m not fully confident about this exact question yet, so the best next step is to narrow it down."
        ),
        "steps": [
            "Tell me which screen you are on and what you were trying to do.",
            "Include the exact error text if you saw one.",
            "Mention whether this happened on mobile, web, or both.",
        ],
        "suggestions": _default_suggestions(),
        "escalate": escalation,
        "escalation_message": (
            f"If the issue is blocking you right now, email {SUPPORT_EMAIL} with a screenshot and the exact steps you took."
            if escalation
            else ""
        ),
    }


def build_support_reply(
    message: str,
    history: Optional[list[dict]] = None,
    profile: Optional[dict] = None,
    subscription: Optional[dict] = None,
    surface: str = "web",
) -> dict:
    cleaned_message = _normalize_text(message)
    trimmed_history = history or []
    recent_history = [
        _normalize_text(str(item.get("content", "")))
        for item in trimmed_history[-6:]
        if str(item.get("role", "")).strip().lower() == "user"
    ]
    history_text = " ".join(part for part in recent_history if part)
    ctx = _make_context(profile=profile, subscription=subscription, surface=surface)

    if not cleaned_message:
        fallback = _unknown_reply(ctx, "")
        return {
            "topic_id": "general",
            "topic_title": "General support",
            "confidence": 0.0,
            "contact_email": SUPPORT_EMAIL,
            **fallback,
        }

    scored_topics: list[tuple[float, dict[str, object]]] = []
    for topic in SUPPORT_TOPICS:
        scored_topics.append((_score_topic(cleaned_message, history_text, topic), topic))
    scored_topics.sort(key=lambda item: item[0], reverse=True)

    best_score, best_topic = scored_topics[0]
    if best_score < 2.0:
        payload = _unknown_reply(ctx, message)
        topic_id = "general"
        topic_title = "General support"
    else:
        builder = best_topic["builder"]
        payload = builder(ctx)
        topic_id = str(best_topic["id"])
        topic_title = str(best_topic["title"])

    payload["reply"] = str(payload.get("reply", "")).strip()
    payload["steps"] = [str(step).strip() for step in payload.get("steps", []) if str(step).strip()]
    payload["suggestions"] = [str(item).strip() for item in payload.get("suggestions", []) if str(item).strip()]
    if not payload["suggestions"]:
        payload["suggestions"] = _default_suggestions()
    return {
        "topic_id": topic_id,
        "topic_title": topic_title,
        "confidence": round(float(best_score), 2),
        "contact_email": SUPPORT_EMAIL,
        **payload,
    }
