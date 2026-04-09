import axios from 'axios';
import { API_BASE_URL } from '../constants/config';
import { clearStoredAuthTokens, getStoredAuthTokens, storeAuthTokens } from './authStorage';
import {
  AccountRecord,
  AuthUser,
  BankAccountRecord,
  BankConnectionRecord,
  CategoryRecord,
  DailyBalanceRecord,
  PaymentRequiredInfo,
  TransactionRecord,
} from '../types/app';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
});

let currentAuthToken: string | null = null;
let sessionExpiredHandler: (() => Promise<void> | void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const setAuthToken = (token: string | null) => {
  currentAuthToken = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const getAuthToken = () => currentAuthToken;

export const setSessionExpiredHandler = (handler: (() => Promise<void> | void) | null) => {
  sessionExpiredHandler = handler;
};

export const getApiErrorInfo = (error: unknown): PaymentRequiredInfo => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    const detail = typeof data?.detail === 'string' ? data.detail : error.message;
    return {
      message: detail || 'Something went wrong.',
      status: error.response?.status,
      paymentRequired: Boolean(data?.payment_required),
      paymentUrl: typeof data?.payment_url === 'string' ? data.payment_url : null,
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: 'Something went wrong.' };
};

const notifySessionExpired = async () => {
  if (!sessionExpiredHandler) return;
  await sessionExpiredHandler();
};

const refreshAccessToken = async (): Promise<string | null> => {
  const { refreshToken } = await getStoredAuthTokens();
  if (!refreshToken) {
    throw new Error('Session expired');
  }
  const response = await api.post<AuthUser>(
    '/auth/refresh',
    { refresh_token: refreshToken },
    { headers: { 'X-Skip-Auth-Refresh': '1' } }
  );
  const nextAccessToken = response.data.token ?? null;
  const nextRefreshToken = response.data.refresh_token ?? refreshToken;
  if (!nextAccessToken) {
    throw new Error('Refresh response did not include an access token.');
  }
  await storeAuthTokens(nextAccessToken, nextRefreshToken);
  setAuthToken(nextAccessToken);
  return nextAccessToken;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const responseStatus = error.response?.status;
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const skipRefresh = String(originalRequest?.headers?.['X-Skip-Auth-Refresh'] ?? '') === '1';
    const requestUrl = String(originalRequest?.url ?? '');

    if (
      responseStatus !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      skipRefresh ||
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/recover/')
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken()
          .catch(async (refreshError) => {
            await clearStoredAuthTokens();
            setAuthToken(null);
            await notifySessionExpired();
            throw refreshError;
          })
          .finally(() => {
            refreshInFlight = null;
          });
      }

      const nextAccessToken = await refreshInFlight;
      if (nextAccessToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
      }
      return api(originalRequest);
    } catch {
      return Promise.reject(error);
    }
  }
);

export const authApi = {
  async login(name: string, password: string): Promise<AuthUser> {
    const response = await api.post<AuthUser>('/auth/login', {
      name,
      password,
      client: 'mobile',
    });
    return response.data;
  },
  async session(): Promise<AuthUser> {
    const response = await api.get<AuthUser>('/auth/session');
    return response.data;
  },
  async refresh(refreshToken: string): Promise<AuthUser> {
    const response = await api.post<AuthUser>(
      '/auth/refresh',
      { refresh_token: refreshToken },
      { headers: { 'X-Skip-Auth-Refresh': '1' } }
    );
    return response.data;
  },
  async logout(refreshToken?: string | null): Promise<void> {
    await api.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : {});
  },
  async createWebSession(destination: 'dashboard' | 'profile'): Promise<{ launch_url: string }> {
    const response = await api.post<{ launch_url: string }>('/auth/mobile-sso', { destination });
    return response.data;
  },
  async recoverRequest(email: string): Promise<{ ok: boolean; sent: boolean; expires_minutes: number }> {
    const response = await api.post('/auth/recover/request', { email });
    return response.data;
  },
  async recoverConfirm(email: string, code: string, newPassword: string): Promise<{ ok: boolean }> {
    const response = await api.post('/auth/recover/confirm', {
      email,
      code,
      new_password: newPassword,
    });
    return response.data;
  },
};

export const profileApi = {
  async get(): Promise<AuthUser> {
    const response = await api.get<AuthUser>('/profile');
    return response.data;
  },
  async update(payload: Record<string, unknown>): Promise<AuthUser> {
    const response = await api.put<AuthUser>('/profile', payload);
    return response.data;
  },
  async updatePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    const response = await api.put('/profile/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },
};

export const financeApi = {
  async getAccounts(userId: number): Promise<AccountRecord[]> {
    const response = await api.get<AccountRecord[]>('/accounts', { params: { user_id: userId } });
    return response.data;
  },
  async createAccount(payload: {
    user_id: number;
    account_name: string;
    account_type: string;
    group_name: string;
    balance: number;
  }): Promise<AccountRecord> {
    const response = await api.post<AccountRecord>('/accounts', payload);
    return response.data;
  },
  async getTransactions(userId: number): Promise<TransactionRecord[]> {
    const response = await api.get<TransactionRecord[]>('/transactions', { params: { user_id: userId } });
    return response.data;
  },
  async createTransaction(payload: {
    user_id: number;
    tx_type: string;
    amount: number;
    account_id: number;
    category: string;
    note?: string;
    date?: string | null;
  }): Promise<TransactionRecord> {
    const response = await api.post<TransactionRecord>('/transactions', payload);
    return response.data;
  },
  async getCategories(userId: number): Promise<CategoryRecord[]> {
    const response = await api.get<CategoryRecord[]>('/categories', { params: { user_id: userId } });
    return response.data;
  },
  async createCategory(payload: { user_id: number; category_name: string }): Promise<CategoryRecord> {
    const response = await api.post<CategoryRecord>('/categories', payload);
    return response.data;
  },
  async getDailyBalances(userId: number): Promise<DailyBalanceRecord[]> {
    const response = await api.get<DailyBalanceRecord[]>('/daily_balances', { params: { user_id: userId } });
    return response.data;
  },
  async getBankConnections(userId: number): Promise<BankConnectionRecord[]> {
    const response = await api.get<BankConnectionRecord[]>('/bank/connections', { params: { user_id: userId } });
    return response.data;
  },
  async getBankAccounts(userId: number): Promise<BankAccountRecord[]> {
    const response = await api.get<BankAccountRecord[]>('/bank/accounts', { params: { user_id: userId } });
    return response.data;
  },
  async transferAccounts(userId: number, fromAccountId: number, toAccountId: number, amount: number): Promise<{ ok: boolean }> {
    const response = await api.post<{ ok: boolean }>('/accounts/transfer', {
      user_id: userId,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      amount,
    });
    return response.data;
  },
};

export default api;
