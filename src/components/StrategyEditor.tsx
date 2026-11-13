import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Code2, Download, Save, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { Button, Card, Toggle } from '@/components/ui';
import { downloadStrategyFile, MAX_STRATEGY_FILE_BYTES } from '@/lib/strategyFile';
import { NEW_STRATEGY_TEMPLATE } from '@/lib/strategyTemplate';
import type { Strategy } from '@/lib/types';

const EVALUATE_PATTERN = /def\s+evaluate\s*\(/;
const INPUT_CLASS =
  'w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary';

interface StrategyEditorProps {
  strategy: Strategy | null;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}

interface Notice {
  type: 'success' | 'error';
  text: string;
}

export function StrategyEditor({ strategy, onSaved, onDeleted }: StrategyEditorProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(strategy?.name ?? '');
  const [description, setDescription] = useState(strategy?.description ?? '');
  const [code, setCode] = useState(strategy?.code ?? NEW_STRATEGY_TEMPLATE);
  const [isActive, setIsActive] = useState(strategy?.is_active ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const fail = (text: string) => setNotice({ type: 'error', text });

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      fail(t('strat.nameRequired'));
      return;
    }
    if (!EVALUATE_PATTERN.test(code)) {
      fail(t('strat.codeInvalid'));
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const payload = { name: trimmedName, description: description.trim(), code, is_active: isActive };
      const result = strategy
        ? await supabase
            .from('strategies')
            .update({ ...payload, version: strategy.version + 1, updated_at: new Date().toISOString() })
            .eq('id', strategy.id)
            .select('id')
            .maybeSingle()
        : await supabase.from('strategies').insert(payload).select('id').maybeSingle();

      if (result.error || !result.data) {
        fail(t('strat.saveFailed'));
        return;
      }
      setNotice({ type: 'success', text: t('strat.saved') });
      onSaved(result.data.id as string);
    } catch (err) {
      console.error('Failed to save strategy:', err);
      fail(t('strat.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!strategy) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('strategies').delete().eq('id', strategy.id);
      if (error) {
        fail(t('strat.deleteFailed'));
        return;
      }
      onDeleted();
    } catch (err) {
      console.error('Failed to delete strategy:', err);
      fail(t('strat.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.py') || file.size > MAX_STRATEGY_FILE_BYTES) {
      fail(t('strat.uploadInvalid'));
      return;
    }
    try {
      const text = await file.text();
      setCode(text);
    } catch (err) {
      console.error('Failed to read file:', err);
      fail(t('strat.uploadInvalid'));
      return;
    }
    if (!name.trim()) setName(file.name.replace(/\.py$/i, ''));
    setNotice({ type: 'success', text: t('strat.uploaded') });
  };

  const handleTab = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const target = event.currentTarget;
    const { selectionStart, selectionEnd, value } = target;
    setCode(`${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`);
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = selectionStart + 4;
    });
  };

  return (
    <Card className="p-6 space-y-5">
      <h3 className="text-text-primary font-semibold flex items-center gap-2">
        <Code2 size={18} className="text-accent-primary" />
        {strategy ? strategy.name : t('strat.new')}
      </h3>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-text-secondary text-sm font-medium block mb-2">{t('strat.name')}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
        </div>
        <div>
          <label className="text-text-secondary text-sm font-medium block mb-2">{t('strat.description')}</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={INPUT_CLASS} />
        </div>
      </div>

      <Toggle checked={isActive} onChange={setIsActive} label={t('strat.activeLabel')} />

      <div>
        <label className="text-text-secondary text-sm font-medium block mb-2">{t('strat.code')}</label>
        <p className="text-text-muted text-xs mb-2">{t('strat.codeGuide')}</p>
        <textarea
          dir="ltr"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleTab}
          className={`${INPUT_CLASS} font-mono text-sm leading-relaxed min-h-[360px] resize-y`}
        />
      </div>

      {notice && (
        <p className={`text-sm ${notice.type === 'success' ? 'text-success-text' : 'text-danger-text'}`}>{notice.text}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-subtle">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} className="me-1.5" />
            {t('strat.upload')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => downloadStrategyFile(name || 'strategy', code)} disabled={!code.trim()}>
            <Download size={14} className="me-1.5" />
            {t('strat.download')}
          </Button>
          <input ref={fileInputRef} type="file" accept=".py" className="hidden" onChange={handleFileChange} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {strategy &&
            (confirmingDelete ? (
              <>
                <span className="text-danger-text text-sm">{t('strat.confirmDelete')}</span>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                  {t('strat.confirmYes')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  {t('set.cancel')}
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={14} className="me-1.5 text-danger-text" />
                {t('strat.delete')}
              </Button>
            ))}
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} className="me-2" />
            {saving ? t('strat.saving') : t('strat.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
