import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { WEB_BASE_URL } from '../constants/config';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';
import { PaymentRequiredInfo } from '../types/app';

type AuthMode = 'signin' | 'recover';

export const AuthScreen: React.FC = () => {
  const { theme } = useTheme();
  const { signIn } = useAuth();
  const isAndroid = Platform.OS === 'android';
  const [mode, setMode] = useState<AuthMode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentRequiredInfo | null>(null);

  const signUpUrl = useMemo(() => `${WEB_BASE_URL}/auth?mode=signup`, []);

  const handleSignIn = async () => {
    setLoading(true);
    setMessage(null);
    setPaymentInfo(null);
    try {
      await signIn(username.trim(), password);
    } catch (error) {
      const info = error as PaymentRequiredInfo;
      if (info.paymentRequired) {
        setPaymentInfo(info);
      } else {
        setMessage(info.message || 'Sign in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverRequest = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { authApi, getApiErrorInfo } = await import('../services/api');
      const result = await authApi.recoverRequest(email.trim());
      setMessage(result.sent ? `Recovery code sent. It expires in ${result.expires_minutes} minutes.` : 'Recovery request received.');
    } catch (error) {
      const { message: errorMessage } = await import('../services/api').then((m) => m.getApiErrorInfo(error));
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverConfirm = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { authApi } = await import('../services/api');
      await authApi.recoverConfirm(email.trim(), code.trim(), newPassword);
      Alert.alert('Password updated', 'Your password has been reset. You can sign in now.');
      setMode('signin');
      setCode('');
      setNewPassword('');
    } catch (error) {
      const { getApiErrorInfo } = await import('../services/api');
      setMessage(getApiErrorInfo(error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.bgTop }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: theme.heading }]}>KeeperBMA</Text>
              <Text style={[styles.subtitle, { color: theme.muted }]}>Sign in to your account</Text>
            </View>
          </View>
          <Text style={[styles.helperText, { color: theme.muted }]}>Don't have an account yet? Create your KeeperBMA account on the website, then come back here to sign in on mobile.</Text>
          {isAndroid ? (
            <Text style={[styles.helperText, { color: theme.muted }]}>
              Android builds keep account creation on the website so the Play Store release stays review-friendly.
            </Text>
          ) : (
            <Button title="If you don't have an account, sign up here" variant="secondary" onPress={() => Linking.openURL(signUpUrl)} />
          )}
        </Card>

        <Card>
          <View style={styles.tabs}>
            {(['signin', 'recover'] as AuthMode[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  setMode(tab);
                  setMessage(null);
                  setPaymentInfo(null);
                }}
                style={[
                  styles.tab,
                  mode === tab && { borderBottomColor: theme.primaryStart, borderBottomWidth: 2 },
                ]}
              >
                <Text style={[styles.tabText, { color: mode === tab ? theme.primaryStart : theme.muted }]}>
                  {tab === 'signin' ? 'Sign In' : 'Recover'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'signin' ? (
            <View style={styles.form}>
              <Input label="Username" placeholder="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
              <Input label="Password" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
              {paymentInfo ? (
                <Card style={[styles.noticeCard, { backgroundColor: theme.surface }]}> 
                  <Text style={[styles.noticeTitle, { color: theme.heading }]}>Payment information required</Text>
                  <Text style={[styles.noticeText, { color: theme.muted }]}>{paymentInfo.message}</Text>
                  {isAndroid ? (
                    <Text style={[styles.noticeText, { color: theme.muted, marginTop: spacing.sm }]}>
                      Billing changes are managed on the KeeperBMA website for the Android store build.
                    </Text>
                  ) : (
                    <Button
                      title="Add Payment Information"
                      onPress={() => Linking.openURL(paymentInfo.paymentUrl || `${WEB_BASE_URL}/auth?mode=signin`)}
                      style={{ marginTop: spacing.sm }}
                    />
                  )}
                </Card>
              ) : null}
              {message ? <Text style={[styles.message, { color: theme.dangerStart }]}>{message}</Text> : null}
              <Button title={loading ? 'Signing In...' : 'Sign In'} onPress={handleSignIn} disabled={loading} />
            </View>
          ) : (
            <View style={styles.form}>
              <Input label="Email" placeholder="name@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Input label="Recovery Code" placeholder="Enter the code from your email" value={code} onChangeText={setCode} autoCapitalize="none" />
              <Input label="New Password" placeholder="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
              {message ? <Text style={[styles.message, { color: theme.muted }]}>{message}</Text> : null}
              <View style={styles.buttonGap}>
                <Button title={loading ? 'Sending...' : 'Send Recovery Code'} variant="outline" onPress={handleRecoverRequest} disabled={loading} />
              </View>
              <Button title={loading ? 'Updating...' : 'Reset Password'} onPress={handleRecoverConfirm} disabled={loading} />
            </View>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  headerCard: { marginBottom: spacing.lg, gap: spacing.md },
  headerRow: { alignItems: 'center', gap: spacing.md },
  headerTextWrap: { alignItems: 'center' },
  logo: { width: 220, height: 66 },
  title: { ...typography.h1, fontSize: 28 },
  subtitle: { ...typography.body },
  helperText: { ...typography.body, lineHeight: 24, textAlign: 'center' },
  tabs: { flexDirection: 'row', marginBottom: spacing.md },
  tab: { paddingVertical: spacing.sm, marginRight: spacing.lg },
  tabText: { ...typography.body, fontWeight: '700' },
  form: { gap: spacing.xs },
  buttonGap: { marginBottom: spacing.sm },
  message: { ...typography.body, marginBottom: spacing.sm },
  noticeCard: { marginBottom: spacing.md },
  noticeTitle: { ...typography.h3, marginBottom: spacing.xs },
  noticeText: { ...typography.body },
});


