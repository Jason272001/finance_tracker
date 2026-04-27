import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { PieChart } from 'react-native-chart-kit';
import { ArrowUpRight, CreditCard, ShieldCheck } from 'lucide-react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ModeSwitch } from '../components/ModeSwitch';
import { StatCard } from '../components/StatCard';
import { WEB_BASE_URL } from '../constants/config';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { financeApi, getApiErrorInfo } from '../services/api';
import { AccountRecord, DailyBalanceRecord, TransactionRecord } from '../types/app';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';
import {
  formatPlanName,
  formatCurrency,
  formatDateTime,
  isDebtAccount,
  numberFromUnknown,
  sortByDateDesc,
} from '../utils/format';

interface ChartSlice {
  name: string;
  amount: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

const formatChartAmount = (value: number): string => numberFromUnknown(value).toFixed(2);

const buildChartSlices = (
  entries: Array<[string, number]>,
  colors: string[],
  legendFontColor: string
): ChartSlice[] => {
  return entries
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, amount], index) => ({
      name,
      amount,
      color: colors[index % colors.length],
      legendFontColor,
      legendFontSize: 12,
    }));
};

export const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user, refreshSession } = useAuth();
  const { locale, t } = useLanguage();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [dailyBalances, setDailyBalances] = useState<DailyBalanceRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const chartColors = useMemo(
    () => [
      theme.primaryStart,
      theme.secondaryStart,
      theme.accentStart,
      theme.dangerStart,
      theme.primaryEnd,
      theme.secondaryEnd,
    ],
    [
      theme.accentStart,
      theme.dangerStart,
      theme.primaryEnd,
      theme.primaryStart,
      theme.secondaryEnd,
      theme.secondaryStart,
    ]
  );

  const chartWidth = Math.max(Math.min(width - spacing.lg * 3, 420), 280);

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
      setDailyBalances(sortByDateDesc(dailyRows));
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

  const chartData = useMemo(() => {
    const incomeByCategory = new Map<string, number>();
    const expenseByCategory = new Map<string, number>();
    const debtByAccount = new Map<string, number>();

    transactions.forEach((txn) => {
      const type = txn.tx_type ?? txn.type;
      const label = txn.category?.trim() || t('home.uncategorized');
      const amount = numberFromUnknown(txn.amount);

      if (type === 'income') {
        incomeByCategory.set(label, (incomeByCategory.get(label) ?? 0) + amount);
      }

      if (type === 'expense') {
        expenseByCategory.set(label, (expenseByCategory.get(label) ?? 0) + amount);
      }
    });

    accounts.forEach((account) => {
      if (!isDebtAccount(account.account_type)) return;
      const amount = numberFromUnknown(account.balance);
      const label = account.account_name?.trim() || account.account_type || 'Debt';
      debtByAccount.set(label, (debtByAccount.get(label) ?? 0) + amount);
    });

    return {
      income: buildChartSlices([...incomeByCategory.entries()], chartColors, theme.text),
      expense: buildChartSlices([...expenseByCategory.entries()], chartColors, theme.text),
      debt: buildChartSlices([...debtByAccount.entries()], chartColors, theme.text),
    };
  }, [accounts, chartColors, t, theme.text, transactions]);

  const recentTransactions = transactions.slice(0, 6);
  const latestBalance = dailyBalances[0];
  const planName = formatPlanName(user?.plan_code, Boolean(user?.is_lifetime));
  const bankSyncAllowed = Boolean(user?.is_lifetime || user?.feature_flags?.bank_sync);

  const chartConfig = useMemo(
    () => ({
      backgroundColor: theme.cardBg,
      backgroundGradientFrom: theme.cardBg,
      backgroundGradientTo: theme.cardBg,
      color: (opacity = 1) => `rgba(255,255,255,${opacity})`,
      labelColor: () => theme.text,
      strokeWidth: 2,
    }),
    [theme.cardBg, theme.text]
  );

  const renderPieSection = (title: string, data: ChartSlice[]) => (
    <Card style={styles.chartSection}>
      <Text style={[styles.chartTitle, { color: theme.heading }]}>{title}</Text>
      {data.length ? (
        <View style={styles.chartWrap}>
          <PieChart
            data={data}
            width={chartWidth}
            height={220}
            accessor="amount"
            backgroundColor="transparent"
            paddingLeft="16"
            chartConfig={chartConfig}
            absolute
            hasLegend={false}
          />
          <View style={styles.chartLegend}>
            {data.map((item) => (
              <View key={`${title}-${item.name}`} style={styles.chartLegendItem}>
                <View style={[styles.chartLegendDot, { backgroundColor: item.color }]} />
                <Text style={[styles.chartLegendText, { color: theme.text }]}>
                  {formatChartAmount(item.amount)} {item.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <EmptyState
          title={t('home.noChartDataTitle')}
          message={t('home.noChartDataMessage')}
        />
      )}
    </Card>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bgTop }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primaryStart}
        />
      }
    >
      <ModeSwitch />

      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>
          {t('home.welcomeBack', { name: user?.name ?? 'there' })}
        </Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>
          {t('home.summaryLine', {
            plan: planName,
            payment: user?.payment_status ?? '-',
            trial: user?.trial_status ?? '-',
          })}
        </Text>
        <View style={styles.statGrid}>
          <StatCard
            label={t('home.availableBalance')}
            value={formatCurrency(summary.availableBalance, locale)}
            tone="primary"
          />
          <StatCard
            label={t('home.totalDebt')}
            value={formatCurrency(summary.totalDebt, locale)}
            tone="danger"
          />
        </View>
        <View style={styles.statGrid}>
          <StatCard
            label={t('home.totalIncome')}
            value={formatCurrency(summary.totalIncome, locale)}
            tone="success"
          />
          <StatCard
            label={t('home.totalExpense')}
            value={formatCurrency(summary.totalExpense, locale)}
            tone="accent"
          />
        </View>
      </Card>

      {statusMessage ? (
        <Card>
          <Text style={[styles.errorText, { color: theme.dangerStart }]}>{statusMessage}</Text>
        </Card>
      ) : null}

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('home.bankSync')}</Text>
          <Button
            title={t('home.openWebsite')}
            variant="outline"
            onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)}
          />
        </View>
        <View style={styles.infoRow}>
          <ShieldCheck
            size={20}
            color={bankSyncAllowed ? theme.secondaryStart : theme.dangerStart}
          />
          <Text style={[styles.infoText, { color: theme.muted }]}> 
            {bankSyncAllowed ? t('home.bankSyncAvailable') : t('home.bankSyncLocked')}
          </Text>
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Quick Actions</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>
          Open the screens where transaction entry, category creation, account setup, transfers, filters, and language settings live.
        </Text>
        <View style={styles.quickActions}>
          <View style={styles.quickActionItem}>
            <Button title="Open Transactions" onPress={() => navigation.navigate('Transactions')} />
            <Text style={[styles.quickActionText, { color: theme.muted }]}>
              Create transactions and categories, then filter by account, category, and date range with live income and expense totals.
            </Text>
          </View>
          <View style={styles.quickActionItem}>
            <Button title="Open Accounts" variant="secondary" onPress={() => navigation.navigate('Accounts')} />
            <Text style={[styles.quickActionText, { color: theme.muted }]}>
              Add accounts and transfer money from one account to another without counting it as income or expense.
            </Text>
          </View>
          <View style={styles.quickActionItem}>
            <Button title="Open Settings" variant="outline" onPress={() => navigation.navigate('Settings')} />
            <Text style={[styles.quickActionText, { color: theme.muted }]}>
              Change the app language and review your settings in one place.
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>
          {t('home.dailySnapshot')}
        </Text>
        {latestBalance ? (
          <View style={styles.snapshotGrid}>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>{t('common.date')}</Text>
              <Text style={[styles.snapshotValue, { color: theme.text }]}>
                {latestBalance.date}
              </Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>
                {t('common.income')}
              </Text>
              <Text style={[styles.snapshotValue, { color: theme.secondaryStart }]}>
                {formatCurrency(latestBalance.income, locale)}
              </Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>
                {t('common.expense')}
              </Text>
              <Text style={[styles.snapshotValue, { color: theme.dangerStart }]}>
                {formatCurrency(latestBalance.expense, locale)}
              </Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={[styles.snapshotLabel, { color: theme.muted }]}>{t('common.net')}</Text>
              <Text style={[styles.snapshotValue, { color: theme.primaryStart }]}>
                {formatCurrency(latestBalance.net, locale)}
              </Text>
            </View>
          </View>
        ) : (
          <EmptyState
            title={t('home.noDailyBalancesTitle')}
            message={t('home.noDailyBalancesMessage')}
          />
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>
          {t('home.summaryCharts')}
        </Text>
        <View style={styles.chartGrid}>
          {renderPieSection(t('home.incomeByCategory'), chartData.income)}
          {renderPieSection(t('home.expenseByCategory'), chartData.expense)}
          {renderPieSection(t('home.debtByAccount'), chartData.debt)}
        </View>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>
            {t('home.recentTransactions')}
          </Text>
          <ArrowUpRight size={18} color={theme.primaryStart} />
        </View>
        {recentTransactions.length ? (
          recentTransactions.map((txn) => {
            const txnType = txn.tx_type ?? txn.type;
            const amountColor =
              txnType === 'income'
                ? theme.secondaryStart
                : txnType === 'expense'
                  ? theme.dangerStart
                  : theme.primaryStart;

            return (
              <View
                key={txn.txn_id}
                style={[styles.transactionRow, { borderBottomColor: theme.border }]}
              >
                <View style={styles.transactionBody}>
                  <Text style={[styles.transactionCategory, { color: theme.text }]}>
                    {txn.category || t('home.uncategorized')}
                  </Text>
                  <Text style={[styles.transactionMeta, { color: theme.muted }]}>
                    {txn.account_name || 'Account'} | {formatDateTime(txn.date, locale)}
                  </Text>
                  {txn.note ? (
                    <Text style={[styles.transactionMeta, { color: theme.muted }]}>
                      {txn.note}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.transactionAmount, { color: amountColor }]}> 
                  {formatCurrency(txn.amount, locale)}
                </Text>
              </View>
            );
          })
        ) : (
          <EmptyState
            title={t('home.noTransactionsTitle')}
            message={t('home.noTransactionsMessage')}
          />
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>
          {t('home.accountsOverview')}
        </Text>
        {accounts.length ? (
          accounts.slice(0, 6).map((account) => (
            <View
              key={account.account_id}
              style={[styles.accountRow, { borderBottomColor: theme.border }]}
            >
              <View>
                <Text style={[styles.accountName, { color: theme.text }]}>
                  {account.account_name}
                </Text>
                <Text style={[styles.accountMeta, { color: theme.muted }]}>
                  {account.account_type}
                </Text>
              </View>
              <View style={styles.accountBalanceWrap}>
                <CreditCard
                  size={18}
                  color={isDebtAccount(account.account_type) ? theme.dangerStart : theme.primaryStart}
                />
                <Text style={[styles.accountBalance, { color: theme.text }]}>
                  {formatCurrency(account.balance, locale)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            title={t('home.noAccountsTitle')}
            message={t('home.noAccountsMessage')}
          />
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3 },
  quickActions: { gap: spacing.md, marginTop: spacing.md },
  quickActionItem: { gap: spacing.xs },
  quickActionText: { ...typography.caption, lineHeight: 18 },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  infoText: { ...typography.body, flex: 1, lineHeight: 24 },
  snapshotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  snapshotItem: { width: '47%' },
  snapshotLabel: { ...typography.caption, fontWeight: '700', marginBottom: spacing.xs },
  snapshotValue: { ...typography.body, fontWeight: '700' },
  chartGrid: { gap: spacing.md, marginTop: spacing.md },
  chartSection: { padding: spacing.sm },
  chartTitle: { ...typography.body, fontWeight: '700', marginBottom: spacing.sm },
  chartWrap: { alignItems: 'center', justifyContent: 'center' },
  chartLegend: { width: '100%', marginTop: spacing.sm, gap: spacing.sm },
  chartLegendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chartLegendDot: { width: 12, height: 12, borderRadius: 999 },
  chartLegendText: { ...typography.caption, flex: 1, lineHeight: 18 },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  transactionBody: { flex: 1, paddingRight: spacing.md },
  transactionCategory: { ...typography.body, fontWeight: '700' },
  transactionMeta: { ...typography.caption, marginTop: spacing.xs },
  transactionAmount: { ...typography.body, fontWeight: '700', alignSelf: 'center' },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  accountName: { ...typography.body, fontWeight: '700' },
  accountMeta: { ...typography.caption, marginTop: spacing.xs },
  accountBalanceWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountBalance: { ...typography.body, fontWeight: '700' },
  errorText: { ...typography.body },
});
