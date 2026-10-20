"""Transactional adapter for the legacy DataFrame domain models.

All application writers take the same database lock before their first read.
This deliberately serializes writes for this small service while preserving
tables, indexes and constraints and committing multi-table operations together.
Do not run maintenance writers concurrently without taking this lock.
"""
from contextlib import contextmanager
from contextvars import ContextVar
import hashlib
import json
import math
import time

import pandas as pd
from sqlalchemy import Boolean, Column, Float, Integer, MetaData, String, Table, Text, inspect, select, text
from sqlalchemy.sql.sqltypes import Numeric

CONNECTION = ContextVar("keeperbma_sql_connection", default=None)
LOCK_ID = 7438201957
TABLE_KEYS = {
    "users": "user_id", "accounts": "account_id", "transactions": "txn_id",
    "categories": "category_id", "daily_balances": "dailyB_id", "admin_1957": "id",
    "coupons": "id", "businesses": "business_id", "business_employees": "employee_id",
    "bank_connections": "connection_id", "linked_bank_accounts": "linked_account_id",
    "imported_bank_transactions": "import_txn_id",
}
BOOLEAN_COLUMNS = {
    "is_lifetime", "email_notifications_enabled", "plan_with_website", "is_auto", "is_active",
    "page_enabled", "website_enabled", "pending", "can_sales", "can_purchase", "can_inventory",
    "can_reports", "can_customers", "can_suppliers", "can_settings",
}
FLOAT_COLUMNS = {"balance", "amount", "current_balance", "available_balance"}


@contextmanager
def transaction(engine):
    existing = CONNECTION.get()
    if existing is not None:
        yield existing
        return
    with engine.connect() as connection:
        mysql_lock = False
        try:
            with connection.begin():
                dialect = connection.dialect.name
                if dialect == "postgresql":
                    connection.execute(text("SET LOCAL lock_timeout = '10s'"))
                    connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": LOCK_ID})
                elif dialect == "sqlite":
                    connection.exec_driver_sql("BEGIN IMMEDIATE")
                elif dialect in {"mysql", "mariadb"}:
                    acquired = connection.execute(text("SELECT GET_LOCK('keeperbma_writes', 30)")).scalar()
                    if acquired != 1:
                        raise TimeoutError("Timed out acquiring database write lock")
                    mysql_lock = True
                else:
                    raise RuntimeError(f"Unsupported transactional database: {dialect}")
                token = CONNECTION.set(connection)
                try:
                    yield connection
                finally:
                    CONNECTION.reset(token)
        finally:
            # MySQL named locks are session scoped, so release only after commit/rollback.
            if mysql_lock:
                connection.execute(text("SELECT RELEASE_LOCK('keeperbma_writes')"))
                connection.commit()


def read_table(engine, table_name, columns):
    if table_name not in TABLE_KEYS:
        raise ValueError("Unknown application table")
    connection = CONNECTION.get()
    if connection is None:
        with engine.connect() as connection:
            return _read(connection, table_name, columns)
    return _read(connection, table_name, columns)


def _read(connection, table_name, columns):
    if not inspect(connection).has_table(table_name):
        return pd.DataFrame(columns=columns)
    frame = pd.read_sql_table(table_name, con=connection)
    for column in columns:
        if column not in frame:
            frame[column] = ""
    return frame[list(columns)]


def _column_type(name):
    if name in BOOLEAN_COLUMNS:
        return Boolean()
    if name in FLOAT_COLUMNS:
        return Float()
    if name.endswith("_id") or name == "id" or name in {"max_uses", "used_count"}:
        # Provider IDs are strings rather than internal integer IDs.
        if name in {"item_id", "institution_id", "provider_account_id", "provider_txn_id",
                    "billing_customer_id", "billing_subscription_id", "billing_price_id"}:
            return Text()
        return Integer()
    return Text()


def _value(value, column_type):
    if value is None or pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(column_type, Boolean):
        if value == "":
            return None
        return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}
    if isinstance(column_type, (Integer, Float, Numeric)):
        if value == "":
            return None
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("Non-finite numeric value cannot be saved")
        if isinstance(column_type, Integer):
            if not number.is_integer():
                raise ValueError("An integer database column received a fractional value")
            return int(number)
        return number
    return str(value)


