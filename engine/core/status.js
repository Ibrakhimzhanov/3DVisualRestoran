// Состояние отправленного заказа: отправка, живое обновление по SSE, вызовы.
// Разметку и тексты рисует ui.js, здесь только данные и события.
import { Emitter } from './emitter.js';
import {
  ApiError,
  clientOrderId,
  resetClientOrderId,
  savedOrderId,
  saveOrderId,
  defaultStorage
} from './api.js';

// Четыре шага таймлайна на экране гостя. paid и cancelled показываются отдельно.
export const STEPS = ['new', 'accepted', 'kitchen', 'served'];

// Порядок статусов по цепочке контракта.
const RANK = { new: 0, accepted: 1, kitchen: 2, served: 3, paid: 4 };

// Фазы экрана: пусто, отправляем, живой заказ, отправка не прошла.
export const PHASES = ['idle', 'sending', 'live', 'failed'];

const CALL_KINDS = ['waiter', 'bill'];

function isFilledString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// Только то, что мы умеем показывать. Всё лишнее с сервера отбрасываем,
// строки остаются строками и уходят в textContent, без разметки.
function sanitizeOrder(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const str = (v) => (typeof v === 'string' ? v : '');

  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      return {
        dishId: str(it.dishId),
        name: str(it.name),
        qty: Math.max(0, Math.trunc(num(it.qty))),
        price: num(it.price),
        note: str(it.note)
      };
    })
    .filter((it) => it && it.qty > 0);

  const timeline = (Array.isArray(raw.timeline) ? raw.timeline : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      return { status: str(row.status), at: str(row.at), by: str(row.by) };
    })
    .filter((row) => row && row.status);

  const waiterRaw = raw.waiter && typeof raw.waiter === 'object' ? raw.waiter : null;
  const waiter = waiterRaw
    ? { name: str(waiterRaw.name), initials: str(waiterRaw.initials) }
    : null;

  return {
    id: str(raw.id),
    number: str(raw.number),
    restaurant: str(raw.restaurant),
    table: str(raw.table),
    status: str(raw.status) || 'new',
    createdAt: str(raw.createdAt),
    subtotal: num(raw.subtotal),
    service: num(raw.service),
    total: num(raw.total),
    items,
    timeline,
    waiter: waiter && (waiter.name || waiter.initials) ? waiter : null
  };
}

export class OrderStatus extends Emitter {
  constructor({ api, restaurantId, storage = undefined } = {}) {
    super();
    this.api = api || null;
    this.restaurantId = String(restaurantId ?? '');
    this.storage = storage === undefined ? defaultStorage() : storage;

    this._order = null;
    this._orderId = savedOrderId(this.restaurantId, this.storage);
    this._phase = this._orderId ? 'live' : 'idle';
    this._error = null;
    this._online = true;
    this._unsubscribe = null;
    this._pending = null;
    // Вызовы официанта: waiter и bill живут независимо.
    this._calls = { waiter: { state: 'idle', id: '', acked: false }, bill: { state: 'idle', id: '', acked: false } };
    this._onNet = null;
  }

  // ---------- чтение ----------

  get order() {
    return this._order;
  }

  get orderId() {
    return this._orderId;
  }

  get phase() {
    return this._phase;
  }

  get error() {
    return this._error;
  }

  get online() {
    return this._online;
  }

  hasOrder() {
    return Boolean(this._orderId);
  }

  callState(kind) {
    const row = this._calls[kind === 'bill' ? 'bill' : 'waiter'];
    return row ? row.state : 'idle';
  }

  // Четыре шага таймлайна: done, now, next. Время берём из timeline заказа.
  steps() {
    const order = this._order;
    const current = order ? order.status : 'new';
    const times = new Map();
    for (const row of order && Array.isArray(order.timeline) ? order.timeline : []) {
      if (!times.has(row.status)) times.set(row.status, row.at);
    }
    if (order && order.createdAt && !times.has('new')) times.set('new', order.createdAt);

    const cancelled = current === 'cancelled';
    const rank = Object.prototype.hasOwnProperty.call(RANK, current) ? RANK[current] : 0;

    return STEPS.map((status, i) => {
      let state;
      if (cancelled) state = times.has(status) ? 'done' : 'next';
      else if (i < rank) state = 'done';
      else if (i === rank) state = 'now';
      else state = 'next';
      // served и paid закрывают последний шаг совсем.
      if (!cancelled && i === STEPS.length - 1 && rank >= RANK.served) state = 'done';
      return { status, at: times.get(status) || '', state };
    });
  }

  // ---------- изменения ----------

  _setPhase(phase, error = null) {
    this._phase = PHASES.indexOf(phase) === -1 ? 'idle' : phase;
    this._error = error;
    this.emit('change', this);
  }

  _setOrder(raw, { silent = false } = {}) {
    const next = sanitizeOrder(raw);
    if (!next || !next.id) return false;
    this._order = next;
    this._orderId = next.id;
    saveOrderId(this.restaurantId, next.id, this.storage);
    if (!silent) this.emit('change', this);
    return true;
  }

  // Восстановление после перезагрузки: id в sessionStorage есть, данные тянем.
  async restore() {
    if (!this._orderId || !this.api) return false;
    this._setPhase('live');
    this.listen();
    try {
      const data = await this.api.getOrder(this._orderId);
      if (!this._setOrder(data)) throw new ApiError('Пустой ответ сервера', { code: 'server_error' });
      return true;
    } catch (err) {
      // Заказа больше нет: чистим сессию, гость возвращается в меню.
      if (err instanceof ApiError && err.status === 404) {
        this.reset();
        return false;
      }
      this._setPhase('live', err);
      return true;
    }
  }

