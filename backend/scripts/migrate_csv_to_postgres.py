import argparse
import os
import sys
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2 import sql
from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
PGHOST = os.getenv("PGHOST", "127.0.0.1")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE", "keeperbma")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "")

TABLE_MIGRATIONS = [
    (
        "users",
        "users.csv",
        [
            "user_id",
            "name",
            "email",
            "phone",
            "password",
            "is_lifetime",
            "payment_status",
            "trial_status",
            "email_notifications_enabled",
            "profile_image_url",
            "coupon_code",
            "created_at",
            "plan_code",
            "subscription_status",
            "trial_ends_at",
            "subscription_started_at",
            "subscription_ends_at",
            "billing_provider",
            "billing_customer_id",
            "billing_subscription_id",
            "billing_price_id",
            "billing_cycle",
            "plan_with_website",
            "next_charge_at",
        ],
    ),
    (
        "transactions",
        "transactions.csv",
        ["txn_id", "date", "type", "amount", "account_id", "category", "note", "user_id"],
    ),
    (
        "accounts",
        "accounts.csv",
        ["account_id", "account_name", "account_type", "group", "user_id", "balance"],
    ),
    (
        "daily_balances",
        "daily_balances.csv",
        ["dailyB_id", "date", "account_id", "balance", "type", "user_id"],
    ),
    (
        "categories",
        "category.csv",
        ["category_id", "category_name", "user_id", "is_auto", "linked_account_id"],
    ),
    (
        "admin_1957",
        "admin_1957.csv",
        ["id", "name", "email", "phone", "password", "position", "created_at"],
    ),
    (
        "coupons",
        "coupons.csv",
        [
            "id",
            "code",
            "plan_code",
            "billing_cycle",
            "is_lifetime",
            "max_uses",
            "used_count",
            "is_active",
            "expires_at",
            "created_by_admin_id",
            "created_at",
        ],
    ),
    (
        "businesses",
        "businesses.csv",
        [
            "business_id",
            "owner_user_id",
            "business_name",
            "business_type",
            "industry",
            "page_slug",
            "website_slug",
            "about_text",
            "phone",
            "email",
            "address",
            "logo_url",
            "cover_url",
            "page_enabled",
            "website_enabled",
            "created_at",
            "updated_at",
        ],
    ),
    (
        "business_employees",
        "business_employees.csv",
        [
            "employee_id",
            "business_id",
            "linked_user_id",
            "employee_name",
            "email",
            "phone",
            "role_code",
            "status",
            "can_sales",
            "can_purchase",
            "can_inventory",
            "can_reports",
            "can_customers",
            "can_suppliers",
            "can_settings",
            "created_at",
            "updated_at",
        ],
    ),
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Migrate local CSV data into PostgreSQL. Safe by default: existing rows are not overwritten unless --replace is used."
    )
    parser.add_argument(
        "--source-dir",
        default=str(DATA_DIR),
        help="Directory containing source CSV files. Defaults to the local data/ directory.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Truncate each destination table before importing from CSV.",
    )
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help="Allow --replace to clear a table even when the source CSV is missing or empty.",
    )
    return parser.parse_args()


def _admin_conn():
    if DATABASE_URL:
        raise RuntimeError("Database already selected via DATABASE_URL; skip admin database creation.")
    return psycopg2.connect(
        host=PGHOST,
        port=PGPORT,
        dbname="postgres",
        user=PGUSER,
        password=PGPASSWORD,
    )


def ensure_database():
    if DATABASE_URL:
        print("[ok] skipping database creation because DATABASE_URL is set")
        return
    conn = _admin_conn()
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (PGDATABASE,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(PGDATABASE)))
                print(f"[ok] created database: {PGDATABASE}")
            else:
                print(f"[ok] database exists: {PGDATABASE}")
    finally:
        conn.close()


def get_engine():
    if DATABASE_URL:
        url = DATABASE_URL
    else:
        url = f"postgresql+psycopg2://{PGUSER}:{PGPASSWORD}@{PGHOST}:{PGPORT}/{PGDATABASE}"
    return create_engine(url, pool_pre_ping=True)


