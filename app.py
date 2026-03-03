import streamlit as st
import pandas as pd
from core import User, Transaction, Account, DailyBalance

st.set_page_config(page_title="Finance Tracker", layout="wide")
st.title("Finance Tracker")

# ---------------- SESSION USER ----------------
if "u" not in st.session_state:
    st.session_state["u"] = User()

u = st.session_state["u"]

# ---------------- LOGIN ----------------
if not u.is_logged_in():
    st.subheader("Login")

    name = st.text_input("Name")
    pw = st.text_input("Password", type="password")

    if st.button("Login"):
        try:
            ok = u.login(name, pw)
            if ok:
                st.success("Logged in")
                st.rerun()
            else:
                st.error("Wrong name or password")
        except Exception:
            st.error("Login failed. Please try again.")

    st.info("Users are added manually in data/users.csv")
    st.stop()

# ---------------- AFTER LOGIN ----------------
st.success(f"Logged in as: {u.name} ")

if st.button("Logout"):
    u.logout()
    st.rerun()

st.divider()

# ---------------- PAGE NAV ----------------
if "page" not in st.session_state:
    st.session_state["page"] = "Summary"

page = st.radio("Navigation", ["Summary", "Register", "Accounts", "Daily Balance"], horizontal=True)
st.session_state["page"] = page

tx = Transaction()
ac = Account()
db = DailyBalance()

# ---------------- LOAD ACCOUNTS ----------------
def load_accounts(uid):
    if uid is None:
        return pd.DataFrame()
    return ac.by_user(uid)

acc = load_accounts(u.uid)

if not acc.empty:
    acc_map = dict(zip(acc["account_name"], acc["account_id"]))
else:
    acc_map = {}

# manual dropdown lists
TYPE_LIST = ["income", "expense"]
CAT_LIST = [
    "Uber", "Job", "Gift",
    "Gas", "Food", "Rent", "Bills",
    "Shopping", "Loan Payment", "Other"
]

# =========================================================
# ======================= SUMMARY =========================
# =========================================================
if page == "Summary":

    st.subheader("Transaction Summary")

    df = tx.by_user(u.uid)

    if df.empty:
        st.info("No transactions yet.")
    else:
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)

        income = df[df["type"] == "income"]["amount"].sum()
        expense = df[df["type"] == "expense"]["amount"].sum()
        net = income - expense

        c1, c2, c3 = st.columns(3)
        c1.metric("Total Income", f"{income:.2f}")
        c2.metric("Total Expense", f"{expense:.2f}")
        c3.metric("Net", f"{net:.2f}")

        st.divider()
        st.subheader("All Records")

        df = df.sort_values("txn_id", ascending=False)

        for _, r in df.iterrows():
            tid = int(r["txn_id"])

            cols = st.columns([1,2,2,2,2,2,2,1,1])

            cols[0].write(tid)
            cols[1].write(r["date"])
            cols[2].write(r["type"])
            cols[3].write(float(r["amount"]))
            cols[4].write(int(r["account_id"]))
            cols[5].write(r["category"])
            cols[6].write(r["note"])

            if cols[7].button("Update", key=f"u{tid}"):
                st.session_state["edit_id"] = tid

            if cols[8].button("Delete", key=f"d{tid}"):
                tx.delete(tid, user_id=u.uid)
                st.rerun()

        # ---------- EDIT SECTION ----------
        if "edit_id" in st.session_state:
            edit_id = st.session_state["edit_id"]
            row = tx.get(edit_id, user_id=u.uid)

            if row:
                st.divider()
                st.subheader(f"Edit Transaction {edit_id}")

                new_type = st.selectbox("Type", TYPE_LIST,
                    index=TYPE_LIST.index(row["type"]) if row["type"] in TYPE_LIST else 0)

                new_amount = st.number_input("Amount",
                    value=float(row["amount"]), min_value=0.0)

                if acc_map:
                    # preselect account
                    acc_name = next((k for k,v in acc_map.items() if v == row["account_id"]), None)
                    names = list(acc_map.keys())
                    idx = names.index(acc_name) if acc_name in names else 0
                    selected_name = st.selectbox("Account", names, index=idx)
                    new_account_id = acc_map[selected_name]
                else:
                    new_account_id = row["account_id"]

                new_cat = st.selectbox("Category", CAT_LIST,
                    index=CAT_LIST.index(row["category"]) if row["category"] in CAT_LIST else 0)

                new_note = st.text_input("Note", value=row["note"])

                if st.button("Save Changes"):
                    tx.update(edit_id,
                              user_id=u.uid,
                              type=new_type,
                              amount=new_amount,
                              account_id=new_account_id,
                              category=new_cat,
                              note=new_note)
                    del st.session_state["edit_id"]
                    st.rerun()

                if st.button("Cancel"):
                    del st.session_state["edit_id"]
                    st.rerun()

