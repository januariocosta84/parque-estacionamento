// Shared building blocks from docs/DESIGN.md "Components".
import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, sizes } from '../theme';

/** Yellow "P" brand mark. */
export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.25 }]}>
      <Text style={[styles.markText, { fontSize: size * 0.55 }]}>P</Text>
    </View>
  );
}

/** Ink header with the brand mark, yellow eyebrow and white title. */
export function Header({
  eyebrow,
  title,
  subtitle,
  large,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  large?: boolean;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (large) {
    return (
      <View style={[styles.header, styles.headerLarge, { paddingTop: insets.top + 32 }]}>
        <BrandMark size={64} />
        <Text style={[styles.eyebrow, { marginTop: 28 }]}>{eyebrow}</Text>
        <Text style={styles.titleLarge}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    );
  }
  return (
    <View style={[styles.header, styles.headerRow, { paddingTop: insets.top + 16 }]}>
      <BrandMark size={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow} numberOfLines={1} adjustsFontSizeToFit>
          {eyebrow}
        </Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

type IconName = ComponentProps<typeof Feather>['name'];

/** Primary (red) or dark button, radius 14, at least 56 high. */
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  busy,
  disabled,
}: {
  label: string;
  onPress(): void;
  icon?: IconName;
  variant?: 'primary' | 'dark';
  busy?: boolean;
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? colors.red : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={22} color={colors.surface} /> : null}
          <Text style={styles.buttonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Yellow-soft info note with an (i) icon. */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Feather name="info" size={18} color={colors.ink} style={{ marginTop: 1 }} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** Label above a field: 13 / 600. */
export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  mark: { backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.extrabold, color: colors.ink },
  header: { backgroundColor: colors.ink, paddingHorizontal: 24 },
  headerLarge: { paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 20 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.yellow,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.surface, marginTop: 2 },
  titleLarge: { fontFamily: fonts.extrabold, fontSize: 32, color: colors.surface, marginTop: 6 },
  subtitle: { fontFamily: fonts.regular, fontSize: 16, color: colors.onInkMuted, marginTop: 8 },
  button: {
    minHeight: sizes.button,
    borderRadius: sizes.radius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 18, color: colors.surface },
  note: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.yellowSoft,
    borderRadius: sizes.radius,
    padding: 16,
  },
  noteText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink },
  label: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, marginBottom: 8 },
});
