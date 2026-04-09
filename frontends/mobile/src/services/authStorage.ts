import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'keeperbma_mobile_access_token';
const REFRESH_TOKEN_KEY = 'keeperbma_mobile_refresh_token';
const LEGACY_ACCESS_TOKEN_KEY = 'keeperbma_mobile_token';

const secureStoreAvailable = async (): Promise<boolean> => {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
};

const readValue = async (key: string): Promise<string | null> => {
  if (await secureStoreAvailable()) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // Fall back to AsyncStorage.
    }
  }
  return AsyncStorage.getItem(key);
};

const writeValue = async (key: string, value: string): Promise<void> => {
  if (await secureStoreAvailable()) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // Fall back to AsyncStorage.
    }
  }
  await AsyncStorage.setItem(key, value);
};

const deleteValue = async (key: string): Promise<void> => {
  if (await secureStoreAvailable()) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Keep going so AsyncStorage fallback is also cleared.
    }
  }
  await AsyncStorage.removeItem(key);
};

export interface StoredAuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export const getStoredAuthTokens = async (): Promise<StoredAuthTokens> => {
  let accessToken = await readValue(ACCESS_TOKEN_KEY);
  const refreshToken = await readValue(REFRESH_TOKEN_KEY);

  if (!accessToken) {
    const legacyToken = await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);
    if (legacyToken) {
      accessToken = legacyToken;
      await writeValue(ACCESS_TOKEN_KEY, legacyToken);
      await AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    }
  }

  return { accessToken, refreshToken };
};

export const storeAuthTokens = async (accessToken: string, refreshToken?: string | null): Promise<void> => {
  await writeValue(ACCESS_TOKEN_KEY, accessToken);
  if (typeof refreshToken === 'string' && refreshToken.trim()) {
    await writeValue(REFRESH_TOKEN_KEY, refreshToken.trim());
  }
};

export const clearStoredAuthTokens = async (): Promise<void> => {
  await Promise.all([
    deleteValue(ACCESS_TOKEN_KEY),
    deleteValue(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY),
  ]);
};
