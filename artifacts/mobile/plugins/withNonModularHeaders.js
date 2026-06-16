const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BUILD_SETTING = "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES";
const RNFB_STATIC_FLAG = "$RNFirebaseAsStaticFramework = true";

const INJECTION = `post_install do |installer|
    installer.pods_project.targets.each do |non_modular_target|
      non_modular_target.build_configurations.each do |non_modular_config|
        non_modular_config.build_settings['${BUILD_SETTING}'] = 'YES'
      end
    end`;

/**
 * React Native Firebase requires static frameworks on iOS (set via
 * expo-build-properties `ios.useFrameworks: "static"`). Two extra Podfile
 * tweaks are needed for the iOS build to compile:
 *
 * 1. `$RNFirebaseAsStaticFramework = true` — tells the RNFB pods to build as
 *    static frameworks, matching `use_frameworks! :linkage => :static`.
 *    Without it the App/Crashlytics modules fail to compile with
 *    "declaration of 'RCTBridgeModule' must be imported from module ... before
 *    it is required" plus a cascade of implicit-int / parse errors.
 * 2. `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES` — allows the
 *    RNFB framework modules to include non-modular React headers
 *    (-Werror,-Wnon-modular-include-in-framework-module).
 *
 * Both are applied to the generated Podfile during prebuild.
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
      let changed = false;

      if (!contents.includes(RNFB_STATIC_FLAG)) {
        contents = `${RNFB_STATIC_FLAG}\n${contents}`;
        changed = true;
      }

      if (!contents.includes(BUILD_SETTING)) {
        const marker = "post_install do |installer|";
        if (!contents.includes(marker)) {
          throw new Error(
            "[withNonModularHeaders] Could not find 'post_install do |installer|' in the Podfile."
          );
        }
        contents = contents.replace(marker, INJECTION);
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);
};

module.exports = withNonModularHeaders;
