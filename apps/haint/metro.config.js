const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Monorepo setup per docs.expo.dev/guides/monorepos — Metro needs to watch
// the workspace root (to see changes in @boneyard/skeleton-ui) and to look
// up node_modules at the workspace root too, not just this app's own.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
