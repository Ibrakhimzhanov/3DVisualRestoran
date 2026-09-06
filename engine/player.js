// Видеоплеер MenuLive: один элемент video на всё приложение.
// Отвечает за смену источника, состояние загрузки и прогрев следующих роликов.
import { Emitter } from './core/emitter.js';

// Готовым считаем видео только когда оно реально отрисовало кадры.
const READY_TIME = 0.05;

export class Player extends Emitter {
  constructor(videoEl) {
    super();
    this.el = videoEl;
    this.dish = null;
    this._ready = false;
    this._prefetched = new Set();
    this._bind();
  }

  // Перепривязка к другому элементу video (режим без камеры).
  attach(videoEl) {
    if (!videoEl || videoEl === this.el) return;
    this._unbind();
    this.el = videoEl;
    this._bind();
  }

  _bind() {
    const el = this.el;
    if (!el) return;
    this._onMeta = () => {
      const w = el.videoWidth;
      const h = el.videoHeight;
      if (w > 0 && h > 0) this.emit('metadata', w / h);
    };
    this._onTime = () => {
      if (!this._ready && el.currentTime > READY_TIME) {
        this._ready = true;
        this.emit('ready');
      }
    };
    this._onError = () => this.emit('error', el.error);
    this._onPlaying = () => {
      if (el.currentTime > READY_TIME && !this._ready) {
        this._ready = true;
        this.emit('ready');
      }
    };
    el.addEventListener('loadedmetadata', this._onMeta);
    el.addEventListener('timeupdate', this._onTime);
    el.addEventListener('playing', this._onPlaying);
    el.addEventListener('error', this._onError);
  }

  _unbind() {
    const el = this.el;
    if (!el) return;
    el.removeEventListener('loadedmetadata', this._onMeta);
    el.removeEventListener('timeupdate', this._onTime);
    el.removeEventListener('playing', this._onPlaying);
    el.removeEventListener('error', this._onError);
  }

  // Загрузить блюдо. Если источник тот же, просто перезапускаем с начала.
  load(dish) {
    const el = this.el;
    if (!el || !dish) return;
    this.dish = dish;
    const next = new URL(dish.video, document.baseURI).href;
    const changed = el.currentSrc !== next && el.src !== next;

    if (changed) {
      this._ready = false;
      this.emit('loading');
      if (dish.poster) el.poster = new URL(dish.poster, document.baseURI).href;
      el.src = dish.video;
      el.load();
    }
    try {
      el.currentTime = 0;
    } catch (e) {
      // Safari может ругаться, если метаданные ещё не готовы
    }
    this.play();
  }

  play() {
    const el = this.el;
    if (!el) return;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Автозапуск заблокирован: iOS в режиме энергосбережения, нужен тап
        this.emit('blocked');
      });
    }
  }

  pause() {
    if (this.el) this.el.pause();
  }

  setMuted(muted) {
    if (!this.el) return;
    this.el.muted = !!muted;
    if (!muted) this.play();
  }

  get muted() {
    return this.el ? this.el.muted : true;
  }

  // Прогрев следующих роликов в HTTP-кэш, по одному, без спешки.
  prefetch(urls) {
    if (!Array.isArray(urls) || !urls.length) return;
    const conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;

    const queue = urls.filter((u) => u && !this._prefetched.has(u));
    if (!queue.length) return;

    const next = () => {
      const url = queue.shift();
      if (!url) return;
      this._prefetched.add(url);
      fetch(url, { mode: 'no-cors', cache: 'force-cache' })
        .catch(() => {})
        .then(() => {
          if (queue.length) setTimeout(next, 400);
        });
    };
    setTimeout(next, 1200);
  }

  destroy() {
    this._unbind();
    this.el = null;
  }
}
