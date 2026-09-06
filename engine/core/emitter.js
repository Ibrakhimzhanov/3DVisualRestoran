// Простая шина событий без зависимостей.
export class Emitter {
  constructor() {
    // Map<string, Set<Function>>
    this._listeners = new Map();
  }

  // Подписка. Возвращает функцию отписки.
  on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn);
  }

  // Отписка одного обработчика.
  off(event, fn) {
    const set = this._listeners.get(event);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this._listeners.delete(event);
  }

  // Разовая подписка.
  once(event, fn) {
    const stop = this.on(event, (...args) => {
      stop();
      fn(...args);
    });
    return stop;
  }

  // Вызов обработчиков. Ошибка внутри одного не ломает остальные.
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return false;
    // копия, чтобы отписка внутри обработчика не рвала обход
    for (const fn of Array.from(set)) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[Emitter] ошибка в обработчике "${event}":`, err);
      }
    }
    return true;
  }

  // Снять всё: конкретное событие или вообще всё.
  clear(event) {
    if (event === undefined) this._listeners.clear();
    else this._listeners.delete(event);
  }
}
