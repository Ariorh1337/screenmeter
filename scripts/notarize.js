const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  console.log("Calling notarize");

  return await notarize({
    appBundleId: 'com.build80.screenmetertimer',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: "-REMOVED-",
    appleIdPassword: "-REMOVED-",
  });
};