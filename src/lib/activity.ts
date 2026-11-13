export interface BilingualActivity {
  fa: string;
  en: string;
}

function cleanMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

function translateDirection(direction: string): string {
  if (direction.toLowerCase() === 'buy' || direction.toLowerCase() === 'up') return 'خرید / صعودی';
  if (direction.toLowerCase() === 'sell' || direction.toLowerCase() === 'down') return 'فروش / نزولی';
  return 'خنثی';
}

function translateReason(reason: string): string {
  const knownReasons: Array<[RegExp, string]> = [
    [/^Price overextended from fast EMA — waiting for pullback$/i, 'قیمت از میانگین سریع بیش‌ازحد فاصله گرفته؛ منتظر اصلاح قیمت است'],
    [/^Downtrend but no completed pullback turn yet$/i, 'روند نزولی است، اما اصلاح قیمت هنوز کامل نشده است'],
    [/^Uptrend but no completed pullback turn yet$/i, 'روند صعودی است، اما اصلاح قیمت هنوز کامل نشده است'],
    [/^Volatility too low — gold scalps need movement$/i, 'نوسان بازار کم است؛ نوسان‌گیری طلا به حرکت کافی نیاز دارد'],
    [/^Volatility extreme \(news spike\) — standing aside$/i, 'نوسان غیرعادی و احتمالاً خبری است؛ فعلاً وارد نمی‌شود'],
    [/^Trend unclear$/i, 'جهت روند مشخص نیست'],
    [/^No fresh bullish trigger$/i, 'محرک تازه‌ای برای خرید دیده نشد'],
    [/^No fresh bearish trigger$/i, 'محرک تازه‌ای برای فروش دیده نشد'],
    [/^No MACD sign change$/i, 'تغییر معناداری در جهت MACD دیده نشد'],
    [/^Not enough data$/i, 'داده کافی وجود ندارد'],
  ];

  for (const [pattern, translation] of knownReasons) {
    if (pattern.test(reason.trim())) return translation;
  }

  return `دلیل: ${reason}`;
}

function translateError(error: string): string {
  if (error.includes('SYMBOL_EXPIRATION_SPECIFIED')) {
    return 'نسخه کتابخانه MT5 قابلیت انقضای مشخص‌شده برای سفارش را ارائه نمی‌کند؛ سفارش باید با حالت بدون انقضا ارسال شود.';
  }
  return `خطا: ${error}`;
}

export function getBilingualActivity(message: string): BilingualActivity {
  const en = cleanMessage(message);
  let match = en.match(/^Decision cycle failed: (.+)$/i);
  if (match) {
    return { en, fa: `چرخه تصمیم‌گیری با خطا مواجه شد: ${translateError(match[1])}` };
  }

  match = en.match(/^Strategy mode is 'both' but no strategy assigned — using AI prediction only$/i);
  if (match) {
    return { en, fa: 'حالت استراتژی روی «هر دو» است، اما استراتژی‌ای اختصاص داده نشده؛ فقط از مدل هوشمند استفاده می‌شود.' };
  }

  match = en.match(/^Synced (\d+) symbols from MT5 to database$/i);
  if (match) {
    return { en, fa: `${match[1]} نماد از MT5 با پایگاه داده همگام شد.` };
  }

  match = en.match(/^Strategy '([^']+)': (BUY|SELL|NEUTRAL) conf=([\d.]+)% — (.+)$/i);
  if (match) {
    return {
      en,
      fa: `استراتژی «${match[1]}»: ${translateDirection(match[2])} با اطمینان ${match[3]}٪ — ${translateReason(match[4])}`,
    };
  }

  match = en.match(/^Prediction: (UP|DOWN|NEUTRAL) conf=([\d.]+)% \(model=([^)]+)\)$/i);
  if (match) {
    return {
      en,
      fa: `پیش‌بینی: ${translateDirection(match[1])} با اطمینان ${match[2]}٪ (مدل: ${match[3]})`,
    };
  }

  match = en.match(/^Signal skipped: confidence ([\d.]+)% < ([\d.]+)% threshold$/i);
  if (match) {
    return { en, fa: `سیگنال رد شد: اطمینان ${match[1]}٪ از حداقل آستانه ${match[2]}٪ کمتر است.` };
  }

  match = en.match(/^No recent strategy signal — skipped$/i);
  if (match) {
    return { en, fa: 'سیگنال جدیدی از استراتژی وجود ندارد؛ این چرخه رد شد.' };
  }

  match = en.match(/^Signal skipped: direction is neutral$/i);
  if (match) {
    return { en, fa: 'سیگنال رد شد: جهت بازار خنثی است.' };
  }

  match = en.match(/^Strategy signal skipped: confidence ([\d.]+)% < ([\d.]+)%$/i);
  if (match) {
    return { en, fa: `سیگنال استراتژی رد شد: اطمینان ${match[1]}٪ از حداقل ${match[2]}٪ کمتر است.` };
  }

  match = en.match(/^No strategy signal — using AI prediction only$/i);
  if (match) {
    return { en, fa: 'سیگنال استراتژی موجود نیست؛ فقط پیش‌بینی مدل هوشمند استفاده می‌شود.' };
  }

  match = en.match(/^Starting backtest: (.+) on (\S+) (\S+)$/i);
  if (match) {
    return { en, fa: `بک‌تست «${match[1]}» روی نماد ${match[2]} و تایم‌فریم ${match[3]} شروع شد.` };
  }

  match = en.match(/^Backtest done: (.+) — profit=([\d.-]+), trades=(\d+), win=([\d.]+)%$/i);
  if (match) {
    return { en, fa: `بک‌تست «${match[1]}» تمام شد: سود ${match[2]}، تعداد معاملات ${match[3]}، نرخ برد ${match[4]}٪.` };
  }

  match = en.match(/^Range (.+) not available from broker — using latest (\d+) (\S+) candles instead$/i);
  if (match) {
    return { en, fa: `بازه تاریخی ${match[1]} از بروکر دریافت نشد؛ از آخرین ${match[2]} کندل ${match[3]} استفاده شد.` };
  }

  match = en.match(/^MT5 connected successfully$/i);
  if (match) {
    return { en, fa: 'اتصال به MT5 با موفقیت برقرار شد.' };
  }

  match = en.match(/^No enabled symbols found — predictions skipped$/i);
  if (match) {
    return { en, fa: 'نماد فعالی پیدا نشد؛ تولید پیش‌بینی انجام نشد.' };
  }

  return { en, fa: `رویداد سیستم: ${en}` };
}
