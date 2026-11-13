import type { TradeHistory } from '@/lib/types';

export interface DailyPnl {
  key: string;
  profit: number;
}

const DAY_MS = 86400000;

export function dayKey(time: Date, resetHour: number): string {
  return new Date(time.getTime() - resetHour * 3600000).toISOString().slice(0, 10);
}

export function buildDailyPnl(
  trades: Pick<TradeHistory, 'close_time' | 'profit'>[],
  days: number,
  resetHour: number,
  now: Date = new Date(),
): DailyPnl[] {
  const totals = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    totals.set(dayKey(new Date(now.getTime() - i * DAY_MS), resetHour), 0);
  }
  for (const trade of trades) {
    const key = dayKey(new Date(trade.close_time), resetHour);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + trade.profit);
    }
  }
  return Array.from(totals, ([key, profit]) => ({ key, profit }));
}
