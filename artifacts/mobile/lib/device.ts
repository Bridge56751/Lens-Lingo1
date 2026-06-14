import AsyncStorage from "@react-native-async-storage/async-storage";

export const DEVICE_ID_STORAGE_KEY = "@linguascan/device-id/v1";

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
 * Synchronously returns the device id if it has already been loaded
 * (via getOrCreateDeviceId at app start), otherwise null.
 */
export function getDeviceIdSync(): string | null {
  return cachedId;
}
