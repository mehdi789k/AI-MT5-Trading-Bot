import { useEffect, useState, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Card } from '@/components/ui';
import type { Prediction, AiPredictionSettingsSnapshot } from '@/lib/types';

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 44, left: 48 };

interface ChartPoint {
  id: string;
  ts: number;
  confidence: number;
  direction: 'up' | 'down' | 'neutral';
}

interface ChangeMarker {
  id: string;
  ts: number;
  changed_at: string;
}

export function PredictionAccuracyChart() {
  const { t, lang } = useTranslation();
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [markers, setMarkers] = useState<ChangeMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverMarker, setHoverMarker] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const [predResp, histResp] = await Promise.all([
        supabase
          .from('predictions')
          .select('id,created_at,direction,confidence')
          .gte('created_at', new Date(since).toISOString())
          .order('created_at', { ascending: true })
          .limit(500),
        supabase
          .from('ai_prediction_settings_history')
          .select('id,changed_at')
          .order('changed_at', { ascending: true })
          .limit(100),
      ]);

      if (predResp.data) {
        const mapped: ChartPoint[] = (predResp.data as Prediction[]).map((p) => ({
          id: p.id,
          ts: new Date(p.created_at).getTime(),
          confidence: Number(p.confidence),
          direction: p.direction,
        }));
        setPoints(mapped);
      }

      if (histResp.data) {
        const mapped: ChangeMarker[] = (histResp.data as AiPredictionSettingsSnapshot[]).map((h) => ({
          id: h.id,
          ts: new Date(h.changed_at).getTime(),
          changed_at: h.changed_at,
        }));
        setMarkers(mapped);
      }
    } catch (error) {
      console.error('Failed to load prediction accuracy chart data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  if (loading) {
    return (
      <Card className="p-5">
        <h2 className="text-text-primary font-semibold flex items-center gap-2">
          <Sparkles size={18} className="text-accent-primary" />
          {t('dash.aiChartTitle')}
        </h2>
        <div className="text-text-muted text-sm mt-6 text-center">{t('status.loading')}</div>
      </Card>
    );
  }

  if (points.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-text-primary font-semibold flex items-center gap-2">
          <Sparkles size={18} className="text-accent-primary" />
          {t('dash.aiChartTitle')}
        </h2>
        <p className="text-text-muted text-sm mt-4">{t('dash.aiChartEmpty')}</p>
      </Card>
    );
  }

  const minTs = points[0].ts;
  const maxTs = Math.max(points[points.length - 1].ts, markers.length ? markers[markers.length - 1].ts : 0);
  const tsRange = Math.max(maxTs - minTs, 1);

  const xOf = (ts: number) => PAD.left + ((ts - minTs) / tsRange) * innerW;
  const yOf = (conf: number) => PAD.top + (1 - conf / 100) * innerH;

  const gridValues = [0, 25, 50, 75, 100];
  const inRangeMarkers = markers.filter((m) => m.ts >= minTs && m.ts <= maxTs);

  const colorOf = (dir: 'up' | 'down' | 'neutral') =>
    dir === 'up' ? 'fill-success' : dir === 'down' ? 'fill-danger' : 'fill-text-muted';

  const strokeColorOf = (dir: 'up' | 'down' | 'neutral') =>
    dir === 'up' ? 'stroke-success' : dir === 'down' ? 'stroke-danger' : 'stroke-text-muted';

  return (
    <Card className="p-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-text-primary font-semibold flex items-center gap-2">
            <Sparkles size={18} className="text-accent-primary" />
            {t('dash.aiChartTitle')}
          </h2>
          <p className="text-text-muted text-xs mt-1">{t('dash.aiChartSubtitle')}</p>
        </div>
        {(hoverIdx !== null || hoverMarker !== null) && (
          <div className="text-right text-xs">
            {hoverIdx !== null && points[hoverIdx] && (
              <div className="font-mono">
                <div className="text-text-muted">{formatDateTime(new Date(points[hoverIdx].ts).toISOString(), lang)}</div>
                <div className="text-text-primary font-semibold">
                  {points[hoverIdx].confidence.toFixed(1)}% · {t(`dash.aiChart${points[hoverIdx].direction.charAt(0).toUpperCase() + points[hoverIdx].direction.slice(1)}`)}
                </div>
              </div>
            )}
            {hoverMarker !== null && inRangeMarkers[hoverMarker] && (
              <div className="font-mono">
                <div className="text-accent-primary font-semibold">{t('dash.aiChartChange')}</div>
                <div className="text-text-muted">{formatDateTime(inRangeMarkers[hoverMarker].changed_at, lang)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={t('dash.aiChartTitle')}
        onMouseLeave={() => { setHoverIdx(null); setHoverMarker(null); }}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yOf(value)}
              y2={yOf(value)}
              className={value === 50 ? 'stroke-border-strong' : 'stroke-border-subtle'}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={yOf(value)}
              dy="4"
              textAnchor="end"
              fontSize="11"
              className="fill-text-muted"
            >
              {value}%
            </text>
          </g>
        ))}

        {inRangeMarkers.map((m, i) => {
          const x = xOf(m.ts);
          const isActive = hoverMarker === null || hoverMarker === i;
          return (
            <g key={m.id}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                className="stroke-accent-primary"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={isActive ? 0.7 : 0.25}
              />
              <circle
                cx={x}
                cy={PAD.top + 7}
                r={6}
                className="fill-accent-primary stroke-bg-secondary"
                strokeWidth={2}
                opacity={isActive ? 1 : 0.45}
                onMouseEnter={() => { setHoverMarker(i); setHoverIdx(null); }}
              />
            </g>
          );
        })}

        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${xOf(p.ts)},${yOf(p.confidence)}`).join(' ')}
            className="stroke-border-strong"
            strokeWidth={1}
            fill="none"
            opacity={0.4}
          />
        )}

        {points.map((p, i) => {
          const cx = xOf(p.ts);
          const cy = yOf(p.confidence);
          const isActive = hoverIdx === null || hoverIdx === i;
          const r = 3 + (p.confidence / 100) * 3;
          return (
            <g key={p.id}>
              {hoverIdx === i && (
                <line
                  x1={cx}
                  x2={cx}
                  y1={PAD.top}
                  y2={HEIGHT - PAD.bottom}
                  className={strokeColorOf(p.direction)}
                  strokeWidth={1}
                  opacity={0.3}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                className={`${colorOf(p.direction)} transition-opacity duration-200`}
                opacity={isActive ? 0.85 : 0.35}
                onMouseEnter={() => { setHoverIdx(i); setHoverMarker(null); }}
              />
            </g>
          );
        })}

        {(() => {
          const tickCount = Math.min(5, points.length);
          const ticks = Array.from({ length: tickCount }, (_, i) => {
            const ratio = i / Math.max(tickCount - 1, 1);
            return minTs + ratio * (maxTs - minTs);
          });
          const seenLabels = new Set<string>();
          return ticks.map((ts, index) => {
            const date = new Date(ts);
            const dateLabel = date.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US', { month: 'short', day: 'numeric' });
            const timeLabel = date.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
            const label = maxTs - minTs < 24 * 60 * 60 * 1000 ? timeLabel : dateLabel;
            if (seenLabels.has(label) && index !== tickCount - 1) return null;
            seenLabels.add(label);
            return (
              <text
                key={`tick-${ts}`}
                x={xOf(ts)}
                y={HEIGHT - 12}
                textAnchor="middle"
                fontSize="11"
                className="fill-text-muted"
              >
                {label}
              </text>
            );
          });
        })()}
      </svg>

      <div className="mt-4 pt-3 border-t border-border-subtle flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-success" />
          {t('dash.aiChartUp')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-danger" />
          {t('dash.aiChartDown')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-text-muted" />
          {t('dash.aiChartNeutral')}
        </span>
        {inRangeMarkers.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-accent-primary" />
            {t('dash.aiChartChange')} ({inRangeMarkers.length})
          </span>
        )}
      </div>
    </Card>
  );
}
