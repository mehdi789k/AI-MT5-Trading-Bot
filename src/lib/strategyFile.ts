import type { BacktestResult } from '@/lib/types';

export const MAX_STRATEGY_FILE_BYTES = 200 * 1024;

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'strategy';
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadStrategyFile(name: string, code: string) {
  downloadTextFile(`${slugify(name)}.py`, code, 'text/x-python;charset=utf-8');
}

export function downloadBacktestReport(result: BacktestResult) {
  downloadTextFile(
    `backtest-${slugify(result.symbol)}-${result.timeframe}-${result.created_at.slice(0, 10)}.json`,
    JSON.stringify(result, null, 2),
    'application/json;charset=utf-8'
  );
}

export function downloadTradesCsv(result: BacktestResult) {
  const header = ['type', 'entry', 'close', 'pnl', 'reason', 'open_time', 'close_time'];
  const rows = result.trades_detail.map((trade) =>
    [trade.type, trade.entry, trade.close, trade.pnl, trade.reason, trade.open_time, trade.close_time].join(',')
  );
  downloadTextFile(
    `backtest-${slugify(result.symbol)}-${result.timeframe}.csv`,
    [header.join(','), ...rows].join('\n'),
    'text/csv;charset=utf-8'
  );
}
