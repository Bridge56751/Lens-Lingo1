import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useAuth, useSignIn, useSignUp, useSSO } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useLinkAccount } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { getDeviceIdSync } from "@/lib/device";
import { CLERK_ENABLED } from "@/lib/auth";

// Handle any pending OAuth sessions (Apple sign-in via system browser).
WebBrowser.maybeCompleteAuthSession();

type Mode = "signIn" | "signUp";

export default function AuthScreen() {
  // No Clerk key configured: the sign-in flow can't work, and this screen's
  // Clerk hooks would throw without a provider, so send the user back to the
  // app's default anonymous flow instead of mounting it.
  if (!CLERK_ENABLED) {
    return <Redirect href="/" />;
  }
  return <AuthScreenInner />;
}

function AuthScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();

  const { isSignedIn, getToken } = useAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const queryClient = useQueryClient();
  const linkAccount = useLinkAccount();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pendingVerify, setPendingVerify] = useState(false);
  const [resetStep, setResetStep] = useState<"none" | "request" | "verify">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warm up the browser on Android to speed up the OAuth handoff.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  // Once a session becomes active (via any path), carry the anonymous device's
  // data into the account, then close the modal.
  const startedRef = useRef(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  const runLink = useCallback(async () => {
    setLinking(true);
    setLinkError(false);

    const deviceId = getDeviceIdSync();
    if (!deviceId) {
      // No anonymous data to carry over — the account row is created server-side.
      close();
      return;
    }

    // The session token can lag the `isSignedIn` flip; wait briefly for it so
    // the auth-gated link endpoint doesn't 401 on a freshly-activated session.
    let token: string | null = null;
    for (let i = 0; i < 6; i++) {
      try {
        token = await getToken();
      } catch {
        token = null;
      }
      if (token) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!token) {
      setLinking(false);
      setLinkError(true);
      return;
    }

    try {
      await linkAccount.mutateAsync({ data: { deviceId } });
      // Account now owns the merged data — refresh every cached list.
      void queryClient.invalidateQueries();
      close();
    } catch {
      setLinking(false);
      setLinkError(true);
    }
  }, [close, getToken, linkAccount, queryClient]);

  useEffect(() => {
    if (!isSignedIn || startedRef.current) return;
    startedRef.current = true;
    void runLink();
  }, [isSignedIn, runLink]);

  const resetMessages = () => setError(null);

  const handleEmailSubmit = useCallback(async () => {
    if (busy) return;
    resetMessages();
    Haptics.selectionAsync();
    setBusy(true);
    try {
      if (mode === "signUp") {
        const { error: err } = await signUp.password({
          emailAddress: email.trim(),
          password,
        });
        if (err) {
          setError(err.message ?? t("auth.genericError"));
          return;
        }
        await signUp.verifications.sendEmailCode();
        setPendingVerify(true);
      } else {
        const { error: err } = await signIn.password({
          identifier: email.trim(),
          password,
        });
        if (err) {
          setError(err.message ?? t("auth.genericError"));
          return;
        }
        if (signIn.status === "complete") {
          await signIn.finalize({ navigate: () => {} });
        } else {
          setError(t("auth.genericError"));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }, [busy, mode, email, password, signUp, signIn, t]);

  const handleVerify = useCallback(async () => {
    if (busy) return;
    resetMessages();
    Haptics.selectionAsync();
    setBusy(true);
    try {
      await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: () => {} });
      } else {
        setError(t("auth.genericError"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }, [busy, code, signUp, t]);

  const handleApple = useCallback(async () => {
    if (busy) return;
    resetMessages();
    Haptics.selectionAsync();
    setBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_apple",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }, [busy, startSSOFlow, t]);

  const handleSendReset = useCallback(async () => {
    if (busy) return;
    resetMessages();
    Haptics.selectionAsync();
    setBusy(true);
    try {
      const { error: createErr } = await signIn.create({ identifier: email.trim() });
      if (createErr) {
        setError(createErr.message ?? t("auth.genericError"));
        return;
      }
      const { error: sendErr } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendErr) {
        setError(sendErr.message ?? t("auth.genericError"));
        return;
      }
      setCode("");
      setNewPassword("");
      setResetStep("verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }, [busy, email, signIn, t]);

  const handleResetSubmit = useCallback(async () => {
    if (busy) return;
    resetMessages();
    Haptics.selectionAsync();
    setBusy(true);
    try {
      const { error: verifyErr } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verifyErr) {
        setError(verifyErr.message ?? t("auth.genericError"));
        return;
      }
      if (signIn.status !== "needs_new_password") {
        setError(t("auth.genericError"));
        return;
      }
      const { error: submitErr } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
      if (submitErr) {
        setError(submitErr.message ?? t("auth.genericError"));
        return;
      }
      if ((signIn.status as string) === "complete") {
        await signIn.finalize({ navigate: () => {} });
      } else {
        setError(t("auth.genericError"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }, [busy, code, newPassword, signIn, t]);

  const handleResendReset = useCallback(async () => {
    if (busy) return;
    resetMessages();
    Haptics.selectionAsync();
    setBusy(true);
    try {
      const { error: sendErr } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendErr) {
        setError(sendErr.message ?? t("auth.genericError"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }, [busy, signIn, t]);

  const exitReset = useCallback(() => {
    resetMessages();
    setResetStep("none");
    setCode("");
    setNewPassword("");
  }, []);

  const topPadding = Platform.OS === "web" ? 16 : insets.top + 8;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  // Signed in: show the carry-over progress (or a retry on failure) instead of
  // the auth forms, so a transient link failure never silently drops device data.
  if (isSignedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding }]}>
          <View style={{ width: 40 }} />
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("auth.title")}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.completing}>
          {linkError ? (
            <>
              <Ionicons name="alert-circle" size={40} color="#DC2626" />
              <Text style={[styles.error, styles.completingText, { fontFamily: "Inter_500Medium" }]}>
                {t("auth.genericError")}
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.completingBtn, { backgroundColor: colors.primary }, linking && styles.disabled]}
                onPress={runLink}
                disabled={linking}
                activeOpacity={0.85}
              >
                {linking ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                    {t("auth.retry")}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={close} activeOpacity={0.7} style={styles.linkBtn}>
                <Text style={[styles.linkText, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {t("auth.continue")}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={[styles.helper, styles.completingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {t("auth.completing")}
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.iconBtn}
          activeOpacity={0.7}
          accessibilityLabel={t("auth.close")}
        >
          <Ionicons name="close" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("auth.title")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 22, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {resetStep !== "none" ? t("auth.resetSubtitle") : t("auth.subtitle")}
        </Text>

        {resetStep === "request" ? (
          <View style={{ gap: 14 }}>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {t("auth.resetTitle")}
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.emailLabel")}
              </Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={email}
                onChangeText={setEmail}
                placeholder={t("auth.emailPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
            {error ? (
              <Text style={[styles.error, { fontFamily: "Inter_500Medium" }]}>{error}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, (busy || email.trim().length === 0) && styles.disabled]}
              onPress={handleSendReset}
              disabled={busy || email.trim().length === 0}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                  {t("auth.sendResetCta")}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={exitReset} activeOpacity={0.7} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.backToSignIn")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : resetStep === "verify" ? (
          <View style={{ gap: 14 }}>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {t("auth.resetVerifyTitle")}
            </Text>
            <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("auth.resetVerifySubtitle", { email: email.trim() })}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={code}
              onChangeText={setCode}
              placeholder={t("auth.codePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              autoFocus
            />
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t("auth.newPasswordPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
            />
            {error ? (
              <Text style={[styles.error, { fontFamily: "Inter_500Medium" }]}>{error}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, (busy || code.trim().length === 0 || newPassword.length === 0) && styles.disabled]}
              onPress={handleResetSubmit}
              disabled={busy || code.trim().length === 0 || newPassword.length === 0}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                  {t("auth.resetCta")}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleResendReset} disabled={busy} activeOpacity={0.7} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.resendCode")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={exitReset} activeOpacity={0.7} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.backToSignIn")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : pendingVerify ? (
          <View style={{ gap: 14 }}>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {t("auth.verifyTitle")}
            </Text>
            <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("auth.verifySubtitle", { email: email.trim() })}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={code}
              onChangeText={setCode}
              placeholder={t("auth.codePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              autoFocus
            />
            {error ? (
              <Text style={[styles.error, { fontFamily: "Inter_500Medium" }]}>{error}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, busy && styles.disabled]}
              onPress={handleVerify}
              disabled={busy || code.trim().length === 0}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                  {t("auth.verifyCta")}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => signUp.verifications.sendEmailCode()}
              activeOpacity={0.7}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.resendCode")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Tab switcher */}
            <View style={[styles.tabs, { backgroundColor: colors.muted }]}>
              {(["signIn", "signUp"] as const).map((m) => {
                const active = mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.tab, active && { backgroundColor: colors.card }]}
                    onPress={() => {
                      setMode(m);
                      resetMessages();
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color: active ? colors.primary : colors.mutedForeground,
                          fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                        },
                      ]}
                    >
                      {m === "signIn" ? t("auth.signInTab") : t("auth.signUpTab")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.emailLabel")}
              </Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={email}
                onChangeText={setEmail}
                placeholder={t("auth.emailPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.passwordLabel")}
              </Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={password}
                onChangeText={setPassword}
                placeholder={t("auth.passwordPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
              />
            </View>

            {error ? (
              <Text style={[styles.error, { fontFamily: "Inter_500Medium" }]}>{error}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, !canSubmit && styles.disabled]}
              onPress={handleEmailSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                  {mode === "signIn" ? t("auth.signInCta") : t("auth.signUpCta")}
                </Text>
              )}
            </TouchableOpacity>

            {mode === "signIn" ? (
              <TouchableOpacity
                onPress={() => {
                  resetMessages();
                  Haptics.selectionAsync();
                  setResetStep("request");
                }}
                activeOpacity={0.7}
                style={styles.linkBtn}
              >
                <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  {t("auth.forgotPassword")}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Required for Clerk's bot sign-up protection. */}
            <View nativeID="clerk-captcha" />

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.orText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {t("auth.or")}
              </Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.appleBtn, busy && styles.disabled]}
              onPress={handleApple}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-apple" size={18} color="#FFFFFF" />
              <Text style={[styles.appleBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                {t("auth.appleCta")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 18 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: { fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  tabText: { fontSize: 14 },
  label: { fontSize: 13 },
  helper: { fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 15,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15 },
  disabled: { opacity: 0.5 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: 1 },
  orText: { fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  appleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000000",
    borderRadius: 12,
    paddingVertical: 15,
  },
  appleBtnText: { color: "#FFFFFF", fontSize: 15 },
  error: { color: "#DC2626", fontSize: 13 },
  linkBtn: { alignItems: "center", paddingVertical: 4 },
  linkText: { fontSize: 14 },
  completing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  completingText: { textAlign: "center", fontSize: 14, lineHeight: 20 },
  completingBtn: { alignSelf: "stretch" },
});
