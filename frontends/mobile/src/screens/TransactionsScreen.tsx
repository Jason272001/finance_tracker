import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { financeApi, getApiErrorInfo } from '../services/api';
import { TransactionRecord } from '../types/app';
import { formatCurrency, formatDateTime, normalizeText, numberFromUnknown, sortByDateDesc } from '../utils/format';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

export const TransactionsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [query, setQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const rows = await financeApi.getTransactions(user.user_id);
      setTransactions(sortByDateDesc(rows));
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(getApiErrorInfo(error).message);
    }
  }, [user?.user_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredTransactions = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return transactions;
    return transactions.filter((txn) => {
      const haystack = [
        txn.tx_type ?? txn.type,
        txn.category,
        txn.note,
        txn.account_name,
        txn.date,
        txn.amount,
      ].map(normalizeText).join(' ');
      return haystack.includes(q);
    });
  }, [query, transactions]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce(
      (acc, txn) => {
        const amount = numberFromUnknown(txn.amount);
        const type = txn.tx_type ?? txn.type;
        if (type === 'income') acc.income += amount;
        if (type === 'expense') acc.expense += amount;
        if (type === 'transfer') acc.transfer += amount;
        return acc;
      },
      { income: 0, expense: 0, transfer: 0 }
    );
  }, [filteredTransactions]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bgTop }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryStart} />}
    >
      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>Transactions</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>Newest activity shows first. Search by account, category, note, date, or transaction type.</Text>
        <Input placeholder="Search transactions" value={query} onChangeText={setQuery} />
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Income</Text>
            <Text style={[styles.summaryValue, { color: theme.secondaryStart }]}>{formatCurrency(totals.income)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Expense</Text>
            <Text style={[styles.summaryValue, { color: theme.dangerStart }]}>{formatCurrency(totals.expense)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Transfer</Text>
            <Text style={[styles.summaryValue, { color: theme.primaryStart }]}>{formatCurrency(totals.transfer)}</Text>
          </View>
        </View>
      </Card>

      {statusMessage ? (
        <Card><Text style={[styles.errorText, { color: theme.dangerStart }]}>{statusMessage}</Text></Card>
      ) : null}

      <Card>
        {filteredTransactions.length ? (
          filteredTransactions.map((txn) => {
            const type = txn.tx_type ?? txn.type ?? 'transaction';
            return (
              <View key={txn.txn_id} style={[styles.transactionRow, { borderBottomColor: theme.border }]}> 
                <View style={styles.transactionBody}>
                  <Text style={[styles.category, { color: theme.text }]}>{txn.category || 'Uncategorized'}</Text>
                  <Text style={[styles.meta, { color: theme.muted }]}>{type.toUpperCase()} | {txn.account_name || 'Account'}</Text>
                  <Text style={[styles.meta, { color: theme.muted }]}>{formatDateTime(txn.date)}</Text>
                  {txn.note ? <Text style={[styles.meta, { color: theme.muted }]}>{txn.note}</Text> : null}
                </View>
                <Text style={[styles.amount, { color: type === 'income' ? theme.secondaryStart : type === 'expense' ? theme.dangerStart : theme.primaryStart }]}>{formatCurrency(txn.amount)}</Text>
              </View>
            );
          })
        ) : (
          <EmptyState title="No matching transactions" message="Try a different search term or add transactions from the web app." />
        )}
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  heading: { ...typography.h2 },
  subheading: { ...typography.body, marginTop: spacing.xs, marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryItem: { flex: 1, minWidth: 100 },
  summaryLabel: { ...typography.caption, fontWeight: '700' },
  summaryValue: { ...typography.body, fontWeight: '700', marginTop: spacing.xs },
  transactionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: 1 },
  transactionBody: { flex: 1, paddingRight: spacing.md },
  category: { ...typography.body, fontWeight: '700' },
  meta: { ...typography.caption, marginTop: spacing.xs },
  amount: { ...typography.body, fontWeight: '700', alignSelf: 'center' },
  errorText: { ...typography.body },
});
