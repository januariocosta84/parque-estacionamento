// Ask Google Play Services to download the ML Kit text-recognition model when the app is
// installed, not on the first plate reading, so reading works without signal (FR-29, NFR-01).
// https://developers.google.com/ml-kit/vision/text-recognition/v2/android (install-time download)
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withMlKitOcrModel(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      'com.google.mlkit.vision.DEPENDENCIES',
      'ocr',
    );
    return cfg;
  });
};
