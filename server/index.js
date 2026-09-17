// Сервер заказов MenuLive. Контракт: docs/api-orders.md.
// Без внешних зависимостей: только встроенные модули Node 20+.
// Слушает 127.0.0.1, наружу отдаёт nginx.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ensureDir } from './lib/store.js';
import { Menu } from './lib/menu.js';
import { SseHub } from './lib/sse.js';
import { Orders, publicOrder, fullOrder } from './lib/orders.js';
import { Calls, publicCall } from './lib/calls.js';
import {
  ApiError,
  badRequest,
  notFound,
  unauthorized,
  readJsonBody,
  sendJson,
  sendError,
  sendNoContent,
  requireString
} from './lib/http.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const VERSION = readVersion();
const STARTED_AT = Date.now();

// Собирает сервер. Возвращает обычный http.Server, чтобы тесты могли
// поднять его на случайном порту.
export function createServer(options = {}) {
  const dataDir = options.dataDir || process.env.MENULIVE_DATA_DIR || path.join(HERE, 'data');
  const restaurantsDir = options.restaurantsDir
    || process.env.MENULIVE_RESTAURANTS_DIR
    || path.join(REPO_ROOT, 'restaurants');

  ensureDir(dataDir);

  const menu = new Menu(restaurantsDir);
  const sse = new SseHub({
    bufferSize: options.sseBufferSize || 500,
    pingMs: options.ssePingMs || 25000
  });
  const orders = new Orders({
    dataDir,
    menu,
    sse,
    tzOffsetMinutes: readTzOffset()
  });
  const calls = new Calls({ dataDir, menu, sse, orders });

  const app = { dataDir, restaurantsDir, menu, sse, orders, calls };

  const server = http.createServer((req, res) => {
    handle(app, req, res).catch((err) => {
      if (!(err instanceof ApiError)) {
        console.error('[menulive-orders] необработанная ошибка:', err);
      }
      if (!res.headersSent) sendError(req, res, err);
      else res.end();
    });
  });

  server.menulive = app;
  // Долгие SSE-соединения не должны обрываться таймаутами keep-alive.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;
  server.on('close', () => sse.close());

  return server;
}

async function handle(app, req, res) {
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    sendNoContent(req, res);
    return;
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const route = normalizePath(url.pathname);

  // GET /health
  if (route === '/health') {
    requireMethod(method, 'GET');
    sendJson(req, res, 200, {
      ok: true,
      version: VERSION,
      uptime: Math.floor((Date.now() - STARTED_AT) / 1000)
    });
    return;
  }

  // GET /stream - поток событий SSE
  if (route === '/stream') {
    requireMethod(method, 'GET');
    handleStream(app, req, res, url);
    return;
  }

  // /orders
  if (route === '/orders') {
    if (method === 'POST') {
      const payload = await readJsonBody(req);
      const { order, created } = app.orders.create(payload);
      sendJson(req, res, created ? 201 : 200, publicOrder(order));
      return;
    }
    if (method === 'GET') {
      requireStaff(req);
      const list = app.orders.list({
        restaurant: url.searchParams.get('restaurant'),
        status: url.searchParams.get('status'),
        limit: url.searchParams.get('limit')
      });
      sendJson(req, res, 200, { orders: list.map(fullOrder) });
      return;
    }
    throw badRequest(`Метод ${method} для ${route} не поддерживается`);
  }

  // POST /orders/:id/status
  const statusMatch = route.match(/^\/orders\/([A-Za-z0-9_]{1,64})\/status$/);
  if (statusMatch) {
    requireMethod(method, 'POST');
    requireStaff(req);
    const payload = await readJsonBody(req);
    const order = app.orders.setStatus(statusMatch[1], payload.status, payload.by);
    sendJson(req, res, 200, fullOrder(order));
    return;
  }

  // GET /orders/:id
  const orderMatch = route.match(/^\/orders\/([A-Za-z0-9_]{1,64})$/);
  if (orderMatch) {
    requireMethod(method, 'GET');
    const order = app.orders.get(orderMatch[1]);
    sendJson(req, res, 200, fullOrder(order));
    return;
  }

  // /calls
  if (route === '/calls') {
    if (method === 'POST') {
      const payload = await readJsonBody(req);
      const { call, created } = app.calls.create(payload);
      sendJson(req, res, created ? 201 : 200, publicCall(call));
      return;
    }
    if (method === 'GET') {
      // Сверх контракта: официанту нужен список вызовов после переподключения.
      requireStaff(req);
      const list = app.calls.list({
        restaurant: url.searchParams.get('restaurant'),
        open: url.searchParams.get('open')
      });
      sendJson(req, res, 200, { calls: list.map(publicCall) });
      return;
    }
    throw badRequest(`Метод ${method} для ${route} не поддерживается`);
  }

  // POST /calls/:id/ack
  const ackMatch = route.match(/^\/calls\/([A-Za-z0-9_]{1,64})\/ack$/);
  if (ackMatch) {
    requireMethod(method, 'POST');
    requireStaff(req);
    const payload = await readJsonBody(req);
    const call = app.calls.ack(ackMatch[1], payload.by);
    sendJson(req, res, 200, publicCall(call));
    return;
  }

  throw notFound(`Путь ${url.pathname} не найден`);
}

