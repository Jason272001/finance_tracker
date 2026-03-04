import streamlit as st
import pandas as pd
import io
import core as core_module
from datetime import timedelta

try:
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    MATPLOTLIB_OK = True
except Exception:
    MATPLOTLIB_OK = False

User = core_module.User
Transaction = core_module.Transaction
Account = core_module.Account
DailyBalance = core_module.DailyBalance
Category = getattr(core_module, "Category", None)

if Category is None:
    st.error("Category class is missing in core.py. Please restart Streamlit.")
    st.stop()

st.set_page_config(page_title="keeperbmo", page_icon=":bar_chart:", layout="wide")

if "theme_mode" not in st.session_state:
    st.session_state["theme_mode"] = "Light"

# Read latest toggle state first, then compute CSS.
if "theme_toggle_login" in st.session_state:
    st.session_state["theme_mode"] = "Dark" if st.session_state["theme_toggle_login"] else "Light"
elif "theme_toggle_app" in st.session_state:
    st.session_state["theme_mode"] = "Dark" if st.session_state["theme_toggle_app"] else "Light"

if st.session_state["theme_mode"] == "Light":
    theme_css = """
    <style>
    .block-container {padding-top: 1.2rem; padding-bottom: 1.2rem;}
    div[data-testid="stMetricValue"] {font-size: 1.35rem;}
    @keyframes fadeUp {
        from {opacity: 0; transform: translateY(10px);}
        to {opacity: 1; transform: translateY(0);}
    }
    @keyframes softGlow {
        0%, 100% {box-shadow: 0 0 0 rgba(56, 189, 248, 0);}
        50% {box-shadow: 0 6px 22px rgba(56, 189, 248, 0.2);}
    }
    [data-testid="stVerticalBlock"] > div {
        animation: fadeUp 420ms ease both;
    }
    [data-testid="stVerticalBlock"] > div:nth-child(2) {animation-delay: 40ms;}
    [data-testid="stVerticalBlock"] > div:nth-child(3) {animation-delay: 80ms;}
    [data-testid="stVerticalBlock"] > div:nth-child(4) {animation-delay: 120ms;}
    [data-testid="stMetric"] {
        border-radius: 10px;
        transition: transform 180ms ease, box-shadow 180ms ease;
    }
    [data-testid="stMetric"]:hover {
        transform: translateY(-2px);
        animation: softGlow 1.2s ease-in-out;
    }
    [data-testid="stVegaLiteChart"] {
        animation: fadeUp 520ms ease both;
        transition: transform 220ms ease, box-shadow 220ms ease;
        border-radius: 10px;
        overflow: hidden;
    }
    [data-testid="stVegaLiteChart"]:hover {
        transform: translateY(-3px) scale(1.01);
        box-shadow: 0 10px 22px rgba(56, 189, 248, 0.2);
    }
    .stApp {background-color: #ffffff; color: #0f172a;}
    .stButton > button, .stFormSubmitButton > button {
        background-color: #38bdf8 !important;
        color: #ffffff !important;
        border: 1px solid #38bdf8 !important;
        border-radius: 8px !important;
        transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
    }
    .stButton > button:hover, .stFormSubmitButton > button:hover {
        background-color: #0ea5e9 !important;
        border-color: #0ea5e9 !important;
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(14, 165, 233, 0.25);
    }
    div[data-baseweb="select"] > div, .stTextInput input, .stNumberInput input, .stDateInput input {
        background-color: #f8fcff !important;
        border-color: #bfdbfe !important;
        transition: border-color 180ms ease, box-shadow 180ms ease;
    }
    div[data-baseweb="select"] > div:focus-within, .stTextInput input:focus, .stNumberInput input:focus, .stDateInput input:focus {
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18) !important;
        border-color: #38bdf8 !important;
    }
    @media (prefers-reduced-motion: reduce) {
        * {animation: none !important; transition: none !important;}
    }
    </style>
    """
