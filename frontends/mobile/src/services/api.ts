import axios from 'axios';
import { API_BASE_URL } from '../constants/config';
import {
  AccountRecord,
  AuthUser,
  BankAccountRecord,
  BankConnectionRecord,
  BusinessEmployeeRecord,
  BusinessListResponse,
  BusinessRecord,
  CategoryRecord,
  DailyBalanceRecord,
  PaymentRequiredInfo,
  SupportChatMessageRecord,
  SupportChatResponse,
  TransactionRecord,
} from '../types/app';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
});

export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
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

export const authApi = {
  async login(name: string, password: string): Promise<AuthUser> {
    const response = await api.post<AuthUser>('/auth/login', { name, password });
    return response.data;
  },
  async session(): Promise<AuthUser> {
    const response = await api.get<AuthUser>('/auth/session');
    return response.data;
  },
  async logout(): Promise<void> {
    await api.post('/auth/logout');
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
  async transferAccounts(
    userId: number,
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    note?: string,
    date?: string | null
  ): Promise<{ ok: boolean }> {
    const response = await api.post<{ ok: boolean }>('/accounts/transfer', {
      user_id: userId,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      amount,
      note,
      date,
    });
    return response.data;
  },
};

export const supportApi = {
  async chat(payload: {
    user_id: number;
    message: string;
    surface?: 'mobile' | 'web';
    history?: SupportChatMessageRecord[];
  }): Promise<SupportChatResponse> {
    const response = await api.post<SupportChatResponse>('/support/chat', {
      user_id: payload.user_id,
      message: payload.message,
      surface: payload.surface ?? 'mobile',
      history: payload.history ?? [],
    });
    return response.data;
  },
};

export const businessApi = {
  async getBusinesses(userId: number): Promise<BusinessListResponse> {
    const response = await api.get<BusinessListResponse>('/businesses', { params: { user_id: userId } });
    return response.data;
  },
  async getBusiness(businessId: number, userId: number): Promise<{ ok: boolean; business: BusinessRecord }> {
    const response = await api.get<{ ok: boolean; business: BusinessRecord }>(`/businesses/${businessId}`, {
      params: { user_id: userId },
    });
    return response.data;
  },
  async createBusiness(payload: {
    user_id: number;
    business_name: string;
    business_type?: string;
    industry?: string;
    page_slug?: string;
    website_slug?: string;
    about_text?: string;
    phone?: string;
    email?: string;
    address?: string;
    logo_url?: string;
    cover_url?: string;
    page_enabled?: boolean;
    website_enabled?: boolean;
  }): Promise<{ ok: boolean; business: BusinessRecord }> {
    const response = await api.post<{ ok: boolean; business: BusinessRecord }>('/businesses', payload);
    return response.data;
  },
  async updateBusiness(
    businessId: number,
    payload: {
      user_id: number;
      business_name?: string;
      business_type?: string;
      industry?: string;
      page_slug?: string;
      website_slug?: string;
      about_text?: string;
      phone?: string;
      email?: string;
      address?: string;
      logo_url?: string;
      cover_url?: string;
      page_enabled?: boolean;
      website_enabled?: boolean;
    }
  ): Promise<{ ok: boolean; business: BusinessRecord }> {
    const response = await api.put<{ ok: boolean; business: BusinessRecord }>(`/businesses/${businessId}`, payload);
    return response.data;
  },
  async getEmployees(
    businessId: number,
    userId: number
  ): Promise<{ ok: boolean; business: BusinessRecord; items: BusinessEmployeeRecord[] }> {
    const response = await api.get<{ ok: boolean; business: BusinessRecord; items: BusinessEmployeeRecord[] }>(
      `/businesses/${businessId}/employees`,
      { params: { user_id: userId } }
    );
    return response.data;
  },
  async createEmployee(
    businessId: number,
    payload: {
      user_id: number;
      employee_name: string;
      email?: string;
      phone?: string;
      role_code: string;
      status?: string;
      linked_user_id?: number | null;
      can_sales?: boolean;
      can_purchase?: boolean;
      can_inventory?: boolean;
      can_reports?: boolean;
      can_customers?: boolean;
      can_suppliers?: boolean;
      can_settings?: boolean;
    }
  ): Promise<{ ok: boolean; business: BusinessRecord; employee: BusinessEmployeeRecord }> {
    const response = await api.post<{ ok: boolean; business: BusinessRecord; employee: BusinessEmployeeRecord }>(
      `/businesses/${businessId}/employees`,
      payload
    );
    return response.data;
  },
  async updateEmployee(
    businessId: number,
    employeeId: number,
    payload: {
      user_id: number;
      employee_name?: string;
      email?: string;
      phone?: string;
      role_code?: string;
      status?: string;
      linked_user_id?: number | null;
      can_sales?: boolean;
      can_purchase?: boolean;
      can_inventory?: boolean;
      can_reports?: boolean;
      can_customers?: boolean;
      can_suppliers?: boolean;
      can_settings?: boolean;
    }
  ): Promise<{ ok: boolean; business: BusinessRecord; employee: BusinessEmployeeRecord }> {
    const response = await api.put<{ ok: boolean; business: BusinessRecord; employee: BusinessEmployeeRecord }>(
      `/businesses/${businessId}/employees/${employeeId}`,
      payload
    );
    return response.data;
  },
  async deleteEmployee(
    businessId: number,
    employeeId: number,
    userId: number
  ): Promise<{ ok: boolean; deleted_employee_id: number; business_id: number }> {
    const response = await api.delete<{ ok: boolean; deleted_employee_id: number; business_id: number }>(
      `/businesses/${businessId}/employees/${employeeId}`,
      { params: { user_id: userId } }
    );
    return response.data;
  },
};

export default api;
