import os
import hmac
import hashlib
import math
import re
import pandas as pd
import tempfile
import time
from datetime import datetime, timedelta
from contextlib import contextmanager
try:
    from sqlalchemy import create_engine, inspect
except Exception:
    create_engine = None
    inspect = None
# ---------------------------
# Paths
# ---------------------------

DATA_DIR = "data"
USERS_CSV = os.path.join(DATA_DIR, "users.csv")
T_PATH=os.path.join(DATA_DIR,"transactions.csv")
A_PATH=os.path.join(DATA_DIR,"accounts.csv")
D_PATH=os.path.join(DATA_DIR,"daily_balances.csv")
C_PATH=os.path.join(DATA_DIR,"category.csv")
DB_BACKEND = str(os.getenv("DB_BACKEND", "postgres")).strip().lower()
DATABASE_URL = str(os.getenv("DATABASE_URL", "")).strip()
MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_DB = os.getenv("MYSQL_DB", "finance_tracker")
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
PG_HOST = os.getenv("PGHOST", "127.0.0.1")
PG_PORT = int(os.getenv("PGPORT", "5432"))
PG_DB = os.getenv("PGDATABASE", "keeperbma")
PG_USER = os.getenv("PGUSER", "postgres")
PG_PASSWORD = os.getenv("PGPASSWORD", "")
DB_IS_SQL = bool(DATABASE_URL) or DB_BACKEND in {"mysql", "postgres", "postgresql"}
PW_SCHEME = "pbkdf2_sha256"
PW_ITERATIONS = 210000
SPECIAL_COUPON_CODE = "KMAK1957/1965"
DEFAULT_TRIAL_DAYS = int(os.getenv("DEFAULT_TRIAL_DAYS", "14"))
# ---------------------------
# Internal loader (STRICT)
# ---------------------------

def _load_users():
    user_cols = [
        "user_id",
        "name",
        "email",
        "phone",
        "password",
        "is_lifetime",
        "coupon_code",
        "created_at",
        "plan_code",
        "subscription_status",
        "trial_ends_at",
        "subscription_started_at",
        "subscription_ends_at",
    ]
    if DB_IS_SQL:
        df = _read_table("users", user_cols)
    else:
        if not os.path.exists(USERS_CSV):
            os.makedirs(os.path.dirname(USERS_CSV), exist_ok=True)
            pd.DataFrame(columns=user_cols).to_csv(USERS_CSV, index=False)
        df = pd.read_csv(USERS_CSV)

    for c in user_cols:
        if c not in df.columns:
            if c == "is_lifetime":
                df[c] = False
            else:
                df[c] = ""
    df["user_id"] = pd.to_numeric(df["user_id"], errors="coerce")
    df["name"] = df["name"].fillna("").astype(str)
    df["email"] = df["email"].fillna("").astype(str)
    df["phone"] = df["phone"].fillna("").astype(str)
    df["password"] = df["password"].fillna("").astype(str)
    df["coupon_code"] = df["coupon_code"].fillna("").astype(str)
    df["created_at"] = df["created_at"].fillna("").astype(str)
    df["plan_code"] = df["plan_code"].fillna("").astype(str).str.strip().str.lower()
    df["subscription_status"] = (
        df["subscription_status"].fillna("").astype(str).str.strip().str.lower()
    )
    df["trial_ends_at"] = df["trial_ends_at"].fillna("").astype(str)
    df["subscription_started_at"] = df["subscription_started_at"].fillna("").astype(str)
    df["subscription_ends_at"] = df["subscription_ends_at"].fillna("").astype(str)
    df["is_lifetime"] = (
        df["is_lifetime"]
        .fillna(False)
        .astype(str)
        .str.strip()
        .str.lower()
        .isin({"1", "true", "yes", "y"})
    )
    df.loc[df["plan_code"] == "", "plan_code"] = "basic"
    df.loc[df["subscription_status"] == "", "subscription_status"] = "active"
    lifetime_mask = df["is_lifetime"] == True
    df.loc[lifetime_mask, "plan_code"] = "lifetime"
    df.loc[lifetime_mask, "subscription_status"] = "active"
    return df[user_cols]


def _save_users(df):
    user_cols = [
        "user_id",
        "name",
        "email",
        "phone",
        "password",
        "is_lifetime",
        "coupon_code",
        "created_at",
        "plan_code",
        "subscription_status",
        "trial_ends_at",
        "subscription_started_at",
        "subscription_ends_at",
    ]
    out = df.copy()
    for c in user_cols:
        if c not in out.columns:
            if c == "is_lifetime":
                out[c] = False
            else:
                out[c] = ""
    out = out[user_cols]
    if DB_IS_SQL:
        _write_table("users", out)
    else:
        _atomic_write_csv(USERS_CSV, out)


_ENGINE = None


def _get_engine():
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE
    if not DATABASE_URL and DB_BACKEND not in {"mysql", "postgres", "postgresql"}:
        return None
    if create_engine is None:
        raise RuntimeError("Database backend requires SQLAlchemy and driver packages.")
    if DATABASE_URL:
        url = DATABASE_URL
    elif DB_BACKEND == "mysql":
        url = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}"
    else:
        # PostgreSQL
        url = f"postgresql+psycopg2://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}"
    _ENGINE = create_engine(url, pool_pre_ping=True)
    return _ENGINE


def _read_table(table_name, cols):
    engine = _get_engine()
    if engine is None:
        return pd.DataFrame(columns=cols)
    if inspect is None:
        raise RuntimeError("SQLAlchemy inspect is unavailable. Install SQLAlchemy.")
    insp = inspect(engine)
    if not insp.has_table(table_name):
        return pd.DataFrame(columns=cols)
    df = pd.read_sql_table(table_name, con=engine)
    for c in cols:
        if c not in df.columns:
            df[c] = ""
    return df[cols]


def _write_table(table_name, df):
    engine = _get_engine()
    if engine is None:
        raise RuntimeError("MySQL engine is not configured.")
    df.to_sql(table_name, con=engine, if_exists="replace", index=False)


