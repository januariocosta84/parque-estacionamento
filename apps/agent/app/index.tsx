// Entry: loading, blocked phone, or on to sign-in / Início.
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useApp } from '../src/app-state';
import { Header, InfoNote } from '../src/components/ui';
import { colors } from '../src/theme';

export default function Index() {
  const { status, t } = useApp();

  if (status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.ink }]}>
        <ActivityIndicator color={colors.yellow} size="large" />
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
});
