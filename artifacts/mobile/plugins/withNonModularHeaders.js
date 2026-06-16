const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BUILD_SETTING = "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES";

const INJECTION = `post_install do |installer|
    installer.pods_project.targets.each do |non_modular_target|
      non_modular_target.build_configurations.each do |non_modular_config|
        non_modular_config.build_settings['${BUILD_SETTING}'] = 'YES'
      end
    end`;

/**
 * Safety net for the iOS static-frameworks build (expo-build-properties
 * `ios.useFrameworks: "static"`).
 *
 * The real fix for the RNFirebase build failures lives in app.json:
 * `ios.forceStaticLinking: ["RNFBApp", "RNFBAnalytics", "RNFBCrashlytics"]`
 * builds those pods as plain static LIBRARIES (no framework module), which is
 * what resolves both the "non-modular header inside framework module" error
 * and the "declaration of 'RCTBridgeModule' must be imported from module
 * 'RNFBApp.RNFBAppModule' before it is required" error. (Note: RNFirebase's
 * `$RNFirebaseAsStaticFramework = true` does NOT help — it keeps the pods as
 * static FRAMEWORKS, i.e. still framework modules, which re-triggers the error.)
 *
 * This plugin only adds a defensive `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES`
 * to every Pods target's post_install so any OTHER framework pod that includes
 * a non-modular React header doesn't fail the build. Idempotent; fails loudly
 * if the post_install marker is missing.
 */
const withNonModularHeaders = (config) => {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      let contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes(BUILD_SETTING)) {
        return config;
      }

      const marker = "post_install do |installer|";
      if (!contents.includes(marker)) {
        throw new Error(
          "[withNonModularHeaders] Could not find 'post_install do |installer|' in the Podfile."
        );
      }

      contents = contents.replace(marker, INJECTION);
      fs.writeFileSync(podfilePath, contents);

      return config;
    },
  ]);
};

module.exports = withNonModularHeaders;
