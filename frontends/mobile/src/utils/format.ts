export const numberFromUnknown = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const formatCurrency = (value: unknown, locale = 'en-US'): string => {
  const amount = numberFromUnknown(value);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatShortDate = (value?: string | null, locale = 'en-US'): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (value?: string | null, locale = 'en-US'): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export const sortByDateDesc = <T extends { date?: string | null }>(items: T[]): T[] => {
  return [...items].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });
};

export const isDebtAccount = (accountType?: string | null): boolean => {
  const value = normalizeText(accountType);
  return value === 'credit' || value === 'credit_card' || value === 'loan';
};

export const formatPlanName = (planCode?: string | null, isLifetime = false): string => {
  if (isLifetime) {
    return 'Lifetime (All plans unlocked)';
  }

  switch (normalizeText(planCode)) {
    case 'basic':
      return 'Basic';
    case 'regular':
      return 'Regular';
    case 'business':
      return 'Business';
    case 'premium_plus':
      return 'Premium Plus';
    case 'diamond':
      return 'Diamond';
    case 'lifetime':
      return 'Lifetime (All plans unlocked)';
    default:
      return planCode ? String(planCode) : 'Unknown';
  }
};
