import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  OrdersApi,
  readTable,
  clientOrderId,
  resetClientOrderId,
  savedOrderId,
  saveOrderId,
  resolveBaseUrl
} from '../engine/core/api.js';

// Заглушка хранилища вместо sessionStorage.
function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    }
  };
}

// Подменяет глобальный fetch на список ответов, считает вызовы.
function fakeFetch(steps) {
  const calls = [];
  let i = 0;
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (typeof step === 'function') return step();
    if (step instanceof Error) throw step;
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () => step.body
    };
  };
  fn.calls = calls;
  return fn;
}

function withFetch(fn, run) {
  const prev = globalThis.fetch;
  globalThis.fetch = fn;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = prev;
    });
}

// ---------- номер стола ----------

test('номер стола читается из ссылки и запоминается', () => {
  const storage = makeStorage();
  assert.equal(readTable('brest', '?t=12', storage), '12');
  assert.equal(storage.data['menulive:table:brest'], '12');
  // Перезагрузка без параметра берёт стол из хранилища.
  assert.equal(readTable('brest', '', storage), '12');
});

test('мусорный номер стола отбрасывается', () => {
  const storage = makeStorage();
  assert.equal(readTable('brest', '?t=' + encodeURIComponent('<script>'), storage), '');
  assert.equal(readTable('brest', '?t=123456789', storage), '');
  assert.equal(readTable('brest', '', storage), '');
});

test('без стола в ссылке и в хранилище получаем пустую строку', () => {
  assert.equal(readTable('brest', '?nocam=1', makeStorage()), '');
});

// ---------- ключи сессии ----------

test('clientOrderId живёт до сброса', () => {
  const storage = makeStorage();
  const first = clientOrderId('brest', storage);
  assert.match(first, /^c_[0-9a-f]{16}$/);
  assert.equal(clientOrderId('brest', storage), first);
  resetClientOrderId('brest', storage);
  assert.notEqual(clientOrderId('brest', storage), first);
});

test('orderId сохраняется и чистится', () => {
  const storage = makeStorage();
  assert.equal(savedOrderId('brest', storage), '');
  saveOrderId('brest', 'ord_1', storage);
  assert.equal(savedOrderId('brest', storage), 'ord_1');
  saveOrderId('brest', '', storage);
  assert.equal(savedOrderId('brest', storage), '');
});

test('сломанное хранилище не роняет клиента', () => {
  const broken = {
    getItem() {
      throw new Error('приватный режим');
    },
    setItem() {
      throw new Error('приватный режим');
    },
    removeItem() {
      throw new Error('приватный режим');
    }
  };
  assert.equal(readTable('brest', '?t=7', broken), '7');
  assert.match(clientOrderId('brest', broken), /^c_/);
  assert.equal(savedOrderId('brest', broken), '');
});

// ---------- адрес API ----------

test('baseUrl берётся из конфига, иначе из origin', () => {
  assert.equal(resolveBaseUrl({ api: { baseUrl: 'https://a.uz/api/v1/' } }, 'http://x'), 'https://a.uz/api/v1');
  assert.equal(resolveBaseUrl({}, 'https://armenu.shumtuber.uz'), 'https://armenu.shumtuber.uz/api/v1');
  assert.equal(resolveBaseUrl(null, 'http://localhost:5175/'), 'http://localhost:5175/api/v1');
});

// ---------- запросы ----------

test('createOrder отправляет только серверные поля', async () => {
  const fetchFn = fakeFetch([{ status: 201, body: { id: 'ord_1' } }]);
  await withFetch(fetchFn, async () => {
    const api = new OrdersApi({ baseUrl: 'http://x/api/v1', restaurant: 'brest' });
    const res = await api.createOrder({
      table: '12',
      lang: 'ru',
      clientOrderId: 'c_1',
      items: [
        { dishId: 'plato', qty: 2, note: 'острее' },
        { dishId: '', qty: 3 },
        { dishId: 'kebab', qty: 0 }
      ]
    });
    assert.equal(res.id, 'ord_1');
    const body = JSON.parse(fetchFn.calls[0].opts.body);
    assert.equal(body.restaurant, 'brest');
    assert.equal(body.table, '12');
    assert.equal(body.clientOrderId, 'c_1');
    // Пустые и нулевые позиции отсеиваются, цены клиент не шлёт.
    assert.deepEqual(body.items, [{ dishId: 'plato', qty: 2, note: 'острее' }]);
    assert.equal('price' in body.items[0], false);
  });
});