def create_tables(engine):
    ddl = """
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        password TEXT NOT NULL,
        is_lifetime BOOLEAN,
        payment_status TEXT,
        trial_status TEXT,
        email_notifications_enabled BOOLEAN,
        profile_image_url TEXT,
        coupon_code TEXT,
        created_at TEXT,
        plan_code TEXT,
        subscription_status TEXT,
        trial_ends_at TEXT,
        subscription_started_at TEXT,
        subscription_ends_at TEXT,
        billing_provider TEXT,
        billing_customer_id TEXT,
        billing_subscription_id TEXT,
        billing_price_id TEXT,
        billing_cycle TEXT,
        plan_with_website BOOLEAN,
        next_charge_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
        txn_id INTEGER PRIMARY KEY,
        date TEXT,
        type TEXT,
        amount DOUBLE PRECISION,
        account_id INTEGER,
        category TEXT,
        note TEXT,
        user_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS accounts (
        account_id INTEGER PRIMARY KEY,
        account_name TEXT,
        account_type TEXT,
        "group" TEXT,
        user_id INTEGER,
        balance DOUBLE PRECISION
    );

    CREATE TABLE IF NOT EXISTS daily_balances (
        "dailyB_id" INTEGER PRIMARY KEY,
        date TEXT,
        account_id INTEGER,
        balance DOUBLE PRECISION,
        type TEXT,
        user_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS categories (
        category_id INTEGER PRIMARY KEY,
        category_name TEXT,
        user_id INTEGER,
        is_auto BOOLEAN,
        linked_account_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS admin_1957 (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT,
        phone TEXT,
        password TEXT,
        position TEXT,
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY,
        code TEXT,
        plan_code TEXT,
        billing_cycle TEXT,
        is_lifetime BOOLEAN,
        max_uses INTEGER,
        used_count INTEGER,
        is_active BOOLEAN,
        expires_at TEXT,
        created_by_admin_id INTEGER,
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS businesses (
        business_id INTEGER PRIMARY KEY,
        owner_user_id INTEGER,
        business_name TEXT,
        business_type TEXT,
        industry TEXT,
        page_slug TEXT,
        website_slug TEXT,
        about_text TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        logo_url TEXT,
        cover_url TEXT,
        page_enabled BOOLEAN,
        website_enabled BOOLEAN,
        created_at TEXT,
        updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS business_employees (
        employee_id INTEGER PRIMARY KEY,
        business_id INTEGER,
        linked_user_id INTEGER,
        employee_name TEXT,
        email TEXT,
        phone TEXT,
        role_code TEXT,
        status TEXT,
        can_sales BOOLEAN,
        can_purchase BOOLEAN,
        can_inventory BOOLEAN,
        can_reports BOOLEAN,
        can_customers BOOLEAN,
        can_suppliers BOOLEAN,
        can_settings BOOLEAN,
        created_at TEXT,
        updated_at TEXT
    );
    """
    with engine.begin() as conn:
        for stmt in ddl.split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
        for stmt in [
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_status TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS coupon_code TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_code TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_started_at TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ends_at TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_provider TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_customer_id TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_subscription_id TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_price_id TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle TEXT',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_with_website BOOLEAN',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS next_charge_at TEXT',
            'ALTER TABLE admin_1957 ADD COLUMN IF NOT EXISTS email TEXT',
            'ALTER TABLE admin_1957 ADD COLUMN IF NOT EXISTS phone TEXT',
            'ALTER TABLE admin_1957 ADD COLUMN IF NOT EXISTS password TEXT',
            'ALTER TABLE admin_1957 ADD COLUMN IF NOT EXISTS position TEXT',
            'ALTER TABLE admin_1957 ADD COLUMN IF NOT EXISTS created_at TEXT',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS plan_code TEXT',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS billing_cycle TEXT',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INTEGER',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_active BOOLEAN',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TEXT',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER',
            'ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_user_id INTEGER',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_name TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_type TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS page_slug TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS website_slug TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS about_text TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cover_url TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS page_enabled BOOLEAN',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS website_enabled BOOLEAN',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS created_at TEXT',
            'ALTER TABLE businesses ADD COLUMN IF NOT EXISTS updated_at TEXT',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS business_id INTEGER',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS linked_user_id INTEGER',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS employee_name TEXT',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS email TEXT',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS phone TEXT',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS role_code TEXT',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS status TEXT',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS can_sales BOOLEAN',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS can_purchase BOOLEAN',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS can_inventory BOOLEAN',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS can_reports BOOLEAN',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS can_customers BOOLEAN',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS can_suppliers BOOLEAN',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS can_settings BOOLEAN',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS created_at TEXT',
            'ALTER TABLE business_employees ADD COLUMN IF NOT EXISTS updated_at TEXT',
        ]:
            conn.execute(text(stmt))
    print("[ok] tables ensured")


