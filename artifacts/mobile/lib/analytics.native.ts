import Constants from "expo-constants";

// Firebase Analytics + Crashlytics live in native modules that only exist in a
// custom dev or production build. In Expo Go the native module is absent, so we
// must never `require` react-native-firebase there (it throws). On web Metro
// resolves `analytics.ts` (the no-op) instead of this file, so the heavy
// firebase JS SDK never enters the web bundle.
//
// Detection + lazy require + per-call try/catch together guarantee analytics can
// never crash the app, regardless of environment.
const isExpoGo = Constants.executionEnvironment === "storeClient";

type Mods = { analytics: any; crashlytics: any };

let mods: Mods | null = null;
let loadAttempted = false;

function load(): Mods | null {
  if (isExpoGo || loadAttempted) return mods;
  loadAttempted = true;
  try {
    // Lazy require so the module is only evaluated in a real native build.
    const analytics = require("@react-native-firebase/analytics");
    const crashlytics = require("@react-native-firebase/crashlytics");
    mods = { analytics, crashlytics };
  } catch {
    mods = null;
  }
  return mods;
}

export function initAnalytics(): void {
  const m = load();
  if (!m) return;
  try {
    const a = m.analytics.getAnalytics();
    const c = m.crashlytics.getCrashlytics();
    // Force collection on at runtime so it works even if the project's plist
    // shipped with analytics disabled by default.
    void m.analytics.setAnalyticsCollectionEnabled(a, true);
    void m.crashlytics.setCrashlyticsCollectionEnabled(c, true);
    void m.analytics.logAppOpen(a);
  } catch {}
}

export function logEvent(name: string, params?: Record<string, unknown>): void {
  const m = load();
  if (!m) return;
  try {
    void m.analytics.logEvent(m.analytics.getAnalytics(), name, params);
  } catch {}
}

export function logScreenView(screenName: string): void {
  const m = load();
  if (!m) return;
  try {
    void m.analytics.logScreenView(m.analytics.getAnalytics(), {
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch {}
}

export function recordError(error: unknown, context?: string): void {
  const m = load();
  if (!m) return;
  try {
    const c = m.crashlytics.getCrashlytics();
    if (context) m.crashlytics.log(c, context);
    const err = error instanceof Error ? error : new Error(String(error));
    m.crashlytics.recordError(c, err);
  } catch {}
}

export function setAnalyticsUser(id: string | null): void {
  const m = load();
  if (!m) return;
  try {
    void m.analytics.setUserId(m.analytics.getAnalytics(), id);
    if (id) void m.crashlytics.setUserId(m.crashlytics.getCrashlytics(), id);
  } catch {}
}
