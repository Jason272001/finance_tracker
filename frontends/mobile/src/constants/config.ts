import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const API_BASE_URL = extra.apiBaseUrl ?? 'https://api.keeperbma.com';
export const WEB_BASE_URL = extra.webBaseUrl ?? 'https://keeperbma.com';
