import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { WEB_BASE_URL } from '../constants/config';
import { financeApi, getApiErrorInfo } from '../services/api';
import { AccountRecord, BankAccountRecord, BankConnectionRecord } from '../types/app';
import { formatCurrency, formatDateTime, isDebtAccount, normalizeText, numberFromUnknown } from '../utils/format';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

export const AccountsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [connections, setConnections] = useState<BankConnectionRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [query, setQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const bankSyncAllowed = Boolean(user?.is_lifetime || user?.feature_flags?.bank_sync);

  const loadData = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      const accountRows = await financeApi.getAccounts(user.user_id);
      setAccounts(accountRows);
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(getApiErrorInfo(error).message);
    }

    if (bankSyncAllowed) {
      try {
        const [connectionRows, bankAccountRows] = await Promise.all([
          financeApi.getBankConnections(user.user_id),
          financeApi.getBankAccounts(user.user_id),
        ]);
        setConnections(connectionRows);
        setBankAccounts(bankAccountRows);
        setBankMessage(null);
      } catch (error) {
        setBankMessage(getApiErrorInfo(error).message);
      }
    }
  }, [bankSyncAllowed, user?.user_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredAccounts = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return accounts;
    return accounts.filter((account) => [account.account_name, account.account_type, account.group_name, account.balance].map(normalizeText).join(' ').includes(q));
  }, [accounts, query]);

  const totals = useMemo(() => {
    return filteredAccounts.reduce(
      (acc, account) => {
        const amount = numberFromUnknown(account.balance);
        if (isDebtAccount(account.account_type)) {
          acc.debt += amount;
        } else {
          acc.available += amount;
        }
        return acc;
      },
      { available: 0, debt: 0 }
    );
  }, [filteredAccounts]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bgTop }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryStart} />}
    >
      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>Accounts</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>Search by account name, type, group, or balance.</Text>
        <Input placeholder="Search accounts" value={query} onChangeText={setQuery} />
        <View style={styles.summaryRow}>
          <View>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Available</Text>
            <Text style={[styles.summaryValue, { color: theme.primaryStart }]}>{formatCurrency(totals.available)}</Text>
          </View>
          <View>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>Debt</Text>
            <Text style={[styles.summaryValue, { color: theme.dangerStart }]}>{formatCurrency(totals.debt)}</Text>
          </View>
        </View>
      </Card>

      {statusMessage ? <Card><Text style={[styles.errorText, { color: theme.dangerStart }]}>{statusMessage}</Text></Card> : null}

      <Card>
        {filteredAccounts.length ? (
          filteredAccounts.map((account) => (
            <View key={account.account_id} style={[styles.accountRow, { borderBottomColor: theme.border }]}> 
              <View style={styles.accountBody}>
                <Text style={[styles.accountName, { color: theme.text }]}>{account.account_name}</Text>
                <Text style={[styles.accountMeta, { color: theme.muted }]}>{account.account_type} {account.group_name ? `| ${account.group_name}` : ''}</Text>
              </View>
              <Text style={[styles.accountAmount, { color: isDebtAccount(account.account_type) ? theme.dangerStart : theme.text }]}>{formatCurrency(account.balance)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No matching accounts" message="Try a different search term or create accounts on the web app." />
        )}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>Bank Sync</Text>
          <Button title="Manage On Website" variant="secondary" onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)} />
        </View>
        {!bankSyncAllowed ? (
          <EmptyState title="Upgrade required" message="Secure bank connection and automatic transaction import are available on Regular and above, including Lifetime." />
        ) : bankMessage ? (
          <Text style={[styles.errorText, { color: theme.muted }]}>{bankMessage}</Text>
        ) : (
          <>
            <Text style={[styles.sectionCaption, { color: theme.muted }]}>Linked institutions</Text>
            {connections.length ? connections.map((item, index) => (
              <View key={`${item.connection_id ?? index}-${item.institution_name}`} style={[styles.accountRow, { borderBottomColor: theme.border }]}> 
                <View>
                  <Text style={[styles.accountName, { color: theme.text }]}>{item.institution_name || 'Institution'}</Text>
                  <Text style={[styles.accountMeta, { color: theme.muted }]}>{item.status || 'connected'}</Text>
                </View>
                <Text style={[styles.accountMeta, { color: theme.muted }]}>{formatDateTime(item.last_sync_at)}</Text>
              </View>
            )) : <Text style={[styles.accountMeta, { color: theme.muted }]}>No linked institutions yet.</Text>}

            <Text style={[styles.sectionCaption, { color: theme.muted, marginTop: spacing.md }]}>Imported accounts</Text>
            {bankAccounts.length ? bankAccounts.map((item, index) => (
              <View key={`${item.bank_account_id ?? index}-${item.account_name}`} style={[styles.accountRow, { borderBottomColor: theme.border }]}> 
                <View style={styles.accountBody}>
                  <Text style={[styles.accountName, { color: theme.text }]}>{item.account_name || 'Imported account'}</Text>
                  <Text style={[styles.accountMeta, { color: theme.muted }]}>{item.institution_name || ''} {item.subtype ? `| ${item.subtype}` : ''}</Text>
                </View>
                <Text style={[styles.accountAmount, { color: theme.text }]}>{formatCurrency(item.current_balance)}</Text>
              </View>
            )) : <Text style={[styles.accountMeta, { color: theme.muted }]}>No imported accounts yet.</Text>}
          </>
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
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { ...typography.caption, fontWeight: '700' },
  summaryValue: { ...typography.body, fontWeight: '700', marginTop: spacing.xs },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1 },
  accountBody: { flex: 1, paddingRight: spacing.md },
  accountName: { ...typography.body, fontWeight: '700' },
  accountMeta: { ...typography.caption, marginTop: spacing.xs },
  accountAmount: { ...typography.body, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.h3 },
  sectionCaption: { ...typography.caption, fontWeight: '700', marginBottom: spacing.sm },
  errorText: { ...typography.body },
});
