import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowUpRight, CreditCard, ShieldCheck } from 'lucide-react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { WEB_BASE_URL } from '../constants/config';
import { financeApi, getApiErrorInfo } from '../services/api';
import { AccountRecord, DailyBalanceRecord, TransactionRecord } from '../types/app';
import { formatCurrency, formatDateTime, isDebtAccount, numberFromUnknown, sortByDateDesc } from '../utils/format';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

export const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user, refreshSession } = useAuth();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [dailyBalances, setDailyBalances] = useState<DailyBalanceRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const [accountRows, transactionRows, dailyRows] = await Promise.all([
        financeApi.getAccounts(user.user_id),
        financeApi.getTransactions(user.user_id),
        financeApi.getDailyBalances(user.user_id),
        refreshSession(),
      ]);
      setAccounts(accountRows);
      setTransactions(sortByDateDesc(transactionRows));
      setDailyBalances(dailyRows);
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(getApiErrorInfo(error).message);
    }
  }, [refreshSession, user?.user_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const summary = useMemo(() => {
    const availableBalance = accounts
      .filter((account) => !isDebtAccount(account.account_type))
      .reduce((sum, account) => sum + numberFromUnknown(account.balance), 0);

    const totalDebt = accounts
      .filter((account) => isDebtAccount(account.account_type))
      .reduce((sum, account) => sum + numberFromUnknown(account.balance), 0);

    const totalIncome = transactions
      .filter((txn) => (txn.tx_type ?? txn.type) === 'income')
      .reduce((sum, txn) => sum + numberFromUnknown(txn.amount), 0);

    const totalExpense = transactions
      .filter((txn) => (txn.tx_type ?? txn.type) === 'expense')
      .reduce((sum, txn) => sum + numberFromUnknown(txn.amount), 0);

    return { availableBalance, totalDebt, totalIncome, totalExpense };
  }, [accounts, transactions]);

  const recentTransactions = transactions.slice(0, 6);
  const latestBalance = dailyBalances.at(-1);
  const planName = user?.is_lifetime ? 'Lifetime' : user?.plan_code ?? 'Unknown';
  const bankSyncAllowed = Boolean(user?.is_lifetime || user?.feature_flags?.bank_sync);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bgTop }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryStart} />}
    >
      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>Welcome back, {user?.name ?? 'there'}</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>Plan: {planName} | Payment: {user?.payment_status ?? '-'} | Trial: {user?.trial_status ?? '-'}</Text>
        <View style={styles.statGrid}>
          <StatCard label="Available Balance" value={formatCurrency(summary.availableBalance)} tone="primary" />
          <StatCard label="Total Debt" value={formatCurrency(summary.totalDebt)} tone="danger" />
        </View>
        <View style={styles.statGrid}>
          <StatCard label="Total Income" value={formatCurrency(summary.totalIncome)} tone="success" />
          <StatCard label="Total Expense" value={formatCurrency(summary.totalExpense)} tone="accent" />
        </View>
      </Card>

      {statusMessage ? (
        <Card>
          <Text style={[styles.errorText, { color: theme.dangerStart }]}>{statusMessage}</Text>
        </Card>
      ) : null}

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>Bank Sync</Text>
          <Button title="Open Website" variant="outline" onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)} />
        </View>
        <View style={styles.infoRow}>
          <ShieldCheck size={20} color={bankSyncAllowed ? theme.secondaryStart : theme.dangerStart} />
          <Text style={[styles.infoText, { color: theme.muted }]}> 
            {bankSyncAllowed
              ? 'Bank sync is available on your plan. Use the website to connect institutions and import transactions.'
              : 'Bank sync is available on Regular and above, including Lifetime.'}
          </Text>
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Daily Snapshot</Text>
        {latestBalance ? (
          <View style={styles.snapshotGrid}>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>Date</Text>
              <Text style={[styles.snapshotValue, { color: theme.text }]}>{latestBalance.date}</Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>Income</Text>
              <Text style={[styles.snapshotValue, { color: theme.secondaryStart }]}>{formatCurrency(latestBalance.income)}</Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>Expense</Text>
              <Text style={[styles.snapshotValue, { color: theme.dangerStart }]}>{formatCurrency(latestBalance.expense)}</Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>Net</Text>
              <Text style={[styles.snapshotValue, { color: theme.primaryStart }]}>{formatCurrency(latestBalance.net)}</Text>
            </View>
          </View>
        ) : (
          <EmptyState title="No daily balances yet" message="Daily balance snapshots will appear here after your account builds some history." />
        )}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>Recent Transactions</Text>
          <ArrowUpRight size={18} color={theme.primaryStart} />
        </View>
        {recentTransactions.length ? (
          recentTransactions.map((txn) => (
            <View key={txn.txn_id} style={[styles.transactionRow, { borderBottomColor: theme.border }]}> 
              <View style={styles.transactionBody}>
                <Text style={[styles.transactionCategory, { color: theme.text }]}>{txn.category || 'Uncategorized'}</Text>
                <Text style={[styles.transactionMeta, { color: theme.muted }]}>{txn.account_name || 'Account'} | {formatDateTime(txn.date)}</Text>
                {txn.note ? <Text style={[styles.transactionMeta, { color: theme.muted }]}>{txn.note}</Text> : null}
              </View>
              <Text style={[styles.transactionAmount, { color: (txn.tx_type ?? txn.type) === 'income' ? theme.secondaryStart : (txn.tx_type ?? txn.type) === 'expense' ? theme.dangerStart : theme.primaryStart }]}>
                {formatCurrency(txn.amount)}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState title="No transactions yet" message="Transactions from the web app will show up here automatically." />
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Accounts Overview</Text>
        {accounts.length ? (
          accounts.slice(0, 6).map((account) => (
            <View key={account.account_id} style={[styles.accountRow, { borderBottomColor: theme.border }]}> 
              <View>
                <Text style={[styles.accountName, { color: theme.text }]}>{account.account_name}</Text>
                <Text style={[styles.accountMeta, { color: theme.muted }]}>{account.account_type}</Text>
              </View>
              <View style={styles.accountBalanceWrap}>
                <CreditCard size={18} color={isDebtAccount(account.account_type) ? theme.dangerStart : theme.primaryStart} />
                <Text style={[styles.accountBalance, { color: theme.text }]}>{formatCurrency(account.balance)}</Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState title="No accounts yet" message="Create accounts on the web app and they’ll appear here for mobile tracking." />
        )}
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  heading: { ...typography.h2 },
  subheading: { ...typography.body, marginTop: spacing.xs },
  statGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, flexWrap: 'wrap' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: { ...typography.h3 },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  infoText: { ...typography.body, flex: 1, lineHeight: 24 },
  snapshotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  snapshotItem: { width: '47%' },
  snapshotLabel: { ...typography.caption, fontWeight: '700', marginBottom: spacing.xs },
  snapshotValue: { ...typography.body, fontWeight: '700' },
  transactionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: 1 },
  transactionBody: { flex: 1, paddingRight: spacing.md },
  transactionCategory: { ...typography.body, fontWeight: '700' },
  transactionMeta: { ...typography.caption, marginTop: spacing.xs },
  transactionAmount: { ...typography.body, fontWeight: '700', alignSelf: 'center' },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1 },
  accountName: { ...typography.body, fontWeight: '700' },
  accountMeta: { ...typography.caption, marginTop: spacing.xs },
  accountBalanceWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountBalance: { ...typography.body, fontWeight: '700' },
  errorText: { ...typography.body },
});
