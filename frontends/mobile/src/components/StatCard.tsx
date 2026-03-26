import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

interface StatCardProps {
  label: string;
  value: string;
  tone?: 'primary' | 'success' | 'danger' | 'accent';
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, tone = 'primary' }) => {
  const { theme } = useTheme();

  const colorMap = {
    primary: theme.primaryStart,
    success: theme.secondaryStart,
    danger: theme.dangerStart,
    accent: theme.accentStart,
  } as const;

  return (
    <Card style={styles.card}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colorMap[tone] }]}>{value}</Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.h3,
  },
});
