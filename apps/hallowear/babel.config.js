module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-reanimated v4 moved its babel transform into
    // react-native-worklets — must be listed last.
    plugins: ["react-native-worklets/plugin"],
  };
};
