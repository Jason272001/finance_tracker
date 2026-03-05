import os
import sys
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2 import sql
from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

PGHOST = os.getenv("PGHOST", "127.0.0.1")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE", "keeperbma")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "")


def _admin_conn():
    return psycopg2.connect(
        host=PGHOST,
        port=PGPORT,
        dbname="postgres",
        user=PGUSER,
        password=PGPASSWORD,
    )


def ensure_database():
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
    url = f"postgresql+psycopg2://{PGUSER}:{PGPASSWORD}@{PGHOST}:{PGPORT}/{PGDATABASE}"
    return create_engine(url, pool_pre_ping=True)


def create_tables(engine):
    ddl = """
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL
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
    """
    with engine.begin() as conn:
        for stmt in ddl.split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
    print("[ok] tables ensured")


def _read_csv(path, cols):
    if not path.exists():
        return pd.DataFrame(columns=cols)
    df = pd.read_csv(path)
    for c in cols:
        if c not in df.columns:
            df[c] = ""
    return df[cols]


def migrate_table(engine, table_name, csv_name, cols):
    df = _read_csv(DATA_DIR / csv_name, cols)
    with engine.begin() as conn:
        conn.execute(text(f'TRUNCATE TABLE "{table_name}"'))
    if not df.empty:
        if table_name == "categories":
            df["is_auto"] = df["is_auto"].astype(str).str.lower().isin(["1", "true", "yes"])
            df["linked_account_id"] = pd.to_numeric(df["linked_account_id"], errors="coerce")
        if "amount" in df.columns:
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        if "balance" in df.columns:
            df["balance"] = pd.to_numeric(df["balance"], errors="coerce")
        for id_col in ["user_id", "txn_id", "account_id", "dailyB_id", "category_id"]:
            if id_col in df.columns:
                df[id_col] = pd.to_numeric(df[id_col], errors="coerce")
        df.to_sql(table_name, con=engine, if_exists="append", index=False, method="multi")
    print(f"[ok] migrated {table_name}: {len(df)} rows")


def main():
    try:
        ensure_database()
        engine = get_engine()
        create_tables(engine)

        migrate_table(
            engine,
            table_name="users",
            csv_name="users.csv",
            cols=["user_id", "name", "password"],
        )
        migrate_table(
            engine,
            table_name="transactions",
            csv_name="transactions.csv",
            cols=["txn_id", "date", "type", "amount", "account_id", "category", "note", "user_id"],
        )
        migrate_table(
            engine,
            table_name="accounts",
            csv_name="accounts.csv",
            cols=["account_id", "account_name", "account_type", "group", "user_id", "balance"],
        )
        migrate_table(
            engine,
            table_name="daily_balances",
            csv_name="daily_balances.csv",
            cols=["dailyB_id", "date", "account_id", "balance", "type", "user_id"],
        )
        migrate_table(
            engine,
            table_name="categories",
            csv_name="category.csv",
            cols=["category_id", "category_name", "user_id", "is_auto", "linked_account_id"],
        )
        print("[done] CSV to PostgreSQL migration complete.")
    except Exception as e:
        print(f"[error] migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
