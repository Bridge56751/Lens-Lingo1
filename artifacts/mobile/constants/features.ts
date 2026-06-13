// Mobile feature flags.

// Controls whether the email sign-in UI is reachable. When false, the app ships
// with no way to reach the sign-in/sign-up screen, so users stay on the
// anonymous device-id flow. The entire auth architecture (Clerk provider,
// auth screen, account linking, server identity resolution) stays in place and
// dormant — flip this to true to re-enable email sign-in in the UI with no
// other code changes. An already-signed-in session still shows sign-out so a
// pre-existing user is never trapped.
export const AUTH_UI_ENABLED = false;
