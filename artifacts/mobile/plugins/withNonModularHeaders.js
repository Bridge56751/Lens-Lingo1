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
 * React Native Firebase requires static frameworks on iOS. Under static
 * frameworks the RNFB pods include non-modular React headers, which Xcode
 * treats as an error (-Werror,-Wnon-modular-include-in-framework-module).
 * This plugin patches the generated Podfile's post_install hook to allow
 * those includes so the iOS build succeeds.
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
