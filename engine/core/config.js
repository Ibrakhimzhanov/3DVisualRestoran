// Схема конфига ресторана: проверка и подстановка умолчаний.

export const TAGS = ['hit', 'chef', 'spicy', 'veg', 'halal', 'new'];
export const ALLERGENS = ['gluten', 'egg', 'milk', 'nuts', 'fish', 'seafood', 'soy', 'sesame'];

// Допустимые режимы прозрачности видео.
export const KEY_MODES = ['luma', 'chroma', 'none'];

export class ConfigError extends Error {
  constructor(message, path = '') {
    super(message);
    this.name = 'ConfigError';
    this.path = path;
  }
}

const DEFAULT_THEME = {
  bg: '#111111',
  accent: '#c8a050',
  accent2: '#e0c878',
  text: '#ffffff'
};

const DEFAULT_STAGE = {
  x: 0,
  y: 0.35,
  w: 1.1,
  key: 'luma',
  luma: { threshold: 0.10, smoothing: 0.10 },
  chroma: { color: '#00ff00', similarity: 0.4, smoothness: 0.1, spill: 0.1 },
  feather: 0.08
};

const DEFAULT_TRACKING = {
  filterMinCF: 0.0001,
  filterBeta: 0.5,
  missTolerance: 5,
  warmupTolerance: 0,
  smoothFactor: 0.02,
  posThreshold: 0.005,
  rotThreshold: 0.008
};

const DEFAULT_WAITER = { url: '' };

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isFilledString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// Строка или словарь переводов {ru:'...', uz:'...'}.
function isFilledText(v) {
  if (isFilledString(v)) return true;
  if (!isPlainObject(v)) return false;
  return Object.values(v).some((x) => isFilledString(x));
}

function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out;
  }
  return v;
}

