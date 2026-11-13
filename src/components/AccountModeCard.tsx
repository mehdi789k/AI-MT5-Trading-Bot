import { useState } from 'react';
import { Landmark, AlertTriangle, Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { Card, Badge, Modal } from '@/components/ui';
import type { BotSettings } from '@/lib/types';

type AccountMode = BotSettings['account_mode'];

function reportedMode(settings: BotSettings): AccountMode | null {
  if (settings.mt5_account_type === 'real') return 'live';
  if (settings.mt5_account_type === 'demo') return 'demo';
  return null;
}

interface AccountModeCardProps {
  settings: BotSettings | null;
  updateSettings: (patch: Partial<BotSettings>) => Promise<boolean>;
}

export function AccountModeCard({ settings, updateSettings }: AccountModeCardProps) {
  const { t } = useTranslation();
  const [confirmLive, setConfirmLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!settings) {
    return (
      <Card className="p-5">
        <div className="text-text-muted text-sm">{t('status.loading')}</div>
      </Card>
    );
  }

  const mode = settings.account_mode;
  const reported = reportedMode(settings);
  const mismatch = settings.mt5_account_type !== null && reported !== mode;
  const locked = settings.is_running;

  const applyMode = async (next: AccountMode) => {
    setSaving(true);
    setFailed(false);
    const ok = await updateSettings({ account_mode: next });
    setSaving(false);
    if (!ok) setFailed(true);
  };

  const handleSelect = (next: AccountMode) => {
    if (next === mode || locked || saving) return;
    if (next === 'live') {
      setConfirmLive(true);
      return;
    }
    void applyMode(next);
  };

  const confirmSwitchToLive = async () => {
    setConfirmLive(false);
    await applyMode('live');
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <Landmark size={18} className="text-accent-primary" />
            {t('acct.title')}
          </h3>
          <p className="text-text-muted text-sm mt-1 max-w-2xl">{t('acct.subtitle')}</p>
        </div>
        <div className="text-end text-sm">
          <div className="text-text-muted text-xs">{t('acct.reported')}</div>
          <div className="mt-1">
            {settings.mt5_account_type ? (
              <Badge dot variant={reported === 'live' ? 'danger' : 'info'}>
                {t(`acct.reportedType.${settings.mt5_account_type}`)}
              </Badge>
            ) : (
              <span className="text-text-muted">{t('acct.notReported')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ModeOption
          active={mode === 'demo'}
          disabled={locked || saving}
          title={t('acct.demo')}
          hint={t('acct.demoHint')}
          onClick={() => handleSelect('demo')}
        />
        <ModeOption
          active={mode === 'live'}
          disabled={locked || saving}
          danger
          title={t('acct.live')}
          hint={t('acct.liveHint')}
          onClick={() => handleSelect('live')}
        />
      </div>

      {locked && <div className="text-warning-text text-xs mt-4">{t('acct.stopFirst')}</div>}

      {mismatch && (
        <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-danger-muted/20 text-danger-text text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('acct.mismatch')}</span>
        </div>
      )}

      {failed && <div className="text-danger-text text-xs mt-4">{t('ai.saveFailed')}</div>}

      {!mismatch && settings.mt5_account_type && !failed && (
        <div className="flex items-center gap-2 mt-4 text-success-text text-sm">
          <Check size={16} />
          <span>{t('acct.inSync')}</span>
        </div>
      )}

      {confirmLive && (
        <Modal onClose={() => setConfirmLive(false)}>
          <div className="p-6 max-w-md">
            <h3 className="text-text-primary font-semibold flex items-center gap-2">
              <AlertTriangle size={18} className="text-danger-text" />
              {t('acct.confirmTitle')}
            </h3>
            <p className="text-text-secondary text-sm mt-3 leading-relaxed">{t('acct.confirmBody')}</p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmLive(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary bg-bg-tertiary border border-border hover:bg-bg-hover transition-colors"
              >
                {t('acct.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmSwitchToLive}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-danger text-white hover:opacity-90 transition-opacity"
              >
                {t('acct.confirm')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function ModeOption({
  active,
  disabled,
  danger = false,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  danger?: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  const activeClasses = danger
    ? 'border-danger bg-danger-muted/20'
    : 'border-accent-primary bg-accent-primary/10';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`text-start rounded-lg p-4 border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? activeClasses : 'border-border-subtle bg-bg-tertiary hover:bg-bg-hover'
      }`}
    >
      <div className="text-text-primary font-medium text-sm">{title}</div>
      <div className="text-text-muted text-xs mt-1">{hint}</div>
    </button>
  );
}
