import { AuthUser } from '../types/app';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  regular: 'Regular',
  business: 'Business',
  premium_plus: 'Premium Plus',
  diamond: 'Diamond',
};

export const formatPlanDisplayName = (
  user: AuthUser | null | undefined,
  t: (key: string) => string
): string => {
  if (!user) return 'Unknown';
  if (user.is_lifetime) return t('common.planLifetimeWebsite');

  const planCode = String(user.plan_code || '').trim().toLowerCase();
  if (planCode === 'premium_plus' && user.plan_with_website) {
    return t('common.planPremiumWeb');
  }
  return PLAN_LABELS[planCode] ?? user.plan_code ?? 'Unknown';
};
