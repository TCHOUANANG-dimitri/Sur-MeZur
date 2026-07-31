module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // three.js's build uses static class blocks; babel-preset-expo's target
    // (Hermes on older SDKs) doesn't parse that syntax without this plugin.
    plugins: ["@babel/plugin-transform-class-static-block"],
  };
};
