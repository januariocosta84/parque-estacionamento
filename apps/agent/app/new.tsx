// Novo título — issue a ticket (FR-06, FR-07). Design: docs/screens/02-novo-titulo.png
// Date, entry time and agent are shown, never typed (BR-09, FR-07).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatDiliDate, formatDiliTime, formatUsd, tariffInForce } from '@estacionamento/shared';
import { useApp } from '../src/app-state';
import { Card, ErrorText, Row, Screen, SyncNote, vehicleIconName } from '../src/components/kit';
import { Button, InfoNote, Label } from '../src/components/ui';
import { useErrorText, useLocalData, useNow, useVehicleClasses } from '../src/hooks';
import { getMyAreas, getTariffs } from '../src/local/reference';
import { issueTicket } from '../src/local/tickets';
import { colors, fonts, sizes } from '../src/theme';

export default function NewTicket() {
  const { t, env, session, afterWrite } = useApp();
  const errorText = useErrorText();
  const now = useNow();
  const classes = useVehicleClasses().filter((c) => c.active);
  const [plate, setPlate] = useState('');
  const [chosenClassId, setClassId] = useState<string | null>(null);
  const [chosenAreaId, setAreaId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areas = useLocalData((e, s) => getMyAreas(e.db, s.user.areaIds)) ?? [];
  // Until the agent picks, use the first vehicle type and the only area.
  const classId = chosenClassId ?? classes[0]?.id ?? null;
  const areaId = chosenAreaId ?? (areas.length === 1 ? areas[0]!.id : null);

  const tariffs =
    useLocalData((e) => (classId ? getTariffs(e.db, classId) : Promise.resolve([])), [classId]) ??
    [];
  const tariff = classId ? tariffInForce(tariffs, classId, now) : undefined;

  const submit = async () => {
    if (!env || !session || !classId) return;
    if (plate.trim() === '') return setError(t('error.PLATE_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      const ticket = await issueTicket(env, session, {
        plate,
        vehicleClassId: classId,
        ...(areaId ? { areaId } : {}),
      });
      afterWrite();
      setPlate('');
      router.push(`/ticket/${ticket.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      tab="new"
      eyebrow={t('newTicket.eyebrow')}
      title={t('newTicket.title')}
      footer={
        <View style={{ gap: 10 }}>
          <Text style={styles.copies}>{t('newTicket.copiesCount')}</Text>
          <Button
            label={t('newTicket.submit')}
            icon="file-plus"
            onPress={submit}
            busy={busy}
            disabled={!classId}
          />
        </View>
      }
    >
      <Text style={styles.intro}>{t('newTicket.intro')}</Text>

      <View>
        <Label>{t('newTicket.plate')}</Label>
        <View style={styles.plateBox}>
          <TextInput
            value={plate}
            onChangeText={(v) => setPlate(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="A-0000-TL"
            placeholderTextColor={colors.line}
            style={styles.plateInput}
            accessibilityLabel={t('newTicket.plate')}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          <MaterialCommunityIcons name="form-textbox" size={24} color={colors.muted} />
        </View>
      </View>

      <View>
        <Label>{t('newTicket.vehicleType')}</Label>
        <View style={styles.types}>
          {classes.map((c) => {
            const on = c.id === classId;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setClassId(c.id)}
                style={[styles.type, on && styles.typeOn]}
              >
                <MaterialCommunityIcons
                  name={vehicleIconName(c.code)}
                  size={28}
                  color={on ? colors.red : colors.muted}
                />
                <Text style={[styles.typeText, on && { color: colors.red }]} numberOfLines={2}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {areas.length > 1 ? (
        <View>
          <Label>{t('newTicket.area')}</Label>
          <View style={styles.types}>
            {areas.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: a.id === areaId }}
                onPress={() => setAreaId(a.id)}
                style={[styles.type, styles.area, a.id === areaId && styles.typeOn]}
              >
                <Text style={[styles.typeText, a.id === areaId && { color: colors.red }]}>
                  {a.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>{t('newTicket.issueData')}</Text>
        <Row label={t('newTicket.date')} value={formatDiliDate(now)} mono />
        <Row label={t('newTicket.entryTime')} value={formatDiliTime(now)} mono />
        <Row
          label={t('newTicket.agent')}
          value={`${session?.user.name ?? ''} · ${session?.user.agentNumber ?? ''}`}
          strong
        />
      </Card>

      {tariff ? (
        <InfoNote>{t('newTicket.tariffNote', { amount: formatUsd(tariff.centsPerHour) })}</InfoNote>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <SyncNote />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24, color: colors.muted },
  plateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    borderRadius: sizes.radius,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
  },
  plateInput: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 24,
    color: colors.ink,
    paddingVertical: 12,
  },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  type: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 96,
    borderRadius: sizes.radius,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
  },
  area: { minHeight: sizes.touch + 8 },
  typeOn: { backgroundColor: colors.redSoft, borderColor: colors.red, borderWidth: 2 },
  typeText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.muted, textAlign: 'center' },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink, marginBottom: 6 },
  copies: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: 'center' },
});
