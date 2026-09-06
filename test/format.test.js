import test from 'node:test';
import assert from 'node:assert/strict';
import { price, kcal } from '../engine/core/format.js';

const CURRENCY = { ru: 'сум', uz: "so'm", en: 'UZS' };
const NBSP = ' ';

test('price на трёх языках', () => {
  assert.equal(price(68000, 'ru', CURRENCY), `68${NBSP}000 сум`);
  assert.equal(price(68000, 'uz', CURRENCY), `68${NBSP}000 so'm`);
  assert.equal(price(68000, 'en', CURRENCY), `68${NBSP}000 UZS`);
});

test('price группирует разряды неразрывным пробелом', () => {
  assert.equal(price(1234567, 'ru', CURRENCY), `1${NBSP}234${NBSP}567 сум`);
  assert.equal(price(999, 'ru', CURRENCY), '999 сум');
  assert.ok(price(68000, 'ru', CURRENCY).includes(NBSP));
  assert.ok(!price(68000, 'ru', CURRENCY).includes('68 000'));
});

test('price берёт первую доступную валюту, если для языка её нет', () => {
  assert.equal(price(5000, 'en', { ru: 'сум' }), `5${NBSP}000 сум`);
});

test('price без валюты даёт только число', () => {
  assert.equal(price(5000, 'ru', {}), `5${NBSP}000`);
  assert.equal(price(5000, 'ru'), `5${NBSP}000`);
});

test('price для не-числа даёт пустую строку', () => {
  assert.equal(price(null, 'ru', CURRENCY), '');
  assert.equal(price(undefined, 'ru', CURRENCY), '');
  assert.equal(price(Number.NaN, 'ru', CURRENCY), '');
});

test('kcal на трёх языках', () => {
  assert.equal(kcal(540, 'ru'), '540 ккал');
  assert.equal(kcal(540, 'uz'), '540 kkal');
  assert.equal(kcal(540, 'en'), '540 kcal');
});

test('kcal без значения даёт пустую строку', () => {
  assert.equal(kcal(null, 'ru'), '');
  assert.equal(kcal(undefined, 'ru'), '');
});

test('kcal группирует большие числа', () => {
  assert.equal(kcal(1200, 'ru'), `1${NBSP}200 ккал`);
});
