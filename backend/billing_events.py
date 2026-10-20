"""Idempotent subscription reconciliation for authenticated Stripe events."""
from datetime import datetime, timezone
import time

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, select

import core
from sql_storage import CONNECTION

EVENT_TYPES = {
    "checkout.session.completed", "checkout.session.async_payment_succeeded",
    "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
    "invoice.payment_failed", "invoice.paid", "invoice.payment_succeeded",
}


def _id(value):
    return str(value.get("id", "") if isinstance(value, dict) else value or "").strip()


def _ledger(connection):
    table = Table("stripe_processed_events", MetaData(),
                  Column("event_id", String(255), primary_key=True),
                  Column("event_type", String(100), nullable=False),
                  Column("event_created", Integer, nullable=False),
                  Column("user_id", Integer), Column("processed_at", Text, nullable=False))
    table.create(connection, checkfirst=True)
    return table


def process_event(event, fetch_subscription, fetch_checkout, price_metadata, status_mapper, iso_timestamp):
    event_type = event["type"]
    if event_type not in EVENT_TYPES:
        return {"ok": True, "ignored": True}
    if not core.DB_IS_SQL:
        # Never claim a durable acknowledgment when only ephemeral CSV storage is configured.
        raise RuntimeError("Stripe webhooks require the SQL backend")
    with core.atomic_operation():
        connection = CONNECTION.get()
        ledger = _ledger(connection)
        if connection.execute(select(ledger.c.event_id).where(ledger.c.event_id == event["id"])).first():
            return {"ok": True, "duplicate": True}
        data = event["data"]["object"]
        checkout = event_type.startswith("checkout.")
        customer_id = _id(data.get("customer"))
        subscription_id = _id(data.get("id")) if event_type.startswith("customer.subscription.") else _id(data.get("subscription"))
        if event_type.startswith("invoice.") and not subscription_id:
            details = (data.get("parent") or {}).get("subscription_details") or {}
            subscription_id = _id(details.get("subscription"))
        users = core.User()
        profile = None
        if checkout:
            session = fetch_checkout(_id(data))
            customer_id = _id(session.get("customer"))
            subscription_id = _id(session.get("subscription"))
            if session.get("status") != "complete" or session.get("mode") != "subscription":
                raise ValueError("Completed subscription checkout is required")
            metadata = session.get("metadata") or {}
            uid = metadata.get("user_id") or session.get("client_reference_id")
            if uid:
                profile = users.get_user_by_id(int(uid))
        if profile is None and customer_id:
            profile = users.get_user_by_billing_customer_id(customer_id)

        ignored = True
        if profile and subscription_id:
            current_id = str(profile.get("billing_subscription_id") or "").strip()
            current_customer = str(profile.get("billing_customer_id") or "").strip()
            if current_customer and current_customer != customer_id:
                raise ValueError("Checkout customer does not match the account")
            # Events for an old subscription must not revoke a newer subscription.
            obsolete = bool(not checkout and current_id and current_id != subscription_id)
            if not obsolete:
                # Retrieve canonical state, including on deleted/failed-payment events.
                # API failures roll back the ledger and produce a retryable response.
                subscription = fetch_subscription(subscription_id)
                if _id(subscription.get("customer")) != customer_id or _id(subscription) != subscription_id:
                    raise ValueError("Subscription identity mismatch")
                if checkout and current_id and current_id != subscription_id:
                    previous = fetch_subscription(current_id)
                    previous_created = int(previous.get("created") or 0)
                    candidate_created = int(subscription.get("created") or 0)
                    obsolete = previous_created > candidate_created
                    if previous_created == candidate_created:
                        obsolete = (session.get("metadata") or {}).get("replaces_subscription_id") != current_id
                    if previous.get("status") in {"active", "trialing"} and subscription.get("status") not in {"active", "trialing"}:
                        obsolete = True
                if not obsolete:
                    items = (subscription.get("items") or {}).get("data") or []
                    first_item = items[0] if items else {}
                    price = first_item.get("price") or {}
                    price_id = _id(price)
                    plan = price_metadata(price_id)
                    if not plan:
                        raise ValueError("Subscription price is not configured; refusing to grant a plan")
                    status = status_mapper(str(subscription.get("status") or ""))
                    period_end = subscription.get("current_period_end") or first_item.get("current_period_end")
                    ending = subscription.get("ended_at") or subscription.get("canceled_at") or subscription.get("cancel_at")
                    users.update_billing_subscription(
                        user_id=int(profile["user_id"]), plan_code=plan["plan_code"], subscription_status=status,
                        trial_ends_at=iso_timestamp(subscription.get("trial_end")) if status == "trial" else "",
                        subscription_started_at=iso_timestamp(subscription.get("start_date") or subscription.get("created")),
                        subscription_ends_at=iso_timestamp(ending or int(time.time())) if status == "canceled" else "",
                        billing_provider="stripe", billing_customer_id=customer_id,
                        billing_subscription_id=subscription_id, billing_price_id=price_id,
                        billing_cycle=plan["billing_cycle"], plan_with_website=plan["with_website"],
                        next_charge_at=iso_timestamp(subscription.get("trial_end") if status == "trial" else period_end) if status != "canceled" else "",
                        payment_status="active", trial_status="active" if status in {"active", "trial"} else "inactive",
                    )
                    ignored = False
        connection.execute(ledger.insert().values(
            event_id=event["id"], event_type=event_type, event_created=event["created"],
            user_id=int(profile["user_id"]) if profile else None,
            processed_at=datetime.now(timezone.utc).isoformat(),
        ))
        return {"ok": True, "ignored": ignored}