else:
    theme_css = """
    <style>
    .block-container {padding-top: 1.2rem; padding-bottom: 1.2rem;}
    div[data-testid="stMetricValue"] {font-size: 1.35rem;}
    @keyframes fadeUp {
        from {opacity: 0; transform: translateY(10px);}
        to {opacity: 1; transform: translateY(0);}
    }
    @keyframes softGlowDark {
        0%, 100% {box-shadow: 0 0 0 rgba(37, 99, 235, 0);}
        50% {box-shadow: 0 6px 20px rgba(37, 99, 235, 0.26);}
    }
    [data-testid="stVerticalBlock"] > div {
        animation: fadeUp 420ms ease both;
    }
    [data-testid="stVerticalBlock"] > div:nth-child(2) {animation-delay: 40ms;}
    [data-testid="stVerticalBlock"] > div:nth-child(3) {animation-delay: 80ms;}
    [data-testid="stVerticalBlock"] > div:nth-child(4) {animation-delay: 120ms;}
    [data-testid="stMetric"] {
        border-radius: 10px;
        transition: transform 180ms ease, box-shadow 180ms ease;
    }
    [data-testid="stMetric"]:hover {
        transform: translateY(-2px);
        animation: softGlowDark 1.2s ease-in-out;
    }
    [data-testid="stVegaLiteChart"] {
        animation: fadeUp 520ms ease both;
        transition: transform 220ms ease, box-shadow 220ms ease;
        border-radius: 10px;
        overflow: hidden;
    }
    [data-testid="stVegaLiteChart"]:hover {
        transform: translateY(-3px) scale(1.01);
        box-shadow: 0 10px 22px rgba(37, 99, 235, 0.28);
    }
    .stApp {background-color: #0b1220; color: #f8fafc;}
    .stApp, .stApp p, .stApp span, .stApp label, .stApp h1, .stApp h2, .stApp h3, .stApp h4, .stApp h5 {
        color: #f8fafc !important;
    }
    .stButton > button, .stFormSubmitButton > button {
        background-color: #2563eb !important;
        color: #ffffff !important;
        border: 1px solid #2563eb !important;
        border-radius: 8px !important;
        transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
    }
    .stButton > button:hover, .stFormSubmitButton > button:hover {
        background-color: #1d4ed8 !important;
        border-color: #1d4ed8 !important;
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(29, 78, 216, 0.32);
    }
    div[data-baseweb="select"] > div, .stTextInput input, .stNumberInput input, .stDateInput input {
        background-color: #111827 !important;
        border-color: #374151 !important;
        color: #f8fafc !important;
        transition: border-color 180ms ease, box-shadow 180ms ease;
    }
    div[data-baseweb="select"] > div:focus-within, .stTextInput input:focus, .stNumberInput input:focus, .stDateInput input:focus {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2) !important;
        border-color: #3b82f6 !important;
    }
    [data-testid="stDataFrame"] [role="grid"],
    [data-testid="stDataFrame"] [role="row"],
    [data-testid="stDataFrame"] [role="columnheader"],
    [data-testid="stDataFrame"] [role="gridcell"] {
        background-color: #111827 !important;
        color: #f8fafc !important;
        border-color: #1f2937 !important;
    }
    @media (prefers-reduced-motion: reduce) {
        * {animation: none !important; transition: none !important;}
    }
    </style>
    """

st.markdown(theme_css, unsafe_allow_html=True)
st.title("keeperbmo")