test('пустой заказ до сети не доходит', async () => {
  const fetchFn = fakeFetch([{ status: 201, body: {} }]);
  await withFetch(fetchFn, async () => {
    const api = new OrdersApi({ baseUrl: 'http://x/api/v1', restaurant: 'brest' });
    await assert.rejects(() => api.createOrder({ table: '12', items: [] }), ApiError);
    assert.equal(fetchFn.calls.length, 0);
  });
});

test('сетевая ошибка повторяется три раза и потом сдаётся', async () => {
  const fetchFn = fakeFetch([new TypeError('failed to fetch')]);
  await withFetch(fetchFn, async () => {
    const api = new OrdersApi({ baseUrl: 'http://x/api/v1', restaurant: 'brest', retries: 3 });
    await assert.rejects(
      () => api.createOrder({ table: '1', clientOrderId: 'c_1', items: [{ dishId: 'a', qty: 1 }] }),
      (err) => err instanceof ApiError && err.code === 'network' && err.retriable
    );
    assert.equal(fetchFn.calls.length, 3);
  });
});

test('пятисотка повторяется, со второго раза проходит', async () => {
  const fetchFn = fakeFetch([
    { status: 503, body: { error: { code: 'server_error', message: 'упал' } } },
    { status: 201, body: { id: 'ord_2' } }
  ]);
  await withFetch(fetchFn, async () => {
    const api = new OrdersApi({ baseUrl: 'http://x/api/v1', restaurant: 'brest' });
    const res = await api.createOrder({ table: '1', clientOrderId: 'c_1', items: [{ dishId: 'a', qty: 1 }] });
    assert.equal(res.id, 'ord_2');
    assert.equal(fetchFn.calls.length, 2);
    // Повтор идёт с тем же ключом идемпотентности.
    assert.equal(JSON.parse(fetchFn.calls[0].opts.body).clientOrderId, 'c_1');
    assert.equal(JSON.parse(fetchFn.calls[1].opts.body).clientOrderId, 'c_1');
  });
});

test('четырёхсотка не повторяется', async () => {
  const fetchFn = fakeFetch([{ status: 400, body: { error: { code: 'bad_request', message: 'нет стола' } } }]);
  await withFetch(fetchFn, async () => {
    const api = new OrdersApi({ baseUrl: 'http://x/api/v1', restaurant: 'brest' });
    await assert.rejects(
      () => api.createOrder({ table: '1', clientOrderId: 'c_1', items: [{ dishId: 'a', qty: 1 }] }),
      (err) => err instanceof ApiError && err.code === 'bad_request' && err.status === 400
    );
    assert.equal(fetchFn.calls.length, 1);
  });
});

test('createCall нормализует вид вызова', async () => {
  const fetchFn = fakeFetch([{ status: 201, body: { id: 'call_1' } }]);
  await withFetch(fetchFn, async () => {
    const api = new OrdersApi({ baseUrl: 'http://x/api/v1', restaurant: 'brest' });
    await api.createCall({ table: '12', kind: 'чтотоне то', orderId: 'ord_1' });
    const body = JSON.parse(fetchFn.calls[0].opts.body);
    assert.equal(body.kind, 'waiter');
    assert.equal(body.orderId, 'ord_1');
  });
});

test('streamOrder без EventSource возвращает пустую отписку', () => {
  const api = new OrdersApi({ baseUrl: 'http://x/api/v1', restaurant: 'brest' });
  const stop = api.streamOrder('ord_1', {});
  assert.equal(typeof stop, 'function');
  stop();
});
