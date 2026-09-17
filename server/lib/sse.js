// Хаб подписок Server-Sent Events.
// Держит последние 500 событий, чтобы клиент после обрыва добрал пропущенное
// по заголовку Last-Event-ID. Раз в 25 секунд шлёт ping, иначе nginx и мобильные
// сети рвут висящее соединение.

import { corsHeaders } from './http.js';

const DEFAULT_BUFFER_SIZE = 500;
const DEFAULT_PING_MS = 25000;

export class SseHub {
  constructor(options = {}) {
    this.bufferSize = options.bufferSize || DEFAULT_BUFFER_SIZE;
    this.pingMs = options.pingMs || DEFAULT_PING_MS;
    this.buffer = [];
    this.clients = new Set();
    this.lastId = 0;
    this.closed = false;
    this.timer = setInterval(() => this.ping(), this.pingMs);
    // Таймер не должен держать процесс живым в тестах.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  // Рассылает событие подходящим подписчикам и кладёт его в буфер.
  // scope: { restaurant, table, orderId } - по этим полям фильтруются подписчики.
  emit(name, data, scope = {}) {
    if (this.closed) return null;
    this.lastId += 1;
    const event = {
      id: this.lastId,
      name,
      data,
      restaurant: scope.restaurant || null,
      table: scope.table || null,
      orderId: scope.orderId || null
    };
    this.buffer.push(event);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.bufferSize);
    }
    for (const client of this.clients) {
      if (client.filter(event)) writeEvent(client.res, event);
    }
    return event;
  }

  // Подписывает клиента. filter(event) решает, видит ли он событие.
  subscribe(req, res, filter) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Страховка на случай, если в nginx забыли proxy_buffering off.
      'X-Accel-Buffering': 'no',
      ...corsHeaders(req)
    });
    // Соединение висит долго, таймауты сокета снимаем.
    if (typeof res.setTimeout === 'function') res.setTimeout(0);
    if (req.socket) {
      req.socket.setTimeout(0);
      req.socket.setNoDelay(true);
      req.socket.setKeepAlive(true);
    }
    res.write('retry: 3000\n\n');

    const client = { res, filter };
    this.clients.add(client);

    // Добор пропущенного после обрыва.
    const lastSeen = parseLastEventId(req);
    if (lastSeen > 0) {
      for (const event of this.buffer) {
        if (event.id > lastSeen && filter(event)) writeEvent(res, event);
      }
    }

    const drop = () => {
      this.clients.delete(client);
    };
    res.on('close', drop);
    res.on('error', drop);
    req.on('close', drop);
    req.on('error', drop);
    return client;
  }

  // Пинг всем, чтобы соединение не считалось мёртвым. Без id, добирать нечего.
  ping() {
    for (const client of this.clients) {
      try {
        client.res.write('event: ping\ndata: {}\n\n');
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get clientCount() {
    return this.clients.size;
  }

  // Закрывает все соединения и останавливает таймер.
  close() {
    this.closed = true;
    clearInterval(this.timer);
    for (const client of this.clients) {
      try { client.res.end(); } catch { /* уже закрыт */ }
    }
    this.clients.clear();
  }
}

function writeEvent(res, event) {
  const chunk = `event: ${event.name}\nid: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`;
  try {
    res.write(chunk);
  } catch {
    // Клиент отвалился, его уберёт обработчик close.
  }
}

// Last-Event-ID приходит заголовком, но в тестах и на некоторых прокси удобнее query.
function parseLastEventId(req) {
  const header = req.headers['last-event-id'];
  const fromHeader = Number.parseInt(Array.isArray(header) ? header[0] : header, 10);
  if (Number.isInteger(fromHeader) && fromHeader > 0) return fromHeader;
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const fromQuery = Number.parseInt(url.searchParams.get('lastEventId'), 10);
    if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  } catch {
    // Кривой URL, добирать нечего.
  }
  return 0;
}
