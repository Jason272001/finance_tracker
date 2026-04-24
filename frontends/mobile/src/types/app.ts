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

export interface BusinessPermissions {
  can_sales: boolean;
  can_purchase: boolean;
  can_inventory: boolean;
  can_reports: boolean;
  can_customers: boolean;
  can_suppliers: boolean;
  can_settings: boolean;
}

export interface BusinessRecord {
  business_id: number;
  owner_user_id: number;
  business_name: string;
  business_type?: string | null;
  industry?: string | null;
  page_slug?: string | null;
  website_slug?: string | null;
  about_text?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  page_enabled?: boolean;
  website_enabled?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  access_role?: string | null;
  is_owner?: boolean;
  permissions?: BusinessPermissions;
}

export interface BusinessEmployeeRecord {
  employee_id: number;
  business_id: number;
  linked_user_id?: number;
  employee_name: string;
  email?: string | null;
  phone?: string | null;
  role_code: string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  permissions: BusinessPermissions;
}

export interface BusinessListResponse {
  ok: boolean;
  max_businesses: number;
  items: BusinessRecord[];
}