def _atomic_write_csv(path, df):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".tmp_", suffix=".csv", dir=os.path.dirname(path))
    try:
        os.close(fd)
        df.to_csv(tmp_path, index=False)
        # Windows can transiently deny replace if destination is briefly in use.
        last_err = None
        for i in range(12):
            try:
                os.replace(tmp_path, path)
                last_err = None
                break
            except PermissionError as e:
                last_err = e
                time.sleep(0.03 * (i + 1))
        if last_err is not None:
            raise last_err
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


@contextmanager
def _file_lock(path, timeout=5.0):
    lock_path = f"{path}.lock"
    lock_dir = os.path.dirname(lock_path)
    if lock_dir:
        os.makedirs(lock_dir, exist_ok=True)
    start = time.time()
    fd = None
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            break
        except FileExistsError:
            # Cleanup stale lock files older than 60 seconds.
            try:
                age = time.time() - os.path.getmtime(lock_path)
                if age > 60:
                    os.remove(lock_path)
                    continue
            except Exception:
                pass
            if time.time() - start >= timeout:
                raise TimeoutError(f"Timed out waiting for lock: {lock_path}")
            time.sleep(0.05)
    try:
        yield
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except Exception:
                pass
        try:
            os.remove(lock_path)
        except Exception:
            pass


def _hash_password(password, salt_hex=None):
    if salt_hex is None:
        salt_hex = os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        str(password).encode("utf-8"),
        bytes.fromhex(salt_hex),
        PW_ITERATIONS,
    )
    return f"{PW_SCHEME}${PW_ITERATIONS}${salt_hex}${dk.hex()}"


def _verify_password(stored_password, provided_password):
    stored = str(stored_password)
    provided = str(provided_password)

    if stored.startswith(f"{PW_SCHEME}$"):
        parts = stored.split("$")
        if len(parts) != 4:
            return False, False
        _, iter_s, salt_hex, expected_hex = parts
        try:
            iterations = int(iter_s)
            dk = hashlib.pbkdf2_hmac(
                "sha256",
                provided.encode("utf-8"),
                bytes.fromhex(salt_hex),
                iterations,
            )
        except Exception:
            return False, False
        return hmac.compare_digest(dk.hex(), expected_hex), False

    # Backward-compatible plaintext support for existing rows.
    return hmac.compare_digest(stored, provided), True


# ---------------------------
# User Class
# ---------------------------