def _build_summary_pdf(
    tx_df,
    income_df,
    expense_df,
    debt_df,
    period_label,
    start_date,
    end_date,
):
    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        # Page 1: title + 3 pie charts
        fig = plt.figure(figsize=(11.69, 8.27))
        fig.suptitle(
            f"keeperbmo Summary ({period_label})\n{start_date} to {end_date}",
            fontsize=14,
            fontweight="bold",
        )
        ax1 = fig.add_subplot(2, 2, 1)
        ax2 = fig.add_subplot(2, 2, 2)
        ax3 = fig.add_subplot(2, 2, 3)
        ax4 = fig.add_subplot(2, 2, 4)

        def draw_pie(ax, data_df, label_col, value_col, title):
            ax.set_title(title, fontsize=11)
            if data_df.empty:
                ax.text(0.5, 0.5, "No data", ha="center", va="center")
                ax.axis("off")
                return

            values = data_df[value_col].astype(float)
            labels = data_df[label_col].astype(str).tolist()

            def pct_fmt(pct):
                return f"{pct:.1f}%" if pct >= 4 else ""

            wedges, _, _ = ax.pie(
                values,
                labels=None,
                autopct=pct_fmt,
                startangle=90,
                wedgeprops={"width": 0.72},
                textprops={"fontsize": 8},
            )
            ax.legend(
                wedges,
                labels,
                loc="center left",
                bbox_to_anchor=(1.02, 0.5),
                fontsize=8,
                frameon=False,
            )
            ax.axis("equal")

        draw_pie(ax1, income_df, "category", "amount", "Income by Category")
        draw_pie(ax2, expense_df, "category", "amount", "Expense by Category")
        draw_pie(ax3, debt_df, "account_name", "balance", "Debt by Account")

        total_income = float(income_df["amount"].sum()) if not income_df.empty else 0.0
        total_expense = float(expense_df["amount"].sum()) if not expense_df.empty else 0.0
        total_debt = float(debt_df["balance"].sum()) if not debt_df.empty else 0.0
        net = total_income - total_expense
        ax4.axis("off")
        ax4.text(
            0.0,
            0.75,
            f"Total Income: {total_income:,.2f}\n"
            f"Total Expense: {total_expense:,.2f}\n"
            f"Net: {net:,.2f}\n"
            f"Total Debt: {total_debt:,.2f}\n"
            f"Transactions: {len(tx_df)}",
            fontsize=11,
            va="top",
        )

        fig.tight_layout(rect=[0, 0, 1, 0.93])
        pdf.savefig(fig)
        plt.close(fig)

        # Following pages: all transactions
        cols = ["date", "type", "amount", "account_name", "category", "note"]
        tx_show = tx_df[cols].copy() if not tx_df.empty else pd.DataFrame(columns=cols)
        if not tx_show.empty:
            tx_show["amount"] = pd.to_numeric(tx_show["amount"], errors="coerce").fillna(0.0).map(lambda x: f"{x:,.2f}")
        rows_per_page = 28
        if tx_show.empty:
            fig = plt.figure(figsize=(11.69, 8.27))
            ax = fig.add_subplot(1, 1, 1)
            ax.axis("off")
            ax.set_title("Transactions")
            ax.text(0.5, 0.5, "No transactions in this period.", ha="center", va="center")
            pdf.savefig(fig)
            plt.close(fig)
        else:
            for p, start in enumerate(range(0, len(tx_show), rows_per_page), start=1):
                chunk = tx_show.iloc[start:start + rows_per_page]
                fig = plt.figure(figsize=(11.69, 8.27))
                ax = fig.add_subplot(1, 1, 1)
                ax.axis("off")
                ax.set_title(f"Transactions (Page {p})")
                table = ax.table(
                    cellText=chunk.values.tolist(),
                    colLabels=chunk.columns.tolist(),
                    loc="center",
                    cellLoc="left",
                )
                table.auto_set_font_size(False)
                table.set_fontsize(8)
                table.scale(1, 1.2)
                pdf.savefig(fig)
                plt.close(fig)

    buf.seek(0)
    return buf.getvalue()

# ---------------- SESSION USER ----------------
if "u" not in st.session_state:
    st.session_state["u"] = User()

u = st.session_state["u"]

# ---------------- LOGIN ----------------
if not u.is_logged_in():
    w1, w2 = st.columns([8, 1])
    with w1:
        st.subheader("Welcome")
    with w2:
        dark_on = st.toggle(
            "Dark Mode",
            value=(st.session_state["theme_mode"] == "Dark"),
            key="theme_toggle_login",
        )
        st.session_state["theme_mode"] = "Dark" if dark_on else "Light"
    tab_login, tab_register = st.tabs(["Login", "Register"])

    with tab_login:
        with st.form("login_form"):
            name = st.text_input("Name")
            pw = st.text_input("Password", type="password")
            do_login = st.form_submit_button("Login", width="stretch")
            if do_login:
                try:
                    ok = u.login(name, pw)
                    if ok:
                        st.success("Logged in")
                        st.rerun()
                    else:
                        st.error("Wrong name or password")
                except Exception:
                    st.error("Login failed. Please try again.")

    with tab_register:
        with st.form("register_form"):
            new_name = st.text_input("New User Name")
            new_pw = st.text_input("New Password", type="password")
            confirm_pw = st.text_input("Confirm Password", type="password")
            do_register = st.form_submit_button("Create Account", width="stretch")
            if do_register:
                if new_pw != confirm_pw:
                    st.error("Passwords do not match.")
                else:
                    try:
                        u.register(new_name, new_pw)
                        st.success("Account created. You can now login.")
                    except ValueError as e:
                        st.error(str(e))
                    except Exception:
                        st.error("Registration failed. Please try again.")

    st.stop()