# =========================================================
# ======================= REGISTER ========================
# =========================================================
elif page == "Register":

    st.subheader("Transaction Register")

    if not acc_map:
        st.warning("No accounts available.")
        st.stop()

    col1, col2, col3 = st.columns(3)

    with col1:
        t_type = st.selectbox("Type", TYPE_LIST)
        amount = st.number_input("Amount", min_value=0.0)

    with col2:
        category = st.selectbox("Category", CAT_LIST)
        note = st.text_input("Note")

    with col3:
        acc_name = st.selectbox("Account", list(acc_map.keys()))
        account_id = acc_map[acc_name]   # show name, save ID

    if st.button("Save Transaction"):
        tx.add(
            t_type=t_type,
            amount=amount,
            account_id=account_id,
            category=category,
            note=note,
            user_id=u.uid
        )
        st.session_state["page"] = "Summary"
        st.rerun()

# =========================================================
# ======================= ACCOUNTS ========================
# =========================================================
elif page == "Accounts":
    st.subheader("Accounts")

    acc_df = ac.by_user(u.uid)

    if acc_df.empty:
        st.info("No accounts yet.")
    else:
        show = acc_df[["account_id", "account_name", "account_type", "group", "balance"]].copy()
        show = show.sort_values("account_id", ascending=True)
        st.dataframe(show, use_container_width=True)

    st.divider()
    st.markdown("### Add Account")

    c1, c2 = st.columns(2)
    with c1:
        new_name = st.text_input("Account Name")
        new_type = st.selectbox("Account Type", ["asset", "saving", "credit", "cash", "other"])
    with c2:
        new_group = st.text_input("Group", value="bank")
        new_balance = st.number_input("Opening Balance", value=0.0)

    if st.button("Add Account"):
        if not str(new_name).strip():
            st.error("Account name is required.")
        else:
            ac.add(
                account_name=new_name.strip(),
                account_type=new_type,
                group_name=new_group.strip() or "other",
                balance=new_balance,
                user_id=u.uid,
            )
            st.rerun()

    if not acc_df.empty:
        st.divider()
        st.markdown("### Delete Account")
        del_map = dict(zip(acc_df["account_name"], acc_df["account_id"]))
        del_name = st.selectbox("Choose account", list(del_map.keys()), key="acc_del_name")
        if st.button("Delete Account"):
            ac.delete(del_map[del_name], user_id=u.uid)
            st.rerun()

# =========================================================
# ==================== DAILY BALANCE ======================
# =========================================================
elif page == "Daily Balance":
    st.subheader("Daily Balance")

    acc_df = ac.by_user(u.uid)
    if acc_df.empty:
        st.warning("Create an account first in Accounts tab.")
        st.stop()

    acc_name_to_id = dict(zip(acc_df["account_name"], acc_df["account_id"]))
    acc_id_to_name = dict(zip(acc_df["account_id"], acc_df["account_name"]))

    bal_df = db.by_user(u.uid)
    if not bal_df.empty:
        show = bal_df.copy()
        show["account_name"] = show["account_id"].map(acc_id_to_name).fillna(show["account_id"].astype(str))
        show = show[["dailyB_id", "date", "account_name", "balance", "type"]]
        show = show.sort_values(["date", "dailyB_id"], ascending=[False, False])
        st.dataframe(show, use_container_width=True)
    else:
        st.info("No daily balance records yet.")

    st.divider()
    st.markdown("### Add Daily Balance")

    d1, d2, d3 = st.columns(3)
    with d1:
        d_date = st.date_input("Date")
        d_acc_name = st.selectbox("Account", list(acc_name_to_id.keys()))
    with d2:
        d_balance = st.number_input("Balance", value=0.0, key="daily_balance_value")
        d_type = st.selectbox("Type", ["snapshot", "adjustment", "manual"])
    with d3:
        st.write("")
        st.write("")
        if st.button("Save Daily Balance"):
            db.add(
                account_id=acc_name_to_id[d_acc_name],
                balance=d_balance,
                type_name=d_type,
                user_id=u.uid,
                date_value=d_date.isoformat(),
            )
            st.rerun()

    if not bal_df.empty:
        st.divider()
        st.markdown("### Delete Daily Balance")
        did = st.selectbox("Record ID", sorted(bal_df["dailyB_id"].tolist(), reverse=True))
        if st.button("Delete Daily Balance"):
            db.delete(did, user_id=u.uid)
            st.rerun()
