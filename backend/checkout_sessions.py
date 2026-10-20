"""Durable checkout attempts with Stripe idempotency across request retries."""
import hashlib
import json
import uuid

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, select
import core
from sql_storage import CONNECTION


class CheckoutConflict(ValueError):
    pass


def _table(connection):
    table = Table("billing_checkout_attempts", MetaData(), Column("user_id", Integer, primary_key=True),
                  Column("attempt_id", String(64), nullable=False), Column("fingerprint", String(64), nullable=False),
                  Column("form_payload", Text, nullable=False), Column("session_id", String(255)),
                  Column("response_payload", Text))
    table.create(connection, checkfirst=True)
    return table


def create_checkout(user_id, form, create_session, fetch_session, allow_after_complete=False):
    if not core.DB_IS_SQL:
        raise RuntimeError("Checkout requires durable SQL storage")
    serialized = json.dumps(form, sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(serialized.encode()).hexdigest()
    # Persist the idempotency key BEFORE making any external request.
    with core.atomic_operation():
        connection = CONNECTION.get()
        table = _table(connection)
        existing = connection.execute(select(table).where(table.c.user_id == user_id)).mappings().first()
        if existing:
            if existing["session_id"]:
                current = fetch_session(existing["session_id"])
                status = str(current.get("status") or "")
                if status == "open":
                    if existing["fingerprint"] != fingerprint:
                        raise CheckoutConflict("An unfinished checkout already exists. Complete it or let it expire before choosing another plan.")
                    return json.loads(existing["response_payload"])
                if status == "complete" and not allow_after_complete:
                    raise CheckoutConflict("Checkout is already complete. Refresh your account or finish payment activation instead of purchasing again.")
                if status not in {"expired", "complete"}:
                    raise RuntimeError("Checkout state is unavailable; retry later")
                existing = None
            elif existing["fingerprint"] != fingerprint:
                raise CheckoutConflict("A checkout request is still being resolved. Retry the original plan before starting another checkout.")
        if not existing:
            values = {"attempt_id": uuid.uuid4().hex, "fingerprint": fingerprint, "form_payload": serialized,
                      "session_id": None, "response_payload": None}
            old = connection.execute(select(table.c.user_id).where(table.c.user_id == user_id)).first()
            if old:
                connection.execute(table.update().where(table.c.user_id == user_id).values(**values))
            else:
                connection.execute(table.insert().values(user_id=user_id, **values))
    with core.atomic_operation():
        connection = CONNECTION.get()
        table = _table(connection)
        attempt = connection.execute(select(table).where(table.c.user_id == user_id)).mappings().one()
        if attempt["fingerprint"] != fingerprint:
            raise CheckoutConflict("Checkout changed; refresh and try again")
        if attempt["session_id"]:
            return json.loads(attempt["response_payload"])
        response = create_session(json.loads(attempt["form_payload"]), "keeperbma-checkout-" + attempt["attempt_id"])
        if not response.get("id") or not (response.get("url") or response.get("client_secret")):
            raise RuntimeError("Stripe did not return a usable checkout session")
        connection.execute(table.update().where(table.c.user_id == user_id).values(
            session_id=response["id"], response_payload=json.dumps(response)))
        return response
