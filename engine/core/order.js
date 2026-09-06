// Заказ гостя: позиции живут в памяти и дублируются в sessionStorage.
import { Emitter } from './emitter.js';

const PREFIX = 'menulive:order:';

function defaultStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // приватный режим может бросать уже на обращении
    return null;
  }
}

export class Order extends Emitter {
  constructor(restaurantId, storage = undefined) {
    super();
    this.restaurantId = String(restaurantId ?? '');
    this.storage = storage === undefined ? defaultStorage() : storage;
    // Map хранит порядок первого добавления
    this._items = new Map();
  }

  get key() {
    return PREFIX + this.restaurantId;
  }

  // Добавить количество (по умолчанию одну штуку).
  add(dishId, qty = 1) {
    const id = String(dishId ?? '');
    const n = Math.trunc(Number(qty));
    if (!id || !Number.isFinite(n) || n <= 0) return this.qty(id);
    this._items.set(id, (this._items.get(id) || 0) + n);
    this._commit();
    return this._items.get(id);
  }

  inc(dishId) {
    return this.add(dishId, 1);
  }

  // Убавить на единицу, на нуле позиция уходит.
  dec(dishId) {
    const id = String(dishId ?? '');
    if (!this._items.has(id)) return 0;
    const next = this._items.get(id) - 1;
    if (next <= 0) this._items.delete(id);
    else this._items.set(id, next);
    this._commit();
    return this._items.get(id) || 0;
  }

  remove(dishId) {
    const id = String(dishId ?? '');
    if (!this._items.delete(id)) return false;
    this._commit();
    return true;
  }

  clear() {
    if (this._items.size === 0) {
      this._commit();
      return;
    }
    this._items.clear();
    this._commit();
  }

  qty(dishId) {
    return this._items.get(String(dishId ?? '')) || 0;
  }

  get count() {
    let sum = 0;
    for (const n of this._items.values()) sum += n;
    return sum;
  }

  // Позиции в порядке первого добавления.
  items() {
    return Array.from(this._items.entries()).map(([dishId, qty]) => ({ dishId, qty }));
  }

  // Сумма по списку блюд вида {id, price}.
  total(dishes) {
    if (!Array.isArray(dishes)) return 0;
    const prices = new Map();
    for (const dish of dishes) {
      if (dish && dish.id !== undefined && typeof dish.price === 'number') {
        prices.set(String(dish.id), dish.price);
      }
    }
    let sum = 0;
    for (const [dishId, qty] of this._items.entries()) {
      const p = prices.get(dishId);
      if (typeof p === 'number' && Number.isFinite(p)) sum += p * qty;
    }
    return sum;
  }

  toJSON() {
    return { v: 1, items: this.items() };
  }

  // Сохранить и сообщить подписчикам.
  _commit() {
    this._save();
    this.emit('change', this);
  }

  _save() {
    if (!this.storage) return;
    try {
      if (this._items.size === 0) this.storage.removeItem(this.key);
      else this.storage.setItem(this.key, JSON.stringify(this.toJSON()));
    } catch (err) {
      console.warn('[Order] не удалось сохранить заказ:', err);
    }
  }

  // Восстановление из хранилища. Любая ошибка даёт пустой заказ.
  static restore(restaurantId, storage = undefined) {
    const order = new Order(restaurantId, storage);
    if (!order.storage) return order;
    try {
      const raw = order.storage.getItem(order.key);
      if (!raw) return order;
      const data = JSON.parse(raw);
      const items = data && Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        if (!item) continue;
        const id = String(item.dishId ?? '');
        const qty = Math.trunc(Number(item.qty));
        if (id && Number.isFinite(qty) && qty > 0) {
          order._items.set(id, (order._items.get(id) || 0) + qty);
        }
      }
    } catch (err) {
      console.warn('[Order] не удалось восстановить заказ:', err);
      order._items.clear();
    }
    return order;
  }
}
