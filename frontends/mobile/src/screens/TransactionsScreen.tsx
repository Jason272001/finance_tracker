import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { ModeSwitch } from '../components/ModeSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { financeApi, getApiErrorInfo } from '../services/api';
import { AccountRecord, CategoryRecord, TransactionRecord } from '../types/app';
import { formatCurrency, formatDateTime, normalizeText, numberFromUnknown, sortByDateDesc } from '../utils/format';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

const TRANSFER_CATEGORY = 'Transfer Acc to Acc';

const parseInputTimestamp = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const parseTxnTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const categoryDisplayName = (category: CategoryRecord): string =>
  String(category.category_name || category.name || '').trim();

const formatDateTimeInput = (value: Date = new Date()): string => {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
};

export const TransactionsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { locale } = useLanguage();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [txType, setTxType] = useState('expense');
  const [txAmount, setTxAmount] = useState('');
  const [txAccountId, setTxAccountId] = useState<string | null>(null);
  const [txCategory, setTxCategory] = useState<string | null>(null);
  const [txDateTime, setTxDateTime] = useState(() => formatDateTimeInput());
  const [txNote, setTxNote] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [transactionMessage, setTransactionMessage] = useState<string | null>(null);
  const [transactionMessageIsError, setTransactionMessageIsError] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [categoryMessageIsError, setCategoryMessageIsError] = useState(false);
  const [submittingTransaction, setSubmittingTransaction] = useState(false);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const [transactionRows, accountRows, categoryRows] = await Promise.all([
        financeApi.getTransactions(user.user_id),
        financeApi.getAccounts(user.user_id),
        financeApi.getCategories(user.user_id),
      ]);
      setTransactions(sortByDateDesc(transactionRows));
      setAccounts(accountRows);
      setCategories(categoryRows);
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

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: String(account.account_id), label: account.account_name })),
    [accounts]
  );

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    categories.forEach((category) => {
      const name = categoryDisplayName(category);
      if (name) values.add(name);
    });
    transactions.forEach((txn) => {
      const name = String(txn.category || '').trim();
      if (name) values.add(name);
    });
    values.add(TRANSFER_CATEGORY);
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [categories, transactions]);

  const filterAccountOptions = useMemo(
    () => [{ value: 'all', label: 'All Accounts' }, ...accountOptions],
    [accountOptions]
  );

  const filterCategoryOptions = useMemo(
    () => [{ value: 'all', label: 'All Categories' }, ...categoryOptions],
    [categoryOptions]
  );

  const filteredTransactions = useMemo(() => {
    const q = normalizeText(query);
    const fromTs = parseInputTimestamp(fromTime);
    const toTs = parseInputTimestamp(toTime);

    return transactions.filter((txn) => {
      const haystack = [txn.txn_id, txn.tx_type ?? txn.type, txn.category, txn.note, txn.account_name, txn.date, txn.amount]
        .map(normalizeText)
        .join(' ');
      if (q && !haystack.includes(q)) return false;
      if (selectedAccountId !== 'all' && String(txn.account_id) !== selectedAccountId) return false;
      if (selectedCategory !== 'all' && String(txn.category || '').trim() !== selectedCategory) return false;

      const txnTs = parseTxnTimestamp(txn.date);
      if (fromTs !== null && (txnTs === null || txnTs < fromTs)) return false;
      if (toTs !== null && (txnTs === null || txnTs > toTs)) return false;
      return true;
    });
  }, [fromTime, query, selectedAccountId, selectedCategory, toTime, transactions]);

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

  const timeframeLabel = useMemo(() => {
    if (fromTime.trim() || toTime.trim()) {
      return `${fromTime.trim() || 'Beginning'} to ${toTime.trim() || 'Now'}`;
    }
    return 'All time';
  }, [fromTime, toTime]);

  const handleCreateCategory = useCallback(async () => {
    if (!user?.user_id) return;
    const categoryName = newCategoryName.trim();
    if (!categoryName) {
      setCategoryMessage('Category name is required.');
      setCategoryMessageIsError(true);
      return;
    }

    try {
      setSubmittingCategory(true);
      await financeApi.createCategory({ user_id: user.user_id, category_name: categoryName });
      setNewCategoryName('');
      setCategoryMessage('Category created successfully.');
      setCategoryMessageIsError(false);
      await loadData();
      setTxCategory(categoryName);
    } catch (error) {
      setCategoryMessage(getApiErrorInfo(error).message);
      setCategoryMessageIsError(true);
    } finally {
      setSubmittingCategory(false);
    }
  }, [loadData, newCategoryName, user?.user_id]);

  const handleCreateTransaction = useCallback(async () => {
    if (!user?.user_id) return;
    const amount = numberFromUnknown(txAmount);
    const category = String(txCategory || '').trim();
    const note = txNote.trim();

    if (!txAccountId || amount <= 0 || !category) {
      setTransactionMessage('Account, category, and amount are required.');
      setTransactionMessageIsError(true);
      return;
    }

    try {
      setSubmittingTransaction(true);
      await financeApi.createTransaction({
        user_id: user.user_id,
        tx_type: txType,
        amount,
        account_id: Number(txAccountId),
        category,
        note,
        date: txDateTime.trim() || null,
      });
      setTxAmount('');
      setTxDateTime(formatDateTimeInput());
      setTxNote('');
      setTransactionMessage('Transaction created successfully.');
      setTransactionMessageIsError(false);
      await loadData();
    } catch (error) {
      setTransactionMessage(getApiErrorInfo(error).message);
      setTransactionMessageIsError(true);
    } finally {
      setSubmittingTransaction(false);
    }
  }, [loadData, txAccountId, txAmount, txCategory, txDateTime, txNote, txType, user?.user_id]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bgTop }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryStart} />}
    >
      <ModeSwitch />

      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>Create Transaction</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>Add income and expense entries directly from mobile.</Text>
        <OptionSelect
          label="Transaction Type"
          placeholder="Transaction Type"
          value={txType}
          options={[
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expense' },
          ]}
          onChange={setTxType}
        />
        <Input
          label="Amount"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={txAmount}
          onChangeText={setTxAmount}
        />
        <OptionSelect
          label="Account"
          placeholder="Select Account"
          value={txAccountId}
          options={accountOptions}
          onChange={setTxAccountId}
        />
        <OptionSelect
          label="Category"
          placeholder="Select Category"
          value={txCategory}
          options={categoryOptions}
          onChange={setTxCategory}
        />
        <Input
          label="Date & Time"
          placeholder="YYYY-MM-DD HH:MM:SS"
          value={txDateTime}
          onChangeText={setTxDateTime}
        />
        <Input
          label="Note"
          placeholder="Optional note"
          value={txNote}
          onChangeText={setTxNote}
        />
        {transactionMessage ? (
          <Text style={[styles.feedbackText, { color: transactionMessageIsError ? theme.dangerStart : theme.secondaryStart }]}>
            {transactionMessage}
          </Text>
        ) : null}
        <Button
          title={submittingTransaction ? 'Saving Transaction...' : 'Save Transaction'}
          onPress={handleCreateTransaction}
          disabled={submittingTransaction || accountOptions.length === 0 || categoryOptions.length === 0}
        />
      </Card>

      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>Create Category</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>Add a category once, then reuse it in transaction entry and search filters.</Text>
        <Input
          label="Category Name"
          placeholder="Category Name"
          value={newCategoryName}
          onChangeText={setNewCategoryName}
        />
        {categoryMessage ? (
          <Text style={[styles.feedbackText, { color: categoryMessageIsError ? theme.dangerStart : theme.secondaryStart }]}>
            {categoryMessage}
          </Text>
        ) : null}
        <Button title={submittingCategory ? 'Creating Category...' : 'Create Category'} onPress={handleCreateCategory} disabled={submittingCategory} />
      </Card>

      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>Transaction Search</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>Filter by keyword, account, category, or time range. The summary updates from the filtered time frame.</Text>
        <Input
          label="Keyword Search"
          placeholder="Search by note, date, amount, type, or account"
          value={query}
          onChangeText={setQuery}
        />
        <OptionSelect
          label="Account Filter"
          placeholder="All Accounts"
          value={selectedAccountId}
          options={filterAccountOptions}
          onChange={setSelectedAccountId}
        />
        <OptionSelect
          label="Category Filter"
          placeholder="All Categories"
          value={selectedCategory}
          options={filterCategoryOptions}
          onChange={setSelectedCategory}
        />
        <Input
          label="From Time"
          placeholder="YYYY-MM-DD HH:MM:SS"
          value={fromTime}
          onChangeText={setFromTime}
          autoCapitalize="none"
        />
        <Input
          label="To Time"
          placeholder="YYYY-MM-DD HH:MM:SS"
          value={toTime}
          onChangeText={setToTime}
          autoCapitalize="none"
        />
        <View style={styles.summaryHeader}>
          <Text style={[styles.summaryRangeLabel, { color: theme.heading }]}>Summary Time Frame</Text>
          <Text style={[styles.summaryRangeValue, { color: theme.muted }]}>{timeframeLabel}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Income</Text>
            <Text style={[styles.summaryValue, { color: theme.secondaryStart }]}>{formatCurrency(totals.income, locale)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Expense</Text>
            <Text style={[styles.summaryValue, { color: theme.dangerStart }]}>{formatCurrency(totals.expense, locale)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Transfer</Text>
            <Text style={[styles.summaryValue, { color: theme.primaryStart }]}>{formatCurrency(totals.transfer, locale)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Transactions</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{filteredTransactions.length}</Text>
          </View>
        </View>
      </Card>

      {statusMessage ? (
        <Card>
          <Text style={[styles.errorText, { color: theme.dangerStart }]}>{statusMessage}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>Transaction History</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>Latest transactions show first.</Text>
        {filteredTransactions.length ? (
          filteredTransactions.map((txn) => {
            const type = txn.tx_type ?? txn.type ?? 'transaction';
            return (
              <View key={txn.txn_id} style={[styles.transactionRow, { borderBottomColor: theme.border }]}> 
                <View style={styles.transactionBody}>
                  <Text style={[styles.category, { color: theme.text }]}>{txn.category || 'Uncategorized'}</Text>
                  <Text style={[styles.meta, { color: theme.muted }]}>{String(type).toUpperCase()} | {txn.account_name || 'Account'}</Text>
                  <Text style={[styles.meta, { color: theme.muted }]}>{formatDateTime(txn.date, locale)}</Text>
                  {txn.note ? <Text style={[styles.meta, { color: theme.muted }]}>{txn.note}</Text> : null}
                </View>
                <Text style={[styles.amount, { color: type === 'income' ? theme.secondaryStart : type === 'expense' ? theme.dangerStart : theme.primaryStart }]}>
                  {formatCurrency(txn.amount, locale)}
                </Text>
              </View>
            );
          })
        ) : (
          <EmptyState title="No matching transactions" message="Try a different filter or add a transaction from the form above." />
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
  summaryHeader: { marginBottom: spacing.sm },
  summaryRangeLabel: { ...typography.caption, fontWeight: '700' },
  summaryRangeValue: { ...typography.caption, marginTop: spacing.xs },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryItem: { flex: 1, minWidth: 110 },
  summaryLabel: { ...typography.caption, fontWeight: '700' },
  summaryValue: { ...typography.body, fontWeight: '700', marginTop: spacing.xs },
  transactionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: 1 },
  transactionBody: { flex: 1, paddingRight: spacing.md },
  category: { ...typography.body, fontWeight: '700' },
  meta: { ...typography.caption, marginTop: spacing.xs },
  amount: { ...typography.body, fontWeight: '700', alignSelf: 'center' },
  errorText: { ...typography.body },
  feedbackText: { ...typography.body, marginBottom: spacing.md },
});
