import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus, STEPS } from '../engine/core/status.js';
import { ApiError } from '../engine/core/api.js';

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

// Заглушка клиента API: отдаёт что сказали и считает вызовы.
function makeApi(handlers = {}) {
  const calls = { createOrder: [], getOrder: [], createCall: [], stream: [] };
  return {
    calls,
    async createOrder(payload) {
      calls.createOrder.push(payload);
      if (handlers.createOrder) return handlers.createOrder(payload, calls.createOrder.length);
      return { id: 'ord_1', number: 'А-1', table: payload.table, status: 'new', items: [], timeline: [] };
    },
    async getOrder(id) {
      calls.getOrder.push(id);
      if (handlers.getOrder) return handlers.getOrder(id);
      return { id, number: 'А-1', status: 'accepted', items: [], timeline: [] };
    },
    async createCall(payload) {
      calls.createCall.push(payload);
      if (handlers.createCall) return handlers.createCall(payload);
      return { id: 'call_1', kind: payload.kind, table: payload.table, ackAt: null };
    },
    streamOrder(orderId) {
      calls.stream.push(orderId);
      return () => {};
    }
  };
}

const ORDER = {
  id: 'ord_1',
  number: 'А-1204',
  restaurant: 'brest',
  table: '12',
  status: 'kitchen',
  createdAt: '2026-09-17T14:41:09Z',
  subtotal: 413000,
  service: 41300,
  total: 454300,
  items: [{ dishId: 'plato', name: 'Плато', qty: 1, price: 265000 }],
  timeline: [
    { status: 'new', at: '2026-09-17T14:41:09Z' },
    { status: 'accepted', at: '2026-09-17T14:42:31Z', by: 'aziz' },
    { status: 'kitchen', at: '2026-09-17T14:44:00Z', by: 'aziz' }
  ],
  waiter: { name: 'Азиз Каримов', initials: 'АК' }
};

test('успешная отправка сохраняет заказ и сбрасывает ключ идемпотентности', async () => {
  const storage = makeStorage();
  const api = makeApi({ createOrder: () => ORDER });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage });

  let sent = null;
  status.on('sent', (order) => {
    sent = order;
  });

  const ok = await status.send({ table: '12', items: [{ dishId: 'plato', qty: 1 }], lang: 'ru' });
  assert.equal(ok, true);
  assert.equal(status.phase, 'live');
  assert.equal(status.orderId, 'ord_1');
  assert.equal(storage.data['menulive:orderId:brest'], 'ord_1');
  assert.equal(storage.data['menulive:client:brest'], undefined);
  assert.equal(sent.number, 'А-1204');
});

test('провал отправки не теряет позиции, повтор идёт тем же ключом', async () => {
  const storage = makeStorage();
  let attempt = 0;
  const api = makeApi({
    createOrder: () => {
      attempt += 1;
      if (attempt === 1) throw new Error('нет связи');
      return ORDER;
    }
  });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage });

  const ok = await status.send({ table: '12', items: [{ dishId: 'plato', qty: 1 }] });
  assert.equal(ok, false);
  assert.equal(status.phase, 'failed');
  assert.equal(status.hasOrder(), false);

  const first = api.calls.createOrder[0].clientOrderId;
  assert.match(first, /^c_/);

  // Повтор без новых позиций берёт отложенную отправку.
  const again = await status.retry();
  assert.equal(again, true);
  assert.equal(api.calls.createOrder.length, 2);
  assert.equal(api.calls.createOrder[1].clientOrderId, first);
  assert.deepEqual(api.calls.createOrder[1].items, [{ dishId: 'plato', qty: 1 }]);
});

test('отправка без стола не идёт в сеть', async () => {
  const api = makeApi();
  const status = new OrderStatus({ api, restaurantId: 'brest', storage: makeStorage() });
  const ok = await status.send({ table: '', items: [{ dishId: 'plato', qty: 1 }] });
  assert.equal(ok, false);
  assert.equal(status.phase, 'failed');
  assert.equal(status.error.code, 'no_table');
  assert.equal(api.calls.createOrder.length, 0);
});

