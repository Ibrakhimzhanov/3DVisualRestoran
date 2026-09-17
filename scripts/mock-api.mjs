// Мок сервера заказов MenuLive для локальной проверки гостевого меню.
// Отдаёт статику репозитория и реализует docs/api-orders.md в объёме,
// который нужен гостю: создание заказа, чтение, вызовы, поток SSE.
// Это только для разработки, в прод не уходит.
//
// Запуск:  node scripts/mock-api.mjs [--port 5175] [--fast]
// Открыть: http://localhost:5175/brest-v2.html?t=12&nocam=1
//
// Ручное управление статусом:
//   GET /api/v1/dev/status?id=<orderId>&status=kitchen
//   GET /api/v1/dev/ack?id=<callId>
//   GET /api/v1/dev/fail?on=1   следующий POST /orders вернёт 503
//   GET /api/v1/dev/state       что сейчас в памяти

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(argValue('--port', '5175')) || 5175;
const FAST = args.includes('--fast');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mind': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

// ---------- данные ресторана ----------

const menus = new Map();

function menu(restaurant) {
  if (menus.has(restaurant)) return menus.get(restaurant);
  const file = path.join(ROOT, 'restaurants', restaurant + '.json');
  if (!fs.existsSync(file)) return null;
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dishes = new Map();
  for (const cat of cfg.categories || []) {
    for (const dish of cat.dishes || []) {
      const name = typeof dish.name === 'string' ? dish.name : dish.name.ru || Object.values(dish.name)[0];
      dishes.set(dish.id, { id: dish.id, name, price: dish.price });
    }
  }
  menus.set(restaurant, dishes);
  return dishes;
}

// ---------- состояние ----------

