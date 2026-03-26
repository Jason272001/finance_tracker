import React from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { WEB_BASE_URL } from '../constants/config';
import { useTheme } from '../theme/ThemeContext';
import { formatShortDate } from '../utils/format';
import { spacing, typography } from '../theme/theme';

export const SettingsScreen: React.FC = () => {
  const { theme, isDark, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bgTop }]} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.headerRow}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.heading, { color: theme.heading }]}>{user?.name ?? 'KeeperBMA User'}</Text>
            <Text style={[styles.subheading, { color: theme.muted }]}>{user?.email || 'No email on file'}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Account</Text>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>Phone</Text><Text style={[styles.infoValue, { color: theme.text }]}>{user?.phone || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>Plan</Text><Text style={[styles.infoValue, { color: theme.text }]}>{user?.is_lifetime ? 'Lifetime' : user?.plan_code || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>Billing cycle</Text><Text style={[styles.infoValue, { color: theme.text }]}>{user?.billing_cycle || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>Payment status</Text><Text style={[styles.infoValue, { color: theme.text }]}>{user?.payment_status || '-'}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>Trial ends</Text><Text style={[styles.infoValue, { color: theme.text }]}>{formatShortDate(user?.trial_ends_at)}</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.muted }]}>Trial days remaining</Text><Text style={[styles.infoValue, { color: theme.text }]}>{String(user?.trial_days_remaining ?? '-')}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Preferences</Text>
        <View style={styles.preferenceRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.preferenceTitle, { color: theme.text }]}>Dark mode</Text>
            <Text style={[styles.preferenceText, { color: theme.muted }]}>Switch between light and dark mobile themes.</Text>
          </View>
          <Switch value={isDark} onValueChange={toggleTheme} thumbColor="#ffffff" trackColor={{ false: theme.borderStrong, true: theme.accentStart }} />
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Website Actions</Text>
        <View style={styles.buttonStack}>
          <Button title="Open Web Dashboard" onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)} />
          <Button title="Manage Profile On Website" variant="outline" onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)} />
          <Button title="Contact Support" variant="secondary" onPress={() => Linking.openURL('mailto:support@keeperbma.com')} />
          <Button title="Sign Out" variant="danger" onPress={() => {
            Alert.alert('Sign out', 'Do you want to sign out on this device?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
            ]);
          }} />
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 64, height: 64, marginRight: spacing.md },
  heading: { ...typography.h2 },
  subheading: { ...typography.body, marginTop: spacing.xs },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm, gap: spacing.md },
  infoLabel: { ...typography.caption, fontWeight: '700' },
  infoValue: { ...typography.body, flexShrink: 1, textAlign: 'right' },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  preferenceTitle: { ...typography.body, fontWeight: '700' },
  preferenceText: { ...typography.caption, marginTop: spacing.xs },
  buttonStack: { gap: spacing.sm },
});
