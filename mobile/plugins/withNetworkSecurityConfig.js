const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Copie network_security_config.xml dans res/xml/ et référence le fichier sur
// <application> : autorise le HTTP en clair uniquement pour api.gitingeniering.com
// (le backend n'a pas de HTTPS), sans affaiblir la politique par défaut pour le
// reste du système. Nécessaire car expo-build-properties@1.0.10 n'expose que
// l'option globale usesCleartextTraffic, pas de config par domaine.
function withNetworkSecurityConfig(config) {
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const src = path.join(config.modRequest.projectRoot, "network_security_config.xml");
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, "network_security_config.xml"));
      return config;
    },
  ]);

  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];
    application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return config;
  });

  return config;
}

module.exports = withNetworkSecurityConfig;