# ---------------- AFTER LOGIN ----------------
h1, h2, h3 = st.columns([5, 1, 1])
with h1:
    st.caption(f"Signed in as: {u.name}")
with h2:
    dark_on = st.toggle(
        "Dark Mode",
        value=(st.session_state["theme_mode"] == "Dark"),
        key="theme_toggle_app",
    )
    st.session_state["theme_mode"] = "Dark" if dark_on else "Light"
with h3:
    if st.button("Logout", width="stretch"):
        u.logout()
        st.rerun()

st.divider()

# ---------------- PAGE NAV ----------------
if "page" not in st.session_state:
    st.session_state["page"] = "Summary"

page = st.radio("Navigation", ["Summary", "Register", "Accounts", "Categories", "Daily Balance"], horizontal=True)
st.session_state["page"] = page

tx = Transaction()
ac = Account()
db = DailyBalance()
ct = Category()

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

TYPE_LIST = ["income", "expense"]
ct.sync_auto_from_accounts(u.uid)
ct.ensure_default_categories(u.uid)
cat_df = ct.by_user(u.uid)
CAT_LIST = []
if not cat_df.empty:
    CAT_LIST = list(dict.fromkeys(cat_df["category_name"].astype(str).tolist()))

# Auto-generate one daily balance snapshot per account/day.
snapshot_key = (u.uid, pd.Timestamp.today().date().isoformat(), int(acc.shape[0]) if not acc.empty else 0)
if st.session_state.get("daily_snapshot_key") != snapshot_key:
    db.auto_snapshot_from_accounts(u.uid, accounts_df=acc)
    st.session_state["daily_snapshot_key"] = snapshot_key

