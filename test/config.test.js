import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConfig,
  allDishes,
  findDish,
  ConfigError,
  TAGS,
  ALLERGENS
} from '../engine/core/config.js';

// Минимально валидный конфиг для тестов.
function baseConfig() {
  return {
    id: 'mu',
    name: 'MU Steak House',
    logo: 'logomu.png',
    target: { mind: 'targets.mind', preview: 'menu.jpg' },
    categories: [
      {
        id: 'hot',
        name: 'Горячее',
        dishes: [
          { id: 'steak', name: 'Стейк', price: 120000, video: 'steak.mp4' },
          { id: 'kebab', name: 'Кебаб', price: 68000, video: 'kebab.mp4' }
        ]
      },
      {
        id: 'drinks',
        name: 'Напитки',
        dishes: [{ id: 'cola', name: 'Кола', price: 12000, video: 'cola.mp4' }]
      }
    ]
  };
}

// Заглушка console.warn, чтобы вывод тестов был чистым.
function silentWarn(fn) {
  const original = console.warn;
  const messages = [];
  console.warn = (...args) => messages.push(args.join(' '));
  try {
    return { result: fn(), warnings: messages };
  } finally {
    console.warn = original;
  }
}

test('валидный конфиг проходит проверку', () => {
  const cfg = validateConfig(baseConfig());
  assert.equal(cfg.id, 'mu');
  assert.equal(cfg.categories.length, 2);
  assert.equal(cfg.categories[0].dishes[0].id, 'steak');
});

test('константы тегов и аллергенов на месте', () => {
  assert.deepEqual(TAGS, ['hit', 'chef', 'spicy', 'veg', 'halal', 'new']);
  assert.equal(ALLERGENS.length, 8);
});

test('нет обязательного поля: ConfigError с нужным path', () => {
  const noId = baseConfig();
  delete noId.id;
  assert.throws(() => validateConfig(noId), (err) => {
    assert.ok(err instanceof ConfigError);
    assert.equal(err.name, 'ConfigError');
    assert.equal(err.path, 'id');
    return true;
  });

  const noMind = baseConfig();
  delete noMind.target.mind;
  assert.throws(() => validateConfig(noMind), (err) => {
    assert.equal(err.path, 'target.mind');
    return true;
  });

  const noPreview = baseConfig();
  delete noPreview.target.preview;
  assert.throws(() => validateConfig(noPreview), (err) => {
    assert.equal(err.path, 'target.preview');
    return true;
  });

  const noVideo = baseConfig();
  delete noVideo.categories[0].dishes[1].video;
  assert.throws(() => validateConfig(noVideo), (err) => {
    assert.equal(err.path, 'categories[0].dishes[1].video');
    return true;
  });

  const badPrice = baseConfig();
  badPrice.categories[1].dishes[0].price = 0;
  assert.throws(() => validateConfig(badPrice), (err) => {
    assert.equal(err.path, 'categories[1].dishes[0].price');
    return true;
  });

  const noCats = baseConfig();
  noCats.categories = [];
  assert.throws(() => validateConfig(noCats), (err) => {
    assert.equal(err.path, 'categories');
    return true;
  });

  const noCatName = baseConfig();
  delete noCatName.categories[1].name;
  assert.throws(() => validateConfig(noCatName), (err) => {
    assert.equal(err.path, 'categories[1].name');
    return true;
  });
});

test('умолчания подставляются', () => {
  const cfg = validateConfig(baseConfig());
  assert.deepEqual(cfg.theme, {
    bg: '#111111',
    accent: '#c8a050',
    accent2: '#e0c878',
    text: '#ffffff'
  });
  assert.equal(cfg.stage.w, 1.1);
  assert.equal(cfg.stage.y, 0.35);
  assert.equal(cfg.stage.key, 'luma');
  assert.equal(cfg.stage.feather, 0.08);
  assert.deepEqual(cfg.stage.luma, { threshold: 0.10, smoothing: 0.10 });
  assert.equal(cfg.tracking.filterMinCF, 0.0001);
  assert.equal(cfg.tracking.missTolerance, 5);
  assert.deepEqual(cfg.languages, ['ru']);
  assert.equal(cfg.defaultLang, 'ru');
  assert.equal(cfg.autoLang, true);
  assert.deepEqual(cfg.currency, {});
  assert.deepEqual(cfg.waiter, { url: '' });
  assert.equal(cfg.reviewUrl, '');
  assert.equal(cfg.hotspots, false);
  assert.equal(cfg.qr, '');

  const dish = cfg.categories[0].dishes[0];
  assert.equal(dish.weight, '');
  assert.equal(dish.kcal, null);
  assert.deepEqual(dish.tags, []);
  assert.deepEqual(dish.allergens, []);
  assert.deepEqual(dish.pairs, []);
  assert.equal(dish.promo, null);
  assert.equal(dish.poster, '');
  assert.equal(dish.audio, false);
  assert.equal(dish.key, 'luma');
  assert.equal(dish.hotspot, null);
});

