export type FeatureFlags = Record<string, boolean>;

export interface AuthUser {
  user_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  email_notifications_enabled?: boolean;
  profile_image_url?: string | null;
  lifetime_access?: boolean;
  session_minutes?: number;
  plan_code?: string | null;
  subscription_status?: string | null;
  payment_status?: string | null;
  trial_status?: string | null;
  trial_ends_at?: string | null;
  trial_days_remaining?: number | null;
  is_lifetime?: boolean;
  billing_cycle?: string | null;
  plan_with_website?: boolean;
  access_active?: boolean;
  access_reason?: string | null;
  feature_flags?: FeatureFlags;
  token?: string;
}

export interface AccountRecord {
  account_id: number;
  user_id: number;
  account_name: string;
  account_type: string;
  group_name?: string | null;
  balance: number | string;
}

export interface TransactionRecord {
  txn_id: number;
  user_id: number;
  date?: string | null;
  tx_type?: string | null;
  type?: string | null;
  amount: number | string;
  account_id: number;
  account_name?: string;
  category?: string | null;
  note?: string | null;
}

export interface CategoryRecord {
  category_id?: number;
  user_id: number;
  name?: string;
  category_name?: string;
  category_type?: string | null;
  is_auto?: boolean;
}

export interface DailyBalanceRecord {
  balance_id?: number;
  user_id: number;
  date: string;
  income?: number | string | null;
  expense?: number | string | null;
  net?: number | string | null;
  snapshot?: number | string | null;
}

export interface BankConnectionRecord {
  connection_id?: number;
  institution_name?: string | null;
  status?: string | null;
  last_sync_at?: string | null;
}

export interface BankAccountRecord {
  bank_account_id?: number;
  institution_name?: string | null;
  account_name?: string | null;
  account_type?: string | null;
  subtype?: string | null;
  current_balance?: number | string | null;
}

export interface PaymentRequiredInfo {
  message: string;
  paymentRequired?: boolean;
  paymentUrl?: string | null;
  status?: number;
}

export interface SupportChatMessageRecord {
  role: 'user' | 'assistant';
  content: string;
}

export interface SupportChatResponse {
  ok: boolean;
  user_id: number;
  topic_id: string;
  topic_title: string;
  confidence: number;
  reply: string;
  steps: string[];
  suggestions: string[];
  escalate: boolean;
  escalation_message?: string | null;
  contact_email: string;
}
