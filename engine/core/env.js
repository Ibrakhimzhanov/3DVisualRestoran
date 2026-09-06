// Определение окружения: встроенные браузеры, язык, десктоп.

const IOS_RE = /iPhone|iPad|iPod/i;
const ANDROID_RE = /Android/i;
const MOBILE_RE = /Android|iPhone|iPad|iPod|Mobile/i;

// Внутренний браузер соцсети, где камера часто недоступна.
export function detectWebView(ua) {
  const s = typeof ua === 'string' ? ua : '';
  if (/Telegram|TgWebView/i.test(s)) return 'telegram';
  if (/Instagram/i.test(s)) return 'instagram';
  if (/FBAN|FBAV/i.test(s)) return 'facebook';
  return null;
}

// Ссылка, которая выкидывает пользователя из webview в обычный браузер.
export function escapeUrl(href, ua) {
  if (typeof href !== 'string' || href === '') return null;
  const s = typeof ua === 'string' ? ua : '';
  if (IOS_RE.test(s)) return `x-safari-${href}`;
  if (ANDROID_RE.test(s)) {
    const bare = href.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    return `intent://${bare}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  }
  return null;
}

// Язык интерфейса по списку языков браузера.
export function pickLang(navLangs, languages, defaultLang, autoLang) {
  const list = Array.isArray(languages) && languages.length ? languages : ['ru'];
  const fallback = typeof defaultLang === 'string' && defaultLang ? defaultLang : list[0];
  if (!autoLang) return fallback;
  const navs = Array.isArray(navLangs) ? navLangs : [];
  for (const item of navs) {
    if (typeof item !== 'string' || item.length < 2) continue;
    const code = item.slice(0, 2).toLowerCase();
    if (list.includes(code)) return code;
  }
  return fallback;
}

// Скорее всего десктоп: нет мобильных признаков и широкий экран.
export function isLikelyDesktop(ua, width) {
  const s = typeof ua === 'string' ? ua : '';
  const w = typeof width === 'number' && Number.isFinite(width) ? width : 0;
  return !MOBILE_RE.test(s) && w >= 1024;
}
