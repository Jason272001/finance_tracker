import React, { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { supportApi, getApiErrorInfo } from '../services/api';
import { SupportChatMessageRecord, SupportChatResponse } from '../types/app';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

interface SupportBubble {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: string[];
  topicTitle?: string;
  escalate?: boolean;
  escalationMessage?: string;
  contactEmail?: string;
}

const SUPPORT_EMAIL = 'support@keeperbma.com';
const SUPPORT_AGENT_NAME = 'Omar';

const buildInitialAssistantMessage = (): SupportBubble => ({
  id: 'support-welcome',
  role: 'assistant',
  content:
    `Hi, I'm ${SUPPORT_AGENT_NAME}. I can help with common KeeperBMA questions about login, billing, coupons, bank sync, missing data, transactions, transfers, reports, and typical app issues.`,
  topicTitle: SUPPORT_AGENT_NAME,
});

const buildAssistantBubble = (response: SupportChatResponse): SupportBubble => ({
  id: `assistant-${Date.now()}`,
  role: 'assistant',
  content: response.reply,
  steps: response.steps,
  topicTitle: response.topic_title,
  escalate: response.escalate,
  escalationMessage: response.escalation_message || '',
  contactEmail: response.contact_email || SUPPORT_EMAIL,
});

const buildErrorAssistantBubble = (message: string): SupportBubble => ({
  id: `assistant-error-${Date.now()}`,
  role: 'assistant',
  content: message,
  topicTitle: SUPPORT_AGENT_NAME,
  steps: [],
  escalationMessage: `If you still need help right now, tap Email Support and contact ${SUPPORT_EMAIL}.`,
  contactEmail: SUPPORT_EMAIL,
});

export const SupportScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<SupportBubble[]>([buildInitialAssistantMessage()]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([
    'Why is my data not showing?',
    'How do I reset my password?',
    'How do coupons and billing work?',
  ]);

  const historyPayload = useCallback(
    (items: SupportBubble[]): SupportChatMessageRecord[] =>
      items.slice(-10).map((item) => ({
        role: item.role,
        content: item.content,
      })),
    []
  );

  const latestEscalation = useMemo(() => {
    const assistantMessage = [...messages].reverse().find((item) => item.role === 'assistant' && item.escalate);
    return assistantMessage
      ? {
          contactEmail: assistantMessage.contactEmail || SUPPORT_EMAIL,
          escalationMessage: assistantMessage.escalationMessage || '',
        }
      : null;
  }, [messages]);

  const mapSupportError = useCallback(
    (error: unknown) => {
      const info = getApiErrorInfo(error);
      if (info.status === 404 || /not found/i.test(info.message || '')) {
        return `${SUPPORT_AGENT_NAME} support chat is not active on this server yet. Please use Email Support for now and try again after the latest backend update is deployed.`;
      }
      return info.message || t('support.error');
    },
    [t]
  );

  const handleSend = useCallback(
    async (rawMessage?: string) => {
      if (!user?.user_id) return;
      const message = String(rawMessage ?? draft).trim();
      if (!message || sending) return;

      const nextUserBubble: SupportBubble = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
      };
      const nextMessages = [...messages, nextUserBubble];
      setMessages(nextMessages);
      setDraft('');
      setSending(true);
      setStatusMessage(null);

      try {
        const response = await supportApi.chat({
          user_id: user.user_id,
          message,
          surface: 'mobile',
          history: historyPayload(nextMessages),
        });
        setMessages((current) => [...current, buildAssistantBubble(response)]);
        setSuggestions(response.suggestions);
      } catch (error) {
        const friendlyMessage = mapSupportError(error);
        setMessages((current) => [...current, buildErrorAssistantBubble(friendlyMessage)]);
        setStatusMessage(null);
      } finally {
        setSending(false);
      }
    },
    [draft, historyPayload, mapSupportError, messages, sending, user?.user_id]
  );

  const openEmailSupport = useCallback(async () => {
    const email = latestEscalation?.contactEmail || SUPPORT_EMAIL;
    const subject = encodeURIComponent('KeeperBMA Support');
    const body = encodeURIComponent('Please describe the issue, include the screen, date range, and any screenshot or error text.');
    await Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
  }, [latestEscalation?.contactEmail]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bgTop }]} contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>{t('support.heading')}</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>{t('support.subheading')}</Text>
        <Text style={[styles.note, { color: theme.muted }]}>{t('support.note')}</Text>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('support.quickQuestions')}</Text>
        <View style={styles.quickActions}>
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              title={suggestion}
              variant="outline"
              onPress={() => handleSend(suggestion)}
              disabled={sending}
            />
          ))}
        </View>
      </Card>

      <Card>
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                isUser ? styles.userBubble : styles.assistantBubble,
                {
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  backgroundColor: isUser ? theme.primaryStart : theme.surface,
                  borderColor: isUser ? theme.primaryStart : theme.border,
                },
              ]}
            >
              {!isUser && message.topicTitle ? (
                <Text style={[styles.topicTitle, { color: theme.heading }]}>{message.topicTitle}</Text>
              ) : null}
              <Text style={[styles.messageText, { color: isUser ? '#ffffff' : theme.text }]}>{message.content}</Text>
              {!isUser && message.steps?.length ? (
                <View style={styles.stepsWrap}>
                  {message.steps.map((step, index) => (
                    <Text key={`${message.id}-step-${index}`} style={[styles.stepText, { color: theme.muted }]}>
                      {`${index + 1}. ${step}`}
                    </Text>
                  ))}
                </View>
              ) : null}
              {!isUser && message.escalationMessage ? (
                <Text style={[styles.escalationText, { color: theme.dangerStart }]}>{message.escalationMessage}</Text>
              ) : null}
            </View>
          );
        })}
        {statusMessage ? <Text style={[styles.errorText, { color: theme.dangerStart }]}>{statusMessage}</Text> : null}
      </Card>

      <Card>
        <Input
          label={t('support.askLabel')}
          placeholder={t('support.placeholder')}
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          style={styles.messageInput}
        />
        <View style={styles.composerActions}>
          <Button
            title={sending ? t('support.sending') : t('support.send')}
            onPress={() => handleSend()}
            disabled={sending || !draft.trim()}
            style={styles.primaryAction}
          />
          <Button
            title={t('support.emailSupport')}
            variant="secondary"
            onPress={openEmailSupport}
            style={styles.secondaryAction}
          />
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  heading: { ...typography.h2 },
  subheading: { ...typography.body, marginTop: spacing.xs },
  note: { ...typography.caption, marginTop: spacing.md, lineHeight: 18 },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },
  quickActions: { gap: spacing.sm },
  messageBubble: {
    width: '88%',
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  userBubble: {
    borderTopRightRadius: 4,
  },
  assistantBubble: {
    borderTopLeftRadius: 4,
  },
  topicTitle: { ...typography.caption, fontWeight: '700', marginBottom: spacing.xs },
  messageText: { ...typography.body, lineHeight: 22 },
  stepsWrap: { marginTop: spacing.sm, gap: spacing.xs },
  stepText: { ...typography.caption, lineHeight: 18 },
  escalationText: { ...typography.caption, fontWeight: '700', marginTop: spacing.sm, lineHeight: 18 },
  errorText: { ...typography.body, marginTop: spacing.sm },
  messageInput: { minHeight: 110, paddingTop: spacing.md },
  composerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  primaryAction: { flex: 1 },
  secondaryAction: { flex: 1 },
  askLabel: { ...typography.caption, fontWeight: '700' },
});
