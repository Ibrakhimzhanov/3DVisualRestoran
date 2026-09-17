/* ============================================================
   Мок-сервер MenuLive Orders API v1 для проверки приложения официанта.
   Только встроенные модули Node, без зависимостей.

   Запуск:
     node waiter-app/mock/server.js
     PORT=4788 MENULIVE_STAFF_TOKEN=test-token node waiter-app/mock/server.js

   Что умеет:
     GET  /api/v1/health
     GET  /api/v1/orders?restaurant=brest&status=new,accepted&limit=50
     POST /api/v1/orders/:id/status
     POST /api/v1/calls/:id/ack
     GET  /api/v1/stream?restaurant=brest&role=waiter   (SSE)
     плюс раздаёт статику из ../www, чтобы открыть приложение с того же адреса

   Раз в 20 секунд кидает в поток новый заказ (order.created).
   Данные живут в памяти, при перезапуске всё сбрасывается.
   ============================================================ */

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = Number(process.env.PORT || 4788);
var TOKEN = process.env.MENULIVE_STAFF_TOKEN || 'test-token';
var WWW = path.join(__dirname, '..', 'www');
var API = '/api/v1';

/* ---------------------------------------------------------
   Данные
   --------------------------------------------------------- */

var MENU = [
  { dishId: 'plato', name: 'Мясное плато Brest', price: 265000, notes: ['соус чили отдельно', 'без кунжута', ''] },
  { dishId: 'kebab', name: 'Кебаб на углях', price: 148000, notes: ['средняя прожарка', 'острее', ''] },
  { dishId: 'ribeye', name: 'Рибай сухой выдержки', price: 312000, notes: ['medium rare', ''] },
  { dishId: 'salat-brest', name: 'Салат Брест', price: 74000, notes: ['без лука', ''] },
  { dishId: 'lemonade', name: 'Лимонад домашний', price: 45000, notes: ['без льда', ''] },
  { dishId: 'baklava', name: 'Пахлава', price: 39000, notes: [''] }
];

var FLOW = ['new', 'accepted', 'kitchen', 'served', 'paid'];

var orders = [];   // свежие в начале
var calls = [];
var clients = [];  // открытые SSE-соединения
var events = [];   // кольцо последних событий для Last-Event-ID
var eventSeq = 0;
var orderSeq = 1200;
var callSeq = 1;

