// Read the plate with the camera (FR-29). Recognition runs on the phone (ML Kit on Android, Apple
// Vision on iOS), so it works offline. The photo is deleted as soon as it has been read; the agent
// always checks the plate before issuing.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { extractTextFromImage, isSupported } from 'expo-text-extractor';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { plateCandidates } from '@estacionamento/shared';
import { useApp } from '../app-state';
import { colors, fonts, sizes } from '../theme';
import { Button } from './ui';

export const plateScanSupported = Platform.OS !== 'web' && isSupported;

/** The Android recogniser wants a plain path, not a file:// URI; iOS wants the URI. */
const recogniserPath = (uri: string) =>
  Platform.OS === 'android' ? decodeURI(uri.replace(/^file:\/\//, '')) : uri;

export function PlateScanner({
  visible,
  onClose,
  onResult,
}: {
  visible: boolean;
  onClose(): void;
  /** Likely plates, best first; never empty. */
  onResult(candidates: string[]): void;
}) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const close = () => {
    setMessage(null);
    onClose();
  };

  const capture = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setMessage(null);
    let uri: string | null = null;
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      uri = photo.uri;
      const candidates = plateCandidates(await extractTextFromImage(recogniserPath(uri)));
      if (candidates.length === 0) {
        setMessage(t('scan.none'));
      } else {
        setMessage(null);
        onResult(candidates);
      }
    } catch {
      setMessage(t('scan.failed'));
    } finally {
      if (uri) {
        try {
          new File(uri).delete();
        } catch {
          // Already gone; it is in the app's cache, which the system clears anyway.
        }
      }
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.root}>
        {permission?.granted ? (
          <View style={styles.cameraBox}>
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.hint}>{t('scan.hint')}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.cameraBox, styles.ask]}>
            <Text style={styles.hint}>{t('scan.permission')}</Text>
            {permission === null || permission.canAskAgain ? (
              <Button
                label={t('scan.allow')}
                icon="camera"
                onPress={() => void requestPermission()}
              />
            ) : null}
          </View>
        )}

        <View style={[styles.bar, { paddingBottom: 20 + insets.bottom }]}>
          {busy ? (
            <View style={styles.reading}>
              <ActivityIndicator color={colors.yellow} />
              <Text style={styles.barText}>{t('scan.reading')}</Text>
            </View>
          ) : message ? (
            <Text style={styles.barText}>{message}</Text>
          ) : null}
          {permission?.granted ? (
            <Button
              label={t('scan.capture')}
              icon="camera"
              onPress={() => void capture()}
              busy={busy}
            />
          ) : null}
          <Pressable accessibilityRole="button" onPress={close} style={styles.cancel}>
            <Text style={styles.cancelText}>{t('scan.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  cancel: { minHeight: sizes.touch, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bold, fontSize: 18, color: colors.surface },
  cameraBox: { flex: 1, overflow: 'hidden' },
  ask: { alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: '82%',
    aspectRatio: 2.4,
    borderWidth: 3,
    borderColor: colors.yellow,
    borderRadius: sizes.radius,
  },
  hint: {
    marginTop: 16,
    fontFamily: fonts.semibold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.surface,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  bar: { padding: 20, gap: 12 },
  reading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  barText: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.surface,
    textAlign: 'center',
  },
});
