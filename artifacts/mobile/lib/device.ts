import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const DEVICE_ID_STORAGE_KEY = "@linguascan/device-id/v1";

// SecureStore keys may only contain alphanumerics, ".", "-", and "_", so the
// AsyncStorage key (with "@" and "/") is invalid there — the encrypted store
// uses its own sanitized key. DEVICE_ID_STORAGE_KEY stays the AsyncStorage key:
// it is the legacy migration source and the exclusion key in settings.tsx.
const SECURE_DEVICE_ID_KEY = "linguascan_device_id_v1";

// expo-secure-store is native-only and throws on web, so the web preview falls
// back to AsyncStorage (without this, web would mint a new id every reload).
const isWeb = Platform.OS === "web";

let cachedId: string | null = null;

function generateUuid(): string {
  return Crypto.randomUUID();
}

/**
 * Web persistence path: SecureStore is unavailable, so behave exactly as the
 * original AsyncStorage implementation did.
 */
async function getOrCreateWeb(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      cachedId = existing;
      return existing;
    }
  } catch {
    // ignore read errors, fall through to generate
  }
  const id = generateUuid();
  cachedId = id;
  try {
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  } catch {
    // ignore write errors; id stays cached for this session
  }
  return id;
}

/**
 * Native persistence path: read from the encrypted store, migrating any legacy
 * AsyncStorage id on first launch.
 *
 * The device id is the sole identity token for anonymous users, so this must
 * never lose or replace an existing id. The key safety rule: a SecureStore READ
 * failure (vs. a successful read that returns null) means an id may exist but is
 * temporarily unreadable — in that case we must NOT persist a freshly generated
 * id, or we would clobber the real one and orphan the user's server-side data.
 */
async function getOrCreateNative(): Promise<string> {
  // 1. Try the encrypted store. Distinguish "read ok but empty" from "read failed".
  let secureReadOk = false;
  try {
    const secure = await SecureStore.getItemAsync(SECURE_DEVICE_ID_KEY);
    secureReadOk = true;
    if (secure) {
      cachedId = secure;
      return secure;
    }
  } catch {
    secureReadOk = false;
  }

  // 2. One-time migration: look for a legacy id in plain AsyncStorage.
  let legacy: string | null = null;
  try {
    legacy = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    legacy = null;
  }

  if (legacy) {
    cachedId = legacy;
    // Only migrate into SecureStore when it is healthy; otherwise keep using the
    // legacy id and retry the migration on a future launch. SecureStore is
    // written before the AsyncStorage delete so a failed write leaves the legacy
    // copy intact.
    if (secureReadOk) {
      try {
        await SecureStore.setItemAsync(SECURE_DEVICE_ID_KEY, legacy);
        await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY);
      } catch {
        // best-effort migration; keep using the legacy id regardless
      }
    }
    return legacy;
  }

  // 3. No id found anywhere. Generate one.
  const id = generateUuid();
  cachedId = id;
  // Persist only when SecureStore is known-readable. If the read failed, treat
  // this id as session-only so a transient failure can't overwrite an existing
  // (but momentarily unreadable) secure id; a later successful launch will read
  // the real id or persist a fresh one.
  if (secureReadOk) {
    try {
      await SecureStore.setItemAsync(SECURE_DEVICE_ID_KEY, id);
    } catch {
      // ignore write errors; id stays cached for this session
    }
  }
  return id;
}

/**
 * Returns a stable per-device identifier, generating and persisting one on
 * first launch. Used to scope a customer's data before real authentication.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  return isWeb ? getOrCreateWeb() : getOrCreateNative();
}

/**
 * Synchronously returns the device id if it has already been loaded
 * (via getOrCreateDeviceId at app start), otherwise null.
 */
export function getDeviceIdSync(): string | null {
  return cachedId;
}
