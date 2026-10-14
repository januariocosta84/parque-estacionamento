// Entrar — agent sign-in (FR-01–FR-03). Design: docs/screens/00-login-agente.png
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { locales } from '@estacionamento/shared';
import type { MessageKey } from '@estacionamento/shared';
import { useApp } from '../src/app-state';
import { knownAgentName } from '../src/auth';
import type { SignInResult } from '../src/auth';
import { Button, Header, InfoNote, Label } from '../src/components/ui';
import { colors, fonts, sizes } from '../src/theme';

const PIN_LENGTH = 6;

function errorText(
  t: ReturnType<typeof useApp>['t'],
  result: Extract<SignInResult, { ok: false }>,
): string {
  switch (result.reason) {
    case 'wrong_pin':
      return t('agentLogin.wrongPin', { remaining: result.remainingAttempts ?? '—' });
    case 'locked':
      return t('agentLogin.locked');
    case 'device_blocked':
      return t('blocked.text');
    case 'no_offline_profile':
      return t('agentLogin.noOfflineProfile');
    case 'invalid_pin_format':
      return t('agentLogin.invalidPin');
  }
}

export default function LoginScreen() {
  const { status, env, t, locale, setLocale, signIn } = useApp();
  const insets = useSafeAreaInsets();
  const [agentNumber, setAgentNumber] = useState('');
  const [pin, setPin] = useState('');
  const [knownName, setKnownName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinInput = useRef<TextInput>(null);

  useEffect(() => {
    if (!env) return;
    let live = true;
    void knownAgentName(env, agentNumber).then((name) => live && setKnownName(name));
    return () => {
      live = false;
    };
  }, [env, agentNumber]);

  if (status === 'signed-in') return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await signIn(agentNumber, pin);
    setBusy(false);
    if (!result.ok) {
      setError(errorText(t, result));
      setPin('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.ground }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          large
          eyebrow={t('authorityName')}
          title={t('appName')}
          subtitle={t('agentLogin.subtitle')}
        />

        <View style={styles.body}>
          <Label>{t('agentLogin.agentNumber')}</Label>
          <View style={styles.field}>
            <TextInput
              value={agentNumber}
              onChangeText={setAgentNumber}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="AMD-000"
              placeholderTextColor={colors.line}
              style={styles.agentInput}
              returnKeyType="next"
              onSubmitEditing={() => pinInput.current?.focus()}
              accessibilityLabel={t('agentLogin.agentNumber')}
            />
            {knownName ? <Text style={styles.knownName}>{knownName}</Text> : null}
          </View>

          <View style={{ height: 24 }} />
          <Label>{t('agentLogin.pin')}</Label>
          <Pressable style={styles.field} onPress={() => pinInput.current?.focus()}>
            <View style={styles.dots}>
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i < pin.length ? styles.dotFilled : styles.dotEmpty]}
                />
              ))}
            </View>
            <TextInput
              ref={pinInput}
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              secureTextEntry
              style={styles.hiddenInput}
              onSubmitEditing={submit}
              accessibilityLabel={t('agentLogin.pin')}
            />
          </Pressable>

          <View style={{ height: 24 }} />
          <Button
            label={busy ? t('agentLogin.signingIn') : t('agentLogin.submit')}
            icon="log-in"
            onPress={submit}
            busy={busy}
            disabled={agentNumber.trim() === '' || pin.length !== PIN_LENGTH}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.forgot}>{t('agentLogin.forgotPin')}</Text>

          <View style={{ flex: 1, minHeight: 32 }} />
          <InfoNote>{t('agentLogin.offlineNote')}</InfoNote>

          <View style={styles.languages}>
            {locales.map((l) => {
              const active = l === locale;
              return (
                <Pressable
                  key={l}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLocale(l)}
                  style={[styles.langPill, active ? styles.langActive : styles.langIdle]}
                >
                  <Text style={[styles.langText, { color: active ? colors.surface : colors.ink }]}>
                    {t(`language.${l}` as MessageKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  field: {
    minHeight: 64,
    borderRadius: sizes.radius,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentInput: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 22,
    color: colors.ink,
    paddingVertical: 14,
  },
  knownName: { fontFamily: fonts.bold, fontSize: 15, color: colors.green, marginLeft: 12 },
  dots: { flexDirection: 'row', gap: 18 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  dotFilled: { backgroundColor: colors.ink },
  dotEmpty: { borderWidth: 1.5, borderColor: colors.muted },
  hiddenInput: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0 },
  error: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.red,
    marginTop: 14,
    textAlign: 'center',
  },
  forgot: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.red,
    marginTop: 18,
    textAlign: 'center',
  },
  languages: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 20 },
  langPill: {
    minHeight: sizes.touch,
    paddingHorizontal: 24,
    borderRadius: 24,
    justifyContent: 'center',
  },
  langActive: { backgroundColor: colors.ink },
  langIdle: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  langText: { fontFamily: fonts.bold, fontSize: 16 },
});
