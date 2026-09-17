// Общая HTTP-обвязка: разбор тела, JSON-ответы, ошибки по контракту, CORS.
// Коды ошибок и их HTTP-статусы описаны в docs/api-orders.md.

// Ошибка, которую можно отдать клиенту как есть.
export class ApiError extends Error {
  constructor(code, message, extra = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    // Дополнительные поля тела ответа (например текущий статус при 409).
    this.extra = extra;
  }
}

// Таблица из контракта, менять нельзя.
export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  server_error: 500
};

export function badRequest(message, extra = null) {
  return new ApiError('bad_request', message, extra);
}

export function notFound(message) {
  return new ApiError('not_found', message);
}

export function unauthorized(message) {
  return new ApiError('unauthorized', message);
}

export function conflict(message, extra = null) {
  return new ApiError('conflict', message, extra);
}

// Заголовки CORS. Меню открывается по QR с того же домена, но приложение официанта
// и локальная отладка ходят с другого origin, поэтому разрешаем всем.
export function corsHeaders(req) {
  const origin = req.headers.origin;
  return {
    'Access-Control-Allow-Origin': origin && origin !== 'null' ? origin : '*',
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Staff-Token, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

// Ответ JSON с нужным статусом.
export function sendJson(req, res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...corsHeaders(req)
  });
  res.end(payload);
}

// Ответ об ошибке строго в формате контракта: { "error": { "code", "message" } }.
export function sendError(req, res, err) {
  const api = err instanceof ApiError ? err : new ApiError('server_error', 'Внутренняя ошибка сервера');
  const status = ERROR_STATUS[api.code] || 500;
  const body = { error: { code: api.code, message: api.message } };
  if (api.extra && typeof api.extra === 'object') Object.assign(body, api.extra);
  sendJson(req, res, status, body);
}

// Ответ на preflight.
export function sendNoContent(req, res) {
  res.writeHead(204, corsHeaders(req));
  res.end();
}

// Читает тело запроса с ограничением размера.
export function readBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;

    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limitBytes) {
        done = true;
        reject(badRequest('Тело запроса слишком большое'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(badRequest(`Обрыв запроса: ${err.message}`));
    });
  });
}

// Читает тело и разбирает его как JSON-объект.
export async function readJsonBody(req, limitBytes = 64 * 1024) {
  const raw = await readBody(req, limitBytes);
  if (raw.trim() === '') return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw badRequest('Тело запроса не является корректным JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('Тело запроса должно быть JSON-объектом');
  }
  return value;
}

// --- маленькие валидаторы, все ошибки одного вида: bad_request ---

export function requireString(value, field, options = {}) {
  const max = options.max || 200;
  if (typeof value !== 'string') {
    throw badRequest(`Поле "${field}" должно быть строкой`);
  }
  const text = value.trim();
  if (text === '') throw badRequest(`Поле "${field}" не может быть пустым`);
  if (text.length > max) throw badRequest(`Поле "${field}" длиннее ${max} символов`);
  if (options.pattern && !options.pattern.test(text)) {
    throw badRequest(`Поле "${field}" имеет недопустимый формат`);
  }
  return text;
}

export function optionalString(value, field, options = {}) {
  if (value === undefined || value === null || value === '') return '';
  return requireString(value, field, options);
}

export function requireInt(value, field, options = {}) {
  const min = options.min === undefined ? 0 : options.min;
  const max = options.max === undefined ? Number.MAX_SAFE_INTEGER : options.max;
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isInteger(num)) {
    throw badRequest(`Поле "${field}" должно быть целым числом`);
  }
  if (num < min || num > max) {
    throw badRequest(`Поле "${field}" должно быть от ${min} до ${max}`);
  }
  return num;
}

// Время в формате RFC 3339 UTC без миллисекунд: 2026-09-17T14:41:09Z.
export function nowIso(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
