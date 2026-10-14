// Registar saída — exit time from the clock, the charge, and cash payment (FR-14, FR-15).
// Design: docs/screens/04-registar-saida.png. Adds "Valor recebido" for FR-15.
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatDiliDate,
  formatDiliTime,
  formatDuration,
  formatHours,
  formatUsd,
  parseUsdInput,
} from '@estacionamento/shared';
import type { ChargeQuote } from '@estacionamento/shared';
import { useApp } from '../../src/app-state';
import {
  Card,
  Divider,
  ErrorText,
  Row,
  Screen,
  StatusPill,
  VehicleBadge,
} from '../../src/components/kit';
import { Button, InfoNote, Label } from '../../src/components/ui';
import { useErrorText, useLocalData, useNow, useVehicleClasses } from '../../src/hooks';
import { getSettings } from '../../src/local/reference';
import { LocalError, closeTicket, getTicket, quoteExit } from '../../src/local/tickets';
import { colors, fonts, sizes } from '../../src/theme';

type Loaded = { quote: ChargeQuote } | { error: unknown };

export default function RecordExit() {
  const { t, locale, env, session, afterWrite } = useApp();
  const errorText = useErrorText();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow(15_000);
  const ticket = useLocalData((e) => getTicket(e.db, id), [id]);
  const settings = useLocalData((e) => getSettings(e.db));
  const loaded = useLocalData<Loaded>(
    (e, s) =>
      quoteExit(e, s, id).then(
        (quote) => ({ quote }),
        (error: unknown) => ({ error }),
      ),
    [id, now.getTime()],
  );
  const classes = useVehicleClasses();
  /** What the agent typed; null until they type, so the field follows the total. */
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = loaded && 'quote' in loaded ? loaded.quote : undefined;
  const loadError = loaded && 'error' in loaded ? errorText(loaded.error) : null;
  const received = typed ?? (quote ? formatUsd(quote.amountCents).replace('$', '') : '');

  const receivedCents = parseUsdInput(received);
  const change = quote && receivedCents !== null ? receivedCents - quote.amountCents : null;
  const rule = settings?.chargingRule;
  const startedHourRule = rule?.minimumHours === 1 && rule.graceMinutes === 0;

  const confirm = async () => {
    if (!env || !session || !quote) return;
    if (receivedCents === null) return setError(t('error.INVALID_AMOUNT'));
    setBusy(true);
    setError(null);
    try {
      await closeTicket(env, session, id, {
        expectedAmountCents: quote.amountCents,
        receivedCents,
      });
      afterWrite();
      router.replace(`/receipt/${id}`);
    } catch (err) {
      setError(errorText(err));
      if (err instanceof LocalError && err.code === 'CHARGE_CHANGED') afterWrite(); // reload quote
    } finally {
      setBusy(false);
    }
  };

  const vehicleCode = classes.find((c) => c.id === ticket?.vehicleClassId)?.code;

  return (
    <Screen
      tab="new"
      eyebrow={t('exit.eyebrow')}
      title={t('exit.title')}
      footer={
        quote ? (
          <Button
            label={t('exit.confirm')}
            icon="check"
            onPress={confirm}
            busy={busy}
            disabled={receivedCents === null || (change !== null && change < 0)}
          />
        ) : undefined
      }
    >
      {ticket ? (
        <Card style={styles.summary}>
          <VehicleBadge code={vehicleCode} />
          <View style={{ flex: 1 }}>
            <Text style={styles.plate}>{ticket.plate}</Text>
            <Text style={styles.serial} numberOfLines={1}>
              {ticket.serial}
            </Text>
          </View>
          <StatusPill status={ticket.status} />
        </Card>
      ) : null}

      {loadError ? <ErrorText>{loadError}</ErrorText> : null}

      {quote ? (
        <>
          <View>
            <Label>{t('exit.exitOn', { date: formatDiliDate(new Date(quote.exitAt)) })}</Label>
            <View style={styles.clock}>
              <Text style={styles.clockText}>{formatDiliTime(new Date(quote.exitAt))}</Text>
              <Feather name="clock" size={24} color={colors.muted} />
            </View>
          </View>

          <Card>
            <Row label={t('exit.entry')} value={formatDiliTime(new Date(quote.entryAt))} mono />
            <Row label={t('exit.timeParked')} value={formatDuration(quote.durationMinutes)} mono />
            <Divider />
            <Row
              label={t('exit.hoursCharged')}
              value={formatHours(locale, quote.hoursCharged)}
              strong
            />
            <Row
              label={t('exit.tariff')}
              value={t('unit.perHour', { amount: formatUsd(quote.tariffCentsPerHour) })}
              strong
            />
            <Row label={t('exit.paymentMethod')} value={t('payment.CASH')} strong />
          </Card>

          <View style={styles.total}>
            <View>
              <Text style={styles.totalLabel}>{t('exit.totalDue')}</Text>
              <Text style={styles.totalCalc}>
                {t('exit.hoursTimesTariff', {
                  hours: quote.hoursCharged,
                  tariff: formatUsd(quote.tariffCentsPerHour),
                })}
              </Text>
            </View>
            <Text style={styles.totalValue} adjustsFontSizeToFit numberOfLines={1}>
              {formatUsd(quote.amountCents)}
            </Text>
          </View>

          <View>
            <Label>{t('exit.received')}</Label>
            <View style={styles.receivedRow}>
              <TextInput
                value={received}
                onChangeText={setTyped}
                keyboardType="decimal-pad"
                style={styles.receivedInput}
                accessibilityLabel={t('exit.received')}
              />
              {change !== null && change > 0 ? (
                <Text style={styles.change}>
                  {t('exit.change')}: {formatUsd(change)}
                </Text>
              ) : null}
            </View>
            {change !== null && change < 0 ? (
              <ErrorText>{t('error.INSUFFICIENT_PAYMENT')}</ErrorText>
            ) : null}
          </View>

          {startedHourRule ? <InfoNote>{t('exit.ruleNote')}</InfoNote> : null}
        </>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  plate: { fontFamily: fonts.extrabold, fontSize: 21, color: colors.ink },
  serial: { fontFamily: fonts.mono, fontSize: 14, color: colors.blue, marginTop: 2 },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    borderRadius: sizes.radius,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
  },
  clockText: { fontFamily: fonts.mono, fontSize: 24, color: colors.ink },
  total: {
    backgroundColor: colors.yellow,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  totalLabel: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  totalCalc: { fontFamily: fonts.mono, fontSize: 15, color: colors.ink, marginTop: 4 },
  totalValue: { flexShrink: 1, fontFamily: fonts.extrabold, fontSize: 42, color: colors.ink },
  receivedRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  receivedInput: {
    flex: 1,
    minHeight: 60,
    borderRadius: sizes.radius,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    fontFamily: fonts.mono,
    fontSize: 22,
    color: colors.ink,
  },
  change: { fontFamily: fonts.bold, fontSize: 17, color: colors.green },
});
