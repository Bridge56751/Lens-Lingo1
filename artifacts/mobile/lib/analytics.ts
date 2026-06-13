// Web + non-native fallback.
//
// Firebase Analytics + Crashlytics are native-only (they require a custom dev or
// production build via `@react-native-firebase`). Metro automatically resolves
// `analytics.native.ts` on iOS/Android; this file is used on web and is also the
// TypeScript source of truth for the public API. Every export here is a no-op so
// calling analytics from shared code is always safe.

export function initAnalytics(): void {}

export function logEvent(_name: string, _params?: Record<string, unknown>): void {}

export function logScreenView(_screenName: string): void {}

export function recordError(_error: unknown, _context?: string): void {}

export function setAnalyticsUser(_id: string | null): void {}
