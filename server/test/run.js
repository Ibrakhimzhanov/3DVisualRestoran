// Самодостаточный прогон сервера заказов.
// Поднимает сервер на случайном порту с временной директорией данных
// и проверяет то, что ломается чаще всего: деньги, идемпотентность,
// переходы статусов, доступ по токену и доставку событий в SSE.
//
// Запуск: node server/test/run.js

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from '../index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const STAFF_TOKEN = 'test-token-0123456789';

let passed = 0;
let failed = 0;

function check(name, condition, details = '') {
  if (condition) {
    passed += 1;
    console.log(`  ок    ${name}`);
  } else {
    failed += 1;
    console.log(`  ПАДАЕТ ${name}${details ? ` -> ${details}` : ''}`);
  }
}

function equal(name, actual, expected) {
  check(name, actual === expected, `получено ${JSON.stringify(actual)}, ожидалось ${JSON.stringify(expected)}`);
}

function group(title) {
  console.log(`\n${title}`);
}

// --- HTTP-клиент ---

function request(port, method, route, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? null : Buffer.from(JSON.stringify(options.body), 'utf8');
    const headers = { ...(options.headers || {}) };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text === '' ? null : JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// --- SSE-клиент ---

function openStream(port, route, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: route,
      headers: { Accept: 'text/event-stream', ...headers }
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`поток ответил ${res.statusCode}`));
        return;
      }

      const events = [];
      const waiters = [];
      let buffer = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        buffer += chunk;
        let index = buffer.indexOf('\n\n');
        while (index >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = parseBlock(block);
          if (event) {
            events.push(event);
            feedWaiters(waiters, event);
          }
          index = buffer.indexOf('\n\n');
        }
      });

      resolve({
        events,
        lastId() {
          const withId = events.filter((e) => e.id !== null);
          return withId.length > 0 ? withId[withId.length - 1].id : 0;
        },
        waitFor(name, ms = 4000) {
          const ready = events.find((e) => e.name === name && !e.taken);
          if (ready) {
            ready.taken = true;
            return Promise.resolve(ready);
          }
          return new Promise((ok, fail) => {
            const waiter = { name, ok };
            waiter.timer = setTimeout(() => {
              const i = waiters.indexOf(waiter);
              if (i >= 0) waiters.splice(i, 1);
              fail(new Error(`событие "${name}" не пришло за ${ms} мс`));
            }, ms);
            waiters.push(waiter);
          });
        },
        close() { req.destroy(); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function feedWaiters(waiters, event) {
  for (let i = 0; i < waiters.length; i += 1) {
    if (waiters[i].name !== event.name) continue;
    const waiter = waiters.splice(i, 1)[0];
    clearTimeout(waiter.timer);
    event.taken = true;
    waiter.ok(event);
    return;
  }
}

function parseBlock(block) {
  let name = 'message';
  let id = null;
  let data = '';
  let seen = false;
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) { name = line.slice(6).trim(); seen = true; }
    else if (line.startsWith('id:')) { id = Number.parseInt(line.slice(3).trim(), 10); seen = true; }
    else if (line.startsWith('data:')) { data += line.slice(5).trim(); seen = true; }
  }
  if (!seen) return null;
  let parsed = null;
  try { parsed = data === '' ? null : JSON.parse(data); } catch { parsed = null; }
  return { name, id, data: parsed, taken: false };
}

// --- подготовка ---

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.menulive.sse.close();
    server.close(() => resolve());
  });
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menulive-test-'));
  fs.writeFileSync(
    path.join(dataDir, 'staff.json'),
    JSON.stringify({ staff: [{ id: 'aziz', name: 'Азиз Каримов', initials: 'АК', restaurant: 'brest' }] }, null, 2),
    'utf8'
  );

  process.env.MENULIVE_STAFF_TOKEN = STAFF_TOKEN;

  const server = createServer({
    dataDir,
    restaurantsDir: path.join(REPO_ROOT, 'restaurants'),
    ssePingMs: 1000
  });
  const port = await listen(server);
  const staff = { 'X-Staff-Token': STAFF_TOKEN };

  console.log(`Сервер поднят на 127.0.0.1:${port}, данные в ${dataDir}`);

  try {
    // 1. Здоровье
    group('1. GET /api/v1/health');
    const health = await request(port, 'GET', '/api/v1/health');
    equal('статус 200', health.status, 200);
    equal('ok = true', health.json && health.json.ok, true);
    check('есть version', typeof (health.json && health.json.version) === 'string');
    check('есть uptime', Number.isInteger(health.json && health.json.uptime));

    // Поток официанта поднимаем до заказа, иначе событие о создании пролетит мимо.
    const waiterStream = await openStream(port, '/api/v1/stream?restaurant=brest&role=waiter', staff);

    // 2. Создание заказа
    group('2. POST /api/v1/orders создаёт заказ и считает деньги сам');
    const body = {
      restaurant: 'brest',
      table: '12',
      clientOrderId: 'c_9f2a1b7e4d',
      lang: 'ru',
      comment: 'Приборы отдельно',
      items: [
        { dishId: 'plato', qty: 1, note: 'соус чили отдельно', price: 1 },
        { dishId: 'kebab', qty: 1, note: 'средняя прожарка' }
      ]
    };
    const created = await request(port, 'POST', '/api/v1/orders', { body });
    equal('статус 201', created.status, 201);
    const order = created.json || {};
    check('id вида ord_ плюс 26 символов', /^ord_[0-9A-HJKMNP-TV-Z]{26}$/.test(order.id || ''), order.id);
    check('человеческий номер буква-дефис-число', /^[А-Я]-\d+$/.test(order.number || ''), order.number);
    equal('статус new', order.status, 'new');
    equal('subtotal из конфига ресторана', order.subtotal, 413000);
    equal('сервисный сбор 10 процентов', order.service, 41300);
    equal('итого', order.total, 454300);
    equal('цена первой позиции с сервера, а не от клиента', order.items && order.items[0].price, 265000);
    equal('название блюда подставлено', order.items && order.items[0].name, 'Мясное плато Brest');
    check('createdAt в формате RFC 3339 без миллисекунд', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(order.createdAt || ''), order.createdAt);

    // 3. Идемпотентность
    group('3. Повтор POST с тем же clientOrderId');
    const repeat = await request(port, 'POST', '/api/v1/orders', { body });
    equal('статус 200, а не 201', repeat.status, 200);
    equal('тот же заказ', repeat.json && repeat.json.id, order.id);
    equal('номер не изменился', repeat.json && repeat.json.number, order.number);

    const other = await request(port, 'POST', '/api/v1/orders', {
      body: { ...body, clientOrderId: 'c_другой', items: [{ dishId: 'lemonade', qty: 2 }] }
    });
    equal('другой clientOrderId создаёт новый заказ', other.status, 201);
    check('id отличается', other.json && other.json.id !== order.id);
    equal('две позиции лимонада посчитаны', other.json && other.json.subtotal, 90000);

    // 4. Валидация
    group('4. Валидация входных данных');
    const emptyItems = await request(port, 'POST', '/api/v1/orders', {
      body: { restaurant: 'brest', table: '12', clientOrderId: 'c_empty', items: [] }
    });
    equal('пустой items даёт 400', emptyItems.status, 400);
    equal('код ошибки bad_request', emptyItems.json && emptyItems.json.error.code, 'bad_request');

    const badDish = await request(port, 'POST', '/api/v1/orders', {
      body: { restaurant: 'brest', table: '12', clientOrderId: 'c_bad', items: [{ dishId: 'нет-такого', qty: 1 }] }
    });
    equal('неизвестный dishId даёт 400', badDish.status, 400);

    const noRestaurant = await request(port, 'POST', '/api/v1/orders', {
      body: { restaurant: 'nosuch', table: '12', clientOrderId: 'c_nr', items: [{ dishId: 'plato', qty: 1 }] }
    });
    equal('неизвестный ресторан даёт 404', noRestaurant.status, 404);
    equal('код ошибки not_found', noRestaurant.json && noRestaurant.json.error.code, 'not_found');

    // 5. Доступ персонала
    group('5. Методы персонала требуют X-Staff-Token');
    const noToken = await request(port, 'POST', `/api/v1/orders/${order.id}/status`, {
      body: { status: 'accepted', by: 'aziz' }
    });
    equal('без токена 401', noToken.status, 401);
    equal('код ошибки unauthorized', noToken.json && noToken.json.error.code, 'unauthorized');

    const wrongToken = await request(port, 'POST', `/api/v1/orders/${order.id}/status`, {
      body: { status: 'accepted', by: 'aziz' },
      headers: { 'X-Staff-Token': 'test-token-9999999999' }
    });
    equal('с неверным токеном 401', wrongToken.status, 401);

    const listNoToken = await request(port, 'GET', '/api/v1/orders?restaurant=brest');
    equal('GET /orders без токена 401', listNoToken.status, 401);

    // 6. Переходы статусов
    group('6. Переходы статусов');
    const jump = await request(port, 'POST', `/api/v1/orders/${order.id}/status`, {
      body: { status: 'served', by: 'aziz' },
      headers: staff
    });
    equal('прыжок через шаг даёт 409', jump.status, 409);
    equal('код ошибки conflict', jump.json && jump.json.error.code, 'conflict');
    equal('в теле текущий статус', jump.json && jump.json.status, 'new');

    const accepted = await request(port, 'POST', `/api/v1/orders/${order.id}/status`, {
      body: { status: 'accepted', by: 'aziz' },
      headers: staff
    });
    equal('шаг вперёд разрешён', accepted.status, 200);
    equal('статус сменился', accepted.json && accepted.json.status, 'accepted');
    equal('официант подставлен из staff.json', accepted.json && accepted.json.waiter && accepted.json.waiter.name, 'Азиз Каримов');
    equal('инициалы официанта', accepted.json && accepted.json.waiter && accepted.json.waiter.initials, 'АК');
    equal('в timeline две записи', accepted.json && accepted.json.timeline.length, 2);

    const back = await request(port, 'POST', `/api/v1/orders/${order.id}/status`, {
      body: { status: 'new', by: 'aziz' },
      headers: staff
    });
    equal('откат на шаг назад разрешён', back.status, 200);
    equal('статус вернулся', back.json && back.json.status, 'new');

    const cancelled = await request(port, 'POST', `/api/v1/orders/${other.json.id}/status`, {
      body: { status: 'cancelled', by: 'aziz' },
      headers: staff
    });
    equal('отмена разрешена из любого места цепочки', cancelled.status, 200);
    const afterCancel = await request(port, 'POST', `/api/v1/orders/${other.json.id}/status`, {
      body: { status: 'paid', by: 'aziz' },
      headers: staff
    });
    equal('из cancelled вперёд нельзя', afterCancel.status, 409);

    const unknownStatus = await request(port, 'POST', `/api/v1/orders/${order.id}/status`, {
      body: { status: 'готово', by: 'aziz' },
      headers: staff
    });
    equal('неизвестный статус даёт 400', unknownStatus.status, 400);

    // 7. Гостевое чтение и список персонала
    group('7. Чтение заказов');
    const guestRead = await request(port, 'GET', `/api/v1/orders/${order.id}`);
    equal('гость читает свой заказ без токена', guestRead.status, 200);
    check('есть timeline', Array.isArray(guestRead.json && guestRead.json.timeline));
    check('есть waiter', guestRead.json && guestRead.json.waiter !== undefined);

    const missing = await request(port, 'GET', '/api/v1/orders/ord_00000000000000000000000000');
    equal('чужой несуществующий заказ даёт 404', missing.status, 404);

    const listed = await request(port, 'GET', '/api/v1/orders?restaurant=brest&limit=50', { headers: staff });
    equal('список персонала 200', listed.status, 200);
    check('в списке оба заказа', listed.json && listed.json.orders.length === 2, String(listed.json && listed.json.orders.length));
    equal('свежие сверху', listed.json && listed.json.orders[0].id, other.json.id);

    const filtered = await request(port, 'GET', '/api/v1/orders?restaurant=brest&status=cancelled', { headers: staff });
    equal('фильтр по статусу работает', filtered.json && filtered.json.orders.length, 1);

    // 8. События SSE
    group('8. Доставка событий в SSE');
    const createdEvent = await waiterStream.waitFor('order.created');
    equal('пришло order.created', createdEvent.name, 'order.created');
    check('в событии есть id для Last-Event-ID', Number.isInteger(createdEvent.id) && createdEvent.id > 0, String(createdEvent.id));
    equal('в событии тот самый заказ', createdEvent.data && createdEvent.data.order && createdEvent.data.order.id, order.id);

    const statusEvent = await waiterStream.waitFor('order.status');
    equal('пришло order.status', statusEvent.name, 'order.status');
    equal('в событии новый статус', statusEvent.data && statusEvent.data.status, 'accepted');
    equal('в событии автор', statusEvent.data && statusEvent.data.by, 'aziz');

    const pinged = await waiterStream.waitFor('ping', 4000).then(() => true).catch(() => false);
    check('приходит ping, соединение не считается мёртвым', pinged);

    // 9. Гостевой поток видит только своё
    group('9. Фильтрация потока для гостя');
    const guestStream = await openStream(port, `/api/v1/stream?restaurant=brest&role=guest&orderId=${order.id}`);
    await request(port, 'POST', `/api/v1/orders/${order.id}/status`, {
      body: { status: 'accepted', by: 'aziz' },
      headers: staff
    });
    const guestEvent = await guestStream.waitFor('order.status');
    equal('гость получил событие своего заказа', guestEvent.data && guestEvent.data.orderId, order.id);

    const strangerStream = await openStream(port, '/api/v1/stream?restaurant=brest&role=guest&table=99');
    const leaked = await strangerStream.waitFor('order.status', 700).then(() => true).catch(() => false);
    check('гостю с другого стола чужое событие не приходит', leaked === false);
    strangerStream.close();

    const streamNoToken = await request(port, 'GET', '/api/v1/stream?restaurant=brest&role=waiter');
    equal('поток официанта без токена даёт 401', streamNoToken.status, 401);

    // 10. Добор по Last-Event-ID
    group('10. Добор пропущенного по Last-Event-ID');
    const beforeId = createdEvent.id;
    const replay = await openStream(port, '/api/v1/stream?restaurant=brest&role=waiter', {
      ...staff,
      'Last-Event-ID': String(beforeId)
    });
    const replayed = await replay.waitFor('order.status');
    check('после обрыва добрали событие с id больше присланного', replayed.id > beforeId, `${replayed.id} против ${beforeId}`);
    replay.close();

    // 11. Вызовы официанта
    group('11. Вызовы официанта');
    const call = await request(port, 'POST', '/api/v1/calls', {
      body: { restaurant: 'brest', table: '12', kind: 'waiter', orderId: order.id }
    });
    equal('вызов создан со статусом 201', call.status, 201);
    check('id вида call_', /^call_[0-9A-HJKMNP-TV-Z]{26}$/.test(call.json && call.json.id), call.json && call.json.id);
    equal('ackAt пустой', call.json && call.json.ackAt, null);

    const callAgain = await request(port, 'POST', '/api/v1/calls', {
      body: { restaurant: 'brest', table: '12', kind: 'waiter' }
    });
    equal('повтор до закрытия отдаёт тот же вызов', callAgain.json && callAgain.json.id, call.json.id);
    equal('и статус 200', callAgain.status, 200);

    const billCall = await request(port, 'POST', '/api/v1/calls', {
      body: { restaurant: 'brest', table: '12', kind: 'bill' }
    });
    equal('просьба счёта это отдельный вызов', billCall.status, 201);

    const badKind = await request(port, 'POST', '/api/v1/calls', {
      body: { restaurant: 'brest', table: '12', kind: 'музыку' }
    });
    equal('неизвестный kind даёт 400', badKind.status, 400);

    const ackNoToken = await request(port, 'POST', `/api/v1/calls/${call.json.id}/ack`, { body: { by: 'aziz' } });
    equal('закрыть вызов без токена нельзя', ackNoToken.status, 401);

    const callEvent = await waiterStream.waitFor('call.created');
    equal('пришло call.created', callEvent.data && callEvent.data.call && callEvent.data.call.id, call.json.id);

    const ack = await request(port, 'POST', `/api/v1/calls/${call.json.id}/ack`, {
      body: { by: 'aziz' },
      headers: staff
    });
    equal('вызов закрыт', ack.status, 200);
    check('проставлен ackAt', typeof (ack.json && ack.json.ackAt) === 'string', ack.json && ack.json.ackAt);
    const ackEvent = await waiterStream.waitFor('call.ack');
    equal('пришло call.ack', ackEvent.data && ackEvent.data.callId, call.json.id);

    const callAfterAck = await request(port, 'POST', '/api/v1/calls', {
      body: { restaurant: 'brest', table: '12', kind: 'waiter' }
    });
    equal('после закрытия создаётся новый вызов', callAfterAck.status, 201);
    check('новый id', callAfterAck.json && callAfterAck.json.id !== call.json.id);

    waiterStream.close();
    guestStream.close();

    // 12. Данные на диске
    group('12. Данные лежат в JSON-файлах');
    for (const name of ['orders.json', 'calls.json', 'seq.json']) {
      const file = path.join(dataDir, name);
      check(`${name} существует и разбирается`, (() => {
        try { JSON.parse(fs.readFileSync(file, 'utf8')); return true; } catch { return false; }
      })());
    }
    const leftovers = fs.readdirSync(dataDir).filter((f) => f.endsWith('.tmp'));
    equal('временных файлов после атомарной записи не осталось', leftovers.length, 0);

    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'));
    equal('в orders.json оба заказа', onDisk.orders.length, 2);
    const seq = JSON.parse(fs.readFileSync(path.join(dataDir, 'seq.json'), 'utf8'));
    equal('счётчик номеров дошёл до двух', seq.counters.brest.counter, 2);

    // 13. Неизвестный путь
    group('13. Неизвестный путь');
    const nowhere = await request(port, 'GET', '/api/v1/no-such-path');
    equal('404 на неизвестный путь', nowhere.status, 404);
    const preflight = await request(port, 'OPTIONS', '/api/v1/orders');
    equal('preflight CORS отвечает 204', preflight.status, 204);
    check('в preflight есть Access-Control-Allow-Headers', typeof preflight.headers['access-control-allow-headers'] === 'string');
  } catch (err) {
    failed += 1;
    console.log(`\n  ПАДАЕТ прогон оборвался: ${err.stack || err.message}`);
  } finally {
    await closeServer(server);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* временная папка */ }
  }

  console.log(`\nИтого: успешно ${passed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
