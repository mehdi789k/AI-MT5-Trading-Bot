import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  History,
  Settings,
  Brain,
  LineChart,
  Activity,
  Menu,
  X,
  Power,
  Zap,
  Languages,
  FlaskConical,
} from 'lucide-react';
import { StatusIndicator } from '@/components/StatusIndicator';
import { useBotSettings } from '@/lib/hooks';
import { useTranslation, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui';
import { EngineShutdownButton } from '@/components/EngineShutdownButton';

export type PageId = 'dashboard' | 'positions' | 'history' | 'settings' | 'predictions' | 'learning' | 'strategies';

interface SidebarProps {
  current: PageId;
  onNavigate: (page: PageId) => void;
}

export function AppLayout({ current, onNavigate, children }: SidebarProps & { children: ReactNode }) {
  const { t, lang, toggleLang } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings, updateSettings, isOnline } = useBotSettings();
  const running = settings?.is_running ?? false;

  const toggleBot = async () => {
    if (!isOnline) return;
    try {
      const ok = await updateSettings({ is_running: !running });
      if (!ok) console.error('Failed to toggle bot');
    } catch {
      console.error('Failed to toggle bot');
    }
  };

  const navItems: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'positions', label: t('nav.positions'), icon: TrendingUp },
    { id: 'history', label: t('nav.history'), icon: History },
    { id: 'predictions', label: t('nav.predictions'), icon: Brain },
    { id: 'learning', label: t('nav.learning'), icon: LineChart },
    { id: 'strategies', label: t('nav.strategies'), icon: FlaskConical },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-bg-primary">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-bg-secondary border-e border-border-subtle fixed start-0 top-0 h-full">
        <SidebarContent navItems={navItems} current={current} onNavigate={onNavigate} />
        <div className="p-4 border-t border-border-subtle">
          <PowerControl running={running} isOnline={isOnline} onToggle={toggleBot} />
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-bg-secondary border-e border-border-subtle flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <Logo />
              <button onClick={() => setMobileOpen(false)} className="text-text-muted hover:text-text-primary">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <NavItem key={item.id} item={item} current={current} onNavigate={(p) => { onNavigate(p); setMobileOpen(false); }} />
              ))}
            </nav>
            <div className="p-4 border-t border-border-subtle">
              <PowerControl running={running} isOnline={isOnline} onToggle={toggleBot} />
            </div>
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ms-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-bg-secondary border-b border-border-subtle flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-text-secondary hover:text-text-primary"
            >
              <Menu size={22} />
            </button>
            <h1 className="text-lg font-semibold text-text-primary hidden sm:block">
              {navItems.find((n) => n.id === current)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <LangToggle lang={lang} onToggle={toggleLang} />
            <StatusIndicator />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function Logo() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-primary to-accent-hover flex items-center justify-center shrink-0">
        <Activity size={20} className="text-white" />
      </div>
      <div>
        <div className="text-text-primary font-bold text-sm">{t('app.title')}</div>
        <div className="text-text-muted text-xs">{t('app.subtitle')}</div>
      </div>
    </div>
  );
}

function SidebarContent({
  navItems,
  current,
  onNavigate,
}: {
  navItems: { id: PageId; label: string; icon: typeof LayoutDashboard }[];
  current: PageId;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-border-subtle">
        <Logo />
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavItem key={item.id} item={item} current={current} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

function NavItem({
  item,
  current,
  onNavigate,
}: {
  item: { id: PageId; label: string; icon: typeof LayoutDashboard };
  current: PageId;
  onNavigate: (page: PageId) => void;
}) {
  const Icon = item.icon;
  const active = current === item.id;
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-accent-muted/30 text-accent-primary border border-accent-primary/20'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-transparent'
      }`}
    >
      <Icon size={18} className={active ? 'text-accent-primary' : 'text-text-muted'} />
      {item.label}
    </button>
  );
}

function PowerControl({
  running,
  isOnline,
  onToggle,
}: {
  running: boolean;
  isOnline: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted flex items-center gap-1.5">
          <Zap size={12} /> {t('power.enginePower')}
        </span>
        <span className={running ? 'text-success-text' : 'text-text-muted'}>
          {running ? t('power.on') : t('power.off')}
        </span>
      </div>
      <Button
        onClick={onToggle}
        variant={running ? 'danger' : 'success'}
        size="md"
        disabled={!isOnline}
        className="w-full"
      >
        <span className="flex items-center justify-center gap-2">
          <Power size={16} />
          {running ? t('power.stopBot') : t('power.startBot')}
        </span>
      </Button>
      <EngineShutdownButton isOnline={isOnline} />
      {!isOnline && (
        <p className="text-text-muted text-xs text-center">{t('power.engineOffline')}</p>
      )}
    </div>
  );
}

function LangToggle({ lang, onToggle }: { lang: Lang; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border hover:bg-bg-hover transition-all text-sm text-text-secondary hover:text-text-primary"
      title={lang === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
    >
      <Languages size={16} />
      <span className="font-medium">{lang === 'fa' ? 'EN' : 'فا'}</span>
    </button>
  );
}
