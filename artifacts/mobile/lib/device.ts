import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@linguascan/device-id/v1";

let cachedId: string | null = null;

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a stable per-device identifier, generating and persisting one on
 * first launch. Used to scope a customer's data before real authentication.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
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
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore write errors; id stays cached for this session
  }
  return id;
}

/**
 * Synchronously returns the device id if it has already been loaded
 * (via getOrCreateDeviceId at app start), otherwise null.
 */
export function getDeviceIdSync(): string | null {
  return cachedId;
}

/**
 * Discards the current device identity and provisions a brand-new one. Used
 * after account deletion so the live session continues as a fresh, empty
 * anonymous user instead of re-resolving the just-deleted customer row.
 */
export async function resetDeviceId(): Promise<string> {
  const id = generateUuid();
  cachedId = id;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore write errors; id stays cached for this session
  }
  return id;
}
