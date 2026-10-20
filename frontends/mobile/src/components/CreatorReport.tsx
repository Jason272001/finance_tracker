import React, { useMemo, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import { StatCard } from './StatCard';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { TransactionRecord } from '../types/app';
import { creatorReport, monthKey } from '../utils/creatorReport';
import { formatCurrency } from '../utils/format';

export const CreatorReport: React.FC<{ transactions: TransactionRecord[]; hasAccounts: boolean }> = ({ transactions, hasAccounts }) => {
  const { theme } = useTheme();
  const { locale } = useLanguage();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [message, setMessage] = useState('');
  const report = useMemo(() => creatorReport(transactions, monthKey(month)), [transactions, month]);
  const label = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const money = (value: number) => formatCurrency(value, locale);
  const changeMonth = (direction: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1));
  const shareReport = async () => {
    try {
      await Share.share({ title: `KeeperBMA — ${label}`, message: [
        `KeeperBMA monthly report — ${label}`,
        `Income: ${money(report.income)}`, `Expenses: ${money(report.expenses)}`, `Net income: ${money(report.net)}`,
        '', 'Income by source:', ...report.sources.map((source) => `${source.name}: ${money(source.amount)}`),
        '', 'Based on recorded transactions. Transfers excluded. Not a tax or accounting statement.',
      ].join('\n') });
    } catch {
      setMessage('Could not open sharing. Please try again.');
    }
  };
  return (
    <Card>
      <Text style={[styles.title, { color: theme.heading }]}>Monthly income & expenses</Text>
      <View style={styles.navigation}>
        <Button title="Previous month" variant="outline" onPress={() => changeMonth(-1)} />
        <Button title="Next month" variant="outline" onPress={() => changeMonth(1)} />
      </View>
      <Text style={[styles.month, { color: theme.heading }]} accessibilityLiveRegion="polite">{label}</Text>
      <StatCard label="Income" value={money(report.income)} tone="success" />
      <StatCard label="Expenses" value={money(report.expenses)} tone="accent" />
      <StatCard label="Net income" value={money(report.net)} tone="primary" />
      <Text style={[styles.title, { color: theme.heading }]}>Income by source</Text>
      {report.sources.length ? report.sources.map((source) => (
        <Text key={source.name} style={[styles.text, { color: theme.text }]}>{source.name}: {money(source.amount)}</Text>
      )) : <Text style={[styles.text, { color: theme.muted }]}>No income recorded for this month.</Text>}
      <Text style={[styles.text, { color: theme.muted }]}>Uses all recorded income and expenses. Transfers are excluded. This is a cash tracking summary, not a tax or accounting statement.</Text>
      <Button title="Share report text" variant="outline" disabled={!report.count} onPress={shareReport} />
      <Text style={[styles.title, { color: theme.heading }]}>Get started</Text>
      <Text style={[styles.text, { color: theme.text }]}>{hasAccounts ? '✓' : '○'} Create an account</Text>
      <Text style={[styles.text, { color: theme.text }]}>{transactions.some((row) => ['income', 'expense'].includes(String(row.type || row.tx_type).toLowerCase())) ? '✓' : '○'} Record your first income or expense</Text>
      <Text style={[styles.text, { color: theme.text }]}>{report.count ? '✓' : '○'} Review this month's report</Text>
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: theme.dangerStart }}>{message}</Text> : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', marginVertical: 12 },
  month: { fontSize: 17, fontWeight: '600', marginVertical: 12 },
  text: { fontSize: 14, lineHeight: 21, marginVertical: 6 },
  navigation: { gap: 10, marginVertical: 8 },
});
