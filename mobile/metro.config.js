// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Le maillage de base de l'avatar (mobile/assets/avatar-base-*.glb) est
// chargé via `require()` + expo-asset, comme n'importe quelle image — mais
// Metro ne traite en "asset" que les extensions listées ici, et .glb n'en
// fait pas partie par défaut : sans cet ajout, `require("./avatar-base-
// male.glb")` échouerait au bundling.
config.resolver.assetExts.push("glb", "gltf");

module.exports = config;
