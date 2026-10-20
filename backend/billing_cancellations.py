"""Retryable cancellation/refund intents; external effects cannot be rolled back."""
import hashlib
import json
import time

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, select
import core
from sql_storage import CONNECTION


def _table(connection):
    table = Table("billing_cancellations", MetaData(), Column("subscription_id", String(255), primary_key=True),
                  Column("user_id", Integer, nullable=False), Column("charge_id", String(255)),
                  Column("refund_cents", Integer, nullable=False), Column("refund_policy", String(100), nullable=False),
                  Column("currency", String(20), nullable=False), Column("intent_key", String(100), nullable=False),
                  Column("response_payload", Text))
    table.create(connection, checkfirst=True)
    return table


def _get(user_id, subscription_id):
    with core.atomic_operation():
        connection = CONNECTION.get()
        table = _table(connection)
        row = connection.execute(select(table).where(table.c.subscription_id == subscription_id)).mappings().first()
        if row and row["user_id"] != user_id:
            raise ValueError("Cancellation does not belong to this account")
        return dict(row) if row else None


def cancel_subscription(user_id, subscription_id, load_subscription, latest_payment, compute_refund,
                        cancel_remote, find_refund, create_refund, iso_timestamp):
    if not core.DB_IS_SQL:
        raise RuntimeError("Cancellation requires durable SQL storage")
    intent = _get(user_id, subscription_id)
    if intent and intent["response_payload"]:
        return json.loads(intent["response_payload"])
    subscription = load_subscription(subscription_id)
    if not intent:
        if subscription.get("status") in {"canceled", "incomplete_expired"}:
            raise ValueError("Subscription is already canceled. Contact support for any unresolved refund.")
        try:
            charge_id, paid, refundable, currency = latest_payment(subscription)
            refund_cents, policy = compute_refund(subscription, paid, refundable)
            if paid > 0 and not charge_id:
                refund_cents, policy = 0, "manual_review"
        except ValueError:
            # Complex/multiple-payment invoices still must be cancellable.
            charge_id, currency, refund_cents, policy = "", str(subscription.get("currency") or "usd"), 0, "manual_review"
        intent_key = "keeperbma-cancel-" + hashlib.sha256(subscription_id.encode()).hexdigest()[:40]
        with core.atomic_operation():
            connection = CONNECTION.get()
            table = _table(connection)
            row = connection.execute(select(table).where(table.c.subscription_id == subscription_id)).mappings().first()
            if not row:
                connection.execute(table.insert().values(subscription_id=subscription_id, user_id=user_id,
                    charge_id=charge_id, refund_cents=refund_cents, refund_policy=policy,
                    currency=currency, intent_key=intent_key))
        intent = _get(user_id, subscription_id)
        if intent["response_payload"]:
            return json.loads(intent["response_payload"])
    if subscription.get("status") not in {"canceled", "incomplete_expired"}:
        try:
            subscription = cancel_remote(subscription_id)
        except Exception:
            # A concurrent retry can cancel after our first GET. Confirm state.
            subscription = load_subscription(subscription_id)
            if subscription.get("status") not in {"canceled", "incomplete_expired"}:
                raise
    if subscription.get("status") not in {"canceled", "incomplete_expired"}:
        raise RuntimeError("Subscription cancellation is not yet confirmed")
    ended_at = iso_timestamp(subscription.get("ended_at") or subscription.get("canceled_at") or int(time.time()))
    # Persist access revocation even if a subsequent refund request fails.
    with core.atomic_operation():
        profile = core.User().get_user_by_id(user_id) or {}
        if profile.get("billing_subscription_id") == subscription_id:
            core.User().update_billing_subscription(user_id, subscription_status="canceled", trial_ends_at="",
                subscription_ends_at=ended_at, billing_provider="stripe", next_charge_at="", trial_status="inactive")
    refund = {}
    if intent["refund_cents"] > 0:
        if not intent["charge_id"]:
            raise RuntimeError("Refund requires a charge identifier")
        # Check provider metadata before retrying, including after Stripe's
        # idempotency-key retention window has passed.
        refund = find_refund(intent["charge_id"], intent["intent_key"]) or create_refund(intent)
        if int(refund.get("amount") or 0) != intent["refund_cents"] or refund.get("status") not in {"succeeded", "pending"}:
            raise RuntimeError("Refund has not been confirmed; operator review may be required")
    amount = round(intent["refund_cents"] / 100, 2)
    message = "Subscription canceled."
    if amount:
        verb = "requested" if refund.get("status") == "pending" else "issued"
        message += f" Refund {verb}: {intent['currency'].upper()} {amount:.2f}."
    elif intent["refund_policy"] == "manual_review":
        message += " Contact support to review your refund. No automatic refund was issued."
    else:
        message += " No refund is due under the configured policy."
    result = {"ok": True, "message": message, "refund_amount": amount, "refund_currency": intent["currency"],
              "refund_policy": intent["refund_policy"], "refund_id": refund.get("id", ""),
              "refund_status": refund.get("status", "manual_review" if intent["refund_policy"] == "manual_review" else "not_required"), "subscription_status": "canceled"}
    with core.atomic_operation():
        connection = CONNECTION.get()
        table = _table(connection)
        connection.execute(table.update().where(table.c.subscription_id == subscription_id).values(response_payload=json.dumps(result)))
    return result
