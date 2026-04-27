import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useAppMode } from '../context/AppModeContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

interface ModeSwitchProps {
  containerStyle?: StyleProp<ViewStyle>;
}

export const ModeSwitch: React.FC<ModeSwitchProps> = ({ containerStyle }) => {
  const { mode, setMode } = useAppMode();
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
        },
        containerStyle,
      ]}
    >
      <Text style={[styles.label, { color: theme.heading }]}>{t('mode.label')}</Text>
      <Text style={[styles.caption, { color: theme.muted }]}>{t('mode.caption')}</Text>
      <View style={[styles.switchShell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.option,
            {
              backgroundColor: mode === 'personal' ? theme.primaryStart : 'transparent',
              borderColor: mode === 'personal' ? theme.primaryStart : 'transparent',
            },
          ]}
          onPress={() => setMode('personal')}
          activeOpacity={0.9}
        >
          <Text style={[styles.optionTitle, { color: mode === 'personal' ? '#ffffff' : theme.text }]}>
            {t('mode.personal')}
          </Text>
          <Text style={[styles.optionText, { color: mode === 'personal' ? '#dceaff' : theme.muted }]}>
            {t('mode.personalHint')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.option,
            {
              backgroundColor: mode === 'business' ? theme.secondaryStart : 'transparent',
              borderColor: mode === 'business' ? theme.secondaryStart : 'transparent',
            },
          ]}
          onPress={() => setMode('business')}
          activeOpacity={0.9}
        >
          <Text style={[styles.optionTitle, { color: mode === 'business' ? '#ffffff' : theme.text }]}>
            {t('mode.business')}
          </Text>
          <Text style={[styles.optionText, { color: mode === 'business' ? '#dcffeb' : theme.muted }]}>
            {t('mode.businessHint')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.md,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  caption: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  switchShell: {
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  option: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  optionTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  optionText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
