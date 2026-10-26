import json
import argparse
import hashlib
import os
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, inspect, text
from backend.business_operations import metadata as operations_metadata


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
BACKUP_DIR = ROOT / "backups"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
PGHOST = os.getenv("PGHOST", "127.0.0.1")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE", "keeperbma")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "")

APP_TABLES = ["users", "transactions", "accounts", "daily_balances", "categories", "admin_1957", "coupons",
              "businesses", "business_employees", "bank_connections", "linked_bank_accounts", "imported_bank_transactions",
              "stripe_processed_events", "billing_checkout_attempts", "billing_cancellations"]
APP_TABLES += [table.name for table in operations_metadata.sorted_tables]


def get_engine():
    if DATABASE_URL:
        url = DATABASE_URL
    else:
        url = f"postgresql+psycopg2://{PGUSER}:{PGPASSWORD}@{PGHOST}:{PGPORT}/{PGDATABASE}"
    return create_engine(url, pool_pre_ping=True)


def backup_csv_files(target):
    src_files = [
        "users.csv",
        "transactions.csv",
        "accounts.csv",
        "daily_balances.csv",
        "category.csv",
        "admin_1957.csv",
        "coupons.csv",
        "businesses.csv",
        "business_employees.csv",
    ]
    out = []
    target_csv = target / "csv"
    target_csv.mkdir(parents=True, exist_ok=True)
    for name in src_files:
        src = DATA_DIR / name
        if src.exists():
            dst = target_csv / name
            shutil.copy2(src, dst)
            out.append(str(dst))
    return out


def backup_postgres_tables(target, engine=None):
    owns_engine = engine is None
    if owns_engine:
        engine = get_engine()
    out = []
    target_db = target / "postgres"
    target_db.mkdir(parents=True, exist_ok=True)
    try:
        with engine.connect() as connection:
            if engine.dialect.name == "postgresql":
                connection = connection.execution_options(isolation_level="REPEATABLE READ")
            with connection.begin():
                if engine.dialect.name == "postgresql":
                    connection.execute(text("SET TRANSACTION READ ONLY"))
                inspector = inspect(connection)
                for table in APP_TABLES:
                    if not inspector.has_table(table):
                        continue
                    frame = pd.read_sql_table(table, con=connection)
                    destination = target_db / f"{table}.csv"
                    frame.to_csv(destination, index=False)
                    out.append(str(destination))
    finally:
        if owns_engine:
            engine.dispose()
    return out


def main():
    parser = argparse.ArgumentParser(description="Create a confidential local backup; database failures return a nonzero exit status.")
    parser.add_argument("--csv-only", action="store_true", help="Explicitly skip the SQL database for a CSV-only development backup")
    args = parser.parse_args()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    target = BACKUP_DIR / ts
    target.mkdir(parents=True, exist_ok=True)

    csv_files = backup_csv_files(target)
    db_files = []
    db_error = None
    try:
        if not args.csv_only:
            db_files = backup_postgres_tables(target)
    except Exception as e:
        db_error = str(e)

    manifest = {
        "timestamp": ts,
        "csv_backups": csv_files,
        "postgres_backups": db_files,
        "postgres_error": db_error,
        "complete": db_error is None,
        "sha256": {Path(path).relative_to(target).as_posix(): hashlib.sha256(Path(path).read_bytes()).hexdigest()
                   for path in csv_files + db_files},
    }
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if db_error:
        print(f"[failed] Incomplete backup at {target}; SQL database could not be exported. See manifest.json.")
        return 1
    print(f"[done] backup created: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
