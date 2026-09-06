// MenuLive: точка входа. Грузит конфиг ресторана, собирает AR-сцену,
// интерфейс и плеер, связывает их между собой.
import { validateConfig, ConfigError, allDishes, findDish } from './core/config.js';
import { pickLang, detectWebView, escapeUrl, isLikelyDesktop } from './core/env.js';
import { stageSize } from './core/stage.js';
import { t } from './core/i18n.js';
import { Order } from './core/order.js';
import { createScene, registerAll } from './ar.js';
import { Player } from './player.js';
import { UI } from './ui.js';

const LANG_KEY = 'menulive:lang';
const LOADER_DELAY = 300;
const HINT_BACK_DELAY = 1500;
const START_TIMEOUT = 12000;

class App {
  constructor(config, opts) {
    this.config = config;
    this.dishes = allDishes(config);
    this.opts = opts;
    this.lang = opts.lang;
    this.categoryId = config.categories[0].id;
    this.dishId = null;
    this.filter = null;
    this.started = false;
    this.state = 'welcome';
    this._loaderTimer = null;
    this._hintTimer = null;
  }

  run() {
    const root = document.getElementById('ml-root');
    const mount = document.getElementById('ml-scene');

    this.ui = new UI({ root, config: this.config, lang: this.lang });
    this.order = Order.restore(this.config.id, globalThis.sessionStorage);

    registerAll();
    this.scene = createScene({ config: this.config, mount });
    this.player = new Player(this.scene.videoEl);

    this._wireUI();
    this._wireScene();
    this._wirePlayer();
    this._wireOrder();

    this._selectCategory(this.categoryId, false);
    this._syncOrder();

    if (this.opts.nocam) this._enterNoCam();
    else if (this.opts.preview) this._enterPreview();
    else this.ui.setState('welcome');
  }

  // ---------- интерфейс ----------

  _wireUI() {
    const ui = this.ui;

    ui.on('start', () => this._start());
    ui.on('retry', () => this._start());
    ui.on('nocam', () => this._enterNoCam());

    ui.on('lang', (code) => {
      this.lang = code;
      try {
        localStorage.setItem(LANG_KEY, code);
      } catch (e) {
        // приватный режим, ничего страшного
      }
      this._syncOrder();
    });

    ui.on('category', (id) => this._selectCategory(id, true));
    ui.on('filter', (tag) => {
      this.filter = tag;
      ui.renderDishes(this.categoryId, this.dishId, tag);
    });
    ui.on('dish', (id) => this._selectDish(id));

    ui.on('add', (id) => {
      this.order.add(id);
      ui.toast(t('toast.added', this.lang));
    });
    ui.on('inc', (id) => this.order.inc(id));
    ui.on('dec', (id) => this.order.dec(id));
    // «Готово» на экране официанта только закрывает экран: список гость может
    // дособрать или показать ещё раз, поэтому не очищаем.
    ui.on('reset', () => this._syncOrder());

    ui.on('sound', () => {
      const next = !this.player.muted;
      this.player.setMuted(next);
      ui.setMuted(next);
    });

    ui.on('watch', () => {
      ui.setWatchVisible(false);
      this.player.play();
    });

    ui.on('share', () => this._share());
    ui.on('review', () => {
      if (this.config.reviewUrl) window.open(this.config.reviewUrl, '_blank', 'noopener');
    });
    ui.on('escape', () => {
      const href = escapeUrl(location.href, navigator.userAgent);
      if (href) location.href = href;
    });
  }

