import type { TransactionRecord } from '../types/app';

export const CREATOR_CATEGORIES = ['YouTube', 'TikTok', 'Sponsorships', 'Freelance', 'Digital products', 'Software subscriptions', 'Equipment', 'Marketing'];

export const monthKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const creatorReport = (transactions: TransactionRecord[], month: string) => {
  let income = 0;
  let expenses = 0;
  const sources = new Map<string, number>();
  const rows = transactions.filter((row) => String(row.date || '').slice(0, 7) === month &&
    ['income', 'expense'].includes(String(row.type || row.tx_type || '').toLowerCase()) &&
    Number.isFinite(Number(row.amount)) && Number(row.amount) > 0);
  rows.forEach((row) => {
    const cents = Math.round(Number(row.amount) * 100);
    if (String(row.type || row.tx_type).toLowerCase() === 'income') {
      income += cents;
      const name = String(row.category || 'Uncategorized');
      sources.set(name, (sources.get(name) || 0) + cents);
    } else expenses += cents;
  });
  return { income: income / 100, expenses: expenses / 100, net: (income - expenses) / 100,
    count: rows.length,
    sources: [...sources].sort((a, b) => b[1] - a[1]).map(([name, cents]) => ({ name, amount: cents / 100 })) };
};
