// Entry: loading, start-up error, blocked phone, or on to sign-in / Início.
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../src/app-state';
import { Button, Header, InfoNote } from '../src/components/ui';
import { colors, fonts } from '../src/theme';

export default function Index() {
  const { status, startError, retryStart, t } = useApp();

  if (status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.ink }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <Header large eyebrow={t('authorityName')} title={t('startup.title')} />
        <View style={{ padding: 24, gap: 16 }}>
          <InfoNote>{t('startup.text')}</InfoNote>
          <Text selectable style={styles.detail}>
            {startError}
          </Text>
          <Button label={t('startup.retry')} onPress={retryStart} />
        </View>
      </View>
    );
  }
  if (status === 'blocked') {
    // FR-05: locked, data kept (docs/DECISIONS.md).
    return (
      <View style={{ flex: 1 }}>
        <Header large eyebrow={t('authorityName')} title={t('blocked.title')} />
        <View style={{ padding: 24 }}>
          <InfoNote>{t('blocked.text')}</InfoNote>
        </View>
      </View>
    );
  }
  return <Redirect href={status === 'signed-in' ? '/home' : '/login'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  detail: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
});
