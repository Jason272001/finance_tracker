import React from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { OptionSelect } from '../components/OptionSelect';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { WEB_BASE_URL } from '../constants/config';
import { useTheme } from '../theme/ThemeContext';
import { formatPlanName, formatShortDate } from '../utils/format';
import { spacing, typography } from '../theme/theme';

export const SettingsScreen: React.FC = () => {
  const { theme, isDark, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { language, locale, options, setLanguage, t } = useLanguage();
  const navigation = useNavigation<any>();

  const handleSignOut = async () => {
    await signOut();
  };

  const openWebDashboard = () => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`);
  const contactSupport = () => Linking.openURL('mailto:support@keeperbma.com');

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bgTop }]} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.headerRow}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
          <View style={styles.headerBody}>
            <Text style={[styles.heading, { color: theme.heading }]}>{user?.name ?? 'KeeperBMA User'}</Text>
            <Text style={[styles.subheading, { color: theme.muted }]}>{user?.email || 'No email on file'}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('settings.account')}</Text>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>{t('settings.phone')}</Text><Text style={[styles.infoValue, { color: theme.text }]}>{user?.phone || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>{t('settings.plan')}</Text><Text style={[styles.infoValue, { color: theme.text }]}>{formatPlanName(user?.plan_code, Boolean(user?.is_lifetime))}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>{t('settings.billingCycle')}</Text><Text style={[styles.infoValue, { color: theme.text }]}>{user?.billing_cycle || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>{t('settings.paymentStatus')}</Text><Text style={[styles.infoValue, { color: theme.text }]}>{user?.payment_status || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>{t('settings.trialEnds')}</Text><Text style={[styles.infoValue, { color: theme.text }]}>{formatShortDate(user?.trial_ends_at, locale)}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>{t('settings.trialDaysRemaining')}</Text><Text style={[styles.infoValue, { color: theme.text }]}>{String(user?.trial_days_remaining ?? '-')}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('settings.preferences')}</Text>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceBody}>
            <Text style={[styles.preferenceTitle, { color: theme.text }]}>{t('settings.darkMode')}</Text>
            <Text style={[styles.preferenceText, { color: theme.muted }]}>{t('settings.darkModeDescription')}</Text>
          </View>
          <Switch value={isDark} onValueChange={toggleTheme} thumbColor="#ffffff" trackColor={{ false: theme.borderStrong, true: theme.accentStart }} />
        </View>
        <OptionSelect
          label={t('settings.language')}
          placeholder={t('common.language')}
          value={language}
          options={options}
          onChange={(next) => setLanguage(next as typeof language)}
          containerStyle={styles.languageSelect}
        />
        <Text style={[styles.preferenceText, { color: theme.muted }]}>{t('settings.languageDescription')}</Text>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('settings.websiteActions')}</Text>
        <View style={styles.buttonStack}>
          <Button title={t('settings.openWebDashboard')} onPress={openWebDashboard} />
          <Button title={t('settings.manageProfile')} variant="outline" onPress={openWebDashboard} />
          <Button title={t('settings.openSupportChat')} variant="secondary" onPress={() => navigation.navigate('Support')} />
          <Button title={t('settings.contactSupport')} variant="outline" onPress={contactSupport} />
          <Button
            title={t('settings.signOut')}
            variant="danger"
            onPress={() => {
              Alert.alert(t('settings.signOutTitle'), t('settings.signOutMessage'), [
                { text: t('settings.cancel'), style: 'cancel' },
                { text: t('settings.signOut'), style: 'destructive', onPress: handleSignOut },
              ]);
            }}
          />
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBody: { flex: 1 },
  logo: { width: 64, height: 64, marginRight: spacing.md },
  heading: { ...typography.h2 },
  subheading: { ...typography.body, marginTop: spacing.xs },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm, gap: spacing.md },
  infoLabel: { ...typography.caption, fontWeight: '700' },
  infoValue: { ...typography.body, flexShrink: 1, textAlign: 'right' },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  preferenceBody: { flex: 1 },
  preferenceTitle: { ...typography.body, fontWeight: '700' },
  preferenceText: { ...typography.caption, marginTop: spacing.xs },
  languageSelect: { marginTop: spacing.lg, marginBottom: spacing.xs },
  buttonStack: { gap: spacing.sm },
});
