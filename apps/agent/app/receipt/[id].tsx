// Pagamento recebido — receipt; the ticket is closed (FR-16, FR-17).
// Design: docs/screens/05-pagamento-recebido.png
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Share, StyleSheet, Text, View } from 'react-native';
import { formatDiliDate, formatDiliTime, formatUsd } from '@estacionamento/shared';
import { useApp } from '../../src/app-state';
import { Card, Divider, ErrorText, Row, Screen, StatusPill } from '../../src/components/kit';
import { Button } from '../../src/components/ui';
import { useLocalData, useVehicleClasses } from '../../src/hooks';
import { getReceipt } from '../../src/local/tickets';
import { receiptShareText } from '../../src/receipt-share';
import { colors, fonts } from '../../src/theme';

export default function ReceiptScreen() {
  const { t } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const receipt = useLocalData((env, s) => getReceipt(env.db, s, id), [id]);
  const classes = useVehicleClasses();

  const vehicle = receipt ? classes.find((c) => c.id === receipt.vehicleClassId)?.name : undefined;

  // The driver may want a copy: the share sheet offers WhatsApp, SMS, … (works offline).
  const share = () => {
    if (!receipt) return;
    const message = receiptShareText(receipt, vehicle, t);
    Share.share({ message, title: t('receipt.heading') }).catch(() => undefined);
  };

  const footer = (
    <View style={{ gap: 10 }}>
      {receipt ? <Button label={t('receipt.share')} icon="share-2" onPress={share} /> : null}
      <Button
        label={t('receipt.backHome')}
        icon="home"
        variant="dark"
        onPress={() => router.navigate('/home')}
      />
    </View>
  );

  if (receipt === undefined)
    return (
      <Screen tab="new" eyebrow={t('receipt.eyebrow')} title={t('receipt.title')}>
        {null}
      </Screen>
    );
  if (receipt === null) {
    return (
      <Screen tab="new" eyebrow={t('receipt.eyebrow')} title={t('receipt.title')} footer={footer}>
        <ErrorText>{t('error.NOT_FOUND')}</ErrorText>
      </Screen>
    );
  }

  const entry = new Date(receipt.entryAt);
  const exit = new Date(receipt.exitAt);

  return (
    <Screen tab="new" eyebrow={t('receipt.eyebrow')} title={t('receipt.title')} footer={footer}>
      <View style={styles.paid}>
        <View style={styles.check}>
          <Feather name="check" size={36} color={colors.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.amount}>{formatUsd(receipt.amountCents)}</Text>
          <Text style={styles.closed}>{t('receipt.receivedClosed')}</Text>
        </View>
      </View>

      <Card>
        <View style={styles.headRow}>
          <Text style={styles.heading}>{t('receipt.heading')}</Text>
          <StatusPill status="PAGO" />
        </View>
        <Text style={styles.serial}>{receipt.serial}</Text>
        <Text style={styles.plate}>
          {receipt.plate}
          {vehicle ? ` · ${vehicle}` : ''}
        </Text>
        <View style={{ height: 10 }} />
        <Divider dashed />
        <Row label={t('receipt.date')} value={formatDiliDate(exit)} mono />
        <Row
          label={t('receipt.entryExit')}
          value={`${formatDiliTime(entry)} / ${formatDiliTime(exit)}`}
          mono
        />
        <Row
          label={t('receipt.hoursCharged')}
          value={`${receipt.hoursCharged} h · ${formatUsd(receipt.tariffCentsPerHour)}/h`}
          strong
        />
        <Row label={t('receipt.method')} value={t('payment.CASH')} strong />
        <Row
          label={t('receipt.amountReceived')}
          value={`${formatUsd(receipt.receivedCents)} USD`}
          strong
        />
        {receipt.changeCents > 0 ? (
          <Row label={t('receipt.change')} value={`${formatUsd(receipt.changeCents)} USD`} strong />
        ) : null}
        <Divider />
        <Row
          label={t('receipt.agent')}
          value={`${receipt.agent.name} · ${receipt.agent.agentNumber ?? ''}`}
          strong
        />
        <Text style={styles.registered}>
          {t('receipt.registeredAt', { time: formatDiliTime(exit) })}
        </Text>
        <Text style={styles.refs}>
          {receipt.paymentRef} · {receipt.receiptNo}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  paid: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  check: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: { fontFamily: fonts.extrabold, fontSize: 42, color: colors.green },
  closed: { fontFamily: fonts.semibold, fontSize: 16, color: colors.green, marginTop: 2 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontFamily: fonts.extrabold, fontSize: 21, color: colors.ink },
  serial: { fontFamily: fonts.mono, fontSize: 20, color: colors.blue, marginTop: 12 },
  plate: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, marginTop: 4 },
  registered: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: 8 },
  refs: { fontFamily: fonts.mono, fontSize: 14, color: colors.blue, marginTop: 6 },
});