test('умолчания вкладываются глубоко', () => {
  const raw = baseConfig();
  raw.stage = { luma: { threshold: 0.3 } };
  const cfg = validateConfig(raw);
  assert.equal(cfg.stage.luma.threshold, 0.3);
  assert.equal(cfg.stage.luma.smoothing, 0.10);
  assert.equal(cfg.stage.w, 1.1);
  assert.equal(cfg.stage.key, 'luma');
  assert.deepEqual(cfg.stage.chroma, {
    color: '#00ff00',
    similarity: 0.4,
    smoothness: 0.1,
    spill: 0.1
  });
});

test('defaultLang берётся из первого языка', () => {
  const raw = baseConfig();
  raw.languages = ['uz', 'ru'];
  const cfg = validateConfig(raw);
  assert.equal(cfg.defaultLang, 'uz');
});

test('входной объект не мутируется', () => {
  const raw = baseConfig();
  const snapshot = JSON.stringify(raw);
  const cfg = validateConfig(raw);
  cfg.categories[0].dishes[0].price = 1;
  assert.equal(JSON.stringify(raw), snapshot);
});

test('неизвестный тег и аллерген отбрасываются с предупреждением', () => {
  const raw = baseConfig();
  raw.categories[0].dishes[0].tags = ['hit', 'ufo', 'veg'];
  raw.categories[0].dishes[0].allergens = ['milk', 'uranium'];
  const { result, warnings } = silentWarn(() => validateConfig(raw));
  assert.deepEqual(result.categories[0].dishes[0].tags, ['hit', 'veg']);
  assert.deepEqual(result.categories[0].dishes[0].allergens, ['milk']);
  assert.equal(warnings.length, 2);
});

test('неизвестный key блюда заменяется на stage.key', () => {
  const raw = baseConfig();
  raw.stage = { key: 'chroma' };
  raw.categories[0].dishes[0].key = 'magic';
  const { result, warnings } = silentWarn(() => validateConfig(raw));
  assert.equal(result.categories[0].dishes[0].key, 'chroma');
  assert.equal(warnings.length, 1);
});

test('дубликат id блюда бросает ConfigError с путём', () => {
  const raw = baseConfig();
  raw.categories[1].dishes[0].id = 'steak';
  assert.throws(() => validateConfig(raw), (err) => {
    assert.ok(err instanceof ConfigError);
    assert.equal(err.path, 'categories[1].dishes[0].id');
    return true;
  });
});

test('дубликат id категории бросает ConfigError с путём', () => {
  const raw = baseConfig();
  raw.categories[1].id = 'hot';
  assert.throws(() => validateConfig(raw), (err) => {
    assert.equal(err.path, 'categories[1].id');
    return true;
  });
});

test('несуществующий pair отбрасывается', () => {
  const raw = baseConfig();
  raw.categories[0].dishes[0].pairs = ['cola', 'ghost'];
  const { result, warnings } = silentWarn(() => validateConfig(raw));
  assert.deepEqual(result.categories[0].dishes[0].pairs, ['cola']);
  assert.equal(warnings.length, 1);
});

test('allDishes даёт categoryId и не мутирует конфиг', () => {
  const cfg = validateConfig(baseConfig());
  const snapshot = JSON.stringify(cfg);
  const list = allDishes(cfg);
  assert.equal(list.length, 3);
  assert.deepEqual(
    list.map((d) => d.categoryId),
    ['hot', 'hot', 'drinks']
  );
  list[0].name = 'изменено';
  assert.equal(JSON.stringify(cfg), snapshot);
  assert.equal(cfg.categories[0].dishes[0].categoryId, undefined);
});

test('findDish находит блюдо и возвращает null для чужого id', () => {
  const cfg = validateConfig(baseConfig());
  const dish = findDish(cfg, 'cola');
  assert.equal(dish.name, 'Кола');
  assert.equal(dish.categoryId, 'drinks');
  assert.equal(findDish(cfg, 'nope'), null);
});
