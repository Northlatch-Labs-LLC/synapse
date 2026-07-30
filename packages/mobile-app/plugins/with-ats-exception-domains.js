// Local Expo config plugin: grants per-host App Transport Security exceptions
// so the iOS build can reach an http:// deploy.
//
// This has to run as a mod rather than as an `ios.infoPlist` entry in the app
// config: `ios.infoPlist` is SHALLOW-merged over the Info.plist, so declaring
// NSAppTransportSecurity there replaces the whole dictionary and silently drops
// the template's `NSAllowsLocalNetworking: true` / `NSAllowsArbitraryLoads:
// false`. Merging here — against the plist actually on disk — keeps them, along
// with any exception a prebuilt ios/ directory already carries.

const { withInfoPlist } = require("expo/config-plugins")

function withAtsExceptionDomains(config, { domains = [] } = {}) {
  if (domains.length === 0) return config

  return withInfoPlist(config, (modConfig) => {
    const ats = modConfig.modResults.NSAppTransportSecurity ?? {}
    modConfig.modResults.NSAppTransportSecurity = {
      ...ats,
      NSExceptionDomains: {
        ...ats.NSExceptionDomains,
        ...Object.fromEntries(
          domains.map((domain) => [
            domain,
            {
              ...ats.NSExceptionDomains?.[domain],
              NSExceptionAllowsInsecureHTTPLoads: true,
            },
          ])
        ),
      },
    }
    return modConfig
  })
}

module.exports = withAtsExceptionDomains