class User:
    _login_attempts = {}

    def __init__(self):
        self.uid = None
        self.name = None

    def _normalize_email(self, email):
        return str(email or "").strip().lower()

    def _normalize_phone(self, phone):
        return re.sub(r"\D+", "", str(phone or ""))

    def _validate_email(self, email):
        e = self._normalize_email(email)
        if not e:
            raise ValueError("Email is required.")
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e):
            raise ValueError("Email format is invalid.")
        return e

    def _validate_phone(self, phone):
        p = self._normalize_phone(phone)
        if not p:
            raise ValueError("Phone is required.")
        if len(p) < 7 or len(p) > 20:
            raise ValueError("Phone format is invalid.")
        return p

    def login(self, identifier, pw):
        ident_s = str(identifier or "")
        normalized_ident = ident_s.strip()
        key = normalized_ident.lower()
        now_ts = time.time()
        rec = self._login_attempts.get(key, {"count": 0, "until": 0.0})

        u = _load_users()
        ident_email = self._normalize_email(normalized_ident)
        ident_phone = self._normalize_phone(normalized_ident)
        ident_name = normalized_ident.lower()
        candidates = u[
            (u["email"].astype(str).str.strip().str.lower() == ident_email)
            | (u["phone"].astype(str).apply(self._normalize_phone) == ident_phone)
            | (u["name"].astype(str).str.strip().str.lower() == ident_name)
        ]

        if candidates.empty:
            rec["count"] += 1
            if rec["count"] >= 5:
                rec["until"] = now_ts + min(300, 2 ** (rec["count"] - 5))
            self._login_attempts[key] = rec
            return False

        for idx, row in candidates.iterrows():
            ok, needs_upgrade = _verify_password(row["password"], pw)
            if not ok:
                continue

            self.uid = int(row["user_id"])
            display_name = str(row.get("name", "")).strip()
            if not display_name:
                display_name = str(row.get("email", "")).strip() or f"user-{self.uid}"
            self.name = display_name
            self._login_attempts.pop(key, None)

            if needs_upgrade:
                # Opportunistically migrate plaintext passwords on successful login.
                if DB_IS_SQL:
                    u2 = _load_users()
                    hit = u2.index[
                        (pd.to_numeric(u2["user_id"], errors="coerce") == int(self.uid))
                    ]
                    if len(hit) > 0:
                        u2.at[hit[0], "password"] = _hash_password(pw)
                        _save_users(u2)
                else:
                    with _file_lock(USERS_CSV):
                        u2 = _load_users()
                        hit = u2.index[
                            (pd.to_numeric(u2["user_id"], errors="coerce") == int(self.uid))
                        ]
                        if len(hit) > 0:
                            u2.at[hit[0], "password"] = _hash_password(pw)
                            _save_users(u2)

            return True

        rec["count"] += 1
        if rec["count"] >= 5:
            rec["until"] = now_ts + min(300, 2 ** (rec["count"] - 5))
        self._login_attempts[key] = rec
        return False

    def register(self, name=None, pw=None, email=None, phone=None, coupon_code=""):
        # Backward compatible: legacy caller passes (name, pw).
        if pw is None:
            pw = ""
        pw_s = str(pw)
        if len(pw_s) < 10 or not any(ch.isalpha() for ch in pw_s) or not any(ch.isdigit() for ch in pw_s):
            raise ValueError("Password must be 10+ chars and include letters and numbers.")

        modern_mode = bool(email is not None or phone is not None)
        if modern_mode:
            email_s = self._validate_email(email)
            phone_s = self._validate_phone(phone)
            name_s = str(name or "").strip()
            if not name_s:
                raise ValueError("Name is required.")
            coupon_s = str(coupon_code or "").strip()
            is_lifetime = coupon_s == SPECIAL_COUPON_CODE
        else:
            name_s = str(name or "").strip()
            if not name_s:
                raise ValueError("Name is required.")
            email_s = ""
            phone_s = ""
            coupon_s = ""
            is_lifetime = False

        def _create_user_row(u):
            existing_name = u["name"].astype(str).str.strip().str.lower()
            if (existing_name == name_s.lower()).any():
                raise ValueError("User name already exists.")
            if modern_mode:
                existing_email = u["email"].astype(str).str.strip().str.lower()
                existing_phone = u["phone"].astype(str).apply(self._normalize_phone)
                if (existing_email == email_s).any():
                    raise ValueError("Email already exists.")
                if (existing_phone == phone_s).any():
                    raise ValueError("Phone already exists.")

            uid_col = pd.to_numeric(u["user_id"], errors="coerce").dropna()
            next_uid = 1 if uid_col.empty else int(uid_col.max()) + 1
            now_iso = datetime.utcnow().isoformat() + "Z"
            if bool(is_lifetime):
                plan_code = "lifetime"
                subscription_status = "active"
                trial_ends_at = ""
                subscription_started_at = now_iso
            else:
                plan_code = "basic"
                subscription_status = "trial"
                trial_ends_at = (datetime.utcnow() + timedelta(days=DEFAULT_TRIAL_DAYS)).isoformat() + "Z"
                subscription_started_at = ""
            new_row = {
                "user_id": int(next_uid),
                "name": name_s,
                "email": email_s,
                "phone": phone_s,
                "password": _hash_password(pw_s),
                "is_lifetime": bool(is_lifetime),
                "coupon_code": coupon_s,
                "created_at": now_iso,
                "plan_code": plan_code,
                "subscription_status": subscription_status,
                "trial_ends_at": trial_ends_at,
                "subscription_started_at": subscription_started_at,
                "subscription_ends_at": "",
            }
            return next_uid, new_row

        if DB_IS_SQL:
            u = _load_users()
            next_uid, new_row = _create_user_row(u)
            u = pd.concat([u, pd.DataFrame([new_row])], ignore_index=True)
            _save_users(u)
            return int(next_uid)
        with _file_lock(USERS_CSV):
            u = _load_users()
            next_uid, new_row = _create_user_row(u)
            u = pd.concat([u, pd.DataFrame([new_row])], ignore_index=True)
            _save_users(u)
            return int(next_uid)

    def recover_password(self, name, email, phone, new_password):
        name_s = str(name or "").strip()
        if not name_s:
            raise ValueError("Name is required.")
        email_s = self._validate_email(email)
        phone_s = self._validate_phone(phone)
        pw_s = str(new_password or "")
        if len(pw_s) < 10 or not any(ch.isalpha() for ch in pw_s) or not any(ch.isdigit() for ch in pw_s):
            raise ValueError("Password must be 10+ chars and include letters and numbers.")

        def _do_recover(df):
            name_col = df["name"].astype(str).str.strip().str.lower()
            email_col = df["email"].astype(str).str.strip().str.lower()
            phone_col = df["phone"].astype(str).apply(self._normalize_phone)
            idx = df.index[
                (name_col == name_s.lower()) &
                (email_col == email_s) &
                (phone_col == phone_s)
            ]
            if len(idx) == 0:
                raise ValueError("Recovery verification failed.")
            df.at[idx[0], "password"] = _hash_password(pw_s)
            return int(df.at[idx[0], "user_id"]), df

        if DB_IS_SQL:
            u = _load_users()
            uid, out = _do_recover(u)
            _save_users(out)
            return uid
        with _file_lock(USERS_CSV):
            u = _load_users()
            uid, out = _do_recover(u)
            _save_users(out)
            return uid

    def get_user_by_email(self, email):
        email_s = self._normalize_email(email)
        if not email_s:
            return None
        u = _load_users()
        email_col = u["email"].astype(str).str.strip().str.lower()
        hit = u[email_col == email_s]
        if hit.empty:
            return None
        row = hit.iloc[0]
        return {
            "user_id": int(row["user_id"]),
            "name": str(row.get("name", "")).strip(),
            "email": str(row.get("email", "")).strip(),
            "phone": str(row.get("phone", "")).strip(),
            "is_lifetime": bool(
                str(row.get("is_lifetime", ""))
                .strip()
                .lower() in {"1", "true", "yes", "y"}
            ),
            "plan_code": str(row.get("plan_code", "")).strip().lower() or "basic",
            "subscription_status": str(row.get("subscription_status", "")).strip().lower() or "active",
            "trial_ends_at": str(row.get("trial_ends_at", "")).strip(),
        }

    def set_subscription_plan(self, user_id, plan_code):
        allowed = {"basic", "regular", "business", "premium_plus"}
        plan_s = str(plan_code or "").strip().lower()
        if plan_s not in allowed:
            raise ValueError("Invalid subscription plan.")
        uid = int(user_id)

        def _set(df):
            uid_col = pd.to_numeric(df["user_id"], errors="coerce")
            idx = df.index[uid_col == uid]
            if len(idx) == 0:
                raise ValueError("User not found.")
            i = idx[0]
            is_lifetime = str(df.at[i, "is_lifetime"]).strip().lower() in {"1", "true", "yes", "y"}
            if is_lifetime:
                raise ValueError("Lifetime users do not need plan changes.")
            df.at[i, "plan_code"] = plan_s
            df.at[i, "subscription_status"] = "active"
            df.at[i, "trial_ends_at"] = ""
            started = str(df.at[i, "subscription_started_at"]).strip()
            if not started:
                df.at[i, "subscription_started_at"] = datetime.utcnow().isoformat() + "Z"
            return True, df

        if DB_IS_SQL:
            u = _load_users()
            ok, out = _set(u)
            _save_users(out)
            return ok
        with _file_lock(USERS_CSV):
            u = _load_users()
            ok, out = _set(u)
            _save_users(out)
            return ok

    def set_password_by_user_id(self, user_id, new_password):
        pw_s = str(new_password or "")
        if len(pw_s) < 10 or not any(ch.isalpha() for ch in pw_s) or not any(ch.isdigit() for ch in pw_s):
            raise ValueError("Password must be 10+ chars and include letters and numbers.")
        try:
            uid = int(user_id)
        except Exception:
            raise ValueError("Invalid user id.")

        def _set(df):
            uid_col = pd.to_numeric(df["user_id"], errors="coerce")
            idx = df.index[uid_col == uid]
            if len(idx) == 0:
                raise ValueError("User not found.")
            df.at[idx[0], "password"] = _hash_password(pw_s)
            return True, df

        if DB_IS_SQL:
            u = _load_users()
            ok, out = _set(u)
            _save_users(out)
            return ok
        with _file_lock(USERS_CSV):
            u = _load_users()
            ok, out = _set(u)
            _save_users(out)
            return ok

    def logout(self):
        self.uid = None
        self.name = None

    def is_logged_in(self):
        return self.uid is not None

    def get_name_by_id(self, user_id):
        profile = self.get_user_by_id(user_id)
        if not profile:
            return None
        name = str(profile.get("name", "")).strip()
        if name:
            return name
        email = str(profile.get("email", "")).strip()
        if email:
            return email
        return None

    def get_user_by_id(self, user_id):
        try:
            uid = int(user_id)
        except Exception:
            return None
        u = _load_users()
        uid_col = pd.to_numeric(u["user_id"], errors="coerce")
        hit = u[uid_col == uid]
        if hit.empty:
            return None
        row = hit.iloc[0]
        return {
            "user_id": int(row["user_id"]),
            "name": str(row.get("name", "")).strip(),
            "email": str(row.get("email", "")).strip(),
            "phone": str(row.get("phone", "")).strip(),
            "is_lifetime": bool(
                str(row.get("is_lifetime", ""))
                .strip()
                .lower() in {"1", "true", "yes", "y"}
            ),
            "coupon_code": str(row.get("coupon_code", "")).strip(),
            "created_at": str(row.get("created_at", "")).strip(),
            "plan_code": str(row.get("plan_code", "")).strip().lower() or "basic",
            "subscription_status": str(row.get("subscription_status", "")).strip().lower() or "active",
            "trial_ends_at": str(row.get("trial_ends_at", "")).strip(),
            "subscription_started_at": str(row.get("subscription_started_at", "")).strip(),
            "subscription_ends_at": str(row.get("subscription_ends_at", "")).strip(),
        }
    

