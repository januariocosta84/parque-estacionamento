// Ask Google Play Services to download the ML Kit text-recognition model when the app is
// installed, not on the first plate reading, so reading works without signal (FR-29, NFR-01).
// https://developers.google.com/ml-kit/vision/text-recognition/v2/android (install-time download)
//
// expo-camera declares the same key for its barcode model ("barcode_ui"), which this app does not
// use (barcodeScannerEnabled: false), so our value replaces it in the merged manifest.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const KEY = 'com.google.mlkit.vision.DEPENDENCIES';

module.exports = function withMlKitOcrModel(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, KEY, 'ocr');
    const item = app['meta-data'].find((m) => m.$['android:name'] === KEY);
    item.$['tools:replace'] = 'android:value';
    return cfg;
  });
};
