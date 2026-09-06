import test from 'node:test';
import assert from 'node:assert/strict';
import { pick, dishCountLabel, t, TAG_ICONS } from '../engine/core/i18n.js';

test('pick возвращает строку как есть', () => {
  assert.equal(pick('Стейк', 'uz', 'ru'), 'Стейк');
});

test('pick берёт нужный язык', () => {
  const s = { ru: 'Стейк', uz: 'Bifshteks', en: 'Steak' };
  assert.equal(pick(s, 'uz', 'ru'), 'Bifshteks');
});

test('pick падает на defaultLang, затем на первое непустое', () => {
  const s = { ru: 'Стейк', uz: '' };
  assert.equal(pick(s, 'uz', 'ru'), 'Стейк');
  assert.equal(pick({ en: 'Steak' }, 'uz', 'ru'), 'Steak');
});

test('pick для пустых значений даёт пустую строку', () => {
  assert.equal(pick(null, 'ru', 'ru'), '');
  assert.equal(pick(undefined, 'ru', 'ru'), '');
  assert.equal(pick({}, 'ru', 'ru'), '');
});

test('dishCountLabel склоняет русский', () => {
  assert.equal(dishCountLabel(1, 'ru'), '1 блюдо');
  assert.equal(dishCountLabel(2, 'ru'), '2 блюда');
  assert.equal(dishCountLabel(5, 'ru'), '5 блюд');
  assert.equal(dishCountLabel(11, 'ru'), '11 блюд');
  assert.equal(dishCountLabel(14, 'ru'), '14 блюд');
  assert.equal(dishCountLabel(21, 'ru'), '21 блюдо');
  assert.equal(dishCountLabel(0, 'ru'), '0 блюд');
});

test('dishCountLabel для uz и en', () => {
  assert.equal(dishCountLabel(1, 'uz'), '1 ta taom');
  assert.equal(dishCountLabel(5, 'uz'), '5 ta taom');
  assert.equal(dishCountLabel(1, 'en'), '1 dish');
  assert.equal(dishCountLabel(2, 'en'), '2 dishes');
  assert.equal(dishCountLabel(5, 'en'), '5 dishes');
});

test('незнакомый язык ведёт себя как en', () => {
  assert.equal(dishCountLabel(1, 'de'), '1 dish');
  assert.equal(dishCountLabel(3, 'de'), '3 dishes');
});

test('t отдаёт строки на трёх языках', () => {
  assert.equal(t('welcome.start', 'ru'), 'Открыть камеру');
  assert.equal(t('welcome.start', 'uz'), 'Kamerani ochish');
  assert.equal(t('welcome.start', 'en'), 'Open camera');
  assert.equal(t('order.total', 'ru'), 'Итого');
  assert.equal(t('tag.chef', 'ru'), 'Выбор шефа');
  assert.equal(t('allergen.sesame', 'ru'), 'кунжут');
});

test('t возвращает ключ, если его нет в словаре', () => {
  assert.equal(t('нет.такого.ключа', 'ru'), 'нет.такого.ключа');
});

test('t с vars не ломает строки без плейсхолдеров', () => {
  assert.equal(t('toast.added', 'ru', { name: 'Стейк' }), 'Добавлено');
  assert.equal(t('order.title', 'en', {}), 'Your selection');
});

test('t падает на русский, если языка нет', () => {
  assert.equal(t('order.done', 'de'), 'Готово');
});

test('TAG_ICONS покрывает все теги', () => {
  assert.equal(TAG_ICONS.hit, '★');
  assert.equal(Object.keys(TAG_ICONS).length, 6);
});
