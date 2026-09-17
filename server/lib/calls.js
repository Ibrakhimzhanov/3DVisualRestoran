// Вызовы официанта и просьба счёта.
// Повторный вызов с того же стола, пока предыдущий не закрыт, отдаёт тот же вызов.

import path from 'node:path';
import { JsonFile } from './store.js';
import { makeId } from './orders.js';
import { badRequest, notFound, requireString, optionalString, nowIso } from './http.js';

export const CALL_KINDS = ['waiter', 'bill'];

// Сколько вызовов держим в файле.
const KEEP_DAYS = 30;
const KEEP_MAX = 5000;
const TABLE_MAX = 16;

export class Calls {
  constructor(options) {
    this.menu = options.menu;
    this.sse = options.sse;
    this.orders = options.orders;
    this.file = new JsonFile(path.join(options.dataDir, 'calls.json'), { calls: [] });
    if (!Array.isArray(this.file.data.calls)) this.file.data.calls = [];
  }

  get all() {
    return this.file.data.calls;
  }

  find(id) {
    if (typeof id !== 'string' || id === '') return null;
    return this.all.find((call) => call.id === id) || null;
  }

  get(id) {
    const call = this.find(id);
    if (!call) throw notFound(`Вызов "${id}" не найден`);
    return call;
  }

  // Создание вызова. Возвращает { call, created }.
  create(payload) {
    const restaurantId = requireString(payload.restaurant, 'restaurant', { max: 40 });
    this.menu.load(restaurantId);

    const table = requireString(payload.table, 'table', { max: TABLE_MAX });
    const kind = optionalString(payload.kind, 'kind', { max: 16 }) || 'waiter';
    if (!CALL_KINDS.includes(kind)) {
      throw badRequest(`Поле "kind" должно быть одним из: ${CALL_KINDS.join(', ')}`);
    }

    let orderId = null;
    if (payload.orderId !== undefined && payload.orderId !== null && payload.orderId !== '') {
      orderId = requireString(payload.orderId, 'orderId', { max: 40 });
      if (this.orders && !this.orders.find(orderId)) {
        throw notFound(`Заказ "${orderId}" не найден`);
      }
    }

    // Пока открытый вызов того же вида с того же стола не закрыт, новый не создаём.
    const open = this.findOpen(restaurantId, table, kind);
    if (open) {
      // Заказ мог появиться позже вызова, привяжем его.
      if (orderId && !open.orderId) {
        open.orderId = orderId;
        this.file.save();
      }
      return { call: open, created: false };
    }

    const call = {
      id: makeId('call'),
      restaurant: restaurantId,
      table,
      kind,
      orderId,
      createdAt: nowIso(),
      ackAt: null,
      ackBy: null
    };

    this.all.push(call);
    this.trim();
    this.file.save();

    this.sse.emit('call.created', { call: publicCall(call) }, {
      restaurant: call.restaurant,
      table: call.table,
      orderId: call.orderId
    });

    return { call, created: true };
  }

  // Закрытие вызова официантом. Повторный ack ничего не ломает.
  ack(id, by) {
    const call = this.get(id);
    const who = optionalString(by, 'by', { max: 60 });
    if (call.ackAt) return call;

    call.ackAt = nowIso();
    call.ackBy = who || null;
    this.file.save();

    this.sse.emit('call.ack', { callId: call.id, by: call.ackBy }, {
      restaurant: call.restaurant,
      table: call.table,
      orderId: call.orderId
    });

    return call;
  }

  // Список для официанта: свежие сверху. open=true оставляет только незакрытые.
  list(options = {}) {
    const restaurantId = requireString(options.restaurant, 'restaurant', { max: 40 });
    this.menu.load(restaurantId);
    const onlyOpen = options.open === true || options.open === '1' || options.open === 'true';

    return this.all
      .filter((call) => call.restaurant === restaurantId)
      .filter((call) => (onlyOpen ? !call.ackAt : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findOpen(restaurantId, table, kind) {
    for (let i = this.all.length - 1; i >= 0; i -= 1) {
      const call = this.all[i];
      if (call.restaurant !== restaurantId) continue;
      if (call.table !== table) continue;
      if (call.kind !== kind) continue;
      if (call.ackAt) continue;
      return call;
    }
    return null;
  }

  trim() {
    const edge = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    let list = this.all.filter((call) => Date.parse(call.createdAt) >= edge);
    if (list.length > KEEP_MAX) list = list.slice(list.length - KEEP_MAX);
    if (list.length !== this.all.length) this.file.data.calls = list;
  }
}

// Вид вызова для клиента, ровно как в контракте.
export function publicCall(call) {
  return {
    id: call.id,
    restaurant: call.restaurant,
    kind: call.kind,
    table: call.table,
    orderId: call.orderId,
    createdAt: call.createdAt,
    ackAt: call.ackAt,
    ackBy: call.ackBy
  };
}