def write_table(table_name, frame):
    connection = CONNECTION.get()
    if connection is None:
        raise RuntimeError("Database writes require an atomic_operation transaction before reading")
    if table_name not in TABLE_KEYS:
        raise ValueError("Unknown application table")
    key = TABLE_KEYS[table_name]
    if key not in frame or frame[key].isna().any() or frame[key].duplicated().any():
        raise ValueError(f"Missing or duplicate IDs in {table_name}; refusing to save")
    metadata = MetaData()
    if not inspect(connection).has_table(table_name):
        table = Table(table_name, metadata, *[
            Column(name, _column_type(name), primary_key=(name == key), autoincrement=False)
            for name in frame.columns
        ])
        table.create(connection)
    else:
        table = Table(table_name, metadata, autoload_with=connection)
        # Legacy deployments may lack additive columns. Never drop/rebuild a table.
        quote = connection.dialect.identifier_preparer.quote
        for name in frame.columns:
            if name not in table.c:
                column_type = _column_type(name).compile(dialect=connection.dialect)
                connection.exec_driver_sql(f"ALTER TABLE {quote(table_name)} ADD COLUMN {quote(name)} {column_type}")
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=connection)
    records = []
    for row in frame.to_dict(orient="records"):
        record = {name: _value(value, table.c[name].type) for name, value in row.items()}
        if record[key] is None:
            raise ValueError("A row ID cannot be empty")
        records.append(record)
    wanted = {row[key]: row for row in records}
    if len(wanted) != len(records):
        raise ValueError("Duplicate normalized row IDs")
    existing = {row[key]: dict(row) for row in connection.execute(select(table)).mappings()}
    for row_id in existing.keys() - wanted.keys():
        connection.execute(table.delete().where(table.c[key] == row_id))
    for row_id, row in wanted.items():
        if row_id not in existing:
            connection.execute(table.insert().values(**row))
        else:
            changes = {name: value for name, value in row.items() if name != key and existing[row_id].get(name) != value}
            if changes:
                connection.execute(table.update().where(table.c[key] == row_id).values(**changes))


def update_row(table_name, key_column, key_value, updates):
    connection = CONNECTION.get()
    if connection is None:
        raise RuntimeError("Database updates require an atomic operation")
    if TABLE_KEYS.get(table_name) != key_column:
        raise ValueError("Unknown table or key")
    table = Table(table_name, MetaData(), autoload_with=connection)
    values = {name: _value(value, table.c[name].type) for name, value in updates.items()}
    return connection.execute(table.update().where(table.c[key_column] == key_value).values(**values)).rowcount


class SqlStateStore:
    """Small expiring security state shared by API workers; no raw identifiers."""
    def __init__(self, namespace):
        self.namespace = namespace
        self.connection = CONNECTION.get()
        if self.connection is None:
            raise RuntimeError("Security state requires an atomic operation")
        self.table = Table("auth_state", MetaData(), Column("state_key", String(64), primary_key=True),
                           Column("payload", Text, nullable=False), Column("expires_at", Float, nullable=False))
        self.table.create(self.connection, checkfirst=True)

    def _key(self, key):
        return hashlib.sha256(f"{self.namespace}:{key}".encode("utf-8")).hexdigest()

    def get(self, key, default=None):
        record = self.connection.execute(select(self.table).where(self.table.c.state_key == self._key(key))).mappings().first()
        if not record or record["expires_at"] < time.time():
            return default
        return json.loads(record["payload"])

    def __setitem__(self, key, value):
        hashed = self._key(key)
        expires = float(value.get("expires_at") or (time.time() + 3600))
        values = {"payload": json.dumps(value), "expires_at": expires}
        # All callers hold the shared write lock, so this works across dialects.
        exists = self.connection.execute(select(self.table.c.state_key).where(self.table.c.state_key == hashed)).first()
        if exists:
            self.connection.execute(self.table.update().where(self.table.c.state_key == hashed).values(**values))
        else:
            self.connection.execute(self.table.insert().values(state_key=hashed, **values))
        # Bound expired rows under sustained identifier spraying.
        self.connection.execute(self.table.delete().where(self.table.c.expires_at < time.time()))

    def pop(self, key, default=None):
        value = self.get(key, default)
        self.connection.execute(self.table.delete().where(self.table.c.state_key == self._key(key)))
        return value
