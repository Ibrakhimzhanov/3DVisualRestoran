// Заказы: создание, идемпотентность, переходы статусов, номера.
// Цены берутся из конфига ресторана, всё что прислал клиент про деньги игнорируется.

import path from 'node:path';
import crypto from 'node:crypto';
import { JsonFile } from './store.js';
import { dishName, serviceAmount } from './menu.js';
import { ApiError, badRequest, conflict, notFound, requireInt, requireString, optionalString, nowIso } from './http.js';

// Цепочка статусов из контракта.
export const CHAIN = ['new', 'accepted', 'kitchen', 'served', 'paid'];
export const STATUSES = [...CHAIN, 'cancelled'];

// Буквы для человеческих номеров. Похожие на цифры (З, О) и Ё выкинуты.
const LETTERS = 'АБВГДЕЖИКЛМНПРСТУФЦЧШЭЮЯ';
// Счётчик за день не может расти бесконечно: после 9999 берём следующую букву.
const MAX_COUNTER = 9999;

// Окно идемпотентности clientOrderId: сутки.
const IDEMPOTENCY_MS = 24 * 60 * 60 * 1000;
// Лимит из контракта: больше 20 заказов со стола за час - 429.
const RATE_LIMIT_ORDERS = 20;
const RATE_LIMIT_MS = 60 * 60 * 1000;

// Сколько заказов держим в файле.
const KEEP_DAYS = 30;
const KEEP_MAX = 5000;

// Ограничения на входные данные.
const MAX_ITEMS = 50;
const MAX_QTY = 20;
const TABLE_MAX = 16;
const CLIENT_ORDER_ID_MAX = 64;
const COMMENT_MAX = 500;
const NOTE_MAX = 200;

export class Orders {
  constructor(options) {
    this.menu = options.menu;
    this.sse = options.sse;
    // Смещение локального времени в минутах: по нему считается граница суток
    // для сброса счётчика номеров. По умолчанию Ташкент, UTC+5.
    this.tzOffsetMinutes = Number.isFinite(options.tzOffsetMinutes) ? options.tzOffsetMinutes : 300;

    this.file = new JsonFile(path.join(options.dataDir, 'orders.json'), { orders: [] });
    this.seqFile = new JsonFile(path.join(options.dataDir, 'seq.json'), { counters: {} });
    this.staffFile = new JsonFile(path.join(options.dataDir, 'staff.json'), { staff: [] });

    if (!Array.isArray(this.file.data.orders)) this.file.data.orders = [];
    if (!this.seqFile.data.counters || typeof this.seqFile.data.counters !== 'object') {
      this.seqFile.data.counters = {};
    }
  }

  get all() {
    return this.file.data.orders;
  }

  find(id) {
    if (typeof id !== 'string' || id === '') return null;
    return this.all.find((order) => order.id === id) || null;
  }

  // Заказ по id или 404.
  get(id) {
    const order = this.find(id);
    if (!order) throw notFound(`Заказ "${id}" не найден`);
    return order;
  }

  // Создание заказа. Возвращает { order, created }.
  // created === false, если это повтор по clientOrderId и мы отдаём старый заказ.
  create(payload) {
    const restaurantId = requireString(payload.restaurant, 'restaurant', { max: 40 });
    const menu = this.menu.load(restaurantId);

    const table = requireString(payload.table, 'table', { max: TABLE_MAX });
    const clientOrderId = requireString(payload.clientOrderId, 'clientOrderId', { max: CLIENT_ORDER_ID_MAX });
    const comment = optionalString(payload.comment, 'comment', { max: COMMENT_MAX });

    let lang = optionalString(payload.lang, 'lang', { max: 8 }) || menu.defaultLang;
    if (!menu.languages.includes(lang)) lang = menu.defaultLang;

    // Повтор в течение суток отдаёт тот же заказ и код 200.
    const existing = this.findByClientOrderId(restaurantId, clientOrderId);
    if (existing) return { order: existing, created: false };

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw badRequest('Список "items" не может быть пустым');
    }
    if (payload.items.length > MAX_ITEMS) {
      throw badRequest(`В заказе не может быть больше ${MAX_ITEMS} позиций`);
    }