def _read_csv(path, cols):
    if not path.exists():
        return pd.DataFrame(columns=cols)
    df = pd.read_csv(path)
    for c in cols:
        if c not in df.columns:
            df[c] = ""
    return df[cols]


def _table_row_count(engine, table_name):
    with engine.begin() as conn:
        value = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar()
    return int(value or 0)


def migrate_table(engine, table_name, csv_path, cols, *, replace=False, allow_empty=False):
    source_path = Path(csv_path)
    df = _read_csv(source_path, cols)
    existing_rows = _table_row_count(engine, table_name)

    if replace:
        if df.empty and not allow_empty:
            raise RuntimeError(
                f"Refusing to replace table '{table_name}' from empty or missing source '{source_path}'. "
                "Pass --allow-empty only if you intentionally want to clear the table."
            )
        with engine.begin() as conn:
            conn.execute(text(f'TRUNCATE TABLE "{table_name}"'))
    else:
        if existing_rows > 0:
            print(
                f"[skip] {table_name}: destination already has {existing_rows} rows. "
                "Re-run with --replace to overwrite."
            )
            return
        if df.empty:
            print(f"[skip] {table_name}: source CSV missing or empty at {source_path}")
            return

    if df.empty:
        print(f"[ok] cleared {table_name}: 0 rows imported from {source_path}")
        return

    if table_name == "categories":
        df["is_auto"] = df["is_auto"].astype(str).str.lower().isin(["1", "true", "yes"])
        df["linked_account_id"] = pd.to_numeric(df["linked_account_id"], errors="coerce")
    if table_name == "users":
        for bool_col in ["is_lifetime", "email_notifications_enabled", "plan_with_website"]:
            if bool_col in df.columns:
                df[bool_col] = df[bool_col].astype(str).str.lower().isin(["1", "true", "yes"])
    if table_name == "coupons":
        for bool_col in ["is_lifetime", "is_active"]:
            if bool_col in df.columns:
                df[bool_col] = df[bool_col].astype(str).str.lower().isin(["1", "true", "yes"])
        for int_col in ["max_uses", "used_count", "created_by_admin_id"]:
            if int_col in df.columns:
                df[int_col] = pd.to_numeric(df[int_col], errors="coerce")
    if table_name == "businesses":
        for bool_col in ["page_enabled", "website_enabled"]:
            if bool_col in df.columns:
                df[bool_col] = df[bool_col].astype(str).str.lower().isin(["1", "true", "yes"])
        for int_col in ["business_id", "owner_user_id"]:
            if int_col in df.columns:
                df[int_col] = pd.to_numeric(df[int_col], errors="coerce")
    if table_name == "business_employees":
        for bool_col in [
            "can_sales",
            "can_purchase",
            "can_inventory",
            "can_reports",
            "can_customers",
            "can_suppliers",
            "can_settings",
        ]:
            if bool_col in df.columns:
                df[bool_col] = df[bool_col].astype(str).str.lower().isin(["1", "true", "yes"])
        for int_col in ["employee_id", "business_id", "linked_user_id"]:
            if int_col in df.columns:
                df[int_col] = pd.to_numeric(df[int_col], errors="coerce")
    if "amount" in df.columns:
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    if "balance" in df.columns:
        df["balance"] = pd.to_numeric(df["balance"], errors="coerce")
    for id_col in ["user_id", "txn_id", "account_id", "dailyB_id", "category_id", "id"]:
        if id_col in df.columns:
            df[id_col] = pd.to_numeric(df[id_col], errors="coerce")
    df.to_sql(table_name, con=engine, if_exists="append", index=False, method="multi")
    print(f"[ok] migrated {table_name}: {len(df)} rows from {source_path}")


def main():
    try:
        args = parse_args()
        source_dir = Path(args.source_dir).expanduser().resolve()
        if not source_dir.exists():
            raise RuntimeError(f"Source directory not found: {source_dir}")
        ensure_database()
        engine = get_engine()
        create_tables(engine)
        print(f"[info] source directory: {source_dir}")
        print(f"[info] mode: {'replace' if args.replace else 'safe-append'}")
        for table_name, csv_name, cols in TABLE_MIGRATIONS:
            migrate_table(
                engine,
                table_name=table_name,
                csv_path=source_dir / csv_name,
                cols=cols,
                replace=bool(args.replace),
                allow_empty=bool(args.allow_empty),
            )
        print("[done] CSV to PostgreSQL migration complete.")
    except Exception as e:
        print(f"[error] migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
