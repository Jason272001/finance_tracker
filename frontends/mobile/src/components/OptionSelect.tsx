import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';

export interface OptionSelectItem {
  label: string;
  value: string;
}

interface OptionSelectProps {
  label?: string;
  placeholder?: string;
  value?: string | null;
  options: OptionSelectItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export const OptionSelect: React.FC<OptionSelectProps> = ({
  label,
  placeholder,
  value,
  options,
  onChange,
  disabled,
  containerStyle,
}) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    return options.find((item) => item.value === value)?.label ?? placeholder ?? '';
  }, [options, placeholder, value]);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={[styles.label, { color: theme.heading }]}>{label}</Text> : null}
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.border,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[styles.triggerText, { color: value ? theme.text : theme.muted }]} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <ChevronDown size={18} color={theme.muted} />
      </TouchableOpacity>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.sheet, { backgroundColor: theme.cardBg, borderColor: theme.borderStrong }]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.sheetTitle, { color: theme.heading }]}>{label ?? placeholder ?? 'Select'}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <X size={20} color={theme.muted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[styles.optionRow, { borderBottomColor: theme.border }]}
                >
                  <Text style={[styles.optionText, { color: theme.text }]}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  triggerText: {
    ...typography.body,
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    maxHeight: '70%',
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    ...typography.h3,
    flex: 1,
    marginRight: spacing.sm,
  },
  optionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  optionText: {
    ...typography.body,
  },
});
