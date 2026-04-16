import React, { useEffect, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
  showPasswordToggle?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  style,
  showPasswordToggle = false,
  secureTextEntry,
  ...props
}) => {
  const { theme } = useTheme();
  const [isSecure, setIsSecure] = useState(Boolean(secureTextEntry));

  useEffect(() => {
    setIsSecure(Boolean(secureTextEntry));
  }, [secureTextEntry]);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, { color: theme.heading }]}>
          {label}
        </Text>
      )}
      {showPasswordToggle ? (
        <View
          style={[
            styles.passwordField,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
            },
          ]}
        >
          <TextInput
            style={[
              styles.passwordInput,
              {
                color: theme.text,
              },
              style,
            ]}
            placeholderTextColor={theme.muted}
            secureTextEntry={isSecure}
            {...props}
          />
          <Pressable onPress={() => setIsSecure((value) => !value)} style={styles.toggleButton}>
            <Text style={[styles.toggleText, { color: theme.primaryStart }]}>{isSecure ? 'Show' : 'Hide'}</Text>
          </Pressable>
        </View>
      ) : (
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: theme.border,
              color: theme.text,
            },
            style,
          ]}
          placeholderTextColor={theme.muted}
          secureTextEntry={secureTextEntry}
          {...props}
        />
      )}
      {error && (
        <Text style={[styles.error, { color: theme.dangerStart }]}>
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  passwordField: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    minHeight: 48,
    paddingRight: spacing.sm,
    ...typography.body,
  },
  toggleButton: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toggleText: {
    ...typography.caption,
    fontWeight: '700',
  },
  error: {
    ...typography.caption,
    marginTop: spacing.xs,
    marginLeft: 4,
  },
});