class Transaction:
    cols = ["txn_id", "date", "type", "amount", "account_id", "category", "note", "user_id"]

    def __init__(self, path=T_PATH):
        self.path = path
        self.table = "transactions"
        if not DB_IS_SQL:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            if not os.path.exists(self.path):
                pd.DataFrame(columns=self.cols).to_csv(self.path, index=False)

    def _load(self):
        if DB_IS_SQL:
            df = _read_table(self.table, self.cols)
        else:
            df = pd.read_csv(self.path)
        # Keep schema stable.
        if "data" in df.columns and "date" not in df.columns:
            df = df.rename(columns={"data": "date"})

        for c in self.cols:
            if c not in df.columns:
                df[c] = ""
        return df[self.cols]

    def _save(self, df):
        if DB_IS_SQL:
            _write_table(self.table, df)
        else:
            _atomic_write_csv(self.path, df)

    def _normalize(self, df):
        df = df.copy()
        df["txn_id"] = pd.to_numeric(df["txn_id"], errors="coerce")
        df["user_id"] = pd.to_numeric(df["user_id"], errors="coerce")
        df["account_id"] = pd.to_numeric(df["account_id"], errors="coerce")
        return df

    def _next_id(self, df):
        if df.empty:
            return 1

        s = pd.to_numeric(df["txn_id"], errors="coerce").dropna()
        return 1 if s.empty else int(s.max()) + 1

    def _signed_delta(self, t_type, amount, user_id=None, account_id=None):
        t = str(t_type).strip().lower()
        a = float(amount)
        if t not in {"income", "expense"}:
            return 0.0

        if self._is_credit_account(user_id, account_id):
            # Credit account balance represents debt.
            return a if t == "expense" else -a
        return a if t == "income" else -a

    def _is_credit_account(self, user_id, account_id):
        if user_id is None or account_id is None:
            return False
        acc_row = Account().get(int(account_id), user_id=user_id)
        if not acc_row:
            return False
        acc_type = str(acc_row.get("account_type", "")).strip().lower().replace(" ", "_")
        return acc_type in {"credit", "credit_card"}

    def _is_checking_or_cash_account(self, user_id, account_id):
        if user_id is None or account_id is None:
            return False
        acc_row = Account().get(int(account_id), user_id=user_id)
        if not acc_row:
            return False
        acc_type = str(acc_row.get("account_type", "")).strip().lower().replace(" ", "_")
        return acc_type in {"checking", "cash", "asset", "saving", "bank"}

    def _find_credit_account_id_by_name(self, user_id, account_name):
        if user_id is None:
            return None
        name = str(account_name).strip().lower()
        if not name:
            return None
        acc_df = Account().by_user(user_id)
        if acc_df.empty:
            return None
        names = acc_df["account_name"].astype(str).str.strip().str.lower()
        match = acc_df[names == name].copy()
        if match.empty:
            return None
        match["account_type"] = (
            match["account_type"]
            .astype(str)
            .str.strip()
            .str.lower()
            .str.replace(" ", "_", regex=False)
        )
        hit = match[match["account_type"].isin(["credit", "credit_card"])]
        if hit.empty:
            return None
        return int(hit.iloc[0]["account_id"])

    def _build_postings(self, user_id, t_type, amount, account_id, category):
        t = str(t_type).strip().lower()
        cat = str(category).strip()
        try:
            src_account_id = int(float(account_id))
        except Exception:
            return []
        try:
            amt = float(amount)
        except Exception:
            return []
        if not math.isfinite(amt):
            return []
        if amt == 0:
            return []

        if t == "income":
            # Income always increases selected account balance.
            return [(src_account_id, amt)]

        if t != "expense":
            return []

        if self._is_credit_account(user_id, src_account_id):
            # Expense on a credit card increases card debt.
            return [(src_account_id, amt)]

        postings = [(src_account_id, -amt)]

        # Credit card payment: category text matches a credit account name.
        if self._is_checking_or_cash_account(user_id, src_account_id):
            paydown_account_id = self._find_credit_account_id_by_name(user_id, cat)
            if paydown_account_id is not None and int(paydown_account_id) != src_account_id:
                postings.append((int(paydown_account_id), -amt))
        return postings

    def _apply_account_balance_delta(self, user_id, account_id, delta):
        if user_id is None or account_id is None:
            return False
        acc = Account()
        row = acc.get(int(account_id), user_id=user_id)
        if not row:
            return False
        new_balance = float(row["balance"]) + float(delta)
        return acc.update(int(account_id), user_id=user_id, balance=new_balance)

    def _apply_postings(self, user_id, postings, reverse=False):
        factor = -1.0 if reverse else 1.0
        net = {}
        for account_id, delta in postings:
            aid = int(account_id)
            net[aid] = net.get(aid, 0.0) + (float(delta) * factor)
        for account_id, delta in net.items():
            if delta == 0:
                continue
            self._apply_account_balance_delta(user_id=user_id, account_id=account_id, delta=delta)

    def by_user(self, user_id):
        if user_id is None:
            return pd.DataFrame(columns=self.cols)
        df = self._normalize(self._load())
        out = df[df["user_id"] == int(user_id)].copy()
        out = out[out["txn_id"].notna()].copy()
        out["txn_id"] = out["txn_id"].astype(int)
        out["account_id"] = out["account_id"].fillna(0).astype(int)
        return out

    def get(self, txn_id, user_id=None):
        if user_id is None:
            return None
        df = self._normalize(self._load())
        hit = df[
            (df["txn_id"] == int(txn_id)) &
            (df["user_id"] == int(user_id))
        ]
        if hit.empty:
            return None
        r = hit.iloc[0].to_dict()
        r["txn_id"] = int(r["txn_id"])
        r["account_id"] = int(r["account_id"]) if pd.notna(r["account_id"]) else 0
        return r

    def add(self, t_type, amount, account_id, category="", note="", user_id=None):
        if user_id is None:
            raise ValueError(" Need To login")

        with _file_lock(self.path):
            df = self._load()
            next_id = self._next_id(df)
            d = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            postings = self._build_postings(
                user_id=user_id,
                t_type=t_type,
                amount=amount,
                account_id=account_id,
                category=category,
            )

            new_row = {
                "txn_id": next_id,
                "date": d,
                "type": t_type,
                "amount": float(amount),
                "account_id": int(account_id),
                "category": category,
                "note": note,
                "user_id": int(user_id),
            }
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            self._save(df)
        self._apply_postings(user_id=user_id, postings=postings, reverse=False)
        return next_id

    def update(self, txn_id, user_id=None, **changes):
        if user_id is None:
            return False
        with _file_lock(self.path):
            df = self._load()
            txn = pd.to_numeric(df["txn_id"], errors="coerce")
            uid = pd.to_numeric(df["user_id"], errors="coerce")
            idx = df.index[(txn == int(txn_id)) & (uid == int(user_id))]
            if len(idx) == 0:
                return False

            i = idx[0]
            old_type = str(df.at[i, "type"])
            old_amount = float(df.at[i, "amount"])
            old_account_id = int(df.at[i, "account_id"])
            old_category = str(df.at[i, "category"])
            old_postings = self._build_postings(
                user_id=user_id,
                t_type=old_type,
                amount=old_amount,
                account_id=old_account_id,
                category=old_category,
            )
            self._apply_postings(user_id=user_id, postings=old_postings, reverse=True)

            allowed = {"type", "amount", "account_id", "category", "note"}
            for k, v in changes.items():
                if k not in allowed:
                    continue
                if k == "amount":
                    v = float(v)
                if k == "account_id":
                    v = int(v)
                df.at[i, k] = v

            new_type = str(df.at[i, "type"])
            new_amount = float(df.at[i, "amount"])
            new_account_id = int(df.at[i, "account_id"])
            new_category = str(df.at[i, "category"])
            new_postings = self._build_postings(
                user_id=user_id,
                t_type=new_type,
                amount=new_amount,
                account_id=new_account_id,
                category=new_category,
            )

            self._save(df)
        self._apply_postings(user_id=user_id, postings=new_postings, reverse=False)
        return True

    def delete(self, txn_id, user_id=None):
        if user_id is None:
            return False
        with _file_lock(self.path):
            df = self._load()
            txn = pd.to_numeric(df["txn_id"], errors="coerce")
            uid = pd.to_numeric(df["user_id"], errors="coerce")
            hit = df[(txn == int(txn_id)) & (uid == int(user_id))]
            if hit.empty:
                return False
            r = hit.iloc[0]
            old_postings = self._build_postings(
                user_id=user_id,
                t_type=r["type"],
                amount=r["amount"],
                account_id=r["account_id"],
                category=r["category"],
            )
            out = df[~((txn == int(txn_id)) & (uid == int(user_id)))].copy()
            self._save(out)
        self._apply_postings(user_id=user_id, postings=old_postings, reverse=True)
        return True