# =========================================================
# ======================= SUMMARY =========================
# =========================================================
if page == "Summary":

    st.subheader("Transaction Summary")
    st.caption("Review your high-level numbers, charts, and manage existing transactions.")

    df = tx.by_user(u.uid)

    if df.empty:
        st.info("No transactions yet.")
    else:
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)

        income = df[df["type"] == "income"]["amount"].sum()
        expense = df[df["type"] == "expense"]["amount"].sum()
        net = income - expense
        total_debt = 0.0
        credit_rows = pd.DataFrame()
        if not acc.empty:
            acc_copy = acc.copy()
            acc_copy["account_type_norm"] = (
                acc_copy["account_type"]
                .astype(str)
                .str.strip()
                .str.lower()
                .str.replace(" ", "_", regex=False)
            )
            credit_rows = acc_copy[acc_copy["account_type_norm"].isin(["credit", "credit_card"])].copy()
            if not credit_rows.empty:
                credit_rows["balance"] = pd.to_numeric(credit_rows["balance"], errors="coerce").fillna(0.0)
                total_debt = float(credit_rows["balance"].sum())

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Total Income", f"{income:.2f}")
        c2.metric("Total Expense", f"{expense:.2f}")
        c3.metric("Net", f"{net:.2f}")
        c4.metric("Total Debt", f"{total_debt:.2f}")

        def render_pie(data_df, title, label_col, value_col):
            st.markdown(f"**{title}**")
            if data_df.empty:
                st.info("No data.")
                return
            is_dark = st.session_state.get("theme_mode") == "Dark"
            st.vega_lite_chart(
                data_df,
                {
                    "background": "#0b1220" if is_dark else "#ffffff",
                    "mark": {"type": "arc", "innerRadius": 40},
                    "view": {"stroke": None},
                    "params": [
                        {
                            "name": "hover",
                            "select": {"type": "point", "on": "mouseover", "clear": "mouseout"},
                        }
                    ],
                    "legend": {
                        "labelColor": "#f8fafc" if is_dark else "#111827",
                        "titleColor": "#f8fafc" if is_dark else "#111827",
                    },
                    "title": {"color": "#f8fafc" if is_dark else "#111827"},
                    "encoding": {
                        "theta": {"field": value_col, "type": "quantitative"},
                        "color": {"field": label_col, "type": "nominal"},
                        "opacity": {
                            "condition": {"param": "hover", "value": 1},
                            "value": 0.72,
                        },
                        "tooltip": [
                            {"field": label_col, "type": "nominal"},
                            {"field": value_col, "type": "quantitative", "format": ".2f"},
                        ],
                    },
                },
                width="stretch",
            )

        income_by_cat = (
            df[df["type"] == "income"]
            .groupby("category", as_index=False)["amount"]
            .sum()
        )
        income_by_cat = income_by_cat[income_by_cat["amount"] > 0]

        expense_by_cat = (
            df[df["type"] == "expense"]
            .groupby("category", as_index=False)["amount"]
            .sum()
        )
        expense_by_cat = expense_by_cat[expense_by_cat["amount"] > 0]

        debt_by_account = pd.DataFrame(columns=["account_name", "balance"])
        if not credit_rows.empty:
            debt_by_account = (
                credit_rows.groupby("account_name", as_index=False)["balance"]
                .sum()
            )
            debt_by_account = debt_by_account[debt_by_account["balance"] > 0]

        account_id_to_name = {}
        if not acc.empty:
            account_id_to_name = dict(zip(acc["account_id"], acc["account_name"]))

        st.divider()
        p1, p2, p3 = st.columns(3)
        with p1:
            render_pie(income_by_cat, "Income by Category", "category", "amount")
        with p2:
            render_pie(expense_by_cat, "Expense by Category", "category", "amount")
        with p3:
            render_pie(debt_by_account, "Debt by Account", "account_name", "balance")

        st.divider()
        st.markdown("### Download Summary PDF")
        d1, d2, d3 = st.columns([2, 2, 2])
        with d1:
            period_pick = st.selectbox(
                "Period",
                ["Last 2 Days", "Last 7 Days", "Last 30 Days", "Custom Range"],
                key="pdf_period_pick",
            )
        today_date = pd.Timestamp.today().date()
        if period_pick == "Last 2 Days":
            pdf_start_date = today_date - timedelta(days=1)
            pdf_end_date = today_date
        elif period_pick == "Last 7 Days":
            pdf_start_date = today_date - timedelta(days=6)
            pdf_end_date = today_date
        elif period_pick == "Last 30 Days":
            pdf_start_date = today_date - timedelta(days=29)
            pdf_end_date = today_date
        else:
            with d2:
                pdf_start_date = st.date_input("Start Date", value=today_date - timedelta(days=6), key="pdf_start")
            with d3:
                pdf_end_date = st.date_input("End Date", value=today_date, key="pdf_end")
            if pdf_start_date > pdf_end_date:
                st.error("Start date must be before or equal to end date.")
                pdf_start_date, pdf_end_date = pdf_end_date, pdf_start_date

        tx_pdf = df.copy()
        tx_pdf["txn_day"] = pd.to_datetime(tx_pdf["date"], errors="coerce").dt.date
        tx_pdf = tx_pdf[
            (tx_pdf["txn_day"] >= pdf_start_date) &
            (tx_pdf["txn_day"] <= pdf_end_date)
        ].copy()
        tx_pdf["account_name"] = tx_pdf["account_id"].map(account_id_to_name).fillna(tx_pdf["account_id"].astype(str))

        income_pdf = (
            tx_pdf[tx_pdf["type"] == "income"]
            .groupby("category", as_index=False)["amount"]
            .sum()
        )
        income_pdf = income_pdf[income_pdf["amount"] > 0]

        expense_pdf = (
            tx_pdf[tx_pdf["type"] == "expense"]
            .groupby("category", as_index=False)["amount"]
            .sum()
        )
        expense_pdf = expense_pdf[expense_pdf["amount"] > 0]

        debt_pdf = debt_by_account.copy()
        period_label = f"{period_pick}"
        filename = f"summary_{pdf_start_date.isoformat()}_{pdf_end_date.isoformat()}.pdf"

        if MATPLOTLIB_OK:
            if st.button("Generate PDF", key="gen_pdf_summary"):
                st.session_state["summary_pdf_bytes"] = _build_summary_pdf(
                    tx_df=tx_pdf,
                    income_df=income_pdf,
                    expense_df=expense_pdf,
                    debt_df=debt_pdf,
                    period_label=period_label,
                    start_date=pdf_start_date.isoformat(),
                    end_date=pdf_end_date.isoformat(),
                )
                st.session_state["summary_pdf_name"] = filename
                st.success("PDF is ready.")

            if "summary_pdf_bytes" in st.session_state:
                st.download_button(
                    "Download Summary PDF",
                    data=st.session_state["summary_pdf_bytes"],
                    file_name=st.session_state.get("summary_pdf_name", filename),
                    mime="application/pdf",
                    key="download_summary_pdf",
                )
        else:
            st.warning("PDF export requires matplotlib in the environment.")

        df = df.sort_values("txn_id", ascending=False)

        show_tx = df.copy()
        show_tx["account_name"] = show_tx["account_id"].map(account_id_to_name).fillna(show_tx["account_id"].astype(str))
        show_tx = show_tx[["txn_id", "date", "type", "amount", "account_name", "category", "note"]]

        st.divider()
        st.subheader("All Records")
        st.dataframe(show_tx, width="stretch")

        st.markdown("### Manage Transaction")
        tx_ids = show_tx["txn_id"].astype(int).tolist()
        selected_txn = st.selectbox("Select transaction ID", tx_ids, key="summary_txn_pick")
        m1, m2 = st.columns(2)
        with m1:
            if st.button("Edit Selected Transaction", width="stretch"):
                st.session_state["edit_id"] = int(selected_txn)
        with m2:
            if st.button("Delete Selected Transaction", type="secondary", width="stretch"):
                tx.delete(int(selected_txn), user_id=u.uid)
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
                    ok = tx.update(
                        edit_id,
                        user_id=u.uid,
                        type=new_type,
                        amount=new_amount,
                        account_id=new_account_id,
                        category=new_cat,
                        note=new_note,
                    )
                    if ok:
                        del st.session_state["edit_id"]
                        st.rerun()
                    else:
                        st.error("Could not save changes.")

                if st.button("Cancel"):
                    del st.session_state["edit_id"]
                    st.rerun()

