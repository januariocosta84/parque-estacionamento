// Screen frame and parts used by the agent screens (docs/DESIGN.md "Components").
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MessageKey } from '@estacionamento/shared';
import { useApp } from '../app-state';
import { colors, fonts, sizes } from '../theme';
import { Header } from './ui';

export type Tab = 'home' | 'new' | 'history';

const TABS: {
  key: Tab;
  href: '/home' | '/new' | '/history';
  label: MessageKey;
  icon: ReactNode;
  activeIcon: ReactNode;
}[] = [
  {
    key: 'home',
    href: '/home',
    label: 'tab.home',
    icon: <Feather name="home" size={24} color={colors.muted} />,
    activeIcon: <Feather name="home" size={24} color={colors.red} />,
  },
  {
    key: 'new',
    href: '/new',
    label: 'tab.newTicket',
    icon: <MaterialCommunityIcons name="ticket-outline" size={26} color={colors.muted} />,
    activeIcon: <MaterialCommunityIcons name="ticket-outline" size={26} color={colors.red} />,
  },
  {
    key: 'history',
    href: '/history',
    label: 'tab.history',
    icon: <Feather name="archive" size={24} color={colors.muted} />,
    activeIcon: <Feather name="archive" size={24} color={colors.red} />,
  },
];

/** Bottom tabs: Início · Novo título · Histórico (active = red). */
export function BottomNav({ active }: { active: Tab }) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TABS.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => router.navigate(tab.href)}
            style={styles.navItem}
          >
            {on ? tab.activeIcon : tab.icon}
            <Text style={[styles.navLabel, { color: on ? colors.red : colors.muted }]}>
              {t(tab.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Header, scrolling body, optional fixed action above the bottom tabs. Signed-in screens only. */
export function Screen({
  eyebrow,
  title,
  tab,
  footer,
  headerRight,
  children,
}: {
  eyebrow: string;
  title: string;
  tab: Tab;
  footer?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const { status } = useApp();
  if (status !== 'signed-in') return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <Header eyebrow={eyebrow} title={title} right={headerRight} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      <BottomNav active={tab} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Label on the left, value on the right. */
export function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

export function Divider({ dashed }: { dashed?: boolean }) {
  return <View style={[styles.divider, dashed && styles.dashed]} />;
}

/** Green-soft pill with a dot: "Ativo" / "Pago". */
export function StatusPill({ status }: { status: 'ATIVO' | 'PAGO' }) {
  const { t } = useApp();
  return (
    <View style={styles.pill}>
      <View style={styles.pillDot} />
      <Text style={styles.pillText}>{t(status === 'ATIVO' ? 'status.ATIVO' : 'status.PAGO')}</Text>
    </View>
  );
}

export function vehicleIconName(code: string | undefined): 'motorbike' | 'car' | 'truck' {
  if (code === 'MOTORIZADA') return 'motorbike';
  if (code?.startsWith('PESADO')) return 'truck';
  return 'car';
}

/** Yellow-soft tile with the vehicle icon (lists, ticket header). */
export function VehicleBadge({ code, size = 52 }: { code?: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size }]}>
      <MaterialCommunityIcons name={vehicleIconName(code)} size={size * 0.5} color={colors.ink} />
    </View>
  );
}

/** Sync problems worth telling the agent about; nothing when all is well. */
export function SyncNote() {
  const { t, sync } = useApp();
  const lines: string[] = [];
  if (sync.state === 'offline') lines.push(t('sync.offline'));
  if (sync.state === 'auth-required') lines.push(t('sync.authRequired'));
  if (sync.queued > 0) lines.push(t('sync.queued', { count: sync.queued }));
  if (sync.rejected > 0) lines.push(t('sync.rejected', { count: sync.rejected }));
  if (lines.length === 0) return null;
  return (
    <View style={[styles.syncNote, sync.rejected > 0 && { backgroundColor: colors.redSoft }]}>
      <Feather
        name={sync.state === 'offline' ? 'wifi-off' : 'upload-cloud'}
        size={18}
        color={colors.ink}
      />
      <Text style={styles.syncText}>{lines.join(' ')}</Text>
    </View>
  );
}

/** Red error text under a form. */
export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 28 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.ground,
  },
  nav: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 4, minHeight: sizes.touch },
  navLabel: { fontFamily: fonts.semibold, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
  rowValue: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
  mono: { fontFamily: fonts.mono, fontSize: 16 },
  strong: { fontFamily: fonts.bold },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
  dashed: {
    backgroundColor: 'transparent',
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    height: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.greenSoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.green },
  badge: {
    borderRadius: 12,
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncNote: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: colors.yellowSoft,
    borderRadius: sizes.radius,
    padding: 14,
  },
  syncText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  error: { fontFamily: fonts.semibold, fontSize: 15, color: colors.red, textAlign: 'center' },
});