test('restore поднимает заказ из хранилища', async () => {
  const storage = makeStorage({ 'menulive:orderId:brest': 'ord_1' });
  const api = makeApi({ getOrder: () => ORDER });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage });
  assert.equal(status.hasOrder(), true);
  const ok = await status.restore();
  assert.equal(ok, true);
  assert.equal(status.order.number, 'А-1204');
});

test('пропавший заказ чистит сессию', async () => {
  const storage = makeStorage({ 'menulive:orderId:brest': 'ord_1' });
  const api = makeApi({
    getOrder: () => {
      throw new ApiError('нет такого заказа', { code: 'not_found', status: 404 });
    }
  });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage });
  const ok = await status.restore();
  assert.equal(ok, false);
  assert.equal(status.hasOrder(), false);
  assert.equal(status.phase, 'idle');
  assert.equal(storage.data['menulive:orderId:brest'], undefined);
});

test('заказ на месте, но связь пропала: экран статуса остаётся', async () => {
  const storage = makeStorage({ 'menulive:orderId:brest': 'ord_1' });
  const api = makeApi({
    getOrder: () => {
      throw new ApiError('нет связи', { code: 'network', retriable: true });
    }
  });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage });
  const ok = await status.restore();
  assert.equal(ok, true);
  assert.equal(status.hasOrder(), true);
  assert.equal(status.phase, 'live');
});

test('таймлайн размечает шаги по текущему статусу', async () => {
  const api = makeApi({ createOrder: () => ORDER });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage: makeStorage() });
  await status.send({ table: '12', items: [{ dishId: 'plato', qty: 1 }] });

  const steps = status.steps();
  assert.equal(steps.length, STEPS.length);
  assert.deepEqual(steps.map((s) => s.state), ['done', 'done', 'now', 'next']);
  assert.equal(steps[0].at, '2026-09-17T14:41:09Z');
  assert.equal(steps[3].at, '');
});

test('подан закрывает все четыре шага', async () => {
  const served = { ...ORDER, status: 'served', timeline: [...ORDER.timeline, { status: 'served', at: '2026-09-17T14:58:00Z' }] };
  const api = makeApi({ createOrder: () => served });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage: makeStorage() });
  await status.send({ table: '12', items: [{ dishId: 'plato', qty: 1 }] });
  assert.deepEqual(status.steps().map((s) => s.state), ['done', 'done', 'done', 'done']);
});

test('мусор с сервера не попадает в модель', async () => {
  const dirty = {
    id: 'ord_2',
    number: 'А-2',
    status: 'new',
    total: 'много',
    items: [
      { dishId: 'a', name: 'Блюдо', qty: 2, price: 100 },
      { dishId: 'b', qty: 0 },
      null,
      'строка'
    ],
    timeline: [{ status: 'new', at: '2026-09-17T14:41:09Z' }, null, { at: 'без статуса' }],
    waiter: { name: 42 }
  };
  const api = makeApi({ createOrder: () => dirty });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage: makeStorage() });
  await status.send({ table: '12', items: [{ dishId: 'a', qty: 2 }] });

  assert.equal(status.order.total, 0);
  assert.equal(status.order.items.length, 1);
  assert.equal(status.order.timeline.length, 1);
  assert.equal(status.order.waiter, null);
});

test('вызов официанта переходит в отправлен', async () => {
  const api = makeApi({ createOrder: () => ORDER });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage: makeStorage() });
  await status.send({ table: '12', items: [{ dishId: 'plato', qty: 1 }] });

  assert.equal(status.callState('waiter'), 'idle');
  await status.call('waiter');
  assert.equal(status.callState('waiter'), 'sent');
  assert.equal(api.calls.createCall[0].table, '12');
  assert.equal(api.calls.createCall[0].orderId, 'ord_1');
});

test('reset чистит сессию целиком', async () => {
  const storage = makeStorage();
  const api = makeApi({ createOrder: () => ORDER });
  const status = new OrderStatus({ api, restaurantId: 'brest', storage });
  await status.send({ table: '12', items: [{ dishId: 'plato', qty: 1 }] });
  status.reset();
  assert.equal(status.hasOrder(), false);
  assert.equal(status.phase, 'idle');
  assert.equal(storage.data['menulive:orderId:brest'], undefined);
});
