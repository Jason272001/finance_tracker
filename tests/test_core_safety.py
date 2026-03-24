"""
Regression tests for login lockout and transaction balance updates.

Run from repo root:
  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import os
import tempfile
import unittest
from unittest import mock

import core


def _point_core_at_csv_root(tmp_root: str) -> None:
    core.DB_IS_SQL = False
    core._ENGINE = None  # type: ignore[attr-defined]
    core.DATA_DIR = tmp_root
    core.USERS_CSV = os.path.join(tmp_root, "users.csv")
    core.ADMIN1957_PATH = os.path.join(tmp_root, "admin_1957.csv")
    core.T_PATH = os.path.join(tmp_root, "transactions.csv")
    core.A_PATH = os.path.join(tmp_root, "accounts.csv")
    core.D_PATH = os.path.join(tmp_root, "daily_balances.csv")
    core.C_PATH = os.path.join(tmp_root, "category.csv")
    core.COUPON_PATH = os.path.join(tmp_root, "coupons.csv")


class TestLoginLockout(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        _point_core_at_csv_root(self._tmp.name)
        User = core.User
        User._login_attempts.clear()

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_user_level_lockout_applies_across_identifiers(self) -> None:
        u = core.User()
        u.register(
            "LockUser",
            "secretpass1",
            email="lockuser@example.com",
            phone="5559876543",
            plan_code="basic",
            activate_without_payment=True,
        )
        t0 = 1_000_000.0

        # Five wrong attempts as username — locks user bucket and ident bucket.
        with mock.patch("core.time.time", return_value=t0):
            for _ in range(5):
                self.assertFalse(u.login("LockUser", "wrongpassword1"))
            # Still within lock window (until = t0 + 1s for count == 5).
            self.assertFalse(u.login("lockuser@example.com", "secretpass1"))
            self.assertFalse(u.login("5559876543", "secretpass1"))

        # After lock expires, email login succeeds.
        with mock.patch("core.time.time", return_value=t0 + 5.0):
            self.assertTrue(u.login("lockuser@example.com", "secretpass1"))


class TestTransactionUpdateBalances(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        _point_core_at_csv_root(self._tmp.name)
        core.User._login_attempts.clear()

        reg = core.User()
        self.uid = reg.register(
            "TxUser",
            "secretpass1",
            email="txuser@example.com",
            phone="5551112233",
            plan_code="basic",
            activate_without_payment=True,
        )

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_update_amount_net_matches_row_without_double_apply(self) -> None:
        ac = core.Account()
        tx = core.Transaction()
        aid = ac.add("Checking", "checking", "bank", balance=0.0, user_id=self.uid)
        tid = tx.add("income", 100.0, aid, category="Job", note="", user_id=self.uid)
        row = ac.get(aid, user_id=self.uid)
        self.assertIsNotNone(row)
        assert row is not None
        self.assertAlmostEqual(float(row["balance"]), 100.0)

        ok = tx.update(tid, user_id=self.uid, amount=250.0)
        self.assertTrue(ok)
        row2 = ac.get(aid, user_id=self.uid)
        self.assertIsNotNone(row2)
        assert row2 is not None
        self.assertAlmostEqual(float(row2["balance"]), 250.0)

        ok2 = tx.update(tid, user_id=self.uid, amount=80.0)
        self.assertTrue(ok2)
        row3 = ac.get(aid, user_id=self.uid)
        self.assertIsNotNone(row3)
        assert row3 is not None
        self.assertAlmostEqual(float(row3["balance"]), 80.0)


if __name__ == "__main__":
    unittest.main()
