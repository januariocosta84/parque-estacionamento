import { StyleSheet, Text, View } from 'react-native';
import { t } from '@estacionamento/shared';
import { colors } from '../src/theme';

// Placeholder until M6 (Entrar / Início).
export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.mark}>
        <Text style={styles.markText}>P</Text>
      </View>
      <Text style={styles.eyebrow}>{t('authorityName')}</Text>
      <Text style={styles.title}>{t('appName')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    padding: 24,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  markText: { fontSize: 28, fontWeight: '800', color: colors.ink },
  eyebrow: {
    color: colors.yellow,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { color: colors.surface, fontSize: 24, fontWeight: '800', marginTop: 4 },
});
