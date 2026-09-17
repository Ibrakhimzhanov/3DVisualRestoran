// Конфиг ресторана: названия блюд, цены, языки, процент сервисного сбора.
// Цены сервер берёт только отсюда. Клиентским ценам доверять нельзя.
// Файл перечитывается, когда меняется mtime или размер.

import fs from 'node:fs';
import path from 'node:path';
import { ApiError, badRequest, notFound } from './http.js';

// Идентификатор ресторана: только безопасные символы, чтобы нельзя было выйти из папки.
const RESTAURANT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// Сервисный сбор по умолчанию, если в конфиге ресторана его нет.
const DEFAULT_SERVICE_PERCENT = 10;

export class Menu {
  constructor(dir) {
    this.dir = dir;
    // restaurantId -> { stamp, data }
    this.cache = new Map();
  }

  // Возвращает разобранное меню ресторана.
  // Бросает not_found, если конфига нет, и bad_request, если id кривой.
  load(restaurantId) {
    if (typeof restaurantId !== 'string' || !RESTAURANT_ID.test(restaurantId)) {
      throw badRequest('Поле "restaurant" имеет недопустимый формат');
    }

    const file = path.join(this.dir, `${restaurantId}.json`);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      throw notFound(`Ресторан "${restaurantId}" не найден`);
    }

    const cached = this.cache.get(restaurantId);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.data;
    }

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new ApiError('server_error', `Конфиг ресторана "${restaurantId}" не читается: ${err.message}`);
    }

    const data = parseConfig(restaurantId, raw);
    this.cache.set(restaurantId, { mtimeMs: stat.mtimeMs, size: stat.size, data });
    return data;
  }
}

function parseConfig(restaurantId, raw) {
  const languages = Array.isArray(raw.languages) && raw.languages.length > 0
    ? raw.languages.filter((x) => typeof x === 'string')
    : ['ru'];
  const defaultLang = typeof raw.defaultLang === 'string' && languages.includes(raw.defaultLang)
    ? raw.defaultLang
    : languages[0];

  const dishes = new Map();
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  for (const category of categories) {
    const list = category && Array.isArray(category.dishes) ? category.dishes : [];
    for (const dish of list) {
      if (!dish || typeof dish.id !== 'string' || dish.id === '') continue;
      if (typeof dish.price !== 'number' || !Number.isFinite(dish.price) || dish.price < 0) continue;
      dishes.set(dish.id, {
        id: dish.id,
        name: dish.name,
        price: Math.round(dish.price),
        category: category && typeof category.id === 'string' ? category.id : ''
      });
    }
  }

  return {
    id: restaurantId,
    name: typeof raw.name === 'string' ? raw.name : restaurantId,
    languages,
    defaultLang,
    servicePercent: readServicePercent(raw),
    dishes
  };
}

// Процент сервисного сбора: число или объект { percent: 10 }.
function readServicePercent(raw) {
  const value = raw && raw.service;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
    return value;
  }
  if (value && typeof value === 'object' && typeof value.percent === 'number') {
    const percent = value.percent;
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) return percent;
  }
  return DEFAULT_SERVICE_PERCENT;
}

// Название блюда на нужном языке. Поддерживает и строку, и словарь переводов.
export function dishName(dish, lang, defaultLang) {
  const value = dish.name;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value[lang] === 'string' && value[lang] !== '') return value[lang];
    if (typeof value[defaultLang] === 'string' && value[defaultLang] !== '') return value[defaultLang];
    if (typeof value.ru === 'string' && value.ru !== '') return value.ru;
    const first = Object.values(value).find((x) => typeof x === 'string' && x !== '');
    if (first) return first;
  }
  return dish.id;
}

// Сервисный сбор в целых сумах.
export function serviceAmount(subtotal, percent) {
  return Math.round((subtotal * percent) / 100);
}