class Account:
    cols = ["account_id", "account_name", "account_type", "group", "user_id", "balance"]

    def __init__(self, path=A_PATH):
        self.path = path
        self.table = "accounts"
        if not DB_IS_SQL:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            if not os.path.exists(self.path):
                pd.DataFrame(columns=self.cols).to_csv(self.path, index=False)

    def _load(self):
        if DB_IS_SQL:
            df = _read_table(self.table, self.cols)
        else:
            df = pd.read_csv(self.path)
        for c in self.cols:
            if c not in df.columns:
                df[c] = ""
        return df[self.cols]

    def _save(self, df):
        if DB_IS_SQL:
            _write_table(self.table, df)
        else:
            _atomic_write_csv(self.path, df)

    def _normalize(self, df):
        df = df.copy()
        df["account_id"] = pd.to_numeric(df["account_id"], errors="coerce")
        df["user_id"] = pd.to_numeric(df["user_id"], errors="coerce")
        df["balance"] = pd.to_numeric(df["balance"], errors="coerce")
        return df

    def _next_id(self, df):
        if df.empty:
            return 1
        s = pd.to_numeric(df["account_id"], errors="coerce").dropna()
        return 1 if s.empty else int(s.max()) + 1

    def _is_credit_type(self, account_type):
        v = str(account_type).strip().lower().replace(" ", "_")
        return v in {"credit", "credit_card"}

    def _is_auto_category_type(self, account_type):
        v = str(account_type).strip().lower().replace(" ", "_")
        return v in {"credit", "credit_card", "saving", "savings"}

    def _movement_delta(self, account_type, amount, direction):
        amt = float(amount)
        is_credit = self._is_credit_type(account_type)
        if direction == "out":
            # Transfer out behaves like an expense for the source account.
            return amt if is_credit else -amt
        # Transfer in behaves like an income for the destination account.
        return -amt if is_credit else amt

    def by_user(self, user_id):
        if user_id is None:
            return pd.DataFrame(columns=self.cols)
        df = self._normalize(self._load())
        out = df[df["user_id"] == int(user_id)].copy()
        out = out[out["account_id"].notna()].copy()
        out["account_id"] = out["account_id"].astype(int)
        out["balance"] = out["balance"].fillna(0.0).astype(float)
        return out

    def add(self, account_name, account_type, group_name, balance=0.0, user_id=None):
        if user_id is None:
            raise ValueError("Need to login")
        with _file_lock(self.path):
            df = self._load()
            next_id = self._next_id(df)
            new_row = {
                "account_id": next_id,
                "account_name": str(account_name),
                "account_type": str(account_type),
                "group": str(group_name),
                "user_id": int(user_id),
                "balance": float(balance),
            }
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            self._save(df)
        if self._is_auto_category_type(account_type):
            Category().upsert_auto_credit_category(
                user_id=int(user_id),
                linked_account_id=int(next_id),
                category_name=str(account_name),
            )
        return next_id

    def get(self, account_id, user_id=None):
        if user_id is None:
            return None
        df = self._normalize(self._load())
        hit = df[
            (df["account_id"] == int(account_id)) &
            (df["user_id"] == int(user_id))
        ]
        if hit.empty:
            return None
        r = hit.iloc[0].to_dict()
        r["account_id"] = int(r["account_id"])
        r["balance"] = float(r["balance"]) if pd.notna(r["balance"]) else 0.0
        return r

    def update(self, account_id, user_id=None, **changes):
        if user_id is None:
            return False
        with _file_lock(self.path):
            before = self.get(account_id, user_id=user_id)
            if not before:
                return False
            df = self._load()
            aid = pd.to_numeric(df["account_id"], errors="coerce")
            uid = pd.to_numeric(df["user_id"], errors="coerce")
            idx = df.index[(aid == int(account_id)) & (uid == int(user_id))]
            if len(idx) == 0:
                return False

            i = idx[0]
            allowed = {"account_name", "account_type", "group", "balance"}
            for k, v in changes.items():
                if k not in allowed:
                    continue
                if k == "balance":
                    v = float(v)
                df.at[i, k] = v

            self._save(df)
            after = self.get(account_id, user_id=user_id)
            if not after:
                return False
        cat = Category()
        if self._is_auto_category_type(after["account_type"]):
            cat.upsert_auto_credit_category(
                user_id=int(user_id),
                linked_account_id=int(account_id),
                category_name=str(after["account_name"]),
            )
        else:
            cat.delete_auto_credit_category(
                user_id=int(user_id),
                linked_account_id=int(account_id),
            )
        return True

    def delete(self, account_id, user_id=None):
        if user_id is None:
            return False
        with _file_lock(self.path):
            df = self._load()
            aid = pd.to_numeric(df["account_id"], errors="coerce")
            uid = pd.to_numeric(df["user_id"], errors="coerce")
            out = df[~((aid == int(account_id)) & (uid == int(user_id)))].copy()
            if len(out) == len(df):
                return False
            self._save(out)
        Category().delete_auto_credit_category(
            user_id=int(user_id),
            linked_account_id=int(account_id),
        )
        return True

    def transfer(self, from_account_id, to_account_id, amount, user_id=None):
        if user_id is None:
            return False
        if int(from_account_id) == int(to_account_id):
            return False
        amt = float(amount)
        if amt <= 0:
            return False

        with _file_lock(self.path):
            df = self._load()
            ndf = self._normalize(df)
            aid = pd.to_numeric(ndf["account_id"], errors="coerce")
            uid = pd.to_numeric(ndf["user_id"], errors="coerce")
            from_idx = ndf.index[(aid == int(from_account_id)) & (uid == int(user_id))]
            to_idx = ndf.index[(aid == int(to_account_id)) & (uid == int(user_id))]
            if len(from_idx) == 0 or len(to_idx) == 0:
                return False

            i_from = from_idx[0]
            i_to = to_idx[0]

            from_type = str(df.at[i_from, "account_type"])
            to_type = str(df.at[i_to, "account_type"])
            from_balance = float(ndf.at[i_from, "balance"]) if pd.notna(ndf.at[i_from, "balance"]) else 0.0
            to_balance = float(ndf.at[i_to, "balance"]) if pd.notna(ndf.at[i_to, "balance"]) else 0.0

            df.at[i_from, "balance"] = from_balance + self._movement_delta(from_type, amt, "out")
            df.at[i_to, "balance"] = to_balance + self._movement_delta(to_type, amt, "in")
            self._save(df)
        return True


