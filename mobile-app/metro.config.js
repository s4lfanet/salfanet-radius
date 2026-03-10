// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Fix for Windows: @expo/cli embeds the absolute Windows path in the manifest
// bundleUrl (drive letter stripped, forward slashes), e.g.:
//   http://10.0.2.2:8081/Users/yanz/.../mobile-app/node_modules/expo-router/entry.bundle
// Metro strips the leading "/" and tries to resolve the path relative to the
// project root → file-not-found (500).
// We rewrite the URL to strip that absolute prefix so Metro resolves it normally.
const projectPosix = __dirname.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
// e.g. "/Users/yanz/Downloads/salfanet-radius-main/mobile-app"

config.server = {
  ...config.server,
  rewriteRequestUrl: (url) => {
    const prefix = projectPosix + '/';
    const idx = url.indexOf(prefix);
    if (idx !== -1) {
      return url.slice(0, idx) + '/' + url.slice(idx + prefix.length);
    }
    return url;
  },
};

module.exports = config;
