// Клиент API заказов MenuLive. Единственный источник правды по контракту:
// docs/api-orders.md. Без внешних зависимостей: fetch, AbortController, EventSource.
//
// Здесь же живут сессионные ключи гостя: номер стола из QR, идемпотентный
// clientOrderId и id отправленного заказа. Всё в sessionStorage, чтобы
// перезагрузка страницы не теряла стол и не создавала второй заказ.

const DEFAULT_TIMEOUT = 12000;
const RETRIES = 3;
// Паузы перед второй и третьей попыткой.
const BACKOFF = [400, 1200];

const KEY_TABLE = 'menulive:table:';
const KEY_CLIENT = 'menulive:client:';
const KEY_ORDER = 'menulive:orderId:';

// Номер стола: короткий, только буквы, цифры и дефис. Всё остальное мусор.
const TABLE_RE = /^[A-Za-z0-9-]{1,8}$/;

export class ApiError extends Error {
  constructor(message, { code = 'network', status = 0, retriable = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    // Можно ли повторить запрос автоматически.
    this.retriable = Boolean(retriable);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFilledString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

// sessionStorage может бросать уже на обращении (приватный режим).
export function defaultStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readKey(storage, key) {
  if (!storage) return '';
  try {
    const raw = storage.getItem(key);
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
}

function writeKey(storage, key, value) {
  if (!storage) return;
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch (err) {
    console.warn('[api] не удалось сохранить', key, err);
  }
}

// ---------- сессия гостя ----------

// Номер стола из ссылки вида /brest?t=12. Пустая строка, если стола нет.
export function readTable(restaurantId, search = '', storage = undefined) {
  const store = storage === undefined ? defaultStorage() : storage;
  const key = KEY_TABLE + String(restaurantId ?? '');
  let value = '';
  try {
    const params = new URLSearchParams(String(search || ''));
    value = String(params.get('t') || '').trim();
  } catch {
    value = '';
  }
  if (value && TABLE_RE.test(value)) {
    writeKey(store, key, value);
    return value;
  }
  // Стола в ссылке нет: берём тот, что уже был в этой вкладке.
  const saved = readKey(store, key).trim();
  return TABLE_RE.test(saved) ? saved : '';
}

// Случайный хвост из 16 шестнадцатеричных знаков.
function randomTail() {
  const bytes = new Uint8Array(8);
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// Идемпотентный ключ заказа. Генерируется один раз и живёт в sessionStorage:
// повтор отправки с тем же ключом не создаёт второй заказ.
export function clientOrderId(restaurantId, storage = undefined) {
  const store = storage === undefined ? defaultStorage() : storage;
  const key = KEY_CLIENT + String(restaurantId ?? '');
  const saved = readKey(store, key);
  if (isFilledString(saved)) return saved;
  const next = 'c_' + randomTail();
  writeKey(store, key, next);
  return next;
}

// Сбросить ключ: следующий заказ будет новым, а не дубликатом прошлого.
export function resetClientOrderId(restaurantId, storage = undefined) {
  const store = storage === undefined ? defaultStorage() : storage;
  writeKey(store, KEY_CLIENT + String(restaurantId ?? ''), '');
}

export function savedOrderId(restaurantId, storage = undefined) {
  const store = storage === undefined ? defaultStorage() : storage;
  return readKey(store, KEY_ORDER + String(restaurantId ?? '')).trim();
}

export function saveOrderId(restaurantId, orderId, storage = undefined) {
  const store = storage === undefined ? defaultStorage() : storage;
  writeKey(store, KEY_ORDER + String(restaurantId ?? ''), isFilledString(orderId) ? orderId.trim() : '');
}

// ---------- адрес API ----------

// Из конфига ресторана: api.baseUrl. Нет поля - текущий origin плюс /api/v1.
export function resolveBaseUrl(config, origin = '') {
  const api = config && typeof config === 'object' ? config.api : null;
  const fromConfig = api && typeof api === 'object' ? api.baseUrl : null;
  const base = isFilledString(fromConfig)
    ? fromConfig.trim()
    : String(origin || '').replace(/\/+$/, '') + '/api/v1';
  return base.replace(/\/+$/, '');
}

// ---------- клиент ----------

export class OrdersApi {
  constructor({ baseUrl, restaurant, timeout = DEFAULT_TIMEOUT, retries = RETRIES } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.restaurant = String(restaurant || '');
    this.timeout = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT;
    this.retries = Number.isFinite(retries) && retries > 0 ? retries : RETRIES;
  }

  _url(path, query) {
    let url = this.baseUrl + path;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += '?' + qs;
    }
    return url;
  }

  // Один поход в сеть с таймаутом. Разбирает ошибки контракта.
  async _once(url, method, body) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeout) : null;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
        cache: 'no-store',
        credentials: 'omit'
      });
    } catch (err) {
      const aborted = err && (err.name === 'AbortError' || err.code === 20);
      throw new ApiError(aborted ? 'Превышено время ожидания' : 'Нет связи с сервером', {
        code: aborted ? 'timeout' : 'network',
        retriable: true
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const info = data && typeof data === 'object' ? data.error : null;
      const code = info && isFilledString(info.code) ? info.code : 'server_error';
      const message = info && isFilledString(info.message) ? info.message : `HTTP ${res.status}`;
      // Повторяем только то, что может само пройти: 5xx и 408.
      throw new ApiError(message, {
        code,
        status: res.status,
        retriable: res.status >= 500 || res.status === 408
      });
    }
    return data;
  }

  // Запрос с повторами при сетевой ошибке и 5xx, паузы нарастающие.
  async _request(path, { method = 'GET', body = null, query = null } = {}) {
    const url = this._url(path, query);
    let last = null;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      if (attempt > 0) await sleep(BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)]);
      try {
        return await this._once(url, method, body);
      } catch (err) {
        last = err;
        if (!(err instanceof ApiError) || !err.retriable) throw err;
      }
    }
    throw last || new ApiError('Не удалось выполнить запрос');
  }

  // POST /orders. clientOrderId обязателен: он защищает от дублей.
  async createOrder({ restaurant, table, items, comment, lang, clientOrderId: cid } = {}) {
    const list = (Array.isArray(items) ? items : [])
      .map((it) => {
        const dishId = it && isFilledString(it.dishId) ? it.dishId.trim() : '';
        const qty = Math.trunc(Number(it && it.qty));
        const row = { dishId, qty };
        if (it && isFilledString(it.note)) row.note = it.note.trim().slice(0, 200);
        return row;
      })
      .filter((it) => it.dishId && Number.isFinite(it.qty) && it.qty > 0);

    if (!list.length) throw new ApiError('Заказ пуст', { code: 'bad_request', status: 400 });

    const body = {
      restaurant: isFilledString(restaurant) ? restaurant : this.restaurant,
      table: String(table ?? ''),
      clientOrderId: isFilledString(cid) ? cid : clientOrderId(this.restaurant),
      items: list
    };
    if (isFilledString(lang)) body.lang = lang;
    if (isFilledString(comment)) body.comment = comment.trim().slice(0, 500);

    return this._request('/orders', { method: 'POST', body });
  }

  // GET /orders/:id. Гостевой, отдаёт заказ вместе с waiter и timeline.
  async getOrder(id) {
    if (!isFilledString(id)) throw new ApiError('Нет id заказа', { code: 'bad_request', status: 400 });
    return this._request('/orders/' + encodeURIComponent(id.trim()));
  }

  // POST /calls. kind: waiter или bill.
  async createCall({ restaurant, table, kind, orderId } = {}) {
    const type = kind === 'bill' ? 'bill' : 'waiter';
    const body = {
      restaurant: isFilledString(restaurant) ? restaurant : this.restaurant,
      table: String(table ?? ''),
      kind: type
    };
    if (isFilledString(orderId)) body.orderId = orderId.trim();
    return this._request('/calls', { method: 'POST', body });
  }

  // Подписка на поток событий гостя. Возвращает функцию отписки.
  // handlers: { open, order, status, call, callAck, ping, error }
  streamOrder(orderId, handlers = {}) {
    const noop = () => {};
    if (typeof EventSource !== 'function' || !isFilledString(orderId)) return noop;

    const url = this._url('/stream', {
      restaurant: this.restaurant,
      role: 'guest',
      orderId: String(orderId).trim()
    });

    let es;
    try {
      es = new EventSource(url);
    } catch (err) {
      console.warn('[api] SSE не открылся:', err);
      return noop;
    }

    // Данные с сервера недоверенные: разбираем в try и не падаем на мусоре.
    const parse = (event) => {
      try {
        return JSON.parse(event && event.data ? event.data : 'null');
      } catch {
        return null;
      }
    };
    const bind = (name, fn) => {
      if (typeof fn !== 'function') return;
      es.addEventListener(name, (event) => {
        const data = parse(event);
        if (data !== null) fn(data);
      });
    };

    if (typeof handlers.open === 'function') es.addEventListener('open', () => handlers.open());
    if (typeof handlers.error === 'function') es.addEventListener('error', (e) => handlers.error(e));
    bind('order.created', (d) => {
      if (typeof handlers.order === 'function' && d && d.order) handlers.order(d.order);
    });
    bind('order.updated', (d) => {
      if (typeof handlers.order === 'function' && d && d.order) handlers.order(d.order);
    });
    bind('order.status', (d) => {
      if (typeof handlers.status === 'function' && d) handlers.status(d);
    });
    bind('call.created', (d) => {
      if (typeof handlers.call === 'function' && d && d.call) handlers.call(d.call);
    });
    bind('call.ack', (d) => {
      if (typeof handlers.callAck === 'function' && d) handlers.callAck(d);
    });
    bind('ping', () => {
      if (typeof handlers.ping === 'function') handlers.ping();
    });

    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      try {
        es.close();
      } catch {
        // уже закрыт
      }
    };
  }
}