class Category:
    cols = ["category_id", "category_name", "user_id", "is_auto", "linked_account_id"]
    default_categories = [
        "Uber", "Job", "Gift",
        "Gas", "Food", "Rent", "Electric Bill", "Phone Bill", "Internet Bill", "Fish",
        "Shopping", "Half and Half", "Insurance", "Other",
    ]

    def __init__(self, path=C_PATH):
        self.path = path
        self.table = "categories"
        if not DB_IS_SQL:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            if not os.path.exists(self.path):
                pd.DataFrame(columns=self.cols).to_csv(self.path, index=False)

    def _load(self):
        if DB_IS_SQL:
            df = _read_table(self.table, self.cols)
        else:
            df = pd.read_csv(self.path)
        for c in self.cols:
            if c not in df.columns:
                df[c] = ""
        return df[self.cols]

    def _save(self, df):
        if DB_IS_SQL:
            _write_table(self.table, df)
        else:
            _atomic_write_csv(self.path, df)

    def _normalize(self, df):
        out = df.copy()
        out["category_id"] = pd.to_numeric(out["category_id"], errors="coerce")
        out["user_id"] = pd.to_numeric(out["user_id"], errors="coerce")
        out["linked_account_id"] = pd.to_numeric(out["linked_account_id"], errors="coerce")
        out["is_auto"] = out["is_auto"].astype(str).str.lower().isin(["1", "true", "yes"])
        return out

    def _next_id(self, df):
        if df.empty:
            return 1
        s = pd.to_numeric(df["category_id"], errors="coerce").dropna()
        return 1 if s.empty else int(s.max()) + 1

    def by_user(self, user_id):
        if user_id is None:
            return pd.DataFrame(columns=self.cols)
        df = self._normalize(self._load())
        out = df[df["user_id"] == int(user_id)].copy()
        out = out[out["category_id"].notna()].copy()
        out["category_id"] = out["category_id"].astype(int)
        out["linked_account_id"] = out["linked_account_id"].fillna(0).astype(int)
        out["is_auto"] = out["is_auto"].astype(bool)
        return out

    def _name_exists(self, user_id, category_name, exclude_category_id=None):
        df = self.by_user(user_id)
        if df.empty:
            return False
        names = df["category_name"].astype(str).str.strip().str.lower()
        key = str(category_name).strip().lower()
        if exclude_category_id is not None:
            df = df[df["category_id"] != int(exclude_category_id)].copy()
            names = df["category_name"].astype(str).str.strip().str.lower()
        return (names == key).any()

    def add(self, category_name, user_id=None, is_auto=False, linked_account_id=None):
        if user_id is None:
            raise ValueError("Need to login")
        name = str(category_name).strip()
        if not name:
            raise ValueError("Category name is required.")
        with _file_lock(self.path):
            if self._name_exists(user_id, name):
                raise ValueError("Category name already exists.")
            df = self._load()
            next_id = self._next_id(df)
            new_row = {
                "category_id": int(next_id),
                "category_name": name,
                "user_id": int(user_id),
                "is_auto": bool(is_auto),
                "linked_account_id": "" if linked_account_id in (None, "") else int(linked_account_id),
            }
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            self._save(df)
            return int(next_id)

    def get(self, category_id, user_id=None):
        if user_id is None:
            return None
        df = self.by_user(user_id)
        hit = df[df["category_id"] == int(category_id)]
        if hit.empty:
            return None
        r = hit.iloc[0].to_dict()
        r["category_id"] = int(r["category_id"])
        r["user_id"] = int(r["user_id"])
        r["is_auto"] = bool(r["is_auto"])
        r["linked_account_id"] = int(r["linked_account_id"]) if pd.notna(r["linked_account_id"]) else 0
        return r

    def update(self, category_id, user_id=None, **changes):
        if user_id is None:
            return False
        with _file_lock(self.path):
            df = self._load()
            ndf = self._normalize(df)
            cid = pd.to_numeric(ndf["category_id"], errors="coerce")
            uid = pd.to_numeric(ndf["user_id"], errors="coerce")
            idx = ndf.index[(cid == int(category_id)) & (uid == int(user_id))]
            if len(idx) == 0:
                return False
            i = idx[0]
            if bool(ndf.at[i, "is_auto"]):
                return False
            if "category_name" in changes:
                name = str(changes["category_name"]).strip()
                if not name:
                    return False
                if self._name_exists(user_id, name, exclude_category_id=category_id):
                    return False
                df.at[i, "category_name"] = name
            self._save(df)
            return True

    def delete(self, category_id, user_id=None):
        if user_id is None:
            return False
        with _file_lock(self.path):
            df = self._load()
            ndf = self._normalize(df)
            cid = pd.to_numeric(ndf["category_id"], errors="coerce")
            uid = pd.to_numeric(ndf["user_id"], errors="coerce")
            idx = ndf.index[(cid == int(category_id)) & (uid == int(user_id))]
            if len(idx) == 0:
                return False
            i = idx[0]
            if bool(ndf.at[i, "is_auto"]):
                return False
            out = df.drop(index=i).copy()
            self._save(out)
            return True

    def upsert_auto_credit_category(self, user_id, linked_account_id, category_name):
        with _file_lock(self.path):
            df = self._load()
            ndf = self._normalize(df)
            uid = pd.to_numeric(ndf["user_id"], errors="coerce")
            aid = pd.to_numeric(ndf["linked_account_id"], errors="coerce")
            auto = ndf["is_auto"] == True
            idx = ndf.index[(uid == int(user_id)) & (aid == int(linked_account_id)) & auto]
            if len(idx) > 0:
                i = idx[0]
                df.at[i, "category_name"] = str(category_name)
                df.at[i, "is_auto"] = True
                df.at[i, "linked_account_id"] = int(linked_account_id)
                df.at[i, "user_id"] = int(user_id)
                self._save(df)
                return int(df.at[i, "category_id"])

            next_id = self._next_id(df)
            new_row = {
                "category_id": int(next_id),
                "category_name": str(category_name),
                "user_id": int(user_id),
                "is_auto": True,
                "linked_account_id": int(linked_account_id),
            }
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            self._save(df)
            return int(next_id)

    def delete_auto_credit_category(self, user_id, linked_account_id):
        with _file_lock(self.path):
            df = self._load()
            ndf = self._normalize(df)
            uid = pd.to_numeric(ndf["user_id"], errors="coerce")
            aid = pd.to_numeric(ndf["linked_account_id"], errors="coerce")
            auto = ndf["is_auto"] == True
            out = df[~((uid == int(user_id)) & (aid == int(linked_account_id)) & auto)].copy()
            if len(out) == len(df):
                return False
            self._save(out)
            return True

    def sync_auto_from_accounts(self, user_id):
        if user_id is None:
            return
        acc_df = Account().by_user(user_id)
        if acc_df.empty:
            return
        for _, r in acc_df.iterrows():
            account_type = str(r["account_type"]).strip().lower().replace(" ", "_")
            account_id = int(r["account_id"])
            if account_type in {"credit", "credit_card", "saving", "savings"}:
                self.upsert_auto_credit_category(
                    user_id=int(user_id),
                    linked_account_id=account_id,
                    category_name=str(r["account_name"]),
                )
            else:
                self.delete_auto_credit_category(
                    user_id=int(user_id),
                    linked_account_id=account_id,
                )

    def ensure_default_categories(self, user_id):
        if user_id is None:
            return
        with _file_lock(self.path):
            df = self._load()
            ndf = self._normalize(df)
            u = ndf[ndf["user_id"] == int(user_id)].copy()
            existing_names = set(u["category_name"].astype(str).str.strip().str.lower().tolist())
            rows = []
            next_id = self._next_id(df)
            for name in self.default_categories:
                key = str(name).strip().lower()
                if key in existing_names:
                    continue
                rows.append({
                    "category_id": int(next_id),
                    "category_name": str(name),
                    "user_id": int(user_id),
                    "is_auto": False,
                    "linked_account_id": "",
                })
                next_id += 1

            if rows:
                df = pd.concat([df, pd.DataFrame(rows)], ignore_index=True)
                self._save(df)

    # Backward-compatibility alias for older callers.
    def seed_defaults_for_user(self, user_id):
        self.ensure_default_categories(user_id)


