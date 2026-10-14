// Título emitido — the issued ticket and its three copies (FR-10, BR-08).
// Design: docs/screens/03-titulo-emitido.png
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { formatDiliDate, formatDiliTime } from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { useApp } from '../../src/app-state';
import { Card, Divider, ErrorText, Row, Screen, StatusPill } from '../../src/components/kit';
import { Button, InfoNote } from '../../src/components/ui';
import { useLocalData, useVehicleClasses } from '../../src/hooks';
import { getTicket, issueRefOf } from '../../src/local/tickets';
import { colors, fonts, sizes } from '../../src/theme';

const COPIES: { key: MessageKey; bg: string; fg: string; border?: string }[] = [
  { key: 'copy.WHITE', bg: colors.surface, fg: colors.ink, border: colors.line },
  { key: 'copy.YELLOW', bg: colors.yellow, fg: colors.ink },
  { key: 'copy.RED', bg: colors.red, fg: colors.surface },
];

export default function IssuedTicket() {
  const { t, session } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticket = useLocalData((env) => getTicket(env.db, id), [id]);
  const classes = useVehicleClasses();

  if (ticket === undefined)
    return (
      <Screen tab="new" eyebrow={t('issued.eyebrow')} title={t('issued.title')}>
        {null}
      </Screen>
    );
  if (ticket === null) {
    return (
      <Screen tab="new" eyebrow={t('issued.eyebrow')} title={t('issued.title')}>
        <ErrorText>{t('error.NOT_FOUND')}</ErrorText>
      </Screen>
    );
  }

  const entry = new Date(ticket.entryAt);
  const vehicle = classes.find((c) => c.id === ticket.vehicleClassId);
  const mine = ticket.agentId === session?.user.id;

  return (
    <Screen
      tab="new"
      eyebrow={t('issued.eyebrow')}
      title={t('issued.title')}
      footer={
        ticket.status === 'ATIVO' ? (
          <Button
            label={t('issued.recordExit')}
            icon="log-out"
            variant="dark"
            onPress={() => router.push(`/exit/${ticket.id}`)}
          />
        ) : undefined
      }
    >
      <View style={styles.done}>
        <Feather name="check-circle" size={24} color={colors.green} />
        <Text style={styles.doneText}>
          {t('issued.registeredAt', { time: formatDiliTime(entry) })}
        </Text>
      </View>

      <Card style={styles.ticket}>
        <Text style={styles.authority}>{t('authorityName')}</Text>
        <Text style={styles.heading}>{t('issued.ticketHeading')}</Text>
        <View style={styles.serialBox}>
          <Text style={styles.serial} numberOfLines={1} adjustsFontSizeToFit>
            {ticket.serial}
          </Text>
          <StatusPill status={ticket.status} />
        </View>
        <View style={styles.plateRow}>
          <Text style={styles.plate}>{ticket.plate}</Text>
          <Text style={styles.vehicle}>{vehicle?.name}</Text>
        </View>
        <Divider dashed />
        <Row
          label={t('issued.dateEntry')}
          value={`${formatDiliDate(entry)} · ${formatDiliTime(entry)}`}
          mono
        />
        <Row
          label={t('issued.issuingAgent')}
          value={mine ? `${session?.user.name} · ${session?.user.agentNumber}` : '—'}
          strong
        />
        <Text style={styles.ref}>{issueRefOf(ticket.serial)}</Text>
      </Card>

      <View style={styles.copiesHead}>
        <Text style={styles.copiesTitle}>{t('issued.copies')}</Text>
        <Text style={styles.inRecord}>{t('issued.inRecord')}</Text>
      </View>
      <View style={styles.copies}>
        {COPIES.map((c) => (
          <View
            key={c.key}
            style={[styles.copy, { backgroundColor: c.bg, borderColor: c.border ?? c.bg }]}
          >
            <MaterialCommunityIcons name="content-copy" size={22} color={c.fg} />
            <Text style={[styles.copyText, { color: c.fg }]}>{t(c.key)}</Text>
          </View>
        ))}
      </View>
      <InfoNote>{t('issued.copiesNote')}</InfoNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  done: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  doneText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.green },
  ticket: { borderTopWidth: 6, borderTopColor: colors.ink, gap: 4 },
  authority: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  heading: { fontFamily: fonts.extrabold, fontSize: 21, color: colors.ink, marginBottom: 10 },
  serialBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.blue,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serial: { flex: 1, fontFamily: fonts.mono, fontSize: 19, color: colors.blue },
  plateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 14,
    marginBottom: 6,
  },
  plate: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink },
  vehicle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.muted },
  ref: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted, marginTop: 6 },
  copiesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  copiesTitle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  inRecord: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  copies: { flexDirection: 'row', gap: 12 },
  copy: {
    flex: 1,
    minHeight: 100,
    borderRadius: sizes.radius,
    borderWidth: 1.5,
    padding: 14,
    justifyContent: 'space-between',
  },
  copyText: { fontFamily: fonts.bold, fontSize: 16 },
});
