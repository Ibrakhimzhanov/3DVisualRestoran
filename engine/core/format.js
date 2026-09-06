// Форматирование чисел для карточек блюд.

// Неразрывный пробел как разделитель разрядов.
const NBSP = ' ';

const KCAL_UNIT = { ru: 'ккал', uz: 'kkal', en: 'kcal' };

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// 68000 -> '68 000' (пробел неразрывный).
function groupDigits(value) {
  const neg = value < 0;
  const abs = Math.abs(Math.round(value));
  const digits = String(abs);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += NBSP;
    out += digits[i];
  }
  return neg ? `-${out}` : out;
}

// Единица валюты для языка, иначе первая доступная, иначе пусто.
function currencyUnit(currency, lang) {
  if (!currency || typeof currency !== 'object' || Array.isArray(currency)) return '';
  const direct = currency[lang];
  if (typeof direct === 'string' && direct !== '') return direct;
  for (const value of Object.values(currency)) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}

// Цена с единицей: 68000 -> '68 000 сум'.
export function price(value, lang = 'ru', currency = {}) {
  if (!isNumber(value)) return '';
  const unit = currencyUnit(currency, lang);
  const num = groupDigits(value);
  return unit ? `${num} ${unit}` : num;
}

// Калорийность: 540 -> '540 ккал'. Пусто, если значения нет.
export function kcal(value, lang = 'ru') {
  if (!isNumber(value)) return '';
  const unit = KCAL_UNIT[lang] || KCAL_UNIT.en;
  return `${groupDigits(value)} ${unit}`;
}
