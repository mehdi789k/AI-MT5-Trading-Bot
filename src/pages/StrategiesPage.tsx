import { useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { useStrategies } from '@/lib/hooks';
import { useTranslation } from '@/lib/i18n';
import { Badge, Button, Card } from '@/components/ui';
import { StrategyEditor } from '@/components/StrategyEditor';
import { StrategyBacktest } from '@/components/StrategyBacktest';

const NEW_STRATEGY = 'new';

export function StrategiesPage() {
  const { t } = useTranslation();
  const { strategies, loading, error, refetch } = useStrategies();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = strategies.find((s) => s.id === selectedId) ?? null;

  const handleSaved = async (id: string) => {
    await refetch();
    setSelectedId(id);
  };

  const handleDeleted = async () => {
    setSelectedId(null);
    await refetch();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-text-primary font-semibold text-lg flex items-center gap-2">
            <FlaskConical size={20} className="text-accent-primary" />
            {t('strat.title')}
          </h2>
          <p className="text-text-muted text-sm mt-1">{t('strat.subtitle')}</p>
        </div>
        <Button onClick={() => setSelectedId(NEW_STRATEGY)}>
          <Plus size={16} className="me-2" />
          {t('strat.new')}
        </Button>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        <Card className="p-3 space-y-2">
          {loading && <p className="text-text-muted text-sm p-3">{t('strat.loading')}</p>}
          {error && <p className="text-danger-text text-sm p-3">{t('strat.loadFailed')}</p>}
          {!loading && !error && strategies.length === 0 && (
            <p className="text-text-muted text-sm p-3">{t('strat.empty')}</p>
          )}
          {strategies.map((strategy) => {
            const active = strategy.id === selectedId;
            return (
              <button
                type="button"
                key={strategy.id}
                onClick={() => setSelectedId(strategy.id)}
                className={`w-full text-start p-3 rounded-lg border transition-all duration-150 ${
                  active
                    ? 'bg-accent-muted/30 border-accent-primary/30'
                    : 'border-transparent hover:bg-bg-hover'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text-primary truncate">{strategy.name}</span>
                  <Badge variant={strategy.is_active ? 'success' : 'neutral'}>
                    {strategy.is_active ? t('strat.activeBadge') : t('strat.inactive')}
                  </Badge>
                </div>
                {strategy.description && (
                  <p className="text-text-muted text-xs mt-1 line-clamp-2">{strategy.description}</p>
                )}
              </button>
            );
          })}
        </Card>

        <div key={selectedId ?? 'empty'} className="space-y-6 min-w-0">
          {selectedId === null && (
            <Card className="p-10 text-center text-text-muted text-sm">{t('strat.selectHint')}</Card>
          )}
          {selectedId === NEW_STRATEGY && (
            <StrategyEditor strategy={null} onSaved={handleSaved} onDeleted={handleDeleted} />
          )}
          {selected && (
            <>
              <StrategyEditor strategy={selected} onSaved={handleSaved} onDeleted={handleDeleted} />
              <StrategyBacktest strategy={selected} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
