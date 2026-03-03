import os
import hmac
import hashlib
import pandas as pd
from datetime import datetime
# ---------------------------
# Paths
# ---------------------------

DATA_DIR = "data"
USERS_CSV = os.path.join(DATA_DIR, "users.csv")
T_PATH=os.path.join(DATA_DIR,"transactions.csv")
A_PATH=os.path.join(DATA_DIR,"accounts.csv")
D_PATH=os.path.join(DATA_DIR,"daily_balances.csv")
PW_SCHEME = "pbkdf2_sha256"
PW_ITERATIONS = 210000
# ---------------------------
# Internal loader (STRICT)
# ---------------------------

def _load_users():
    if not os.path.exists(USERS_CSV):
        raise FileNotFoundError(
            "users.csv not found. Create it manually inside data/ folder."
        )

    df = pd.read_csv(USERS_CSV)

    required_cols = {"user_id", "name", "password"}
    if not required_cols.issubset(df.columns):
        raise ValueError(
            "users.csv must contain columns: user_id, name, password"
        )

    return df


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

    def __init__(self):
        self.uid = None
        self.name = None

    def login(self, name, pw):
        u = _load_users()
        name_s = str(name)
        candidates = u[u["name"].astype(str) == name_s]

        if candidates.empty:
            return False

        for idx, row in candidates.iterrows():
            ok, needs_upgrade = _verify_password(row["password"], pw)
            if not ok:
                continue

            self.uid = int(row["user_id"])
            self.name = str(row["name"])

            if needs_upgrade:
                # Opportunistically migrate plaintext passwords on successful login.
                u.at[idx, "password"] = _hash_password(pw)
                u.to_csv(USERS_CSV, index=False)

            return True

        return False

    def logout(self):
        self.uid = None
        self.name = None

    def is_logged_in(self):
        return self.uid is not None
    

class Transaction:
    cols = ["txn_id", "date", "type", "amount", "account_id", "category", "note", "user_id"]

    def __init__(self, path=T_PATH):
        self.path = path
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if not os.path.exists(self.path):
            pd.DataFrame(columns=self.cols).to_csv(self.path, index=False)

    def _load(self):
        df = pd.read_csv(self.path)
        # Keep schema stable.
        if "data" in df.columns and "date" not in df.columns:
            df = df.rename(columns={"data": "date"})

        for c in self.cols:
            if c not in df.columns:
                df[c] = ""
        return df[self.cols]

    def _save(self, df):
        df.to_csv(self.path, index=False)

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

        df = self._load()
        next_id = self._next_id(df)
        d = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

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
        return next_id

    def update(self, txn_id, user_id=None, **changes):
        if user_id is None:
            return False
        df = self._load()
        txn = pd.to_numeric(df["txn_id"], errors="coerce")
        uid = pd.to_numeric(df["user_id"], errors="coerce")
        idx = df.index[(txn == int(txn_id)) & (uid == int(user_id))]
        if len(idx) == 0:
            return False

        i = idx[0]
        allowed = {"type", "amount", "account_id", "category", "note"}
        for k, v in changes.items():
            if k not in allowed:
                continue
            if k == "amount":
                v = float(v)
            if k == "account_id":
                v = int(v)
            df.at[i, k] = v

        self._save(df)
        return True

    def delete(self, txn_id, user_id=None):
        if user_id is None:
            return False
        df = self._load()
        txn = pd.to_numeric(df["txn_id"], errors="coerce")
        uid = pd.to_numeric(df["user_id"], errors="coerce")
        out = df[~((txn == int(txn_id)) & (uid == int(user_id)))].copy()
        if len(out) == len(df):
            return False
        self._save(out)
        return True


class Account:
    cols = ["account_id", "account_name", "account_type", "group", "user_id", "balance"]

    def __init__(self, path=A_PATH):
        self.path = path
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if not os.path.exists(self.path):
            pd.DataFrame(columns=self.cols).to_csv(self.path, index=False)

    def _load(self):
        df = pd.read_csv(self.path)
        for c in self.cols:
            if c not in df.columns:
                df[c] = ""
        return df[self.cols]

    def _save(self, df):
        df.to_csv(self.path, index=False)

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
        return next_id

    def delete(self, account_id, user_id=None):
        if user_id is None:
            return False
        df = self._load()
        aid = pd.to_numeric(df["account_id"], errors="coerce")
        uid = pd.to_numeric(df["user_id"], errors="coerce")
        out = df[~((aid == int(account_id)) & (uid == int(user_id)))].copy()
        if len(out) == len(df):
            return False
        self._save(out)
        return True


class DailyBalance:
    cols = ["dailyB_id", "date", "account_id", "balance", "type", "user_id"]

    def __init__(self, path=D_PATH):
        self.path = path
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if not os.path.exists(self.path):
            pd.DataFrame(columns=self.cols).to_csv(self.path, index=False)

    def _load(self):
        df = pd.read_csv(self.path)
        for c in self.cols:
            if c not in df.columns:
                df[c] = ""
        return df[self.cols]

    def _save(self, df):
        df.to_csv(self.path, index=False)

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

    def add(self, account_id, balance, type_name, user_id=None, date_value=None):
        if user_id is None:
            raise ValueError("Need to login")
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

    def delete(self, dailyb_id, user_id=None):
        if user_id is None:
            return False
        df = self._load()
        did = pd.to_numeric(df["dailyB_id"], errors="coerce")
        uid = pd.to_numeric(df["user_id"], errors="coerce")
        out = df[~((did == int(dailyb_id)) & (uid == int(user_id)))].copy()
        if len(out) == len(df):
            return False
        self._save(out)
        return True