# =========================================================
# ======================= REGISTER ========================
# =========================================================
elif page == "Register":

    st.subheader("Transaction Register")
    st.caption("Add normal transactions or move money between accounts.")
    if st.session_state.pop("txn_saved_ok", False):
        st.success("Transaction saved successfully.")

    if not acc_map:
        st.warning("No accounts available.")
        st.stop()

    tab_txn, tab_transfer = st.tabs(["Add Transaction", "Account Transfer"])

    with tab_txn:
        with st.form("form_add_transaction", clear_on_submit=True):
            col1, col2, col3 = st.columns(3)
            with col1:
                t_type = st.selectbox("Type", TYPE_LIST)
                amount = st.number_input("Amount", min_value=0.0)
            with col2:
                category = st.selectbox("Category", CAT_LIST)
                note = st.text_input("Note")
            with col3:
                acc_name = st.selectbox("Account", list(acc_map.keys()))
                account_id = acc_map[acc_name]
            submitted_txn = st.form_submit_button("Save Transaction", width="stretch")
            if submitted_txn:
                try:
                    tx.add(
                        t_type=t_type,
                        amount=amount,
                        account_id=account_id,
                        category=category,
                        note=note,
                        user_id=u.uid,
                    )
                    st.session_state["txn_saved_ok"] = True
                    st.rerun()
                except ValueError as e:
                    st.error(str(e))

    with tab_transfer:
        with st.form("form_transfer"):
            t1, t2, t3 = st.columns(3)
            with t1:
                from_account_name = st.selectbox("From Account", list(acc_map.keys()), key="transfer_from")
            with t2:
                to_options = [n for n in acc_map.keys() if n != from_account_name]
                to_account_name = st.selectbox("To Account", to_options, key="transfer_to")
            with t3:
                transfer_amount = st.number_input("Transfer Amount", min_value=0.0, key="transfer_amount")
            submitted_transfer = st.form_submit_button("Submit Transfer", width="stretch")
            if submitted_transfer:
                ok = ac.transfer(
                    from_account_id=acc_map[from_account_name],
                    to_account_id=acc_map[to_account_name],
                    amount=transfer_amount,
                    user_id=u.uid,
                )
                if ok:
                    st.success("Transfer completed.")
                    st.rerun()
                else:
                    st.error("Transfer failed. Check accounts and amount.")

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
        st.dataframe(show, width="stretch")

    st.divider()
    st.markdown("### Add Account")

    c1, c2 = st.columns(2)
    account_type_options = ["checking", "credit_card", "asset", "saving", "credit", "cash", "other"]
    with c1:
        new_name = st.text_input("Account Name")
        new_type = st.selectbox("Account Type", account_type_options)
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
        st.markdown("### Update Account")
        edit_acc_options = {
            f"{int(r['account_id'])} - {r['account_name']}": int(r["account_id"])
            for _, r in acc_df.sort_values("account_id").iterrows()
        }
        selected_acc_label = st.selectbox("Select account to update", list(edit_acc_options.keys()), key="acc_edit_pick")
        selected_acc_id = edit_acc_options[selected_acc_label]
        selected_acc = ac.get(selected_acc_id, user_id=u.uid)

        if selected_acc:
            acc_type_options = account_type_options
            edit_key_prefix = f"acc_edit_{selected_acc_id}"
            u1, u2 = st.columns(2)
            with u1:
                edit_acc_name = st.text_input(
                    "Account Name",
                    value=selected_acc["account_name"],
                    key=f"{edit_key_prefix}_name",
                )
                edit_acc_type = st.selectbox(
                    "Account Type",
                    acc_type_options,
                    index=(
                        acc_type_options.index(str(selected_acc["account_type"]).lower())
                        if str(selected_acc["account_type"]).lower() in acc_type_options
                        else 4
                    ),
                    key=f"{edit_key_prefix}_type",
                )
            with u2:
                edit_group = st.text_input(
                    "Group",
                    value=str(selected_acc["group"]),
                    key=f"{edit_key_prefix}_group",
                )
                edit_balance = st.number_input(
                    "Balance",
                    value=float(selected_acc["balance"]),
                    key=f"{edit_key_prefix}_balance",
                )

            if st.button("Save Account Changes"):
                if not str(edit_acc_name).strip():
                    st.error("Account name is required.")
                else:
                    ac.update(
                        selected_acc_id,
                        user_id=u.uid,
                        account_name=edit_acc_name.strip(),
                        account_type=edit_acc_type,
                        group=edit_group.strip() or "other",
                        balance=edit_balance,
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
# ====================== CATEGORIES =======================
# =========================================================
elif page == "Categories":
    st.subheader("Categories")

    cat_df = ct.by_user(u.uid)
    if cat_df.empty:
        st.info("No categories yet.")
    else:
        show = cat_df.copy()
        show["type"] = show["is_auto"].map(lambda x: "auto" if bool(x) else "manual")
        acc_id_to_name = {}
        if not acc.empty:
            acc_id_to_name = dict(zip(acc["account_id"], acc["account_name"]))
        show["linked_account"] = show["linked_account_id"].map(acc_id_to_name).fillna("")
        show = show[["category_id", "category_name", "type", "linked_account"]].sort_values("category_id")
        st.dataframe(show, width="stretch")

    st.divider()
    st.markdown("### Add Category")
    new_category = st.text_input("Category Name", key="cat_add_name")
    if st.button("Add Category"):
        try:
            ct.add(new_category, user_id=u.uid, is_auto=False)
            st.rerun()
        except ValueError as e:
            st.error(str(e))

    manual_df = cat_df[cat_df["is_auto"] == False].copy() if not cat_df.empty else pd.DataFrame()
    if manual_df.empty:
        st.info("No manual categories available for update/delete.")
    else:
        st.divider()
        st.markdown("### Update Category")
        edit_options = {
            f"{int(r['category_id'])} - {r['category_name']}": int(r["category_id"])
            for _, r in manual_df.sort_values("category_id").iterrows()
        }
        selected_edit_label = st.selectbox("Select category", list(edit_options.keys()), key="cat_edit_pick")
        selected_edit_id = edit_options[selected_edit_label]
        selected_row = ct.get(selected_edit_id, user_id=u.uid)
        if selected_row:
            edit_name = st.text_input("New Category Name", value=selected_row["category_name"], key="cat_edit_name")
            if st.button("Save Category Changes"):
                ok = ct.update(selected_edit_id, user_id=u.uid, category_name=edit_name)
                if ok:
                    st.rerun()
                else:
                    st.error("Could not update category.")

        st.divider()
        st.markdown("### Delete Category")
        selected_del_label = st.selectbox("Choose category", list(edit_options.keys()), key="cat_del_pick")
        selected_del_id = edit_options[selected_del_label]
        if st.button("Delete Category"):
            ok = ct.delete(selected_del_id, user_id=u.uid)
            if ok:
                st.rerun()
            else:
                st.error("Could not delete category.")

# =========================================================
# ==================== DAILY BALANCE ======================
# =========================================================
elif page == "Daily Balance":
    st.subheader("Daily Balance")
    st.caption("Daily balances are auto-generated. Manual daily balance entry is disabled.")

    acc_df = ac.by_user(u.uid)
    if acc_df.empty:
        st.warning("Create an account first in Accounts tab.")
        st.stop()

    acc_name_to_id = dict(zip(acc_df["account_name"], acc_df["account_id"]))
    acc_id_to_name = dict(zip(acc_df["account_id"], acc_df["account_name"]))

    bal_df = db.by_user(u.uid)
    st.markdown("### Daily Income / Expense Charts")
    selected_day = st.date_input("Chart Date", value=pd.Timestamp.today().date(), key="daily_chart_date")

    tx_df = tx.by_user(u.uid).copy()
    if tx_df.empty:
        st.info("No transactions available for charts.")
    else:
        tx_df["amount"] = pd.to_numeric(tx_df["amount"], errors="coerce").fillna(0.0)
        tx_df["txn_date"] = tx_df["date"].astype(str).str.slice(0, 10)
        day_df = tx_df[tx_df["txn_date"] == selected_day.isoformat()].copy()

        income_daily = (
            day_df[day_df["type"] == "income"]
            .groupby("category", as_index=False)["amount"]
            .sum()
        )
        income_daily = income_daily[income_daily["amount"] > 0]

        expense_daily = (
            day_df[day_df["type"] == "expense"]
            .groupby("category", as_index=False)["amount"]
            .sum()
        )
        expense_daily = expense_daily[expense_daily["amount"] > 0]

        def render_daily_pie(data_df, title):
            st.markdown(f"**{title}**")
            if data_df.empty:
                st.info("No data.")
                return
            is_dark = st.session_state.get("theme_mode") == "Dark"
            st.vega_lite_chart(
                data_df,
                {
                    "background": "#0b1220" if is_dark else "#ffffff",
                    "mark": {"type": "arc", "innerRadius": 40},
                    "view": {"stroke": None},
                    "params": [
                        {
                            "name": "hover",
                            "select": {"type": "point", "on": "mouseover", "clear": "mouseout"},
                        }
                    ],
                    "legend": {
                        "labelColor": "#f8fafc" if is_dark else "#111827",
                        "titleColor": "#f8fafc" if is_dark else "#111827",
                    },
                    "title": {"color": "#f8fafc" if is_dark else "#111827"},
                    "encoding": {
                        "theta": {"field": "amount", "type": "quantitative"},
                        "color": {"field": "category", "type": "nominal"},
                        "opacity": {
                            "condition": {"param": "hover", "value": 1},
                            "value": 0.72,
                        },
                        "tooltip": [
                            {"field": "category", "type": "nominal"},
                            {"field": "amount", "type": "quantitative", "format": ".2f"},
                        ],
                    },
                },
                width="stretch",
            )

        c1, c2 = st.columns(2)
        with c1:
            render_daily_pie(income_daily, "Daily Income by Category")
        with c2:
            render_daily_pie(expense_daily, "Daily Expense by Category")

    st.divider()
    st.markdown("### Daily Balance Records")
    if not bal_df.empty:
        show = bal_df.copy()
        show["account_name"] = show["account_id"].map(acc_id_to_name).fillna(show["account_id"].astype(str))
        show = show[["dailyB_id", "date", "account_name", "balance", "type"]]
        show = show.sort_values(["date", "dailyB_id"], ascending=[False, False])
        st.dataframe(show, width="stretch")
    else:
        st.info("No daily balance records yet.")

