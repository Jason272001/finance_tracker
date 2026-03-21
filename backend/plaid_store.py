from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd

from core import _read_table, _write_table


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connection_cols() -> List[str]:
    return [
        "connection_id",
        "user_id",
        "provider",
        "item_id",
        "access_token",
        "institution_id",
        "institution_name",
        "status",
        "cursor",
        "created_at",
        "updated_at",
        "last_sync_at",
    ]


def _linked_account_cols() -> List[str]:
    return [
        "linked_account_id",
        "connection_id",
        "user_id",
        "provider_account_id",
        "account_name",
        "official_name",
        "account_type",
        "account_subtype",
        "mask",
        "current_balance",
        "available_balance",
        "currency_code",
        "keeper_account_id",
        "created_at",
        "updated_at",
    ]


def _imported_tx_cols() -> List[str]:
    return [
        "import_txn_id",
        "connection_id",
        "linked_account_id",
        "user_id",
        "provider_txn_id",
        "authorized_date",
        "posted_date",
        "amount",
        "direction",
        "merchant_name",
        "description",
        "category_primary",
        "category_detailed",
        "pending",
        "currency_code",
        "keeper_txn_id",
        "raw_json",
        "created_at",
        "updated_at",
    ]


class PlaidStore:
    def _load_connections(self) -> pd.DataFrame:
        return _read_table("bank_connections", _connection_cols())

    def _save_connections(self, df: pd.DataFrame) -> None:
        _write_table("bank_connections", df)

    def _load_linked_accounts(self) -> pd.DataFrame:
        return _read_table("linked_bank_accounts", _linked_account_cols())

    def _save_linked_accounts(self, df: pd.DataFrame) -> None:
        _write_table("linked_bank_accounts", df)

    def _load_imported_transactions(self) -> pd.DataFrame:
        return _read_table("imported_bank_transactions", _imported_tx_cols())

    def _save_imported_transactions(self, df: pd.DataFrame) -> None:
        _write_table("imported_bank_transactions", df)

    def upsert_connection(
        self,
        user_id: int,
        provider: str,
        item_id: str,
        access_token: str,
        institution_id: str = "",
        institution_name: str = "",
        status: str = "active",
        cursor: str = "",
    ) -> Dict[str, Any]:
        df = self._load_connections()
        now = _utc_now()
        mask = (df["user_id"].astype(int) == int(user_id)) & (df["item_id"].astype(str) == str(item_id))
        if mask.any():
            idx = df.index[mask][0]
            df.at[idx, "provider"] = provider
            df.at[idx, "access_token"] = access_token
            df.at[idx, "institution_id"] = institution_id
            df.at[idx, "institution_name"] = institution_name
            df.at[idx, "status"] = status
            if cursor is not None:
                df.at[idx, "cursor"] = cursor
            df.at[idx, "updated_at"] = now
            connection_id = int(df.at[idx, "connection_id"])
        else:
            next_id = int(df["connection_id"].max()) + 1 if not df.empty else 1
            row = {
                "connection_id": next_id,
                "user_id": int(user_id),
                "provider": provider,
                "item_id": item_id,
                "access_token": access_token,
                "institution_id": institution_id,
                "institution_name": institution_name,
                "status": status,
                "cursor": cursor or "",
                "created_at": now,
                "updated_at": now,
                "last_sync_at": "",
            }
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
            connection_id = next_id
        self._save_connections(df)
        return self.get_connection(connection_id, user_id=user_id) or {}

    def get_connection(self, connection_id: int, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        df = self._load_connections()
        mask = df["connection_id"].astype(int) == int(connection_id)
        if user_id is not None:
            mask &= df["user_id"].astype(int) == int(user_id)
        if not mask.any():
            return None
        return df.loc[mask].iloc[0].to_dict()

    def list_connections(self, user_id: int) -> List[Dict[str, Any]]:
        df = self._load_connections()
        if df.empty:
            return []
        out = df[df["user_id"].astype(int) == int(user_id)].sort_values("connection_id")
        return out.to_dict(orient="records")

    def update_connection_cursor(self, connection_id: int, cursor: str, last_sync_at: Optional[str] = None) -> None:
        df = self._load_connections()
        mask = df["connection_id"].astype(int) == int(connection_id)
        if not mask.any():
            return
        idx = df.index[mask][0]
        df.at[idx, "cursor"] = cursor or ""
        df.at[idx, "updated_at"] = _utc_now()
        df.at[idx, "last_sync_at"] = last_sync_at or _utc_now()
        self._save_connections(df)

    def upsert_linked_accounts(self, connection_id: int, user_id: int, accounts: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        df = self._load_linked_accounts()
        now = _utc_now()
        for account in accounts:
            provider_account_id = str(account.get("provider_account_id", "")).strip()
            if not provider_account_id:
                continue
            mask = (
                (df["user_id"].astype(int) == int(user_id))
                & (df["provider_account_id"].astype(str) == provider_account_id)
            )
            if mask.any():
                idx = df.index[mask][0]
                for key, value in account.items():
                    if key in df.columns and key != "linked_account_id":
                        df.at[idx, key] = value
                df.at[idx, "updated_at"] = now
            else:
                next_id = int(df["linked_account_id"].max()) + 1 if not df.empty else 1
                row = {col: "" for col in _linked_account_cols()}
                row.update(account)
                row["linked_account_id"] = next_id
                row["connection_id"] = int(connection_id)
                row["user_id"] = int(user_id)
                row["created_at"] = now
                row["updated_at"] = now
                if row.get("keeper_account_id", "") in {None, ""}:
                    row["keeper_account_id"] = ""
                df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
        self._save_linked_accounts(df)
        return self.list_linked_accounts(user_id)

    def list_linked_accounts(self, user_id: int) -> List[Dict[str, Any]]:
        df = self._load_linked_accounts()
        if df.empty:
            return []
        out = df[df["user_id"].astype(int) == int(user_id)].sort_values("linked_account_id")
        return out.to_dict(orient="records")

    def set_keeper_account_id(self, user_id: int, provider_account_id: str, keeper_account_id: int) -> None:
        df = self._load_linked_accounts()
        mask = (
            (df["user_id"].astype(int) == int(user_id))
            & (df["provider_account_id"].astype(str) == str(provider_account_id))
        )
        if not mask.any():
            return
        idx = df.index[mask][0]
        df.at[idx, "keeper_account_id"] = int(keeper_account_id)
        df.at[idx, "updated_at"] = _utc_now()
        self._save_linked_accounts(df)

    def get_linked_account_by_provider_id(self, user_id: int, provider_account_id: str) -> Optional[Dict[str, Any]]:
        df = self._load_linked_accounts()
        mask = (
            (df["user_id"].astype(int) == int(user_id))
            & (df["provider_account_id"].astype(str) == str(provider_account_id))
        )
        if not mask.any():
            return None
        return df.loc[mask].iloc[0].to_dict()

    def upsert_imported_transaction(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        df = self._load_imported_transactions()
        now = _utc_now()
        provider_txn_id = str(payload.get("provider_txn_id", "")).strip()
        user_id = int(payload.get("user_id", 0))
        if not provider_txn_id or not user_id:
            raise ValueError("provider_txn_id and user_id are required.")
        mask = (
            (df["user_id"].astype(int) == user_id)
            & (df["provider_txn_id"].astype(str) == provider_txn_id)
        )
        if mask.any():
            idx = df.index[mask][0]
            for key, value in payload.items():
                if key in df.columns and key != "import_txn_id":
                    df.at[idx, key] = value
            df.at[idx, "updated_at"] = now
            import_id = int(df.at[idx, "import_txn_id"])
        else:
            next_id = int(df["import_txn_id"].max()) + 1 if not df.empty else 1
            row = {col: "" for col in _imported_tx_cols()}
            row.update(payload)
            row["import_txn_id"] = next_id
            row["created_at"] = now
            row["updated_at"] = now
            row["raw_json"] = row.get("raw_json") or "{}"
            if row.get("keeper_txn_id", "") in {None, ""}:
                row["keeper_txn_id"] = ""
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
            import_id = next_id
        self._save_imported_transactions(df)
        return self.find_imported_transaction(user_id, provider_txn_id) or {"import_txn_id": import_id}

    def find_imported_transaction(self, user_id: int, provider_txn_id: str) -> Optional[Dict[str, Any]]:
        df = self._load_imported_transactions()
        mask = (
            (df["user_id"].astype(int) == int(user_id))
            & (df["provider_txn_id"].astype(str) == str(provider_txn_id))
        )
        if not mask.any():
            return None
        return df.loc[mask].iloc[0].to_dict()

    def list_imported_transactions(self, user_id: int) -> List[Dict[str, Any]]:
        df = self._load_imported_transactions()
        if df.empty:
            return []
        out = df[df["user_id"].astype(int) == int(user_id)].sort_values("import_txn_id")
        return out.to_dict(orient="records")

    def mark_keeper_txn(self, user_id: int, provider_txn_id: str, keeper_txn_id: int) -> None:
        df = self._load_imported_transactions()
        mask = (
            (df["user_id"].astype(int) == int(user_id))
            & (df["provider_txn_id"].astype(str) == str(provider_txn_id))
        )
        if not mask.any():
            return
        idx = df.index[mask][0]
        df.at[idx, "keeper_txn_id"] = int(keeper_txn_id)
        df.at[idx, "updated_at"] = _utc_now()
        self._save_imported_transactions(df)

    def delete_connection(self, user_id: int, connection_id: int) -> None:
        cdf = self._load_connections()
        cdf = cdf[
            ~(
                (cdf["user_id"].astype(int) == int(user_id))
                & (cdf["connection_id"].astype(int) == int(connection_id))
            )
        ]
        self._save_connections(cdf)

        adf = self._load_linked_accounts()
        adf = adf[
            ~(
                (adf["user_id"].astype(int) == int(user_id))
                & (adf["connection_id"].astype(int) == int(connection_id))
            )
        ]
        self._save_linked_accounts(adf)

        tdf = self._load_imported_transactions()
        tdf = tdf[
            ~(
                (tdf["user_id"].astype(int) == int(user_id))
                & (tdf["connection_id"].astype(int) == int(connection_id))
            )
        ]
        self._save_imported_transactions(tdf)
