// Início — the agent's day and parked vehicles (FR-19, FR-13). Design: docs/screens/01-inicio.png
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDiliDayLong, formatDiliTime, formatUsd } from '@estacionamento/shared';
import { useApp } from '../src/app-state';
import { Card, Screen, StatusPill, SyncNote, VehicleBadge } from '../src/components/kit';
import { Button, InfoNote } from '../src/components/ui';
import { useLocalData, useNow, useVehicleClasses } from '../src/hooks';
import { parkedInMyAreas, todaySummary } from '../src/local/tickets';
import { colors, fonts, sizes } from '../src/theme';

const PREVIEW = 3;

export default function Home() {
  const { t, locale, session, signOut } = useApp();
  const now = useNow(60_000);
  const [showAll, setShowAll] = useState(false);
  const classes = useVehicleClasses();
  const summary = useLocalData((env, s) => todaySummary(env.db, s, env.now()));
  const parked = useLocalData((env, s) => parkedInMyAreas(env.db, s)) ?? [];
  const codeOf = (id: string) => classes.find((c) => c.id === id)?.code;
  const visible = showAll ? parked : parked.slice(0, PREVIEW);

  return (
    <Screen
      tab="home"
      eyebrow={t('authorityName')}
      title={t('appName')}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.signOut')}
          onPress={() => void signOut()}
          style={styles.signOut}
        >
          <Feather name="log-out" size={22} color={colors.onInkMuted} />
        </Pressable>
      }
    >
      <View style={styles.dayRow}>
        <Text style={styles.day}>
          {formatDiliDayLong(locale, now)} · {session?.user.name}
        </Text>
        <Text style={styles.agentNo}>{session?.user.agentNumber}</Text>
      </View>

      <View style={styles.cards}>
        <View style={[styles.stat, { backgroundColor: colors.surface }]}>
          <Text style={styles.statLabel}>{t('home.parked')}</Text>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>{summary?.parkedCount ?? '–'}</Text>
            <MaterialCommunityIcons name="car-outline" size={26} color={colors.muted} />
          </View>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.yellow }]}>
          <Text style={[styles.statLabel, { color: colors.ink }]}>{t('home.receivedToday')}</Text>
          <Text style={styles.statValue} adjustsFontSizeToFit numberOfLines={1}>
            {summary ? formatUsd(summary.receivedTodayCents) : '–'}
          </Text>
        </View>
      </View>

      <Button label={t('home.issueNew')} icon="plus" onPress={() => router.navigate('/new')} />

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>{t('home.parkedVehicles')}</Text>
        {parked.length > PREVIEW ? (
          <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={12}>
            <Text style={styles.seeAll}>{t('home.seeAll', { count: parked.length })}</Text>
          </Pressable>
        ) : null}
      </View>

      {visible.length > 0 ? (
        <Card style={{ paddingVertical: 4 }}>
          {visible.map((ticket, i) => (
            <Pressable
              key={ticket.id}
              accessibilityRole="button"
              onPress={() => router.push(`/exit/${ticket.id}`)}
              style={[styles.item, i > 0 && styles.itemBorder]}
            >
              <VehicleBadge code={codeOf(ticket.vehicleClassId)} />
              <View style={{ flex: 1 }}>
                <Text style={styles.plate}>{ticket.plate}</Text>
                <Text style={styles.serial} numberOfLines={1}>
                  {ticket.serial} · {formatDiliTime(new Date(ticket.entryAt))}
                </Text>
              </View>
              <StatusPill status={ticket.status} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      <SyncNote />
      <InfoNote>{t('currencyNote')}</InfoNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  signOut: {
    width: sizes.touch,
    height: sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  day: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.muted },
  agentNo: { fontFamily: fonts.mono, fontSize: 16, color: colors.muted },
  cards: { flexDirection: 'row', gap: 14 },
  stat: { flex: 1, borderRadius: 18, padding: 18, minHeight: 120, justifyContent: 'space-between' },
  statLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  statValue: { fontFamily: fonts.extrabold, fontSize: 36, color: colors.ink },
  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  listTitle: { fontFamily: fonts.extrabold, fontSize: 21, color: colors.ink },
  seeAll: { fontFamily: fonts.semibold, fontSize: 16, color: colors.red },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  itemBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  plate: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.ink },
  serial: { fontFamily: fonts.mono, fontSize: 14, color: colors.blue, marginTop: 2 },
});