    const items = [];
    let subtotal = 0;
    for (const raw of payload.items) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw badRequest('Каждый элемент "items" должен быть объектом');
      }
      const dishId = requireString(raw.dishId, 'items[].dishId', { max: 64 });
      const dish = menu.dishes.get(dishId);
      if (!dish) throw badRequest(`Неизвестное блюдо: "${dishId}"`);
      const qty = requireInt(raw.qty === undefined ? 1 : raw.qty, 'items[].qty', { min: 1, max: MAX_QTY });
      const note = optionalString(raw.note, 'items[].note', { max: NOTE_MAX });
      subtotal += dish.price * qty;
      items.push({
        dishId: dish.id,
        name: dishName(dish, lang, menu.defaultLang),
        qty,
        price: dish.price,
        note
      });
    }

    this.checkRateLimit(restaurantId, table);

    const service = serviceAmount(subtotal, menu.servicePercent);
    const at = nowIso();
    const order = {
      id: makeId('ord'),
      number: this.nextNumber(restaurantId),
      restaurant: restaurantId,
      table,
      clientOrderId,
      lang,
      comment,
      status: 'new',
      createdAt: at,
      updatedAt: at,
      subtotal,
      service,
      total: subtotal + service,
      items,
      waiter: null,
      timeline: [{ status: 'new', at }]
    };

    this.all.push(order);
    this.trim();
    this.file.save();

    this.sse.emit('order.created', { order: fullOrder(order) }, {
      restaurant: order.restaurant,
      table: order.table,
      orderId: order.id
    });

    return { order, created: true };
  }

  // Список для официанта: свежие сверху.
  list(options = {}) {
    const restaurantId = requireString(options.restaurant, 'restaurant', { max: 40 });
    this.menu.load(restaurantId);

    let statuses = null;
    if (options.status) {
      statuses = String(options.status)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      for (const status of statuses) {
        if (!STATUSES.includes(status)) throw badRequest(`Неизвестный статус: "${status}"`);
      }
    }

    const limit = options.limit === undefined || options.limit === null || options.limit === ''
      ? 50
      : requireInt(options.limit, 'limit', { min: 1, max: 200 });

    return this.all
      .filter((order) => order.restaurant === restaurantId)
      .filter((order) => (statuses ? statuses.includes(order.status) : true))
      .sort((a, b) => (a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt)))
      .slice(0, limit);
  }

  // Смена статуса официантом.
  setStatus(id, nextStatus, by) {
    const order = this.get(id);
    const status = requireString(nextStatus, 'status', { max: 20 });
    if (!STATUSES.includes(status)) throw badRequest(`Неизвестный статус: "${status}"`);
    const who = optionalString(by, 'by', { max: 60 });

    // Повтор того же статуса ничего не ломает: отдаём заказ как есть.
    if (order.status === status) return order;

    const allowed = allowedTransitions(order);
    if (!allowed.includes(status)) {
      throw conflict(
        `Переход "${order.status}" -> "${status}" запрещён`,
        { status: order.status, allowed }
      );
    }

    const at = nowIso();
    order.status = status;
    order.updatedAt = at;
    order.timeline.push(who ? { status, at, by: who } : { status, at });

    const waiter = this.findStaff(order.restaurant, who);
    if (waiter) order.waiter = waiter;

    this.file.save();

    this.sse.emit('order.status', { orderId: order.id, status, at, by: who || null }, {
      restaurant: order.restaurant,
      table: order.table,
      orderId: order.id
    });

    return order;
  }

  // --- внутреннее ---

  findByClientOrderId(restaurantId, clientOrderId) {
    const edge = Date.now() - IDEMPOTENCY_MS;
    for (let i = this.all.length - 1; i >= 0; i -= 1) {
      const order = this.all[i];
      if (order.restaurant !== restaurantId) continue;
      if (order.clientOrderId !== clientOrderId) continue;
      if (Date.parse(order.createdAt) < edge) continue;
      return order;
    }
    return null;
  }

  checkRateLimit(restaurantId, table) {
    const edge = Date.now() - RATE_LIMIT_MS;
    let count = 0;
    for (const order of this.all) {
      if (order.restaurant !== restaurantId || order.table !== table) continue;
      if (Date.parse(order.createdAt) < edge) continue;
      count += 1;
    }
    if (count >= RATE_LIMIT_ORDERS) {
      throw new ApiError(
        'rate_limited',
        `Со стола "${table}" уже сделано ${count} заказов за час, подождите`
      );
    }
  }

  // Человеческий номер: буква, дефис, счётчик. Счётчик сбрасывается каждые сутки.
  nextNumber(restaurantId) {
    const counters = this.seqFile.data.counters;
    const day = localDayKey(new Date(), this.tzOffsetMinutes);
    let entry = counters[restaurantId];

    if (!entry || typeof entry !== 'object') {
      entry = { day, letter: 0, counter: 0 };
    } else if (entry.day !== day) {
      // Новые сутки: счётчик с нуля, буква следующая, чтобы вчерашние номера не путались.
      entry = { day, letter: (Number(entry.letter) + 1) % LETTERS.length, counter: 0 };
    }

    entry.counter = Number(entry.counter) + 1;
    if (entry.counter > MAX_COUNTER) {
      entry.letter = (Number(entry.letter) + 1) % LETTERS.length;
      entry.counter = 1;
    }

    counters[restaurantId] = entry;
    this.seqFile.save();
    return `${LETTERS[entry.letter]}-${entry.counter}`;
  }

  // Официант из справочника server/data/staff.json. Файл правят руками,
  // поэтому перечитываем его при изменении.
  findStaff(restaurantId, login) {
    if (!login) return null;
    this.staffFile.reloadIfChanged();
    const list = Array.isArray(this.staffFile.data.staff) ? this.staffFile.data.staff : [];
    const found = list.find((person) => {
      if (!person || typeof person.id !== 'string') return false;
      if (person.id.toLowerCase() !== login.toLowerCase()) return false;
      if (person.restaurant && person.restaurant !== restaurantId) return false;
      return true;
    });
    if (found) {
      const name = typeof found.name === 'string' && found.name !== '' ? found.name : login;
      const initials = typeof found.initials === 'string' && found.initials !== ''
        ? found.initials
        : initialsFrom(name);
      return { name, initials };
    }
    // Сотрудника нет в справочнике: показываем хотя бы логин, чтобы гость видел человека.
    return { name: login, initials: initialsFrom(login) };
  }

  // Старые заказы из файла убираем, иначе он растёт бесконечно.
  trim() {
    const edge = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    let list = this.all.filter((order) => Date.parse(order.createdAt) >= edge);
    if (list.length > KEEP_MAX) list = list.slice(list.length - KEEP_MAX);
    if (list.length !== this.all.length) this.file.data.orders = list;
  }
}