// Подписка на события. Официант видит весь ресторан, гость только свой заказ и стол.
function handleStream(app, req, res, url) {
  const restaurant = requireString(url.searchParams.get('restaurant'), 'restaurant', { max: 40 });
  app.menu.load(restaurant);

  const role = (url.searchParams.get('role') || 'guest').trim();
  let filter;

  if (role === 'waiter') {
    requireStaff(req);
    filter = (event) => event.restaurant === restaurant;
  } else if (role === 'guest') {
    const orderId = (url.searchParams.get('orderId') || '').trim();
    let table = (url.searchParams.get('table') || '').trim();
    if (orderId) {
      const order = app.orders.find(orderId);
      if (!order) throw notFound(`Заказ "${orderId}" не найден`);
      if (order.restaurant !== restaurant) throw notFound(`Заказ "${orderId}" не найден`);
      if (!table) table = order.table;
    }
    if (!orderId && !table) {
      throw badRequest('Для роли "guest" нужен orderId или table');
    }
    filter = (event) => {
      if (event.restaurant !== restaurant) return false;
      if (orderId && event.orderId === orderId) return true;
      if (table && event.table === table) return true;
      return false;
    };
  } else {
    throw badRequest('Поле "role" должно быть "waiter" или "guest"');
  }

  app.sse.subscribe(req, res, filter);
}

// Проверка токена персонала. Токен только из окружения, в репозитории его нет.
function requireStaff(req) {
  const expected = process.env.MENULIVE_STAFF_TOKEN || '';
  if (expected === '') {
    throw unauthorized('Токен персонала не настроен на сервере (MENULIVE_STAFF_TOKEN)');
  }
  const raw = req.headers['x-staff-token'];
  const given = Array.isArray(raw) ? raw[0] : raw;
  if (!given) throw unauthorized('Нужен заголовок X-Staff-Token');

  const a = Buffer.from(String(given), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw unauthorized('Неверный токен персонала');
  }
}

function requireMethod(method, expected) {
  if (method !== expected) throw badRequest(`Ожидался метод ${expected}, пришёл ${method}`);
}

// nginx проксирует запрос как есть, поэтому путь приходит с префиксом /api/v1.
// Убираем его, чтобы роутинг не зависел от настроек прокси.
function normalizePath(pathname) {
  let route = pathname || '/';
  if (route.length > 1 && route.endsWith('/')) route = route.slice(0, -1);
  if (route === '/api' || route.startsWith('/api/')) route = route.slice(4) || '/';
  if (route === '/v1' || route.startsWith('/v1/')) route = route.slice(3) || '/';
  return route === '' ? '/' : route;
}

function readVersion() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
    return typeof raw.version === 'string' ? raw.version : '1.0.0';
  } catch {
    return '1.0.0';
  }
}

// Смещение локального времени ресторана в минутах, по нему сбрасывается
// дневной счётчик номеров. По умолчанию Ташкент, UTC+5.
function readTzOffset() {
  const raw = Number.parseInt(process.env.MENULIVE_TZ_OFFSET || '', 10);
  if (Number.isInteger(raw) && raw >= -840 && raw <= 840) return raw;
  return 300;
}

// Запуск как самостоятельного процесса.
export function start() {
  const port = Number.parseInt(process.env.PORT || '', 10) || 4010;
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();

  if (!process.env.MENULIVE_STAFF_TOKEN) {
    console.warn('[menulive-orders] MENULIVE_STAFF_TOKEN не задан: методы персонала будут отвечать 401');
  }

  server.listen(port, host, () => {
    console.log(`[menulive-orders] версия ${VERSION}, слушаю http://${host}:${port}`);
    console.log(`[menulive-orders] данные: ${server.menulive.dataDir}`);
    console.log(`[menulive-orders] рестораны: ${server.menulive.restaurantsDir}`);
  });

  const stop = (signal) => {
    console.log(`[menulive-orders] ${signal}, останавливаюсь`);
    server.menulive.sse.close();
    server.close(() => process.exit(0));
    // Если соединения не закрылись за пять секунд, выходим принудительно.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  return server;
}

// Запускаемся только когда файл вызван напрямую, а не импортирован тестом.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}
