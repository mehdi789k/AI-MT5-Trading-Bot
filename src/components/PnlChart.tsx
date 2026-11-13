import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { Card } from '@/components/ui';
import type { DailyPnl } from '@/lib/performance';

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 32, left: 56 };

interface PnlChartProps {
  days: DailyPnl[];
  balance: number | null;
  currency: string;
  dailyLossLimit: number;
  maxDrawdown: number;
}

export function PnlChart({ days, balance, currency, dailyLossLimit, maxDrawdown }: PnlChartProps) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [hovered, setHovered] = useState<number | null>(null);

  if (balance === null) {
    return (
      <Card className="p-5">
        <h2 className="text-text-primary font-semibold">{t('dash.pnlChart')}</h2>
        <p className="text-text-muted text-sm mt-3">{t('dash.pnlEmpty')}</p>
      </Card>
    );
  }

  const safeBalance = balance || 1;
  const points = days.map((d) => ({ key: d.key, profit: d.profit, pct: (d.profit / safeBalance) * 100 }));
  const hasActivity = days.some((d) => d.profit !== 0);
  const limit = Math.max(dailyLossLimit, maxDrawdown, 1, ...points.map((p) => Math.abs(p.pct))) * 1.15;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const yOf = (value: number) => PAD.top + (1 - (value + limit) / (2 * limit)) * innerH;
  const zeroY = yOf(0);
  const slot = innerW / Math.max(points.length, 1);
  const barWidth = slot * 0.6;
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const hoveredPoint = hovered !== null ? points[hovered] : null;

  const gridValues = [limit, 0, -limit];

  return (
    <Card className="p-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-text-primary font-semibold">{t('dash.pnlChart')}</h2>
          <p className="text-text-muted text-xs mt-1">{t('dash.pnlSubtitle')}</p>
        </div>
        {hoveredPoint && (
          <div className="text-right">
            <div className="text-text-secondary text-xs font-mono">{hoveredPoint.key}</div>
            <div
              className={`font-mono text-sm font-semibold ${
                hoveredPoint.profit >= 0 ? 'text-success-text' : 'text-danger-text'
              }`}
            >
              {fmt.currency(hoveredPoint.profit, currency)} · {fmt.percent(hoveredPoint.pct)}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        {!hasActivity && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm pointer-events-none">
            {t('dash.pnlEmpty')}
          </div>
        )}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          role="img"
          aria-label={t('dash.pnlChart')}
          onMouseLeave={() => setHovered(null)}
        >
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yOf(value)}
                y2={yOf(value)}
                className={value === 0 ? 'stroke-border-strong' : 'stroke-border-subtle'}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={yOf(value)}
                dy="4"
                textAnchor="end"
                fontSize="11"
                className="fill-text-muted"
              >
                {fmt.percent(value)}
              </text>
            </g>
          ))}

          {dailyLossLimit > 0 && (
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yOf(-dailyLossLimit)}
              y2={yOf(-dailyLossLimit)}
              className="stroke-danger"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          )}
          {maxDrawdown > 0 && (
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yOf(-maxDrawdown)}
              y2={yOf(-maxDrawdown)}
              className="stroke-warning"
              strokeWidth={1.5}
              strokeDasharray="2 4"
            />
          )}

          {points.map((p, i) => {
            const y = yOf(p.pct);
            const isActive = hovered === null || hovered === i;
            const fillClass =
              p.profit > 0 ? 'fill-success' : p.profit < 0 ? 'fill-danger' : 'fill-text-muted';
            return (
              <rect
                key={p.key}
                x={PAD.left + i * slot + (slot - barWidth) / 2}
                y={Math.min(y, zeroY)}
                width={barWidth}
                height={Math.max(Math.abs(y - zeroY), 1)}
                rx={2}
                className={`${fillClass} transition-opacity duration-200`}
                opacity={isActive ? 1 : 0.45}
                onMouseEnter={() => setHovered(i)}
              />
            );
          })}

          {points.map(
            (p, i) =>
              i % labelEvery === 0 && (
                <text
                  key={`label-${p.key}`}
                  x={PAD.left + i * slot + slot / 2}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  fontSize="11"
                  className="fill-text-muted"
                >
                  {p.key.slice(5)}
                </text>
              ),
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-success" />
          {t('dash.pnlProfit')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-danger" />
          {t('dash.pnlLoss')}
        </span>
        {dailyLossLimit > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-danger" />
            {t('dash.pnlLossLimit')} {fmt.percent(-dailyLossLimit)}
          </span>
        )}
        {maxDrawdown > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dotted border-warning" />
            {t('dash.pnlDrawdownLimit')} {fmt.percent(-maxDrawdown)}
          </span>
        )}
      </div>
    </Card>
  );
}