function base32(n) {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var out = '';
  for (var i = 0; i < n; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

function nowIso(shiftSec) {
  return new Date(Date.now() - (shiftSec || 0) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function makeOrder(table, ageSec, status, howMany) {
  var count = howMany || (1 + Math.floor(Math.random() * 3));
  var pool = MENU.slice();
  var items = [];
  for (var i = 0; i < count && pool.length; i++) {
    var pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    var qty = 1 + (Math.random() < 0.25 ? 1 : 0);
    items.push({
      dishId: pick.dishId,
      name: pick.name,
      qty: qty,
      price: pick.price,
      note: pick.notes[Math.floor(Math.random() * pick.notes.length)]
    });
  }

  var subtotal = items.reduce(function (s, it) { return s + it.price * it.qty; }, 0);
  var service = Math.round(subtotal * 0.1);

  orderSeq += 1;

  return {
    id: 'ord_' + base32(26),
    number: 'А-' + orderSeq,
    restaurant: 'brest',
    table: String(table),
    status: status || 'new',
    createdAt: nowIso(ageSec || 0),
    subtotal: subtotal,
    service: service,
    total: subtotal + service,
    comment: Math.random() < 0.4 ? 'Приборы отдельно, за столом ребёнок' : '',
    waiter: { name: 'Азиз Каримов', initials: 'АК' },
    timeline: [{ status: 'new', at: nowIso(ageSec || 0) }],
    items: items
  };
}

function makeCall(table, kind, ageSec) {
  callSeq += 1;
  return {
    id: 'call_' + base32(20),
    restaurant: 'brest',
    kind: kind || 'waiter',
    table: String(table),
    createdAt: nowIso(ageSec || 0),
    ackAt: null
  };
}

function seed() {
  orders = [
    makeOrder(12, 38, 'new', 3),
    makeOrder(5, 96, 'new', 2),
    makeOrder(3, 760, 'kitchen', 2),
    makeOrder(8, 560, 'served', 1),
    makeOrder(1, 150, 'accepted', 2)
  ];
  calls = [
    makeCall(7, 'waiter', 52),
    makeCall(9, 'bill', 70)
  ];
}

/* ---------------------------------------------------------
   SSE
   --------------------------------------------------------- */

function broadcast(name, payload) {
  eventSeq += 1;
  var frame = 'event: ' + name + '\nid: ' + eventSeq + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  events.push({ id: eventSeq, frame: frame });
  if (events.length > 50) events.shift();

  clients.forEach(function (res) {
    try { res.write(frame); } catch (e) { /* соединение уже закрыто */ }
  });
  console.log('[sse] ' + name + ' -> ' + clients.length + ' клиент(ов)');
}

function openStream(req, res, query) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(': поток открыт\n\n');

  // добор пропущенного по Last-Event-ID
  var last = Number(req.headers['last-event-id'] || query['lastEventId'] || 0);
  if (last > 0) {
    events.forEach(function (e) {
      if (e.id > last) { try { res.write(e.frame); } catch (err) { /* закрыто */ } }
    });
  }

  // Контракт не описывает GET /calls, поэтому открытые вызовы отдаём
  // при подключении отдельными call.created. Так официант не теряет их
  // после обрыва связи. Реальному серверу стоит делать так же.
  calls.forEach(function (c) {
    try { res.write('event: call.created\ndata: ' + JSON.stringify({ call: c }) + '\n\n'); } catch (e) { /* закрыто */ }
  });

  clients.push(res);
  console.log('[sse] клиент подключился, всего ' + clients.length);

  req.on('close', function () {
    var i = clients.indexOf(res);
    if (i !== -1) clients.splice(i, 1);
    console.log('[sse] клиент отключился, осталось ' + clients.length);
  });
}

/* ---------------------------------------------------------
   Ответы
   --------------------------------------------------------- */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Staff-Token, Last-Event-ID, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
}

function sendJson(res, code, body) {
  var txt = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(txt)
  });
  res.end(txt);
}

function sendErr(res, code, errCode, message) {
  sendJson(res, code, { error: { code: errCode, message: message } });
}

function readBody(req) {
  return new Promise(function (resolve) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8');
      var data = null;
      try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = null; }
      resolve(data);
    });
  });
}

function authed(req) {
  return req.headers['x-staff-token'] === TOKEN;
}

/* ---------------------------------------------------------
   Статика
   --------------------------------------------------------- */

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function serveStatic(pathname, res) {
  var rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  var file = path.join(WWW, rel);

  // за пределы www не выпускаем
  if (file.indexOf(WWW) !== 0) { sendErr(res, 404, 'not_found', 'нет такого файла'); return; }

  fs.readFile(file, function (err, buf) {
    if (err) { sendErr(res, 404, 'not_found', 'нет такого файла'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': buf.length
    });
    res.end(buf);
  });
}

/* ---------------------------------------------------------
   Маршрутизация
   --------------------------------------------------------- */

