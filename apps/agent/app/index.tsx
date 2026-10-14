// Entry: routes to sign-in or shows the signed-in placeholder until the Início screen (M6).
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { formatDiliTime } from '@estacionamento/shared';
import { useApp } from '../src/app-state';
import { Button, Header, InfoNote } from '../src/components/ui';
import { colors, fonts } from '../src/theme';

function SyncLine() {
  const { t, sync } = useApp();
  const lines: string[] = [];
  if (sync.state === 'offline') lines.push(t('sync.offline'));
  if (sync.state === 'auth-required') lines.push(t('sync.authRequired'));
  lines.push(
    sync.lastSyncAt
      ? t('sync.done', { time: formatDiliTime(new Date(sync.lastSyncAt)) })
      : t('sync.never'),
  );
  if (sync.queued > 0) lines.push(t('sync.queued', { count: sync.queued }));
  if (sync.rejected > 0) lines.push(t('sync.rejected', { count: sync.rejected }));
  return (
    <>
      {lines.map((line) => (
        <Text key={line} style={styles.sync}>
          {line}
        </Text>
      ))}
    </>
  );
}

export default function Index() {
  const { status, session, t, signOut, syncNow } = useApp();

  if (status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.ink }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }
  if (status === 'blocked') {
    return (
      <View style={{ flex: 1 }}>
        <Header large eyebrow={t('authorityName')} title={t('blocked.title')} />
        <View style={styles.body}>
          <InfoNote>{t('blocked.text')}</InfoNote>
        </View>
      </View>
    );
  }
  if (status === 'signed-out' || !session) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1 }}>
      <Header eyebrow={t('authorityName')} title={t('appName')} />
      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.name}>{session.user.name}</Text>
          <Text style={styles.agent}>{session.user.agentNumber}</Text>
          <View style={{ height: 12 }} />
          <SyncLine />
        </View>
        <Button
          label={t('sync.now')}
          icon="refresh-cw"
          variant="dark"
          onPress={() => void syncNow()}
        />
        <Button label={t('home.signOut')} icon="log-out" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 24, gap: 16 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 20 },
  name: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.ink },
  agent: { fontFamily: fonts.mono, fontSize: 16, color: colors.muted, marginTop: 2 },
  sync: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: 4 },
});
