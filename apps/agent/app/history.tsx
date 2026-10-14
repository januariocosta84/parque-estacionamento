// Histórico — the agent's tickets for the day, with filters and search (FR-18).
// Design: docs/screens/06-historico.png
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatDiliDate,
  formatDiliDayLong,
  formatDiliTime,
  formatUsd,
} from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { useApp } from '../src/app-state';
import { Screen, StatusPill, SyncNote } from '../src/components/kit';
import { useLocalData, useNow } from '../src/hooks';
import { lastEventRefOf, myTicketsForDay } from '../src/local/tickets';
import type { LocalTicket } from '../src/local/tickets';
import { colors, fonts, sizes } from '../src/theme';

type Filter = 'all' | 'active' | 'paid';
const FILTERS: { key: Filter; label: MessageKey; status?: 'ATIVO' | 'PAGO' }[] = [
  { key: 'all', label: 'history.filter.all' },
  { key: 'active', label: 'history.filter.active', status: 'ATIVO' },
  { key: 'paid', label: 'history.filter.paid', status: 'PAGO' },
];

export default function History() {
  const { t, locale, session } = useApp();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const status = FILTERS.find((f) => f.key === filter)?.status;
  const tickets =
    useLocalData(
      (env, s) => myTicketsForDay(env.db, s, env.now(), { ...(status ? { status } : {}), q }),
      [status, q],
    ) ?? [];

  const open = (ticket: LocalTicket) => {
    if (ticket.status === 'ATIVO') router.push(`/exit/${ticket.id}`);
    else if (ticket.paidBy === session?.user.id) router.push(`/receipt/${ticket.id}`);
    else router.push(`/ticket/${ticket.id}`);
  };

  return (
    <Screen tab="history" eyebrow={t('history.eyebrow')} title={t('history.title')}>
      <View style={styles.search}>
        <Feather name="search" size={22} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('history.search')}
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.searchInput}
          accessibilityLabel={t('history.search')}
        />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f.key)}
              style={[styles.filter, on ? styles.filterOn : styles.filterOff]}
            >
              <Text style={[styles.filterText, { color: on ? colors.surface : colors.ink }]}>
                {t(f.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>
          {t(
            filter === 'all' ? 'history.allTickets' : FILTERS.find((f) => f.key === filter)!.label,
          )}
        </Text>
        <Text style={styles.date}>{formatDiliDayLong(locale, now)}</Text>
      </View>

      {tickets.map((ticket) => {
        const entry = new Date(ticket.entryAt);
        const exit = ticket.exitAt ? formatDiliTime(new Date(ticket.exitAt)) : '—';
        return (
          <Pressable
            key={ticket.id}
            accessibilityRole="button"
            onPress={() => open(ticket)}
            style={styles.item}
          >
            <View style={styles.itemTop}>
              <Text style={styles.serial} numberOfLines={1}>
                {ticket.serial}
              </Text>
              <StatusPill status={ticket.status} />
            </View>
            <View style={styles.itemMid}>
              <Text style={styles.plate}>{ticket.plate}</Text>
              <Text style={ticket.amountCents !== null ? styles.amount : styles.inProgress}>
                {ticket.amountCents !== null
                  ? formatUsd(ticket.amountCents)
                  : t('history.inProgress')}
              </Text>
            </View>
            <Text style={styles.meta}>
              {formatDiliDate(entry)} · {formatDiliTime(entry)} → {exit} ·{' '}
              {session?.user.agentNumber}
            </Text>
            <Text style={styles.ref}>{lastEventRefOf(ticket)}</Text>
          </Pressable>
        );
      })}

      <SyncNote />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: sizes.radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.ink,
    paddingVertical: 12,
  },
  filters: { flexDirection: 'row', gap: 12 },
  filter: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOn: { backgroundColor: colors.red },
  filterOff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  filterText: { fontFamily: fonts.bold, fontSize: 16 },
  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  listTitle: { fontFamily: fonts.extrabold, fontSize: 21, color: colors.ink },
  date: { fontFamily: fonts.semibold, fontSize: 15, color: colors.muted },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 4,
  },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  serial: { flex: 1, fontFamily: fonts.mono, fontSize: 15, color: colors.blue },
  itemMid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  plate: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.ink },
  amount: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  inProgress: { fontFamily: fonts.semibold, fontSize: 16, color: colors.muted },
  meta: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  ref: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
});