  async _share() {
    const dish = this.dishId ? findDish(this.config, this.dishId) : null;
    const title = this.config.name;
    const text = dish ? `${title}` : title;
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.ui.toast(t('toast.copied', this.lang));
    } catch (e) {
      // пользователь закрыл системное окно, это не ошибка
    }
  }

  // ---------- сцена ----------

  _wireScene() {
    this.scene.on('found', () => {
      this._clearHintTimer();
      this.state = 'found';
      this.ui.setState('found');
      if (navigator.vibrate) navigator.vibrate(30);
      this.scene.setVisible(true);
      if (!this.player.dish) this._loadActive();
      else this.player.play();
    });

    this.scene.on('lost', () => {
      this.state = 'lost';
      this.scene.setVisible(false);
      this.player.pause();
      this.ui.setState('lost');
      this._clearHintTimer();
      this._hintTimer = setTimeout(() => {
        if (this.state === 'lost') this.ui.setState('scanning');
      }, HINT_BACK_DELAY);
    });

    this.scene.on('error', (info) => this._cameraError(info && info.kind));
  }

  async _start() {
    if (this.started) return;
    this.ui.setState('starting');

    // Жест пользователя: разблокируем воспроизведение видео на iOS.
    try {
      const v = this.scene.videoEl;
      v.muted = true;
      const p = v.play();
      if (p && p.then) await p.then(() => v.pause()).catch(() => {});
    } catch (e) {
      // не критично
    }

    let timer = null;
    try {
      await Promise.race([
        this.scene.start(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { kind: 'camera-error' })), START_TIMEOUT);
        }),
      ]);
      clearTimeout(timer);
      this.started = true;
      this.state = 'scanning';
      this.ui.setState('scanning');
      this._loadActive();
    } catch (err) {
      clearTimeout(timer);
      this._cameraError(err && err.kind);
    }
  }

  _cameraError(kind) {
    const ua = navigator.userAgent;
    const webview = detectWebView(ua);
    if (webview) {
      const isIOS = /iPhone|iPad|iPod/i.test(ua);
      this.ui.setState('error', { kind: 'webview', platform: isIOS ? 'ios' : 'android' });
      return;
    }
    if (isLikelyDesktop(ua, window.innerWidth)) {
      this.ui.setState('error', { kind: 'desktop', qr: this.config.qr || '' });
      return;
    }
    this.ui.setState('error', { kind: kind || 'camera-denied' });
  }

  // ---------- плеер ----------

  _wirePlayer() {
    this.player.on('loading', () => {
      clearTimeout(this._loaderTimer);
      this._loaderTimer = setTimeout(() => this.scene.setLoading(true), LOADER_DELAY);
    });

    this.player.on('ready', () => {
      clearTimeout(this._loaderTimer);
      this.scene.setLoading(false);
      this._prefetchRest();
    });

    this.player.on('metadata', (aspect) => {
      const dish = this.player.dish;
      const cfg = this._stageFor(dish);
      this.scene.setStageSize(stageSize(cfg, aspect));
    });

    this.player.on('blocked', () => this.ui.setWatchVisible(true));

    this.player.on('error', () => {
      clearTimeout(this._loaderTimer);
      this.scene.setLoading(false);
      this.ui.toast(t('error.video', this.lang));
    });
  }

  _stageFor(dish) {
    const base = this.config.stage;
    if (dish && dish.stage) return Object.assign({}, base, dish.stage);
    return base;
  }

  _loadActive() {
    const dish = this.dishId ? findDish(this.config, this.dishId) : null;
    if (!dish) return;
    const cfg = this._stageFor(dish);
    this.scene.setKey(dish.key || cfg.key, cfg);
    this.player.load(dish);
    this.ui.setSoundVisible(!!dish.audio);
    this.ui.setMuted(this.player.muted);
    this.ui.setWatchVisible(false);
  }

  _prefetchRest() {
    const cat = this.config.categories.find((c) => c.id === this.categoryId);
    if (!cat) return;
    const urls = cat.dishes.filter((d) => d.id !== this.dishId).map((d) => d.video);
    this.player.prefetch(urls);
  }

  // ---------- данные ----------

  _selectCategory(id, autoDish) {
    const cat = this.config.categories.find((c) => c.id === id);
    if (!cat) return;
    this.categoryId = id;
    this.filter = null;
    this.ui.renderCategories(id);
    const first = cat.dishes[0];
    if (autoDish && first) this._selectDish(first.id);
    else {
      this.dishId = this.dishId || (first ? first.id : null);
      this.ui.renderDishes(id, this.dishId, null);
      if (this.dishId) this._renderCard();
    }
  }

  _selectDish(id) {
    const dish = findDish(this.config, id);
    if (!dish) return;
    // блюдо может лежать в другой категории (кнопка «Сочетается с»)
    const cat = this.config.categories.find((c) => c.dishes.some((d) => d.id === id));
    if (cat && cat.id !== this.categoryId) {
      this.categoryId = cat.id;
      this.ui.renderCategories(cat.id);
    }
    this.dishId = id;
    this.ui.renderDishes(this.categoryId, id, this.filter);
    this._renderCard();
    if (this.started || this.state === 'nocam') this._loadActive();
  }

  _renderCard() {
    const dish = findDish(this.config, this.dishId);
    if (dish) this.ui.renderCard(dish, this.order.qty(dish.id));
  }

  _wireOrder() {
    this.order.on('change', () => this._syncOrder());
  }

  _syncOrder() {
    const count = this.order.count;
    const total = this.order.total(this.dishes);
    this.ui.renderOrder(count, total);
    this._renderCard();
  }

  // ---------- режимы без камеры ----------

  _enterNoCam() {
    this.state = 'nocam';
    this.ui.setState('nocam');
    const slot = this.ui.noCamSlot();
    if (slot && this.scene.videoEl && this.scene.videoEl.parentNode !== slot) {
      const v = this.scene.videoEl;
      v.setAttribute('controls', '');
      v.style.width = '100%';
      v.style.borderRadius = '14px';
      v.style.display = 'block';
      slot.appendChild(v);
      this.player.attach(v);
    }
    this._loadActive();
  }

  _enterPreview() {
    // Предпросмотр интерфейса без камеры: состояние «меню найдено» поверх фото меню.
    document.body.classList.add('ml-preview');
    const bg = this.config.target.preview;
    if (bg) {
      const img = document.createElement('div');
      img.className = 'ml-preview-bg';
      img.style.backgroundImage = `url("${bg}")`;
      document.body.appendChild(img);
    }
    this._enterNoCam();
    this.ui.setState('found');
  }
}

