/* ============================================================
   MenuLive, приложение официанта.
   Ванильный JS, без сборщиков и внешних библиотек.
   Контракт API: docs/api-orders.md

   Правила безопасности, принятые в этом файле:
   - данные сервера считаются недоверенными, в DOM попадают только
     через textContent и createElement, innerHTML не используется нигде;
   - localStorage и navigator.vibrate обёрнуты в try/catch, приложение
     обязано работать даже там, где хранилище запрещено;
   - токен персонала уходит только заголовком X-Staff-Token,
     в адресную строку он не попадает.
   ============================================================ */

(function () {
  'use strict';

  /* ---------------------------------------------------------
     Константы
     --------------------------------------------------------- */

  var STORE_KEY = 'menulive.waiter.v1';

  // Статусы, которые официант держит в ленте
  var LIST_STATUSES = 'new,accepted,kitchen,served';

  // Цепочка переходов из контракта
  var FLOW = ['new', 'accepted', 'kitchen', 'served', 'paid'];

  // Подписи кнопки действия для каждого текущего статуса
  var NEXT_LABEL = {
    'new': 'Принять заказ',
    'accepted': 'Отправить на кухню',
    'kitchen': 'Отметить поданным',
    'served': 'Закрыть и принести счёт'
  };

  // Человеческие названия статусов
  var STATUS_RU = {
    'new': 'новый заказ',
    'accepted': 'принят',
    'kitchen': 'на кухне',
    'served': 'подано',
    'paid': 'оплачен',
    'cancelled': 'отменён'
  };

  var STAGE_LABELS = ['Новый', 'Принят', 'На кухне', 'Подан'];

  var WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  // Пороги таймера «без ответа», секунды
  var WARN_SEC = 60;   // после этого терракота
  var LATE_SEC = 120;  // после этого мигает рамка

  var NBSP = ' ';

  /* ---------------------------------------------------------
     Состояние
     --------------------------------------------------------- */

  var S = {
    cfg: null,            // настройки из localStorage
    screen: 'settings',   // settings | inbox | order | floor
    prevScreen: 'inbox',  // куда вернуться из настроек
    tab: 'new',           // new | work | calls
    orders: {},           // id -> заказ
    calls: {},            // id -> незакрытый вызов
    currentId: null,      // открытый заказ
    served: {},           // id заказа -> { индекс позиции: true }, локальная отметка
    pickedTable: null,    // выбранный стол в зале
    online: false,
    banner: null,         // { text: '...', kind: 'ok' | 'err' }
    bannerTimer: null,
    cancelArmed: false,   // «Проблема с заказом» нажата один раз
    shift: { revenue: 0, closed: 0, respSum: 0, respCount: 0 }
  };

  /* ---------------------------------------------------------
     Мелкие помощники
     --------------------------------------------------------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // Клонирует статичную иконку из <template>. Данными сервера не наполняется.
  function ico(id) {
    var t = $(id);
    if (!t || !t.content || !t.content.firstElementChild) return el('span');
    return t.content.firstElementChild.cloneNode(true);
  }

  function num(v, fallback) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : fallback;
  }

  // 265000 -> 265 000 (неразрывные пробелы, чтобы сумма не переносилась)
  function money(v) {
    var n = Math.round(Number(v) || 0);
    var sign = n < 0 ? '-' : '';
    return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  function clock(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function hhmm(d) {
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function parseTime(iso) {
    if (!iso) return 0;
    var t = Date.parse(iso);
    return isFinite(t) ? t : 0;
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'ОФ';
    var a = parts[0].charAt(0);
    var b = parts.length > 1 ? parts[1].charAt(0) : '';
    return (a + b).toUpperCase();
  }

  // Строка, пришедшая с сервера, может быть чем угодно. Приводим к тексту.
  function str(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  /* ---------------------------------------------------------
     Настройки, localStorage строго в try/catch
     --------------------------------------------------------- */

  function defaults() {
    return {
      baseUrl: '',
      token: '',
      restaurant: 'brest',
      waiterName: 'Официант',
      waiterId: 'waiter',
      hallName: 'Зал 1',
      tables: 12
    };
  }

  function readCfg() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    var out = defaults();
    if (!raw) return out;
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed || typeof parsed !== 'object') return out;
    out.baseUrl = str(parsed.baseUrl);
    out.token = str(parsed.token);
    out.restaurant = str(parsed.restaurant) || 'brest';
    out.waiterName = str(parsed.waiterName) || 'Официант';
    out.waiterId = str(parsed.waiterId) || 'waiter';
    out.hallName = str(parsed.hallName) || 'Зал 1';
    out.tables = Math.min(99, Math.max(1, num(parsed.tables, 12)));
    return out;
  }

  function writeCfg(cfg) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) {
      return false;
    }
  }

  function wipeCfg() {
    try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* хранилище недоступно */ }
  }

  function configured() {
    return !!(S.cfg && S.cfg.baseUrl && S.cfg.token);
  }

  /* ---------------------------------------------------------
     Сеть
     --------------------------------------------------------- */

  function apiUrl(path) {
    var base = String(S.cfg.baseUrl || '').replace(/\/+$/, '');
    return base + path;
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/json', 'X-Staff-Token': S.cfg.token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(apiUrl(path), {
      method: opts.method || 'GET',
      headers: headers,
      cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var msg = (data && data.error && str(data.error.message)) || ('ошибка ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function loadOrders() {
    var q = '/orders?restaurant=' + encodeURIComponent(S.cfg.restaurant) +
            '&status=' + LIST_STATUSES + '&limit=50';
    return api(q).then(function (d) {
      var list = (d && d.orders) || [];
      var fresh = {};
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o && str(o.id)) {
          // локальные отметки «подано» по позициям переживают перезагрузку списка
          fresh[o.id] = o;
        }
      }
      S.orders = fresh;
      render();
      return list.length;
    });
  }

  /* ---------------------------------------------------------
     Поток событий SSE.
     EventSource не умеет заголовки, а контракт требует X-Staff-Token,
     поэтому поток читается через fetch + ReadableStream. Токен не
     попадает в адресную строку. Переподключение делаем сами.
     --------------------------------------------------------- */

  var stream = { ctrl: null, timer: null, attempt: 0, lastId: null, stopped: true };

  function stopStream() {
    stream.stopped = true;
    if (stream.timer) { clearTimeout(stream.timer); stream.timer = null; }
    if (stream.ctrl) {
      try { stream.ctrl.abort(); } catch (e) { /* уже закрыт */ }
      stream.ctrl = null;
    }
  }

  function startStream() {
    stopStream();
    stream.stopped = false;

    var ctrl = null;
    try { ctrl = new AbortController(); } catch (e) { ctrl = null; }
    stream.ctrl = ctrl;

    var headers = { 'Accept': 'text/event-stream', 'X-Staff-Token': S.cfg.token };
    if (stream.lastId) headers['Last-Event-ID'] = stream.lastId;

    var url = apiUrl('/stream?restaurant=' + encodeURIComponent(S.cfg.restaurant) + '&role=waiter');

    fetch(url, {
      method: 'GET',
      headers: headers,
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('поток отвечает ' + res.status);
      if (!res.body || !res.body.getReader) throw new Error('движок не умеет потоковое тело ответа');
      streamUp();
      return pump(res.body.getReader());
    }).catch(function (err) {
      if (stream.stopped) return;
      streamDown(err);
    });
  }

  function pump(reader) {
    var dec = new TextDecoder('utf-8');
    var buf = '';

    function step() {
      return reader.read().then(function (chunk) {
        if (chunk.done) throw new Error('сервер закрыл поток');
        buf += dec.decode(chunk.value, { stream: true });
        var m;
        // события разделены пустой строкой
        while ((m = /\r?\n\r?\n/.exec(buf)) !== null) {
          var raw = buf.slice(0, m.index);
          buf = buf.slice(m.index + m[0].length);
          if (raw) handleBlock(raw);
        }
        if (buf.length > 262144) buf = '';  // защита от мусора без разделителей
        return step();
      });
    }

    return step();
  }

  function handleBlock(raw) {
    var name = 'message';
    var data = '';
    var id = null;
    var lines = raw.split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.charAt(0) === ':') continue;     // комментарий или пустая строка
      var c = line.indexOf(':');
      var field = c === -1 ? line : line.slice(0, c);
      var value = c === -1 ? '' : line.slice(c + 1);
      if (value.charAt(0) === ' ') value = value.slice(1);
      if (field === 'event') name = value;
      else if (field === 'data') data += (data ? '\n' : '') + value;
      else if (field === 'id') id = value;
    }

    if (id !== null && id !== '') stream.lastId = id;
    if (!data) return;

    var payload = null;
    try { payload = JSON.parse(data); } catch (e) { return; }
    if (!payload || typeof payload !== 'object') return;

    onEvent(name, payload);
  }

  function streamUp() {
    stream.attempt = 0;
    S.online = true;
    document.body.classList.remove('is-offline');
    // после восстановления связи всегда полный список, добору по Last-Event-ID не верим
    loadOrders().catch(function (e) { note(e.message, 'err'); });
    render();
  }

  function streamDown(err) {
    S.online = false;
    document.body.classList.add('is-offline');
    render();

    stream.attempt = Math.min(stream.attempt + 1, 6);
    var delay = Math.min(15000, 1000 * Math.pow(2, stream.attempt - 1));
    var text = 'нет связи, повтор через ' + Math.round(delay / 1000) + ' с';
    var bar = $('netbarText');
    if (bar) bar.textContent = text;

    if (stream.timer) clearTimeout(stream.timer);
    stream.timer = setTimeout(function () {
      if (!stream.stopped) startStream();
    }, delay);
  }

  /* ---------------------------------------------------------
     Обработка событий потока
     --------------------------------------------------------- */

  function onEvent(name, d) {
    if (name === 'ping' || name === 'message') return;

    if (name === 'order.created') {
      var o = d.order;
      if (!o || !str(o.id)) return;
      var isNew = !S.orders[o.id];
      S.orders[o.id] = o;
      if (isNew) alarm();
      render();
      return;
    }

    if (name === 'order.status') {
      var id = str(d.orderId);
      var ord = S.orders[id];
      if (!ord) return;
      applyStatus(ord, str(d.status));
      render();
      return;
    }

    if (name === 'call.created') {
      var c = d.call;
      if (!c || !str(c.id)) return;
      if (c.ackAt) { delete S.calls[c.id]; render(); return; }
      var freshCall = !S.calls[c.id];
      S.calls[c.id] = c;
      if (freshCall) alarm();
      render();
      return;
    }

    if (name === 'call.ack') {
      var cid = str(d.callId);
      if (cid && S.calls[cid]) {
        delete S.calls[cid];
        render();
      }
    }
  }

  // Применяет статус к заказу и снимает его с ленты, если заказ закрыт.
  // Вызов может прийти дважды (ответ на POST и событие из потока),
  // поэтому закрытый заказ второй раз не считаем.
  function applyStatus(order, status) {
    if (!status || !order || order._closed) return;
    if (status === 'accepted' && order.status === 'new') noteResponse(order);
    order.status = status;
    if (status === 'paid' || status === 'cancelled') {
      order._closed = true;
      if (status === 'paid') {
        S.shift.revenue += Number(order.total) || 0;
        S.shift.closed += 1;
      }
      delete S.orders[order.id];
      delete S.served[order.id];
      if (S.currentId === order.id) {
        S.currentId = null;
        if (S.screen === 'order') S.screen = 'inbox';
      }
    }
  }

  function noteResponse(order) {
    var born = parseTime(order.createdAt);
    if (!born) return;
    var sec = Math.max(0, Math.round((Date.now() - born) / 1000));
    if (sec > 3600) return;  // явный мусор, в среднее не берём
    S.shift.respSum += sec;
    S.shift.respCount += 1;
  }

  /* ---------------------------------------------------------
     Звук и вибрация
     --------------------------------------------------------- */

  var actx = null;

  function audioCtx() {
    try {
      if (!actx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended' && actx.resume) actx.resume();
      return actx;
    } catch (e) {
      return null;
    }
  }

  // Короткий двойной сигнал на осцилляторе, файл не нужен
  function beep() {
    var ctx = audioCtx();
    if (!ctx) return;
    try {
      var t0 = ctx.currentTime + 0.01;
      var notes = [{ f: 880, at: 0 }, { f: 1318, at: 0.15 }];
      for (var i = 0; i < notes.length; i++) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        var at = t0 + notes[i].at;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[i].f, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.28, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.16);
      }
    } catch (e) { /* звук не критичен */ }
  }

  function buzz() {
    // Android-обёртка может дать свой канал уведомления
    try {
      if (window.MenuLiveNative && typeof window.MenuLiveNative.notify === 'function') {
        window.MenuLiveNative.notify();
        return;
      }
    } catch (e) { /* обёртки нет */ }
    try {
      if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate([40, 70, 40]);
    } catch (e) { /* вибрация запрещена */ }
  }

  function alarm() {
    beep();
    buzz();
  }

  // Мобильные движки не дают звук до первого касания, разблокируем контекст
  function unlockAudio() {
    var ctx = audioCtx();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    } catch (e) { /* не страшно */ }
  }

  /* ---------------------------------------------------------
     Баннер над лентой
     --------------------------------------------------------- */

  function note(text, kind) {
    S.banner = { text: String(text || ''), kind: kind === 'err' ? 'err' : 'ok' };
    if (S.bannerTimer) clearTimeout(S.bannerTimer);
    S.bannerTimer = setTimeout(function () {
      S.banner = null;
      render();
    }, kind === 'err' ? 6000 : 4000);
    render();
  }

  /* ---------------------------------------------------------
     Действия над заказами и вызовами
     --------------------------------------------------------- */

  function nextStatus(status) {
    var i = FLOW.indexOf(status);
    if (i === -1 || i === FLOW.length - 1) return null;
    return FLOW[i + 1];
  }

  function prevStatus(status) {
    var i = FLOW.indexOf(status);
    if (i <= 0) return null;
    return FLOW[i - 1];
  }

  function setStatus(order, next) {
    if (!order || !next || order._pending) return;
    var prev = order.status;

    // оптимистично: рисуем сразу
    order.status = next;
    order._pending = true;
    render();

    api('/orders/' + encodeURIComponent(order.id) + '/status', {
      method: 'POST',
      body: { status: next, by: S.cfg.waiterId }
    }).then(function (updated) {
      order._pending = false;
      // сервер вернул полный заказ, его версия главнее нашей
      var finalStatus = (updated && str(updated.status)) || next;

      // заказ мог уже закрыться событием из потока, которое пришло раньше ответа
      if (order._closed) {
        note('Стол ' + str(order.table) + ': ' + (STATUS_RU[finalStatus] || finalStatus), 'ok');
        render();
        return;
      }

      var target = order;
      if (updated && str(updated.id)) {
        updated._pending = false;
        S.orders[updated.id] = updated;
        target = updated;
      }
      // возвращаем прежний статус на один шаг, чтобы applyStatus честно посчитал отклик
      target.status = prev;
      applyStatus(target, finalStatus);
      note('Стол ' + str(order.table) + ': ' + (STATUS_RU[finalStatus] || finalStatus), 'ok');
      render();
    }).catch(function (err) {
      order._pending = false;
      // откат
      order.status = prev;
      // 409 значит, что сервер знает настоящий статус, берём его
      var real = err.data && (str(err.data.status) || (err.data.error && str(err.data.error.status)));
      if (err.status === 409 && real) order.status = real;
      note('Не прошло: ' + err.message, 'err');
      render();
    });
  }

  function ackCall(call) {
    if (!call || call._pending) return;
    call._pending = true;
    var id = call.id;
    render();

    api('/calls/' + encodeURIComponent(id) + '/ack', {
      method: 'POST',
      body: { by: S.cfg.waiterId }
    }).then(function () {
      delete S.calls[id];
      note('Вызов со стола ' + str(call.table) + ' закрыт', 'ok');
      render();
    }).catch(function (err) {
      call._pending = false;
      note('Не прошло: ' + err.message, 'err');
      render();
    });
  }

  /* ---------------------------------------------------------
     Выборки
     --------------------------------------------------------- */

  function allOrders() {
    var out = [];
    for (var k in S.orders) if (Object.prototype.hasOwnProperty.call(S.orders, k)) out.push(S.orders[k]);
    out.sort(function (a, b) { return parseTime(b.createdAt) - parseTime(a.createdAt); });
    return out;
  }

  function allCalls() {
    var out = [];
    for (var k in S.calls) if (Object.prototype.hasOwnProperty.call(S.calls, k)) out.push(S.calls[k]);
    out.sort(function (a, b) { return parseTime(b.createdAt) - parseTime(a.createdAt); });
    return out;
  }

  function newOrders() {
    return allOrders().filter(function (o) { return o.status === 'new'; });
  }

  function workOrders() {
    return allOrders().filter(function (o) {
      return o.status === 'accepted' || o.status === 'kitchen' || o.status === 'served';
    });
  }

  /* ---------------------------------------------------------
     Отрисовка. Никакого innerHTML, только createElement и textContent.
     --------------------------------------------------------- */

  function render() {
    // страховки: не рисуем карточку исчезнувшего заказа и ленту без настроек
    if (S.screen === 'order' && !S.orders[S.currentId]) S.screen = 'inbox';
    if (S.screen !== 'settings' && !configured()) S.screen = 'settings';

    var screens = {
      settings: $('screenSettings'),
      inbox: $('screenInbox'),
      order: $('screenOrder'),
      floor: $('screenFloor')
    };
    for (var key in screens) {
      if (screens[key]) screens[key].hidden = (key !== S.screen);
    }

    if (S.screen === 'settings') renderSettings();
    else if (S.screen === 'inbox') renderInbox();
    else if (S.screen === 'order') renderOrder();
    else if (S.screen === 'floor') renderFloor();

    tick();
  }

  /* ---------- настройки ---------- */

  function renderSettings() {
    $('setBack').hidden = !configured();
  }

  function fillSettingsForm() {
    $('fBase').value = S.cfg.baseUrl;
    $('fToken').value = S.cfg.token;
    $('fRest').value = S.cfg.restaurant;
    $('fTables').value = String(S.cfg.tables);
    $('fName').value = S.cfg.waiterName === 'Официант' ? '' : S.cfg.waiterName;
    $('fBy').value = S.cfg.waiterId === 'waiter' ? '' : S.cfg.waiterId;
    $('fHall').value = S.cfg.hallName;
  }

  function setNote(text, kind) {
    var n = $('setNote');
    n.textContent = text || '';
    n.className = 'set-note' + (kind ? ' is-' + kind : '');
  }

  /* ---------- лента ---------- */

  function renderInbox() {
    $('inbAvatar').textContent = initials(S.cfg.waiterName);
    $('inbName').textContent = S.cfg.waiterName;
    $('inbSub').textContent = S.cfg.hallName.toLowerCase() + ' · столы 1-' + S.cfg.tables;
    $('inbDot').className = 'shift-dot' + (S.online ? '' : ' is-off');
    $('inbShift').textContent = S.online ? 'на смене' : 'офлайн';

    var counts = {
      'new': newOrders().length,
      work: workOrders().length,
      calls: allCalls().length
    };

    var tabsHost = $('inbTabs');
    clear(tabsHost);
    [
      { id: 'new', label: 'Новые' },
      { id: 'work', label: 'В работе' },
      { id: 'calls', label: 'Вызовы' }
    ].forEach(function (t) {
      var on = t.id === S.tab;
      var btn = el('button', 'tab' + (on ? ' is-on' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', 'tab-label', t.label));
      var urgent = (t.id === 'new' && counts['new'] > 0) || (t.id === 'calls' && counts.calls > 0);
      btn.appendChild(el('span', 'tab-count' + (urgent ? ' is-urgent' : ''), counts[t.id]));
      btn.addEventListener('click', function () {
        S.tab = t.id;
        render();
      });
      tabsHost.appendChild(btn);
    });

    var list = $('inbList');
    clear(list);

    if (S.banner) list.appendChild(bannerNode(S.banner));

    var items;
    if (S.tab === 'new') items = newOrders().map(orderTicket);
    else if (S.tab === 'work') items = workOrders().map(orderTicket);
    else items = allCalls().map(callTicket);

    if (!items.length) {
      list.appendChild(emptyNode());
    } else {
      items.forEach(function (n) { list.appendChild(n); });
    }
  }

  function bannerNode(b) {
    var wrap = el('div', 'banner' + (b.kind === 'err' ? ' is-err' : ''));
    var icoWrap = el('span', 'banner-ico');
    icoWrap.appendChild(ico(b.kind === 'err' ? 'icoWarn' : 'icoCheckThin'));
    wrap.appendChild(icoWrap);
    wrap.appendChild(el('span', 'banner-txt', b.text));
    return wrap;
  }

  function emptyNode() {
    var wrap = el('div', 'empty');
    var titles = { 'new': 'Пока тихо', work: 'Ничего в работе', calls: 'Вызовов нет' };
    var subs = {
      'new': 'Новые заказы появятся здесь сразу',
      work: 'Принятые заказы будут тут',
      calls: 'Гости пока не зовут'
    };
    wrap.appendChild(el('div', 'empty-t', titles[S.tab] || 'Пока тихо'));
    wrap.appendChild(el('div', 'empty-s', subs[S.tab] || ''));
    return wrap;
  }

  // Тикет заказа
  function orderTicket(o) {
    var isNew = o.status === 'new';
    var born = parseTime(o.createdAt);

    var art = el('article', 'ticket' + (isNew ? ' t-brass' : '') + (o._pending ? ' is-pending' : ''));

    var body = el('button', 'ticket-body');
    body.type = 'button';
    body.addEventListener('click', function () { openOrder(o.id); });

    var top = el('div', 'ticket-top');
    var left = el('div');
    left.appendChild(el('div', 't-cap', 'Стол'));
    left.appendChild(el('div', 't-table', str(o.table) || '-'));
    top.appendChild(left);

    var right = el('div', 't-timer-wrap');
    right.appendChild(el('div', 't-timer-cap', isNew ? 'без ответа' : (STATUS_RU[o.status] || '')));
    var timer = el('div', 't-timer');
    timer.setAttribute('data-ts', String(born));
    timer.setAttribute('data-mode', isNew ? 'wait' : 'mins');
    right.appendChild(timer);
    top.appendChild(right);
    body.appendChild(top);

    var items = Array.isArray(o.items) ? o.items : [];
    if (items.length) {
      body.appendChild(el('div', 't-sep'));
      items.slice(0, 4).forEach(function (it) {
        var row = el('div', 't-line');
        row.appendChild(el('span', 't-qty', num(it && it.qty, 1)));
        row.appendChild(el('span', 't-name', str(it && it.name) || str(it && it.dishId)));
        var noteText = str(it && it.note);
        if (noteText) row.appendChild(el('span', 't-note', noteText));
        body.appendChild(row);
      });
      if (items.length > 4) {
        var more = el('div', 't-line');
        more.appendChild(el('span', 't-qty', '+'));
        more.appendChild(el('span', 't-name', 'ещё ' + (items.length - 4) + ' позиции'));
        body.appendChild(more);
      }
    }

    var metaBits = [money(o.total) + ' сум'];
    if (str(o.number)) metaBits.push(str(o.number));
    if (born) metaBits.push(hhmm(new Date(born)));
    body.appendChild(el('div', 't-meta', metaBits.join(' · ')));

    art.appendChild(body);

    var next = nextStatus(o.status);
    if (isNew && next) {
      var actWrap = el('div', 't-act');
      var btn = el('button', 'btn-solid', NEXT_LABEL[o.status] || 'Дальше');
      btn.type = 'button';
      if (o._pending) btn.disabled = true;
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        setStatus(o, next);
      });
      actWrap.appendChild(btn);
      art.appendChild(actWrap);
    } else {
      var stage = FLOW.indexOf(o.status);
      var rail = el('div', 'rail');
      for (var i = 1; i <= 4; i++) {
        rail.appendChild(el('i', i <= stage ? 'is-done' : ''));
      }
      art.appendChild(rail);
    }

    return art;
  }

  // Тикет вызова
  function callTicket(c) {
    var isBill = str(c.kind) === 'bill';
    var born = parseTime(c.createdAt);

    var art = el('article', 'ticket t-mint' + (c._pending ? ' is-pending' : ''));

    var body = el('div', 'ticket-body');

    var top = el('div', 'ticket-top');
    var left = el('div');
    left.appendChild(el('div', 't-cap', 'Стол'));
    left.appendChild(el('div', 't-table', str(c.table) || '-'));
    top.appendChild(left);

    var right = el('div', 't-timer-wrap');
    right.appendChild(el('div', 't-timer-cap', 'ждут'));
    var timer = el('div', 't-timer');
    timer.setAttribute('data-ts', String(born));
    timer.setAttribute('data-mode', 'call');
    right.appendChild(timer);
    top.appendChild(right);
    body.appendChild(top);

    var metaBits = [isBill ? 'Просит счёт' : 'Зовёт официанта'];
    if (born) metaBits.push('вызов из меню в ' + hhmm(new Date(born)));
    body.appendChild(el('div', 't-meta', metaBits.join(' · ')));

    art.appendChild(body);

    var actWrap = el('div', 't-act');
    var btn = el('button', 'btn-solid s-mint', isBill ? 'Несу счёт' : 'Иду к столу');
    btn.type = 'button';
    if (c._pending) btn.disabled = true;
    btn.addEventListener('click', function () { ackCall(c); });
    actWrap.appendChild(btn);
    art.appendChild(actWrap);

    return art;
  }

  /* ---------- карточка заказа ---------- */

  function openOrder(id) {
    S.currentId = id;
    S.cancelArmed = false;
    S.screen = 'order';
    render();
  }

  function renderOrder() {
    var o = S.orders[S.currentId];
    if (!o) return;

    var born = parseTime(o.createdAt);
    var isNew = o.status === 'new';

    // тот же баннер, что и в ленте: официант должен видеть отказ сервера здесь же
    var bannerHost = $('ordBannerHost');
    clear(bannerHost);
    if (S.banner) bannerHost.appendChild(bannerNode(S.banner));

    $('ordTitle').textContent = 'Стол ' + (str(o.table) || '-');

    var subBits = [];
    if (str(o.number)) subBits.push(str(o.number));
    subBits.push('гость через QR');
    if (born) subBits.push(hhmm(new Date(born)));
    $('ordSub').textContent = subBits.join(' · ');

    $('ordTimerLabel').textContent = isNew ? 'без ответа' : 'в работе';
    var tm = $('ordTimer');
    tm.setAttribute('data-ts', String(born));
    tm.setAttribute('data-mode', isNew ? 'wait' : 'mins');

    // шкала этапов
    var stagesHost = $('ordStages');
    clear(stagesHost);
    var stage = Math.max(0, FLOW.indexOf(o.status));
    STAGE_LABELS.forEach(function (label, i) {
      var cls = 'stage' + (i === stage ? ' is-on' : (i < stage ? ' is-past' : ''));
      var box = el('div', cls);
      box.appendChild(el('div', 'stage-bar'));
      box.appendChild(el('div', 'stage-label', label));
      stagesHost.appendChild(box);
    });

    // позиции
    var items = Array.isArray(o.items) ? o.items : [];
    var servedMap = S.served[o.id] || (S.served[o.id] = {});
    var servedCount = 0;

    var linesHost = $('ordLines');
    clear(linesHost);

    items.forEach(function (it, idx) {
      var done = !!servedMap[idx];
      if (done) servedCount += 1;

      var row = el('div', 'ord-row' + (done ? ' is-served' : ''));

      var check = el('button', 'check');
      check.type = 'button';
      check.setAttribute('aria-label', 'Отметить позицию поданной');
      check.appendChild(ico('icoCheck'));
      check.addEventListener('click', function () {
        servedMap[idx] = !servedMap[idx];
        render();
      });
      row.appendChild(check);

      var cell = el('div', 'ord-cell');
      var head = el('div', 'ord-head');
      head.appendChild(el('span', 'ord-qty', num(it && it.qty, 1)));
      head.appendChild(el('span', 'ord-name', str(it && it.name) || str(it && it.dishId)));
      cell.appendChild(head);
      var nt = str(it && it.note);
      if (nt) cell.appendChild(el('div', 'ord-note', nt));
      row.appendChild(cell);

      var qty = num(it && it.qty, 1);
      var price = Number(it && it.price) || 0;
      row.appendChild(el('span', 'ord-sum', money(price * qty)));

      linesHost.appendChild(row);
    });

    if (!items.length) {
      linesHost.appendChild(el('div', 'ord-row', 'Позиции не пришли'));
    }

    $('ordServed').textContent = servedCount + ' из ' + items.length + ' подано';

    // пожелание кухне
    var comment = str(o.comment);
    $('ordComment').hidden = !comment;
    $('ordCommentText').textContent = comment;

    // деньги
    $('ordTotal').textContent = money(o.total);
    $('ordTotalSub').textContent = money(o.subtotal) + ' и сервис ' + money(o.service);

    // кнопки
    var next = nextStatus(o.status);
    var primary = $('ordPrimary');
    primary.textContent = next ? (NEXT_LABEL[o.status] || 'Дальше') : 'Заказ закрыт';
    primary.className = 'btn-primary' + (o.status === 'served' ? ' s-mint' : '');
    primary.disabled = !next || !!o._pending;

    var back = $('ordBack');
    var prev = prevStatus(o.status);
    back.disabled = !prev || !!o._pending;

    var cancel = $('ordCancel');
    cancel.textContent = S.cancelArmed ? 'Точно отменить?' : 'Проблема с заказом';
    cancel.className = 'btn-ghost' + (S.cancelArmed ? ' is-armed' : '');
    cancel.disabled = !!o._pending;
  }

  /* ---------- зал ---------- */

  function tableState(no) {
    var key = String(no);
    var calls = allCalls().filter(function (c) { return str(c.table) === key; });
    var orders = allOrders().filter(function (o) { return str(o.table) === key; });

    if (calls.length) {
      var c = calls[0];
      return {
        kind: 'call',
        state: str(c.kind) === 'bill' ? 'просит счёт' : 'зовёт',
        ts: parseTime(c.createdAt),
        mode: 'call',
        suffix: ' ждут'
      };
    }

    var fresh = orders.filter(function (o) { return o.status === 'new'; })[0];
    if (fresh) {
      return {
        kind: 'fresh',
        state: 'новый заказ',
        ts: parseTime(fresh.createdAt),
        mode: 'wait',
        suffix: ' без ответа'
      };
    }

    if (orders.length) {
      var sum = 0;
      orders.forEach(function (o) { sum += Number(o.total) || 0; });
      return { kind: 'order', state: STATUS_RU[orders[0].status] || 'в работе', meta: money(sum) };
    }

    return { kind: 'free', state: 'свободен', meta: 'убран' };
  }

  function renderFloor() {
    $('flrTitle').textContent = S.cfg.hallName;

    // подзаголовок со временем и именем ставит tick, его вызывает render в конце

    // Собираем номера столов: 1..N плюс всё, что пришло с сервера сверх плана
    var total = S.cfg.tables;
    var seen = {};
    var numbers = [];
    for (var i = 1; i <= total; i++) { numbers.push(String(i)); seen[String(i)] = true; }
    allOrders().concat(allCalls()).forEach(function (x) {
      var t = str(x.table);
      if (t && !seen[t]) { seen[t] = true; numbers.push(t); }
    });

    var busy = 0;
    var attention = [];

    var grid = $('flrGrid');
    clear(grid);

    numbers.forEach(function (no) {
      var st = tableState(no);
      if (st.kind !== 'free') busy += 1;
      if (st.kind === 'call' || st.kind === 'fresh') attention.push(no);

      var btn = el('button', 'tbl k-' + st.kind + (S.pickedTable === no ? ' is-picked' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', 'tbl-no', no));

      var foot = el('span', 'tbl-foot');
      foot.appendChild(el('span', 'tbl-state', st.state));

      var meta = el('span', 'tbl-meta');
      if (st.ts) {
        // счётчик тикает, но без цветовой эскалации: плитка уже окрашена по типу
        var live = el('span');
        live.setAttribute('data-ts', String(st.ts));
        live.setAttribute('data-mode', 'plain');
        meta.appendChild(live);
        meta.appendChild(document.createTextNode(st.suffix || ''));
      } else {
        meta.textContent = st.meta || '';
      }
      foot.appendChild(meta);
      btn.appendChild(foot);

      btn.addEventListener('click', function () {
        S.pickedTable = (S.pickedTable === no) ? null : no;
        // если на столе есть заказ, открываем его карточку
        var own = allOrders().filter(function (o) { return str(o.table) === no; })[0];
        if (own && S.pickedTable === no) { openOrder(own.id); return; }
        render();
      });

      grid.appendChild(btn);
    });

    $('flrBusy').textContent = String(busy);
    $('flrAll').textContent = '/' + numbers.length;

    var alertWrap = $('flrAlertWrap');
    if (attention.length) {
      alertWrap.hidden = false;
      $('flrAlertText').textContent = 'Требуют внимания: ' + attention.join(', ');
    } else {
      alertWrap.hidden = true;
    }

    $('stRevenue').textContent = money(S.shift.revenue);
    $('stAvg').textContent = S.shift.closed ? money(S.shift.revenue / S.shift.closed) : '0';
    $('stResp').textContent = S.shift.respCount
      ? clock(S.shift.respSum / S.shift.respCount)
      : '-';
  }

  /* ---------------------------------------------------------
     Секундный тик: часы и таймеры «без ответа»
     --------------------------------------------------------- */

  function tick() {
    var now = Date.now();
    var d = new Date(now);

    var clocks = document.querySelectorAll('[data-clock]');
    for (var c = 0; c < clocks.length; c++) clocks[c].textContent = hhmm(d);

    // подпись зала тоже со временем, обновляем без перерисовки сетки столов
    if (S.cfg && S.screen === 'floor') {
      var first = String(S.cfg.waiterName || '').trim().split(/\s+/)[0] || 'официанта';
      $('flrSub').textContent = WEEKDAYS[d.getDay()] + ', ' + hhmm(d) + ' · смена: ' + first;
    }

    var nodes = document.querySelectorAll('[data-ts]');
    for (var i = 0; i < nodes.length; i++) applyAge(nodes[i], now);
  }

  function applyAge(node, now) {
    var ts = Number(node.getAttribute('data-ts'));
    var mode = node.getAttribute('data-mode') || 'wait';

    if (!ts) {
      node.textContent = '-';
      return;
    }

    var sec = Math.max(0, Math.floor((now - ts) / 1000));

    if (mode === 'mins') {
      node.textContent = Math.floor(sec / 60) + ' мин';
      return;
    }

    node.textContent = clock(sec);

    var warn = sec >= WARN_SEC;
    var late = sec >= LATE_SEC;

    if (mode === 'wait' || mode === 'call') {
      var base = mode === 'call' ? 'c-mint' : 'c-brass';
      node.classList.toggle(base, !warn);
      node.classList.toggle('c-red', warn);
      if (mode === 'call') node.classList.toggle('c-brass', false);

      var ticket = node.closest ? node.closest('.ticket') : null;
      if (ticket) {
        var tone = mode === 'call' ? 't-mint' : 't-brass';
        ticket.classList.toggle(tone, !warn);
        ticket.classList.toggle('t-red', warn);
        ticket.classList.toggle('is-late', late);
      }
    }
  }

  /* ---------------------------------------------------------
     Навигация и обработчики
     --------------------------------------------------------- */

  function go(screen) {
    S.screen = screen;
    if (screen !== 'settings') S.prevScreen = screen;
    render();
  }

  function openSettings() {
    S.prevScreen = (S.screen === 'settings') ? S.prevScreen : S.screen;
    fillSettingsForm();
    setNote('', '');
    S.screen = 'settings';
    render();
  }

  function bind() {
    // общая навигация
    var goButtons = document.querySelectorAll('[data-go]');
    for (var i = 0; i < goButtons.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { go(b.getAttribute('data-go')); });
      })(goButtons[i]);
    }

    var setButtons = document.querySelectorAll('[data-go-settings]');
    for (var j = 0; j < setButtons.length; j++) {
      setButtons[j].addEventListener('click', openSettings);
    }

    $('setBack').addEventListener('click', function () {
      if (!configured()) return;
      go(S.prevScreen || 'inbox');
    });

    // сохранение настроек
    $('setSave').addEventListener('click', function () {
      var base = $('fBase').value.trim().replace(/\/+$/, '');
      var token = $('fToken').value.trim();
      if (!base) { setNote('Нужен адрес сервера', 'err'); return; }
      if (!/^https?:\/\//i.test(base)) { setNote('Адрес должен начинаться с http:// или https://', 'err'); return; }
      if (!token) { setNote('Нужен токен персонала', 'err'); return; }

      S.cfg.baseUrl = base;
      S.cfg.token = token;
      S.cfg.restaurant = $('fRest').value.trim() || 'brest';
      S.cfg.tables = Math.min(99, Math.max(1, num($('fTables').value, 12)));
      S.cfg.waiterName = $('fName').value.trim() || 'Официант';
      S.cfg.waiterId = $('fBy').value.trim() || 'waiter';
      S.cfg.hallName = $('fHall').value.trim() || 'Зал 1';

      var saved = writeCfg(S.cfg);
      setNote(saved ? 'Сохранено, подключаюсь' : 'Хранилище недоступно, настройки живут до перезапуска', saved ? 'ok' : 'err');

      connect();
      go('inbox');
    });

    // проверка связи
    $('setCheck').addEventListener('click', function () {
      var base = $('fBase').value.trim().replace(/\/+$/, '');
      var token = $('fToken').value.trim();
      if (!base) { setNote('Сначала адрес сервера', 'err'); return; }
      setNote('Проверяю...', '');
      fetch(base + '/health', { headers: { 'Accept': 'application/json', 'X-Staff-Token': token }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('ответ ' + r.status)); })
        .then(function (d) {
          setNote('Сервер на связи, версия ' + (str(d && d.version) || 'неизвестна'), 'ok');
        })
        .catch(function (e) { setNote('Нет ответа: ' + e.message, 'err'); });
    });

    // стереть настройки
    $('setWipe').addEventListener('click', function () {
      stopStream();
      wipeCfg();
      S.cfg = defaults();
      S.orders = {};
      S.calls = {};
      S.served = {};
      S.online = false;
      document.body.classList.remove('is-offline');
      fillSettingsForm();
      setNote('Настройки стёрты', 'ok');
      render();
    });

    // карточка заказа
    $('ordPrimary').addEventListener('click', function () {
      var o = S.orders[S.currentId];
      if (!o) return;
      var next = nextStatus(o.status);
      if (next) setStatus(o, next);
    });

    $('ordBack').addEventListener('click', function () {
      var o = S.orders[S.currentId];
      if (!o) return;
      var prev = prevStatus(o.status);
      if (prev) setStatus(o, prev);
    });

    $('ordCancel').addEventListener('click', function () {
      var o = S.orders[S.currentId];
      if (!o) return;
      if (!S.cancelArmed) {
        S.cancelArmed = true;
        render();
        setTimeout(function () {
          if (S.cancelArmed) { S.cancelArmed = false; render(); }
        }, 4000);
        return;
      }
      S.cancelArmed = false;
      setStatus(o, 'cancelled');
      go('inbox');
    });

    // разблокировка звука после первого касания
    var once = function () {
      unlockAudio();
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('touchstart', once);
      document.removeEventListener('click', once);
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('touchstart', once);
    document.addEventListener('click', once);

    // вернулись из фона: сразу освежаем список
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && configured()) {
        if (!S.online) startStream();
        else loadOrders().catch(function (e) { note(e.message, 'err'); });
      }
    });
  }

  /* ---------------------------------------------------------
     Старт
     --------------------------------------------------------- */

  function connect() {
    if (!configured()) return;
    document.body.classList.add('is-offline');
    var bar = $('netbarText');
    if (bar) bar.textContent = 'подключаюсь';
    loadOrders().catch(function (e) { note(e.message, 'err'); });
    startStream();
  }

  function boot() {
    S.cfg = readCfg();
    bind();
    fillSettingsForm();

    if (configured()) {
      S.screen = 'inbox';
      S.prevScreen = 'inbox';
      connect();
    } else {
      S.screen = 'settings';
      S.prevScreen = 'inbox';
    }

    render();
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Ручка для Android-обёртки: она может дёрнуть перезагрузку списка
  window.MenuLiveWaiter = {
    refresh: function () { if (configured()) loadOrders().catch(function () {}); },
    reconnect: function () { if (configured()) startStream(); }
  };

})();
