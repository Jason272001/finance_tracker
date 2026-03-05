import json
import os
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, inspect


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
BACKUP_DIR = ROOT / "backups"

PGHOST = os.getenv("PGHOST", "127.0.0.1")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE", "keeperbma")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "postgres")


def get_engine():
    url = f"postgresql+psycopg2://{PGUSER}:{PGPASSWORD}@{PGHOST}:{PGPORT}/{PGDATABASE}"
    return create_engine(url, pool_pre_ping=True)


def backup_csv_files(target):
    src_files = [
        "users.csv",
        "transactions.csv",
        "accounts.csv",
        "daily_balances.csv",
        "category.csv",
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


def backup_postgres_tables(target):
    engine = get_engine()
    insp = inspect(engine)
    tables = [t for t in ["users", "transactions", "accounts", "daily_balances", "categories"] if insp.has_table(t)]
    out = []
    target_db = target / "postgres"
    target_db.mkdir(parents=True, exist_ok=True)
    for t in tables:
        df = pd.read_sql_table(t, con=engine)
        dst = target_db / f"{t}.csv"
        df.to_csv(dst, index=False)
        out.append(str(dst))
    return out


def main():
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / ts
    target.mkdir(parents=True, exist_ok=True)

    csv_files = backup_csv_files(target)
    db_files = []
    db_error = None
    try:
        db_files = backup_postgres_tables(target)
    except Exception as e:
        db_error = str(e)

    manifest = {
        "timestamp": ts,
        "csv_backups": csv_files,
        "postgres_backups": db_files,
        "postgres_error": db_error,
    }
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[done] backup created: {target}")
    if db_error:
        print(f"[warn] postgres backup skipped: {db_error}")


if __name__ == "__main__":
    main()
