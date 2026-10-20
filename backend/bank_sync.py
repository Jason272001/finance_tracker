"""Apply bank snapshots and transaction changes in one local transaction.

Bank transaction history is for reporting. Account balances come from the bank
snapshot, so importing old transactions never posts them to the balance again.
"""
import json
import math
import pandas as pd

from core import Account, Category, Transaction, atomic_mutation
from backend.plaid_store import PlaidStore


def public_connection(connection):
    fields = {"connection_id", "provider", "institution_id", "institution_name", "status", "created_at", "updated_at", "last_sync_at"}
    return {name: value for name, value in connection.items() if name in fields}


def optional_id(value):
    try:
        return int(float(value)) if value is not None and value != "" else None
    except (ValueError, TypeError, OverflowError):
        return None


def _account_type(account):
    kind = str(account.get("type") or "").lower()
    subtype = str(account.get("subtype") or "").lower()
    if kind in {"credit", "loan"}:
        return "credit"
    return "saving" if subtype == "savings" else "asset"


def _usd(balances):
    currency = str(balances.get("iso_currency_code") or "").upper()
    if currency != "USD":
        raise ValueError("Bank sync currently supports USD accounts only. Other currencies cannot be combined in the USD dashboard.")


def _apply_accounts(store, connection, accounts):
    user_id = int(connection["user_id"])
    linked_rows = []
    for account in accounts:
        provider_id = str(account.get("account_id") or "").strip()
        if not provider_id:
            raise ValueError("Bank account identifier is missing")
        balances = account.get("balances") or {}
        _usd(balances)
        current = balances.get("current")
        if current is None or not math.isfinite(float(current)):
            raise ValueError("Bank balance is unavailable; please try again later")
        existing = store.get_linked_account_by_provider_id(user_id, provider_id)
        keeper_id = optional_id((existing or {}).get("keeper_account_id"))
        name = str(account.get("official_name") or account.get("name") or "Bank account").strip()
        kind = _account_type(account)
        if keeper_id and Account().get(keeper_id, user_id=user_id):
            Account().update(keeper_id, user_id=user_id, bank_snapshot=True, balance=float(current))
        else:
            # Do not merge unrelated accounts merely because their names match.
            keeper_id = Account().add(name, kind, "debt" if kind == "credit" else "bank", balance=float(current), user_id=user_id)
        linked_rows.append({
            "provider_account_id": provider_id, "account_name": name,
            "official_name": str(account.get("official_name") or ""),
            "account_type": kind, "account_subtype": str(account.get("subtype") or ""),
            "mask": str(account.get("mask") or ""), "current_balance": float(current),
            "available_balance": balances.get("available"), "currency_code": "USD", "keeper_account_id": keeper_id,
        })
    store.upsert_linked_accounts(int(connection["connection_id"]), user_id, linked_rows)
    return store.list_linked_accounts(user_id)


@atomic_mutation
def connect_bank(user_id, access_token, item_id, institution_id, institution_name, accounts):
    store = PlaidStore()
    connection = store.upsert_connection(user_id, "plaid", item_id, access_token, institution_id, institution_name, cursor=None)
    linked = _apply_accounts(store, connection, accounts)
    return {"ok": True, "connection": public_connection(connection), "accounts": linked}


@atomic_mutation
def apply_bank_sync(user_id, connection_id, expected_cursor, changes, accounts):
    store = PlaidStore()
    connection = store.get_connection(connection_id, user_id=user_id)
    if not connection:
        raise ValueError("Bank connection not found")
    if str(connection.get("cursor") or "") != str(expected_cursor or ""):
        # Another request has committed this cursor already. Never overwrite it.
        return {"imported": 0, "transactions_created": 0, "superseded": True}
    next_cursor = changes.get("next_cursor")
    if not isinstance(next_cursor, str) or not next_cursor:
        raise ValueError("Bank sync cursor is missing")
    linked_accounts = _apply_accounts(store, connection, accounts)
    linked_by_id = {str(row["provider_account_id"]): row for row in linked_accounts if int(row["connection_id"]) == connection_id}
    transactions = Transaction()
    frame = transactions._load()
    imported_count = 0
    created_count = 0
    for row in [*(changes.get("added") or []), *(changes.get("modified") or [])]:
        external_id = str(row.get("transaction_id") or "").strip()
        if not external_id:
            raise ValueError("Bank transaction identifier is missing")
        linked = linked_by_id.get(str(row.get("account_id") or ""))
        if not linked:
            raise ValueError("Transaction belongs to an unknown bank account; relink or retry")
        if str(row.get("iso_currency_code") or "USD").upper() != "USD":
            raise ValueError("Only USD transaction imports are supported")
        amount = float(row.get("amount") or 0)
        if not math.isfinite(amount):
            raise ValueError("Invalid bank transaction amount")
        category_data = row.get("personal_finance_category") or {}
        category = str(category_data.get("primary") or "Other").replace("_", " ").title()
        transfer = (str(category_data.get("primary") or "").startswith("TRANSFER_") or
                    category_data.get("detailed") == "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")
        direction = "transfer" if transfer else ("expense" if amount >= 0 else "income")
        existing = store.find_imported_transaction(user_id, external_id) or {}
        keeper_id = optional_id(existing.get("keeper_txn_id"))
        mask = (pd.to_numeric(frame["txn_id"], errors="coerce") == keeper_id) & (pd.to_numeric(frame["user_id"], errors="coerce") == user_id)
        pending = bool(row.get("pending"))
        if not pending and amount != 0:
            if not mask.any():
                keeper_id = transactions._next_id(frame)
                created_count += 1
            record = {"txn_id": keeper_id, "user_id": user_id, "account_id": int(linked["keeper_account_id"]),
                      "date": transactions._normalize_date_value(row.get("date")), "type": direction,
                      "amount": abs(amount), "category": category,
                      "note": str(row.get("merchant_name") or row.get("name") or ""), "origin": "bank"}
            if mask.any():
                for key, value in record.items():
                    frame.loc[mask, key] = value
            else:
                frame = pd.concat([frame, pd.DataFrame([record])], ignore_index=True)
        elif mask.any():
            frame = frame.loc[~mask].copy()
            keeper_id = None
        store.upsert_imported_transaction({
            "connection_id": connection_id, "linked_account_id": int(linked["linked_account_id"]),
            "user_id": user_id, "provider_txn_id": external_id,
            "authorized_date": row.get("authorized_date") or "", "posted_date": row.get("date") or "",
            "amount": amount, "direction": direction, "merchant_name": row.get("merchant_name") or "",
            "description": row.get("name") or "", "category_primary": category_data.get("primary") or "",
            "category_detailed": category_data.get("detailed") or "", "pending": pending,
            "currency_code": "USD", "keeper_txn_id": keeper_id,
            "raw_json": json.dumps(row),
        })
        imported_count += 1
    for removed in changes.get("removed") or []:
        external_id = str(removed.get("transaction_id") or "")
        existing = store.find_imported_transaction(user_id, external_id)
        if existing and int(existing["connection_id"]) == connection_id:
            keeper_id = optional_id(existing.get("keeper_txn_id"))
            mask = (pd.to_numeric(frame["txn_id"], errors="coerce") == keeper_id) & (pd.to_numeric(frame["user_id"], errors="coerce") == user_id)
            frame = frame.loc[~mask].copy()
            store.delete_imported_transaction(user_id, external_id)
    transactions._save(frame)
    # Cursor and all local records commit together; failure leaves the old cursor retryable.
    store.update_connection_cursor(connection_id, next_cursor)
    return {"imported": imported_count, "transactions_created": created_count, "superseded": False}