// Глубокое наложение значений на умолчания.
function withDefaults(defaults, value) {
  const out = clone(defaults);
  if (!isPlainObject(value)) return out;
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = withDefaults(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}

function need(cond, message, path) {
  if (!cond) throw new ConfigError(message, path);
}

// Оставить только известные значения из списка, лишние выбросить с предупреждением.
function filterKnown(list, allowed, kind, path) {
  if (list === undefined || list === null) return [];
  const arr = Array.isArray(list) ? list : [list];
  const out = [];
  for (const item of arr) {
    if (allowed.includes(item)) {
      if (!out.includes(item)) out.push(item);
    } else {
      console.warn(`[config] неизвестное значение ${kind} "${item}" в ${path}, пропущено`);
    }
  }
  return out;
}

export function validateConfig(raw) {
  need(isPlainObject(raw), 'Конфиг должен быть объектом', '');
  const src = clone(raw);
  const cfg = {};

  // Обязательные строки верхнего уровня.
  need(isFilledString(src.id), 'Поле id обязательно', 'id');
  need(isFilledText(src.name), 'Поле name обязательно', 'name');
  need(isFilledString(src.logo), 'Поле logo обязательно', 'logo');
  cfg.id = src.id;
  cfg.name = src.name;
  cfg.logo = src.logo;

  // Мишень трекинга.
  need(isPlainObject(src.target), 'Поле target обязательно', 'target');
  need(isFilledString(src.target.mind), 'Поле target.mind обязательно', 'target.mind');
  need(isFilledString(src.target.preview), 'Поле target.preview обязательно', 'target.preview');
  cfg.target = clone(src.target);

  cfg.theme = withDefaults(DEFAULT_THEME, src.theme);
  cfg.stage = withDefaults(DEFAULT_STAGE, src.stage);
  cfg.tracking = withDefaults(DEFAULT_TRACKING, src.tracking);
  cfg.waiter = withDefaults(DEFAULT_WAITER, src.waiter);

  // Ширина сцены нужна всегда и должна быть положительным числом.
  need(
    typeof cfg.stage.w === 'number' && Number.isFinite(cfg.stage.w) && cfg.stage.w > 0,
    'Поле stage.w должно быть положительным числом',
    'stage.w'
  );
  if (!KEY_MODES.includes(cfg.stage.key)) {
    console.warn(`[config] неизвестный режим stage.key "${cfg.stage.key}", взят "luma"`);
    cfg.stage.key = 'luma';
  }

  // Языки.
  const langs = Array.isArray(src.languages) ? src.languages.filter(isFilledString) : [];
  cfg.languages = langs.length ? langs : ['ru'];
  cfg.defaultLang = isFilledString(src.defaultLang) ? src.defaultLang : cfg.languages[0];
  cfg.autoLang = src.autoLang === undefined ? true : Boolean(src.autoLang);

  cfg.currency = isPlainObject(src.currency) ? clone(src.currency) : {};
  cfg.reviewUrl = isFilledString(src.reviewUrl) ? src.reviewUrl : '';
  cfg.hotspots = src.hotspots === undefined ? false : Boolean(src.hotspots);
  cfg.qr = isFilledString(src.qr) ? src.qr : '';

  // Категории и блюда.
  need(Array.isArray(src.categories) && src.categories.length > 0, 'Нужна непустая categories', 'categories');

  const seenCategories = new Set();
  const seenDishes = new Set();
  cfg.categories = src.categories.map((rawCat, ci) => {
    const cp = `categories[${ci}]`;
    need(isPlainObject(rawCat), 'Категория должна быть объектом', cp);
    need(isFilledString(rawCat.id), 'Поле id категории обязательно', `${cp}.id`);
    need(isFilledText(rawCat.name), 'Поле name категории обязательно', `${cp}.name`);
    need(!seenCategories.has(rawCat.id), `Дубликат id категории "${rawCat.id}"`, `${cp}.id`);
    seenCategories.add(rawCat.id);

    const cat = clone(rawCat);
    const rawDishes = rawCat.dishes === undefined ? [] : rawCat.dishes;
    need(Array.isArray(rawDishes), 'Поле dishes должно быть массивом', `${cp}.dishes`);

    cat.dishes = rawDishes.map((rawDish, di) => {
      const dp = `${cp}.dishes[${di}]`;
      need(isPlainObject(rawDish), 'Блюдо должно быть объектом', dp);
      need(isFilledString(rawDish.id), 'Поле id блюда обязательно', `${dp}.id`);
      need(isFilledText(rawDish.name), 'Поле name блюда обязательно', `${dp}.name`);
      need(
        typeof rawDish.price === 'number' && Number.isFinite(rawDish.price) && rawDish.price > 0,
        'Поле price должно быть числом больше нуля',
        `${dp}.price`
      );
      need(isFilledString(rawDish.video), 'Поле video обязательно', `${dp}.video`);
      need(!seenDishes.has(rawDish.id), `Дубликат id блюда "${rawDish.id}"`, `${dp}.id`);
      seenDishes.add(rawDish.id);

      const dish = clone(rawDish);
      dish.weight = rawDish.weight === undefined || rawDish.weight === null ? '' : rawDish.weight;
      dish.kcal =
        typeof rawDish.kcal === 'number' && Number.isFinite(rawDish.kcal) ? rawDish.kcal : null;
      dish.tags = filterKnown(rawDish.tags, TAGS, 'tag', `${dp}.tags`);
      dish.allergens = filterKnown(rawDish.allergens, ALLERGENS, 'allergen', `${dp}.allergens`);
      dish.pairs = Array.isArray(rawDish.pairs) ? rawDish.pairs.filter(isFilledString) : [];
      dish.promo = rawDish.promo === undefined ? null : rawDish.promo;
      dish.poster = isFilledString(rawDish.poster) ? rawDish.poster : '';
      dish.audio = rawDish.audio === undefined ? false : Boolean(rawDish.audio);
      dish.hotspot = rawDish.hotspot === undefined ? null : rawDish.hotspot;
      if (rawDish.key === undefined) {
        dish.key = cfg.stage.key;
      } else if (KEY_MODES.includes(rawDish.key)) {
        dish.key = rawDish.key;
      } else {
        console.warn(`[config] неизвестный key "${rawDish.key}" в ${dp}.key, взят "${cfg.stage.key}"`);
        dish.key = cfg.stage.key;
      }
      return dish;
    });

    return cat;
  });

  // Чистка pairs: ссылки на несуществующие блюда убираем.
  for (let ci = 0; ci < cfg.categories.length; ci++) {
    const cat = cfg.categories[ci];
    for (let di = 0; di < cat.dishes.length; di++) {
      const dish = cat.dishes[di];
      dish.pairs = dish.pairs.filter((pid) => {
        if (pid === dish.id) {
          console.warn(`[config] pairs в categories[${ci}].dishes[${di}] ссылается сам на себя, убрано`);
          return false;
        }
        if (!seenDishes.has(pid)) {
          console.warn(`[config] неизвестный id "${pid}" в categories[${ci}].dishes[${di}].pairs, убран`);
          return false;
        }
        return true;
      });
    }
  }

  return cfg;
}

// Плоский список блюд с categoryId. Исходный конфиг не меняется.
export function allDishes(config) {
  if (!isPlainObject(config) || !Array.isArray(config.categories)) return [];
  const out = [];
  for (const cat of config.categories) {
    const dishes = Array.isArray(cat.dishes) ? cat.dishes : [];
    for (const dish of dishes) out.push({ ...dish, categoryId: cat.id });
  }
  return out;
}

export function findDish(config, id) {
  if (!isPlainObject(config) || !Array.isArray(config.categories)) return null;
  for (const cat of config.categories) {
    const dishes = Array.isArray(cat.dishes) ? cat.dishes : [];
    for (const dish of dishes) {
      if (dish.id === id) return { ...dish, categoryId: cat.id };
    }
  }
  return null;
}
