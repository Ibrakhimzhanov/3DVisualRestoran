import test from 'node:test';
import assert from 'node:assert/strict';
import { Order } from '../engine/core/order.js';

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

const DISHES = [
  { id: 'steak', price: 120000 },
  { id: 'kebab', price: 68000 },
  { id: 'cola', price: 12000 }
];

test('полный цикл заказа', () => {
  const storage = makeStorage();
  const order = new Order('mu', storage);

  let changes = 0;
  const stop = order.on('change', () => changes++);

  order.add('steak');
  order.add('kebab', 2);
  order.inc('steak');

  assert.equal(order.qty('steak'), 2);
  assert.equal(order.qty('kebab'), 2);
  assert.equal(order.count, 4);
  assert.deepEqual(order.items(), [
    { dishId: 'steak', qty: 2 },
    { dishId: 'kebab', qty: 2 }
  ]);
  assert.equal(changes, 3);

  assert.equal(order.total(DISHES), 120000 * 2 + 68000 * 2);

  order.dec('kebab');
  assert.equal(order.qty('kebab'), 1);
  order.dec('kebab');
  assert.equal(order.qty('kebab'), 0);
  assert.deepEqual(order.items(), [{ dishId: 'steak', qty: 2 }]);

  assert.equal(order.remove('steak'), true);
  assert.equal(order.remove('steak'), false);
  assert.equal(order.count, 0);

  stop();
  const before = changes;
  order.add('cola');
  assert.equal(changes, before);
});

test('items хранит порядок первого добавления', () => {
  const order = new Order('mu', makeStorage());
  order.add('cola');
  order.add('steak');
  order.add('cola', 3);
  assert.deepEqual(order.items(), [
    { dishId: 'cola', qty: 4 },
    { dishId: 'steak', qty: 1 }
  ]);
});

test('заказ пишется в хранилище и восстанавливается', () => {
  const storage = makeStorage();
  const order = new Order('mu', storage);
  order.add('steak', 2);
  order.add('cola');

  const raw = storage.getItem('menulive:order:mu');
  assert.ok(raw, 'заказ должен лежать в хранилище');
  assert.deepEqual(JSON.parse(raw), { v: 1, items: [{ dishId: 'steak', qty: 2 }, { dishId: 'cola', qty: 1 }] });

  const restored = Order.restore('mu', storage);
  assert.equal(restored.count, 3);
  assert.equal(restored.qty('steak'), 2);
  assert.deepEqual(restored.toJSON(), order.toJSON());
});

test('clear очищает хранилище', () => {
  const storage = makeStorage();
  const order = new Order('mu', storage);
  order.add('steak');
  order.clear();
  assert.equal(order.count, 0);
  assert.equal(storage.getItem('menulive:order:mu'), null);
});

test('restore из битых данных даёт пустой заказ', () => {
  const storage = makeStorage({ 'menulive:order:mu': '{не json' });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const order = Order.restore('mu', storage);
    assert.equal(order.count, 0);
  } finally {
    console.warn = warn;
  }
  const empty = Order.restore('unknown', makeStorage());
  assert.equal(empty.count, 0);
});

test('restore пропускает мусорные позиции', () => {
  const storage = makeStorage({
    'menulive:order:mu': JSON.stringify({
      v: 1,
      items: [{ dishId: 'steak', qty: 2 }, { dishId: '', qty: 5 }, { dishId: 'cola', qty: 0 }, null]
    })
  });
  const order = Order.restore('mu', storage);
  assert.deepEqual(order.items(), [{ dishId: 'steak', qty: 2 }]);
});

test('заказ работает при storage = null', () => {
  const order = new Order('mu', null);
  order.add('steak', 2);
  order.dec('steak');
  assert.equal(order.count, 1);
  assert.deepEqual(order.toJSON(), { v: 1, items: [{ dishId: 'steak', qty: 1 }] });
  const restored = Order.restore('mu', null);
  assert.equal(restored.count, 0);
});

test('total игнорирует блюда без цены', () => {
  const order = new Order('mu', null);
  order.add('steak');
  order.add('ghost', 3);
  assert.equal(order.total(DISHES), 120000);
  assert.equal(order.total(null), 0);
});

test('некорректные аргументы add ничего не ломают', () => {
  const order = new Order('mu', null);
  order.add('steak', 0);
  order.add('steak', -2);
  order.add('', 1);
  assert.equal(order.count, 0);
  assert.equal(order.dec('ghost'), 0);
});
