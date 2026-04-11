import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { OptionSelect } from '../components/OptionSelect';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { WEB_BASE_URL } from '../constants/config';
import { financeApi, getApiErrorInfo } from '../services/api';
import { AccountRecord, BankAccountRecord, BankConnectionRecord } from '../types/app';
import { formatCurrency, formatDateTime, isDebtAccount, normalizeText, numberFromUnknown } from '../utils/format';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

const formatDateTimeInput = (value: Date = new Date()): string => {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
};

const accountTypeToGroup = (accountType: string): string => (accountType === 'credit' ? 'debt' : 'bank');

export const AccountsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { locale, t } = useLanguage();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [connections, setConnections] = useState<BankConnectionRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [query, setQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferMessageIsError, setTransferMessageIsError] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountMessageIsError, setAccountMessageIsError] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('asset');
  const [newBalance, setNewBalance] = useState('');
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [transferFromId, setTransferFromId] = useState<string | null>(null);
  const [transferToId, setTransferToId] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDateTime, setTransferDateTime] = useState(() => formatDateTimeInput());
  const [transferNote, setTransferNote] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
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

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: String(account.account_id), label: account.account_name })),
    [accounts]
  );

  const accountTypeOptions = useMemo(
    () => [
      { value: 'asset', label: 'Asset' },
      { value: 'credit', label: 'Credit (Debt)' },
      { value: 'saving', label: 'Saving' },
    ],
    []
  );

  const handleCreateAccount = useCallback(async () => {
    if (!user?.user_id) return;
    const accountName = newAccountName.trim();
    const groupName = accountTypeToGroup(newAccountType);
    const balance = numberFromUnknown(newBalance);

    if (!accountName) {
      setAccountMessage('Account name is required.');
      setAccountMessageIsError(true);
      return;
    }

    try {
      setSubmittingAccount(true);
      await financeApi.createAccount({
        user_id: user.user_id,
        account_name: accountName,
        account_type: newAccountType,
        group_name: groupName,
        balance,
      });
      setNewAccountName('');
      setNewBalance('');
      setAccountMessage('Account created successfully.');
      setAccountMessageIsError(false);
      await loadData();
    } catch (error) {
      setAccountMessage(getApiErrorInfo(error).message);
      setAccountMessageIsError(true);
    } finally {
      setSubmittingAccount(false);
    }
  }, [loadData, newAccountName, newAccountType, newBalance, user?.user_id]);

  const handleTransfer = useCallback(async () => {
    if (!user?.user_id) return;

    const amount = numberFromUnknown(transferAmount);
    if (!transferFromId || !transferToId || amount <= 0) {
      setTransferMessage(t('accounts.transferMissingFields'));
      setTransferMessageIsError(true);
      return;
    }

    if (transferFromId === transferToId) {
      setTransferMessage(t('accounts.transferSameAccount'));
      setTransferMessageIsError(true);
      return;
    }

    try {
      setSubmittingTransfer(true);
      await financeApi.transferAccounts(
        user.user_id,
        Number(transferFromId),
        Number(transferToId),
        amount,
        transferNote.trim(),
        transferDateTime.trim() || null
      );
      setTransferMessage(t('accounts.transferSuccess'));
      setTransferMessageIsError(false);
      setTransferAmount('');
      setTransferDateTime(formatDateTimeInput());
      setTransferNote('');
      setTransferFromId(null);
      setTransferToId(null);
      await loadData();
    } catch (error) {
      setTransferMessage(getApiErrorInfo(error).message);
      setTransferMessageIsError(true);
    } finally {
      setSubmittingTransfer(false);
    }
  }, [loadData, t, transferAmount, transferDateTime, transferFromId, transferNote, transferToId, user?.user_id]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bgTop }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryStart} />}
    >
      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>{t('accounts.heading')}</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>{t('accounts.subheading')}</Text>
        <Input placeholder={t('accounts.searchPlaceholder')} value={query} onChangeText={setQuery} />
        <View style={styles.summaryRow}>
          <View>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>{t('common.available')}</Text>
            <Text style={[styles.summaryValue, { color: theme.primaryStart }]}>{formatCurrency(totals.available, locale)}</Text>
          </View>
          <View>
            <Text style={[styles.summaryLabel, { color: theme.muted }]}>{t('common.debt')}</Text>
            <Text style={[styles.summaryValue, { color: theme.dangerStart }]}>{formatCurrency(totals.debt, locale)}</Text>
          </View>
        </View>
      </Card>

      {statusMessage ? <Card><Text style={[styles.errorText, { color: theme.dangerStart }]}>{statusMessage}</Text></Card> : null}

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Create Account</Text>
        <Text style={[styles.sectionCaption, { color: theme.muted }]}>Add asset, credit, or saving accounts from mobile.</Text>
        <Input
          label="Account Name"
          placeholder="Account Name"
          value={newAccountName}
          onChangeText={setNewAccountName}
        />
        <OptionSelect
          label="Account Type"
          placeholder="Account Type"
          value={newAccountType}
          options={accountTypeOptions}
          onChange={setNewAccountType}
        />
        <Input
          label="Opening Balance"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={newBalance}
          onChangeText={setNewBalance}
        />
        {accountMessage ? (
          <Text style={[styles.feedbackText, { color: accountMessageIsError ? theme.dangerStart : theme.secondaryStart }]}>
            {accountMessage}
          </Text>
        ) : null}
        <Button
          title={submittingAccount ? 'Creating Account...' : 'Create Account'}
          onPress={handleCreateAccount}
          disabled={submittingAccount}
        />
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('accounts.transferTitle')}</Text>
        <Text style={[styles.sectionCaption, { color: theme.muted }]}>{t('accounts.transferDescription')}</Text>
        <OptionSelect
          label={t('accounts.fromAccount')}
          placeholder={t('accounts.fromAccount')}
          value={transferFromId}
          options={accountOptions}
          onChange={setTransferFromId}
        />
        <OptionSelect
          label={t('accounts.toAccount')}
          placeholder={t('accounts.toAccount')}
          value={transferToId}
          options={accountOptions}
          onChange={setTransferToId}
        />
        <Input
          label={t('accounts.transferAmount')}
          placeholder={t('accounts.transferAmount')}
          keyboardType="decimal-pad"
          value={transferAmount}
          onChangeText={setTransferAmount}
        />
        <Input
          label="Date & Time"
          placeholder="YYYY-MM-DD HH:MM:SS"
          value={transferDateTime}
          onChangeText={setTransferDateTime}
        />
        <Input
          label="Note"
          placeholder="Optional note"
          value={transferNote}
          onChangeText={setTransferNote}
        />
        {transferMessage ? (
          <Text style={[styles.feedbackText, { color: transferMessageIsError ? theme.dangerStart : theme.secondaryStart }]}>{transferMessage}</Text>
        ) : null}
        <Button
          title={submittingTransfer ? `${t('accounts.transferButton')}...` : t('accounts.transferButton')}
          onPress={handleTransfer}
          disabled={submittingTransfer || accountOptions.length < 2}
        />
      </Card>

      <Card>
        {filteredAccounts.length ? (
          filteredAccounts.map((account) => (
            <View key={account.account_id} style={[styles.accountRow, { borderBottomColor: theme.border }]}> 
              <View style={styles.accountBody}>
                <Text style={[styles.accountName, { color: theme.text }]}>{account.account_name}</Text>
                <Text style={[styles.accountMeta, { color: theme.muted }]}>{account.account_type} {account.group_name ? `| ${account.group_name}` : ''}</Text>
              </View>
              <Text style={[styles.accountAmount, { color: isDebtAccount(account.account_type) ? theme.dangerStart : theme.text }]}>{formatCurrency(account.balance, locale)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title={t('accounts.noMatchingTitle')} message={t('accounts.noMatchingMessage')} />
        )}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('accounts.bankSync')}</Text>
          <Button title={t('accounts.manageOnWebsite')} variant="secondary" onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)} />
        </View>
        {!bankSyncAllowed ? (
          <EmptyState title={t('accounts.upgradeRequiredTitle')} message={t('accounts.upgradeRequiredMessage')} />
        ) : bankMessage ? (
          <Text style={[styles.errorText, { color: theme.muted }]}>{bankMessage}</Text>
        ) : (
          <>
            <Text style={[styles.sectionCaption, { color: theme.muted }]}>{t('accounts.linkedInstitutions')}</Text>
            {connections.length ? connections.map((item, index) => (
              <View key={`${item.connection_id ?? index}-${item.institution_name}`} style={[styles.accountRow, { borderBottomColor: theme.border }]}> 
                <View>
                  <Text style={[styles.accountName, { color: theme.text }]}>{item.institution_name || 'Institution'}</Text>
                  <Text style={[styles.accountMeta, { color: theme.muted }]}>{item.status || 'connected'}</Text>
                </View>
                <Text style={[styles.accountMeta, { color: theme.muted }]}>{formatDateTime(item.last_sync_at, locale)}</Text>
              </View>
            )) : <Text style={[styles.accountMeta, { color: theme.muted }]}>{t('accounts.noLinkedInstitutions')}</Text>}

            <Text style={[styles.sectionCaption, { color: theme.muted, marginTop: spacing.md }]}>{t('accounts.importedAccounts')}</Text>
            {bankAccounts.length ? bankAccounts.map((item, index) => (
              <View key={`${item.bank_account_id ?? index}-${item.account_name}`} style={[styles.accountRow, { borderBottomColor: theme.border }]}> 
                <View style={styles.accountBody}>
                  <Text style={[styles.accountName, { color: theme.text }]}>{item.account_name || 'Imported account'}</Text>
                  <Text style={[styles.accountMeta, { color: theme.muted }]}>{item.institution_name || ''} {item.subtype ? `| ${item.subtype}` : ''}</Text>
                </View>
                <Text style={[styles.accountAmount, { color: theme.text }]}>{formatCurrency(item.current_balance, locale)}</Text>
              </View>
            )) : <Text style={[styles.accountMeta, { color: theme.muted }]}>{t('accounts.noImportedAccounts')}</Text>}
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
  feedbackText: { ...typography.body, marginBottom: spacing.md },
});