  // Отправка заказа. Повтор берёт те же позиции и тот же clientOrderId.
  async send({ table, items, comment, lang } = {}) {
    if (!this.api) return false;
    if (this._phase === 'sending') return false;

    if (Array.isArray(items) && items.length) {
      this._pending = { table, items: items.slice(), comment: comment || '', lang: lang || '' };
    }
    const payload = this._pending;
    if (!payload || !payload.items.length) {
      this._setPhase('failed', new ApiError('Заказ пуст', { code: 'bad_request', status: 400 }));
      return false;
    }
    if (!isFilledString(payload.table)) {
      this._setPhase('failed', new ApiError('Нет номера стола', { code: 'no_table', status: 0 }));
      return false;
    }

    this._setPhase('sending');
    try {
      const data = await this.api.createOrder({
        table: payload.table,
        items: payload.items,
        comment: payload.comment,
        lang: payload.lang,
        clientOrderId: clientOrderId(this.restaurantId, this.storage)
      });
      if (!this._setOrder(data, { silent: true })) {
        throw new ApiError('Сервер вернул пустой заказ', { code: 'server_error' });
      }
      // Заказ ушёл: следующий будет отдельным, ключ идемпотентности сбрасываем.
      resetClientOrderId(this.restaurantId, this.storage);
      this._pending = null;
      this._setPhase('live');
      this.listen();
      this.emit('sent', this._order);
      return true;
    } catch (err) {
      // Позиции остаются в _pending и в корзине: молча ничего не теряем.
      this._setPhase('failed', err);
      this.emit('failed', err);
      return false;
    }
  }

  // Повтор той же отправки, тем же clientOrderId.
  retry() {
    return this.send({});
  }

  // Свежий снимок заказа. Нужен после обрыва SSE.
  async reload() {
    if (!this._orderId || !this.api) return false;
    try {
      const data = await this.api.getOrder(this._orderId);
      return this._setOrder(data);
    } catch (err) {
      console.warn('[status] не удалось обновить заказ:', err);
      return false;
    }
  }

  // Вызов официанта или просьба счёта.
  async call(kind) {
    const type = kind === 'bill' ? 'bill' : 'waiter';
    const row = this._calls[type];
    if (!this.api || !row || row.state === 'sending') return false;
    const table = this._order ? this._order.table : '';
    if (!isFilledString(table)) return false;

    row.state = 'sending';
    this.emit('change', this);
    try {
      const data = await this.api.createCall({ table, kind: type, orderId: this._orderId });
      row.id = data && typeof data.id === 'string' ? data.id : '';
      row.acked = Boolean(data && data.ackAt);
      row.state = row.acked ? 'ack' : 'sent';
      this.emit('change', this);
      return true;
    } catch (err) {
      row.state = 'idle';
      this._error = err;
      this.emit('change', this);
      this.emit('call-failed', { kind: type, error: err });
      return false;
    }
  }

  // ---------- поток событий ----------

  listen() {
    if (!this.api || !this._orderId || this._unsubscribe) return;

    this._unsubscribe = this.api.streamOrder(this._orderId, {
      open: () => {
        // Соединение поднялось: добираем снимок, на Last-Event-ID не полагаемся.
        this._online = true;
        this.emit('change', this);
        this.reload();
      },
      error: () => {
        // EventSource переподключается сам, просто отмечаем обрыв.
        this._online = false;
        this.emit('change', this);
      },
      order: (order) => this._setOrder(order),
      status: (data) => {
        if (!data || typeof data !== 'object') return;
        if (isFilledString(data.orderId) && data.orderId !== this._orderId) return;
        if (!this._order || !isFilledString(data.status)) {
          this.reload();
          return;
        }
        this._order.status = String(data.status);
        const at = isFilledString(data.at) ? String(data.at) : '';
        const by = isFilledString(data.by) ? String(data.by) : '';
        if (!this._order.timeline.some((row) => row.status === this._order.status)) {
          this._order.timeline.push({ status: this._order.status, at, by });
        }
        this.emit('change', this);
        // Имя официанта и суммы приезжают только в полном объекте.
        this.reload();
      },
      call: (call) => {
        if (!call || typeof call !== 'object') return;
        const type = call.kind === 'bill' ? 'bill' : 'waiter';
        const row = this._calls[type];
        row.id = typeof call.id === 'string' ? call.id : row.id;
        row.acked = Boolean(call.ackAt);
        row.state = row.acked ? 'ack' : 'sent';
        this.emit('change', this);
      },
      callAck: (data) => {
        if (!data || typeof data !== 'object') return;
        for (const type of CALL_KINDS) {
          const row = this._calls[type];
          if (row.id && row.id === data.callId) {
            row.acked = true;
            row.state = 'ack';
          }
        }
        this.emit('change', this);
      }
    });

    // Связь вернулась: сразу обновляем снимок.
    if (!this._onNet && typeof globalThis.addEventListener === 'function') {
      this._onNet = () => {
        this._online = Boolean(globalThis.navigator ? globalThis.navigator.onLine : true);
        this.emit('change', this);
        if (this._online) this.reload();
      };
      globalThis.addEventListener('online', this._onNet);
      globalThis.addEventListener('offline', this._onNet);
    }
  }

  stop() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._onNet && typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('online', this._onNet);
      globalThis.removeEventListener('offline', this._onNet);
    }
    this._onNet = null;
  }

  // Полный сброс: заказа больше нет, гость начинает заново.
  reset() {
    this.stop();
    this._order = null;
    this._orderId = '';
    this._pending = null;
    this._calls = { waiter: { state: 'idle', id: '', acked: false }, bill: { state: 'idle', id: '', acked: false } };
    saveOrderId(this.restaurantId, '', this.storage);
    resetClientOrderId(this.restaurantId, this.storage);
    this._setPhase('idle');
  }
}