class DailyBalance:
    cols = ["dailyB_id", "date", "account_id", "balance", "type", "user_id"]

    def __init__(self, path=D_PATH):
        self.path = path
        self.table = "daily_balances"
        if not DB_IS_SQL:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            if not os.path.exists(self.path):
                pd.DataFrame(columns=self.cols).to_csv(self.path, index=False)

    def _load(self):
        if DB_IS_SQL:
            df = _read_table(self.table, self.cols)
        else:
            df = pd.read_csv(self.path)
        for c in self.cols:
            if c not in df.columns:
                df[c] = ""
        return df[self.cols]

    def _save(self, df):
        if DB_IS_SQL:
            _write_table(self.table, df)
        else:
            _atomic_write_csv(self.path, df)

    def _normalize(self, df):
        df = df.copy()
        df["dailyB_id"] = pd.to_numeric(df["dailyB_id"], errors="coerce")
        df["account_id"] = pd.to_numeric(df["account_id"], errors="coerce")
        df["user_id"] = pd.to_numeric(df["user_id"], errors="coerce")
        df["balance"] = pd.to_numeric(df["balance"], errors="coerce")
        return df

    def _next_id(self, df):
        if df.empty:
            return 1
        s = pd.to_numeric(df["dailyB_id"], errors="coerce").dropna()
        return 1 if s.empty else int(s.max()) + 1

    def by_user(self, user_id):
        if user_id is None:
            return pd.DataFrame(columns=self.cols)
        df = self._normalize(self._load())
        out = df[df["user_id"] == int(user_id)].copy()
        out = out[out["dailyB_id"].notna()].copy()
        out["dailyB_id"] = out["dailyB_id"].astype(int)
        out["account_id"] = out["account_id"].fillna(0).astype(int)
        out["balance"] = out["balance"].fillna(0.0).astype(float)
        return out

    def auto_snapshot_from_accounts(self, user_id, accounts_df=None, date_value=None, type_name="auto_eod"):
        if user_id is None:
            return 0
        date_s = str(date_value) if date_value else datetime.now().strftime("%Y-%m-%d")
        acc_df = accounts_df if accounts_df is not None else Account().by_user(user_id)
        if acc_df is None or acc_df.empty:
            return 0
        with _file_lock(self.path):
            db_df = self._load()
            db_norm = self._normalize(db_df)
            existing = db_norm[
                (db_norm["user_id"] == int(user_id)) &
                (db_norm["date"].astype(str) == date_s)
            ].copy()
            existing_ids = set(pd.to_numeric(existing["account_id"], errors="coerce").dropna().astype(int).tolist())

            next_id = self._next_id(db_df)
            rows = []
            for _, r in acc_df.iterrows():
                aid = int(r["account_id"])
                if aid in existing_ids:
                    continue
                bal = float(pd.to_numeric(pd.Series([r["balance"]]), errors="coerce").fillna(0.0).iloc[0])
                rows.append({
                    "dailyB_id": int(next_id),
                    "date": date_s,
                    "account_id": aid,
                    "balance": bal,
                    "type": str(type_name),
                    "user_id": int(user_id),
                })
                next_id += 1

            if rows:
                db_df = pd.concat([db_df, pd.DataFrame(rows)], ignore_index=True)
                self._save(db_df)
            return len(rows)

    def add(self, account_id, balance, type_name, user_id=None, date_value=None):
        if user_id is None:
            raise ValueError("Need to login")
        with _file_lock(self.path):
            df = self._load()
            next_id = self._next_id(df)
            date_s = str(date_value) if date_value else datetime.now().strftime("%Y-%m-%d")
            new_row = {
                "dailyB_id": next_id,
                "date": date_s,
                "account_id": int(account_id),
                "balance": float(balance),
                "type": str(type_name),
                "user_id": int(user_id),
            }
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            self._save(df)
            return next_id

    def get(self, dailyb_id, user_id=None):
        if user_id is None:
            return None
        df = self._normalize(self._load())
        hit = df[
            (df["dailyB_id"] == int(dailyb_id)) &
            (df["user_id"] == int(user_id))
        ]
        if hit.empty:
            return None
        r = hit.iloc[0].to_dict()
        r["dailyB_id"] = int(r["dailyB_id"])
        r["account_id"] = int(r["account_id"]) if pd.notna(r["account_id"]) else 0
        r["balance"] = float(r["balance"]) if pd.notna(r["balance"]) else 0.0
        return r

    def update(self, dailyb_id, user_id=None, **changes):
        if user_id is None:
            return False
        with _file_lock(self.path):
            df = self._load()
            did = pd.to_numeric(df["dailyB_id"], errors="coerce")
            uid = pd.to_numeric(df["user_id"], errors="coerce")
            idx = df.index[(did == int(dailyb_id)) & (uid == int(user_id))]
            if len(idx) == 0:
                return False

            i = idx[0]
            allowed = {"date", "account_id", "balance", "type"}
            for k, v in changes.items():
                if k not in allowed:
                    continue
                if k == "account_id":
                    v = int(v)
                if k == "balance":
                    v = float(v)
                df.at[i, k] = v

            self._save(df)
            return True

    def delete(self, dailyb_id, user_id=None):
        if user_id is None:
            return False
        with _file_lock(self.path):
            df = self._load()
            did = pd.to_numeric(df["dailyB_id"], errors="coerce")
            uid = pd.to_numeric(df["user_id"], errors="coerce")
            out = df[~((did == int(dailyb_id)) & (uid == int(user_id)))].copy()
            if len(out) == len(df):
                return False
            self._save(out)
            return True