function applyTheme(theme) {
  const s = document.documentElement.style;
  s.setProperty('--ml-bg', theme.bg);
  s.setProperty('--ml-accent', theme.accent);
  s.setProperty('--ml-accent2', theme.accent2);
  s.setProperty('--ml-text', theme.text);
}

function showFatal(message, detail) {
  const root = document.getElementById('ml-root') || document.body;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ml-fatal';
  const h = document.createElement('div');
  h.className = 'ml-fatal__title';
  h.textContent = message;
  box.appendChild(h);
  if (detail) {
    const d = document.createElement('div');
    d.className = 'ml-fatal__detail';
    d.textContent = detail;
    box.appendChild(d);
  }
  root.appendChild(box);
}

export async function boot() {
  const src = document.body.dataset.config;
  const params = new URLSearchParams(location.search);

  if (!src) {
    showFatal('MenuLive: не указан конфиг ресторана', 'data-config отсутствует у body');
    return;
  }

  let config;
  try {
    const res = await fetch(src, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    config = validateConfig(await res.json());
  } catch (err) {
    const detail = err instanceof ConfigError ? `${err.message} (${err.path})` : String(err && err.message || err);
    showFatal(t('error.config.title', 'ru'), detail);
    return;
  }

  applyTheme(config.theme);
  document.title = config.name;

  let lang = null;
  try {
    lang = localStorage.getItem(LANG_KEY);
  } catch (e) {
    lang = null;
  }
  if (!lang || !config.languages.includes(lang)) {
    lang = pickLang(navigator.languages || [navigator.language], config.languages, config.defaultLang, config.autoLang);
  }

  const app = new App(config, {
    lang,
    nocam: params.get('nocam') === '1',
    preview: params.get('preview') === '1',
    debug: params.get('debug') === '1',
  });
  window.MenuLive = app;
  app.run();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
