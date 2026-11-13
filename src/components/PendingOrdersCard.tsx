import { Fragment, useState } from 'react';
import { Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useFormat, formatDateTime } from '@/lib/format';
import { Card, Badge, Button } from '@/components/ui';
import type { PendingOrder, PendingOrderType } from '@/lib/types';

const ORDER_TYPE_LABELS: Record<PendingOrderType, string> = {
  buy_limit: 'lim.buyLimit',
  sell_limit: 'lim.sellLimit',
  buy_stop: 'lim.buyStop',
  sell_stop: 'lim.sellStop',
};

interface PendingOrdersCardProps {
  orders: PendingOrder[];
}

export function PendingOrdersCard({ orders }: PendingOrdersCardProps) {
  const { t, lang } = useTranslation();
  const fmt = useFormat();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cancelOrder = async (order: PendingOrder) => {
    if (order.mt5_order_ticket === null) return;
    setCancellingId(order.id);
    setErrorMessage(null);
    const { error } = await supabase.from('bot_logs').insert({
      level: 'info',
      message: `Cancel requested for pending order ${order.mt5_order_ticket}`,
      symbol: order.symbol,
      details: { action: 'cancel_pending_order', mt5_ticket: order.mt5_order_ticket },
    });
    setCancellingId(null);
    setConfirmingId(null);
    if (error) {
      console.error('Failed to request order cancel:', error);
      setErrorMessage(t('lim.cancelFailed'));
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-accent-primary" />
          <h2 className="text-text-primary font-semibold">{t('lim.pendingOrders')}</h2>
        </div>
        <Badge variant="info">{orders.length}</Badge>
      </div>

      {orders.length === 0 ? (
        <div className="px-5 py-10 text-center text-text-muted text-sm">{t('lim.noPending')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-left">
                <th className="px-4 py-3 font-medium">{t('pos.symbol')}</th>
                <th className="px-4 py-3 font-medium">{t('lim.orderType')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('pos.volume')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('lim.entryPrice')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('pos.stopLoss')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('pos.takeProfit')}</th>
                <th className="px-4 py-3 font-medium">{t('lim.expires')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <Fragment key={order.id}>
                  <tr className="border-t border-border-subtle">
                    <td className="px-4 py-3 font-medium text-text-primary">{order.symbol}</td>
                    <td className="px-4 py-3 text-text-secondary">{t(ORDER_TYPE_LABELS[order.order_type])}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt.number(order.volume, 2)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt.number(order.entry_price, 5)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt.number(order.stop_loss, 5)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt.number(order.take_profit, 5)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                      {formatDateTime(order.expires_at, lang)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmingId(order.id)}
                        disabled={cancellingId === order.id || order.mt5_order_ticket === null}
                      >
                        {t('lim.cancel')}
                      </Button>
                    </td>
                  </tr>
                  {confirmingId === order.id && (
                    <tr>
                      <td colSpan={8} className="px-4 pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-danger-muted/20 border border-danger/30">
                          <div>
                            <div className="text-text-primary text-sm font-medium">{t('lim.cancelOrder')}</div>
                            <div className="text-text-muted text-xs">{t('lim.cancelDesc')}</div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                              {t('lim.keepOrder')}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => cancelOrder(order)}
                              disabled={cancellingId === order.id}
                            >
                              {t('lim.confirmCancel')}
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorMessage && <p className="px-5 pb-4 text-sm text-danger-text">{errorMessage}</p>}
    </Card>
  );
}
