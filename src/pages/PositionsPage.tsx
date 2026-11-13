import { useState } from 'react';
import { TrendingUp, X, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOpenPositions, usePendingOrders } from '@/lib/hooks';
import { useTranslation } from '@/lib/i18n';
import { useFormat } from '@/lib/format';
import { Card, Badge, Button, Modal } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { OpenPosition } from '@/lib/types';
import { PendingOrdersCard } from '@/components/PendingOrdersCard';

export function PositionsPage() {
  const { t, lang } = useTranslation();
  const fmt = useFormat();
  const { positions, loading, refetch } = useOpenPositions();
  const { orders: pendingOrders } = usePendingOrders();
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<OpenPosition | null>(null);

  const handleClosePosition = async (position: OpenPosition) => {
    setClosingId(position.id);
    try {
      const { error } = await supabase.from('bot_logs').insert({
        level: 'info',
        message: `Manual close requested for ticket ${position.mt5_ticket}`,
        symbol: position.symbol,
        details: {
          action: 'close_position',
          mt5_ticket: position.mt5_ticket,
          requested_by: 'dashboard',
        },
      });
      if (error) {
        console.error('Failed to send close request:', error);
        return;
      }
      setConfirmClose(null);
    } catch (err) {
      console.error('Failed to send close request:', err);
    } finally {
      setClosingId(null);
    }
  };

  const totalProfit = positions.reduce((sum, p) => sum + (p.profit ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-text-muted text-sm">{t('pos.openPositions')}</div>
          <div className="text-2xl font-bold text-text-primary font-mono mt-1">{positions.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-text-muted text-sm">{t('pos.totalFloating')}</div>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${
              totalProfit >= 0 ? 'text-success-text' : 'text-danger-text'
            }`}
          >
            {totalProfit >= 0 ? '+' : ''}
            {fmt.currency(totalProfit)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-text-muted text-sm">{t('pos.buyPositions')}</div>
          <div className="text-2xl font-bold text-success-text font-mono mt-1">
            {positions.filter((p) => p.position_type === 'buy').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-text-muted text-sm">{t('pos.sellPositions')}</div>
          <div className="text-2xl font-bold text-danger-text font-mono mt-1">
            {positions.filter((p) => p.position_type === 'sell').length}
          </div>
        </Card>
      </div>

      {/* Positions Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <TrendingUp size={18} className="text-accent-primary" />
            {t('pos.livePositions')}
          </h3>
          <Button variant="ghost" size="sm" onClick={refetch}>
            <RefreshCw size={14} className="mr-1" /> {t('pos.refresh')}
          </Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-text-muted">{t('pos.loading')}</div>
        ) : positions.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingUp size={32} className="text-text-muted mx-auto mb-3" />
            <div className="text-text-secondary text-sm">{t('pos.noPositions')}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs uppercase border-b border-border-subtle">
                  <th className="text-start px-4 py-3 font-medium">{t('pos.symbol')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('pos.type')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pos.volume')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pos.openPrice')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pos.current')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pos.stopLoss')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pos.takeProfit')}</th>
                  <th className="text-end px-4 py-3 font-medium">{t('pos.pl')}</th>
                  <th className="text-start px-4 py-3 font-medium">{t('pos.opened')}</th>
                  <th className="text-center px-4 py-3 font-medium">{t('pos.action')}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr
                    key={pos.id}
                    className="border-b border-border-subtle hover:bg-bg-hover transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-text-primary">{pos.symbol}</td>
                    <td className="px-4 py-3">
                      <Badge variant={pos.position_type === 'buy' ? 'success' : 'danger'}>
                        {pos.position_type === 'buy' ? t('pos.buy') : t('pos.sell')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.number(pos.volume, 2)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.price(pos.open_price)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-text-secondary">
                      {fmt.price(pos.current_price)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-danger-text/70">
                      {fmt.price(pos.stop_loss)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-success-text/70">
                      {fmt.price(pos.take_profit)}
                    </td>
                    <td
                      className={`px-4 py-3 text-end font-mono font-semibold ${
                        (pos.profit ?? 0) >= 0 ? 'text-success-text' : 'text-danger-text'
                      }`}
                    >
                      {(pos.profit ?? 0) >= 0 ? '+' : ''}
                      {fmt.currency(pos.profit)}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">{fmt.timeAgo(pos.open_time)}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmClose(pos)}
                        disabled={closingId === pos.id}
                      >
                        <X size={14} className="inline" /> {t('pos.close')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <PendingOrdersCard orders={pendingOrders} />
      </div>

      {/* Close Confirmation Modal */}
      {confirmClose && (
        <Modal onClose={() => setConfirmClose(null)} className="max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-danger-muted/30 flex items-center justify-center">
                <X size={20} className="text-danger-text" />
              </div>
              <div>
                <h3 className="text-text-primary font-semibold">{t('pos.closePosition')}</h3>
                <p className="text-text-muted text-sm">{t('pos.closeDesc')}</p>
              </div>
            </div>
            <div className="bg-bg-tertiary rounded-lg p-4 mb-4 space-y-2">
              <Row label={t('pos.symbol')} value={confirmClose.symbol} />
              <Row label={t('pos.type')} value={confirmClose.position_type === 'buy' ? t('pos.buy') : t('pos.sell')} />
              <Row label={t('pos.volume')} value={fmt.number(confirmClose.volume, 2)} />
              <Row
                label={t('pos.pl')}
                value={fmt.currency(confirmClose.profit)}
                valueClass={(confirmClose.profit ?? 0) >= 0 ? 'text-success-text' : 'text-danger-text'}
              />
              <Row label={t('pos.opened')} value={formatDateTime(confirmClose.open_time, lang)} />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setConfirmClose(null)}>{t('pos.cancel')}</Button>
              <Button variant="danger" onClick={() => handleClosePosition(confirmClose)} disabled={closingId !== null}>
                {t('pos.confirmClose')}
              </Button>
            </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value, valueClass = 'text-text-primary' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted text-sm">{label}</span>
      <span className={`font-mono text-sm ${valueClass}`}>{value}</span>
    </div>
  );
}