var server = http.createServer(function (req, res) {
  var parsed = new URL(req.url, 'http://127.0.0.1:' + PORT);
  var pathname = decodeURIComponent(parsed.pathname);
  var query = {};
  parsed.searchParams.forEach(function (v, k) { query[k] = v; });

  cors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (pathname.indexOf(API) !== 0) { serveStatic(pathname, res); return; }

  var route = pathname.slice(API.length) || '/';

  // GET /health
  if (route === '/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, version: '1.0.0-mock', uptime: Math.round(process.uptime()) });
    return;
  }

  // GET /stream
  if (route === '/stream' && req.method === 'GET') {
    if (!authed(req)) { sendErr(res, 401, 'unauthorized', 'нужен X-Staff-Token'); return; }
    openStream(req, res, query);
    return;
  }

  // GET /orders
  if (route === '/orders' && req.method === 'GET') {
    if (!authed(req)) { sendErr(res, 401, 'unauthorized', 'нужен X-Staff-Token'); return; }
    var wanted = String(query.status || '').split(',').filter(Boolean);
    var limit = Number(query.limit || 50);
    var list = orders.filter(function (o) {
      if (query.restaurant && o.restaurant !== query.restaurant) return false;
      if (wanted.length && wanted.indexOf(o.status) === -1) return false;
      return true;
    }).slice(0, limit);
    sendJson(res, 200, { orders: list });
    return;
  }

  // POST /orders/:id/status
  var mStatus = route.match(/^\/orders\/([^/]+)\/status$/);
  if (mStatus && req.method === 'POST') {
    if (!authed(req)) { sendErr(res, 401, 'unauthorized', 'нужен X-Staff-Token'); return; }
    readBody(req).then(function (body) {
      if (!body || typeof body.status !== 'string') {
        sendErr(res, 400, 'bad_request', 'нужен status');
        return;
      }
      var id = mStatus[1];
      var order = orders.filter(function (o) { return o.id === id; })[0];
      if (!order) { sendErr(res, 404, 'not_found', 'нет такого заказа'); return; }

      var from = FLOW.indexOf(order.status);
      var to = FLOW.indexOf(body.status);
      var ok = body.status === 'cancelled' || (to !== -1 && from !== -1 && Math.abs(to - from) === 1);

      if (!ok) {
        res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          status: order.status,
          error: { code: 'conflict', message: 'недопустимый переход из ' + order.status + ' в ' + body.status }
        }));
        return;
      }

      order.status = body.status;
      order.timeline.push({ status: body.status, at: nowIso(0), by: String(body.by || 'waiter') });

      if (body.status === 'paid' || body.status === 'cancelled') {
        orders = orders.filter(function (o) { return o.id !== order.id; });
      }

      broadcast('order.status', {
        orderId: order.id,
        status: order.status,
        at: nowIso(0),
        by: String(body.by || 'waiter')
      });

      sendJson(res, 200, order);
    });
    return;
  }

  // POST /calls/:id/ack
  var mAck = route.match(/^\/calls\/([^/]+)\/ack$/);
  if (mAck && req.method === 'POST') {
    if (!authed(req)) { sendErr(res, 401, 'unauthorized', 'нужен X-Staff-Token'); return; }
    readBody(req).then(function (body) {
      var id = mAck[1];
      var call = calls.filter(function (c) { return c.id === id; })[0];
      if (!call) { sendErr(res, 404, 'not_found', 'нет такого вызова'); return; }
      call.ackAt = nowIso(0);
      calls = calls.filter(function (c) { return c.id !== call.id; });
      broadcast('call.ack', { callId: call.id, by: String((body && body.by) || 'waiter') });
      sendJson(res, 200, call);
      return;
    });
    return;
  }

  // POST /calls, гостевой, пригодится для ручной проверки вызовов
  if (route === '/calls' && req.method === 'POST') {
    readBody(req).then(function (body) {
      if (!body || !body.table) { sendErr(res, 400, 'bad_request', 'нужен table'); return; }
      var call = makeCall(body.table, body.kind === 'bill' ? 'bill' : 'waiter', 0);
      calls.push(call);
      broadcast('call.created', { call: call });
      sendJson(res, 201, call);
    });
    return;
  }

  sendErr(res, 404, 'not_found', 'нет такого метода');
});

/* ---------------------------------------------------------
   Фоновые таймеры
   --------------------------------------------------------- */

var TABLES = [2, 4, 6, 10, 11, 12, 5, 7];

function pushRandomOrder() {
  var table = TABLES[Math.floor(Math.random() * TABLES.length)];
  var order = makeOrder(table, 0, 'new');
  orders.unshift(order);
  broadcast('order.created', { order: order });
}

seed();

server.listen(PORT, '127.0.0.1', function () {
  console.log('Мок MenuLive слушает http://127.0.0.1:' + PORT);
  console.log('  API   : http://127.0.0.1:' + PORT + API);
  console.log('  Токен : ' + TOKEN);
  console.log('  Заказов в памяти: ' + orders.length + ', вызовов: ' + calls.length);
  console.log('  Новый заказ прилетает раз в 20 секунд.');

  setInterval(pushRandomOrder, 20000);
  setInterval(function () {
    clients.forEach(function (res) {
      try { res.write('event: ping\ndata: {}\n\n'); } catch (e) { /* закрыто */ }
    });
  }, 25000);
});