const orders = new Map(); // id -> заказ
const byClientId = new Map(); // clientOrderId -> id
const calls = new Map(); // id -> вызов
const clients = new Set(); // подписчики SSE
let eventId = 0;
let orderSeq = 1203;
let failNext = false;

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
function orderId() {
  let s = '';
  for (let i = 0; i < 26; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return 'ord_' + s;
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

const WAITERS = [
  { name: 'Азиз Каримов', initials: 'АК', login: 'aziz' },
  { name: 'Дилноза Юсупова', initials: 'ДЮ', login: 'dilnoza' }
];

// ---------- поток SSE ----------

function broadcast(event, data, filter) {
  eventId += 1;
  const frame = `event: ${event}\nid: ${eventId}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (typeof filter === 'function' && !filter(client)) continue;
    try {
      client.res.write(frame);
    } catch {
      clients.delete(client);
    }
  }
  console.log(`[sse] ${event} -> ${[...clients].filter((c) => !filter || filter(c)).length} клиент(ов)`);
}

setInterval(() => {
  for (const client of clients) {
    try {
      client.res.write('event: ping\ndata: {}\n\n');
    } catch {
      clients.delete(client);
    }
  }
}, 25000).unref();

// ---------- переходы статусов ----------

const CHAIN = ['new', 'accepted', 'kitchen', 'served', 'paid'];

function setStatus(order, status, by) {
  if (!CHAIN.includes(status) && status !== 'cancelled') return false;
  order.status = status;
  const at = nowIso();
  order.timeline.push(by ? { status, at, by } : { status, at });
  if (status === 'accepted' && !order.waiter) {
    order.waiter = WAITERS[Math.floor(Math.random() * WAITERS.length)];
  }
  broadcast('order.status', { orderId: order.id, status, at, by: by || '' }, (c) =>
    c.role === 'waiter' ? c.restaurant === order.restaurant : c.orderId === order.id
  );
  console.log(`[order] ${order.number} -> ${status}`);
  return true;
}

// Кухня живёт сама: заказ едет по цепочке, чтобы было что смотреть по SSE.
function autoAdvance(order) {
  const step = FAST ? 3000 : 8000;
  const plan = [
    ['accepted', step],
    ['kitchen', step * 2],
    ['served', step * 5]
  ];
  for (const [status, delay] of plan) {
    setTimeout(() => {
      const live = orders.get(order.id);
      if (!live || live.status === 'cancelled') return;
      if (CHAIN.indexOf(live.status) >= CHAIN.indexOf(status)) return;
      setStatus(live, status, 'aziz');
    }, delay).unref();
  }
}

// ---------- ответы ----------

function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(text);
}

function sendError(res, code, apiCode, message) {
  sendJson(res, code, { error: { code: apiCode, message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function publicOrder(order) {
  return {
    id: order.id,
    number: order.number,
    restaurant: order.restaurant,
    table: order.table,
    status: order.status,
    createdAt: order.createdAt,
    subtotal: order.subtotal,
    service: order.service,
    total: order.total,
    items: order.items,
    timeline: order.timeline,
    waiter: order.waiter ? { name: order.waiter.name, initials: order.waiter.initials } : null
  };
}

// ---------- API ----------

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api\/v1/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Staff-Token'
    });
    res.end();
    return;
  }

  if (route === '/health') {
    sendJson(res, 200, { ok: true, version: 'mock-1.0.0', uptime: Math.round(process.uptime()) });
    return;
  }

  // Поток событий.
  if (route === '/stream' && req.method === 'GET') {
    const client = {
      res,
      restaurant: url.searchParams.get('restaurant') || '',
      role: url.searchParams.get('role') || 'guest',
      orderId: url.searchParams.get('orderId') || ''
    };
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    clients.add(client);
    console.log(`[sse] подключился ${client.role} ${client.orderId || client.restaurant}`);
    req.on('close', () => {
      clients.delete(client);
      console.log('[sse] отключился');
    });
    return;
  }

  // Создание заказа.
  if (route === '/orders' && req.method === 'POST') {
    if (failNext) {
      failNext = false;
      console.log('[dev] отдаём 503, как и просили');
      sendError(res, 503, 'server_error', 'Мок специально упал');
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendError(res, 400, 'bad_request', 'Тело не разобралось');
      return;
    }

    const restaurant = String(body.restaurant || '');
    const dishes = menu(restaurant);
    if (!dishes) {
      sendError(res, 404, 'not_found', 'Нет такого ресторана');
      return;
    }
    const table = String(body.table || '').trim();
    if (!table) {
      sendError(res, 400, 'bad_request', 'Нет номера стола');
      return;
    }
    const clientOrderId = String(body.clientOrderId || '').trim();
    if (!clientOrderId) {
      sendError(res, 400, 'bad_request', 'Нет clientOrderId');
      return;
    }
    // Идемпотентность: тот же ключ отдаёт тот же заказ и код 200.
    const known = byClientId.get(clientOrderId);
    if (known && orders.has(known)) {
      console.log(`[order] повтор по clientOrderId ${clientOrderId}, отдаём тот же заказ`);
      sendJson(res, 200, publicOrder(orders.get(known)));
      return;
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) {
      sendError(res, 400, 'bad_request', 'Пустой заказ');
      return;
    }
    const items = [];
    for (const it of rawItems) {
      const dish = dishes.get(String(it && it.dishId));
      if (!dish) {
        sendError(res, 400, 'bad_request', `Неизвестное блюдо ${it && it.dishId}`);
        return;
      }
      const qty = Math.trunc(Number(it.qty));
      if (!Number.isFinite(qty) || qty <= 0) {
        sendError(res, 400, 'bad_request', 'Плохое количество');
        return;
      }
      // Цены только серверные, клиентским не верим.
      const row = { dishId: dish.id, name: dish.name, qty, price: dish.price };
      if (it.note) row.note = String(it.note).slice(0, 200);
      items.push(row);
    }

    const subtotal = items.reduce((acc, it) => acc + it.price * it.qty, 0);
    const service = Math.round(subtotal * 0.1);
    orderSeq += 1;
    const createdAt = nowIso();
    const order = {
      id: orderId(),
      number: 'А-' + orderSeq,
      restaurant,
      table,
      clientOrderId,
      lang: String(body.lang || 'ru'),
      comment: String(body.comment || ''),
      status: 'new',
      createdAt,
      subtotal,
      service,
      total: subtotal + service,
      items,
      timeline: [{ status: 'new', at: createdAt }],
      waiter: null
    };
    orders.set(order.id, order);
    byClientId.set(clientOrderId, order.id);
    console.log(`[order] создан ${order.number} стол ${table}, позиций ${items.length}, сумма ${order.total}`);

    broadcast('order.created', { order: publicOrder(order) }, (c) =>
      c.role === 'waiter' ? c.restaurant === restaurant : c.orderId === order.id
    );
    autoAdvance(order);
    sendJson(res, 201, publicOrder(order));
    return;
  }

  // Чтение заказа.
  const orderMatch = route.match(/^\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'GET') {
    const order = orders.get(decodeURIComponent(orderMatch[1]));
    if (!order) {
      sendError(res, 404, 'not_found', 'Нет такого заказа');
      return;
    }
    sendJson(res, 200, publicOrder(order));
    return;
  }

  // Вызов официанта или счёт.
  if (route === '/calls' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendError(res, 400, 'bad_request', 'Тело не разобралось');
      return;
    }
    const restaurant = String(body.restaurant || '');
    const table = String(body.table || '').trim();
    const kind = body.kind === 'bill' ? 'bill' : 'waiter';
    if (!table) {
      sendError(res, 400, 'bad_request', 'Нет номера стола');
      return;
    }
    // Открытый вызов того же вида с того же стола возвращается как есть.
    for (const call of calls.values()) {
      if (call.restaurant === restaurant && call.table === table && call.kind === kind && !call.ackAt) {
        console.log(`[call] повтор ${kind} со стола ${table}, отдаём открытый вызов`);
        sendJson(res, 201, call);
        return;
      }
    }
    const call = {
      id: 'call_' + Math.random().toString(36).slice(2, 12),
      restaurant,
      kind,
      table,
      orderId: body.orderId ? String(body.orderId) : null,
      createdAt: nowIso(),
      ackAt: null
    };
    calls.set(call.id, call);
    console.log(`[call] ${kind} со стола ${table}`);
    broadcast('call.created', { call }, (c) =>
      c.role === 'waiter' ? c.restaurant === restaurant : c.orderId === call.orderId
    );
    sendJson(res, 201, call);
    return;
  }

  // ---------- ручки для разработки ----------

  if (route === '/dev/status' && req.method === 'GET') {
    const order = orders.get(String(url.searchParams.get('id') || ''));
    const status = String(url.searchParams.get('status') || '');
    if (!order) {
      sendError(res, 404, 'not_found', 'Нет такого заказа');
      return;
    }
    if (!setStatus(order, status, 'aziz')) {
      sendError(res, 400, 'bad_request', 'Неизвестный статус');
      return;
    }
    sendJson(res, 200, publicOrder(order));
    return;
  }

  if (route === '/dev/ack' && req.method === 'GET') {
    const call = calls.get(String(url.searchParams.get('id') || ''));
    if (!call) {
      sendError(res, 404, 'not_found', 'Нет такого вызова');
      return;
    }
    call.ackAt = nowIso();
    broadcast('call.ack', { callId: call.id, by: 'aziz' }, (c) =>
      c.role === 'waiter' ? c.restaurant === call.restaurant : c.orderId === call.orderId
    );
    sendJson(res, 200, call);
    return;
  }

  if (route === '/dev/fail' && req.method === 'GET') {
    failNext = url.searchParams.get('on') !== '0';
    console.log(`[dev] следующий POST /orders ${failNext ? 'упадёт' : 'пройдёт'}`);
    sendJson(res, 200, { failNext });
    return;
  }

  if (route === '/dev/state' && req.method === 'GET') {
    sendJson(res, 200, {
      orders: [...orders.values()].map(publicOrder),
      calls: [...calls.values()],
      streams: clients.size
    });
    return;
  }

  sendError(res, 404, 'not_found', 'Нет такого метода');
}

// ---------- статика ----------

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/brest-v2.html';
  // Ссылка из QR может быть без расширения: /brest -> brest.html
  const file = path.join(ROOT, rel);
  const candidates = [file, file + '.html'];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(ROOT)) break;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const type = MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      fs.createReadStream(resolved).pipe(res);
      return;
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 ' + rel);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/v1')) {
    handleApi(req, res, url).catch((err) => {
      console.error('[api] упало:', err);
      if (!res.headersSent) sendError(res, 500, 'server_error', 'Мок сломался');
    });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`MenuLive mock: http://localhost:${PORT}/brest-v2.html?t=12&nocam=1`);
  console.log(`API: http://localhost:${PORT}/api/v1/health`);
  console.log(FAST ? 'Режим --fast: статусы едут быстро' : 'Обычный режим: статусы едут медленно');
});