// Куда можно уйти из текущего статуса: шаг вперёд, шаг назад или отмена.
export function allowedTransitions(order) {
  const current = order.status;

  if (current === 'cancelled') {
    // Откат отмены: возвращаемся туда, где заказ был до неё.
    const back = statusBeforeCancel(order);
    return back ? [back] : [];
  }

  const index = CHAIN.indexOf(current);
  const result = [];
  if (index >= 0 && index + 1 < CHAIN.length) result.push(CHAIN[index + 1]);
  if (index > 0) result.push(CHAIN[index - 1]);
  result.push('cancelled');
  return result;
}

function statusBeforeCancel(order) {
  const timeline = Array.isArray(order.timeline) ? order.timeline : [];
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    if (timeline[i] && timeline[i].status && timeline[i].status !== 'cancelled') {
      return timeline[i].status;
    }
  }
  return null;
}

// Публичный вид заказа: то, что уходит гостю после создания.
export function publicOrder(order) {
  return {
    id: order.id,
    number: order.number,
    restaurant: order.restaurant,
    table: order.table,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    lang: order.lang,
    comment: order.comment,
    subtotal: order.subtotal,
    service: order.service,
    total: order.total,
    items: order.items.map((item) => ({ ...item }))
  };
}

// Полный вид: то же плюс официант и история статусов.
export function fullOrder(order) {
  return {
    ...publicOrder(order),
    clientOrderId: order.clientOrderId,
    waiter: order.waiter,
    timeline: order.timeline.map((step) => ({ ...step }))
  };
}

// Идентификатор вида ord_<26 символов base32>, лексикографически растёт по времени.
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function makeId(prefix) {
  const chars = new Array(26);
  let time = Date.now();
  for (let i = 9; i >= 0; i -= 1) {
    chars[i] = BASE32[time % 32];
    time = Math.floor(time / 32);
  }
  const random = crypto.randomBytes(16);
  for (let i = 10; i < 26; i += 1) {
    chars[i] = BASE32[random[i - 10] % 32];
  }
  return `${prefix}_${chars.join('')}`;
}

// Дата вида 2026-09-17 в локальном времени ресторана.
export function localDayKey(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function initialsFrom(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
