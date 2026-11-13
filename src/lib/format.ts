import { useTranslation, type Lang } from '@/lib/i18n';

export function formatCurrency(value: number | null | undefined, currency = 'USD', lang: Lang = 'en'): string {
  if (value === null || value === undefined) return '--';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  return `${sign}${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)} ${currency}`;
}

export function formatNumber(value: number | null | undefined, decimals = 2, lang: Lang = 'en'): string {
  if (value === null || value === undefined) return '--';
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPrice(value: number | null | undefined, lang: Lang = 'en'): string {
  if (value === null || value === undefined) return '--';
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, lang: Lang = 'en'): string {
  if (value === null || value === undefined) return '--';
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  const num = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return lang === 'fa' ? `${num}٪` : `${num}%`;
}

export function formatDateTime(value: string | null | undefined, lang: Lang = 'en'): string {
  if (!value) return '--';
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  return new Date(value).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value: string | null | undefined, lang: Lang = 'en'): string {
  if (!value) return '--';
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  return new Date(value).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function useFormat() {
  const { lang, t } = useTranslation();
  return {
    currency: (v: number | null | undefined, c?: string) => formatCurrency(v, c, lang),
    number: (v: number | null | undefined, d?: number) => formatNumber(v, d, lang),
    price: (v: number | null | undefined) => formatPrice(v, lang),
    percent: (v: number | null | undefined) => formatPercent(v, lang),
    dateTime: (v: string | null | undefined) => formatDateTime(v, lang),
    time: (v: string | null | undefined) => formatTime(v, lang),
    timeAgo: (v: string | null | undefined) => {
      if (!v) return t('common.never');
      const seconds = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
      if (seconds < 5) return t('common.justNow');
      if (seconds < 60) return lang === 'fa' ? `${seconds} ${t('common.sec')} ${t('common.ago')}` : `${seconds}${t('common.sec')} ${t('common.ago')}`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return lang === 'fa' ? `${minutes} ${t('common.min')} ${t('common.ago')}` : `${minutes}${t('common.min')} ${t('common.ago')}`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return lang === 'fa' ? `${hours} ${t('common.hour')} ${t('common.ago')}` : `${hours}${t('common.hour')} ${t('common.ago')}`;
      const days = Math.floor(hours / 24);
      return lang === 'fa' ? `${days} ${t('common.day')} ${t('common.ago')}` : `${days}${t('common.day')} ${t('common.ago')}`;
    },
  };
}
