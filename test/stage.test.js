import test from 'node:test';
import assert from 'node:assert/strict';
import { stageSize } from '../engine/core/stage.js';

test('высота считается из aspect', () => {
  const s = stageSize({ w: 1.6, x: 0, y: 0.35 }, 16 / 9);
  assert.equal(s.w, 1.6);
  assert.equal(s.h, 0.9);
  assert.equal(s.x, 0);
  assert.equal(s.y, 0.35);
  assert.equal(s.z, 0.01);
});

test('квадратное видео даёт квадратную сцену', () => {
  const s = stageSize({ w: 1.2 }, 1);
  assert.equal(s.h, 1.2);
});

test('заданный h важнее aspect', () => {
  const s = stageSize({ w: 1.1, h: 2 }, 16 / 9);
  assert.equal(s.h, 2);
});

test('мусорный aspect заменяется на 16 к 9', () => {
  const expected = stageSize({ w: 1.6 }, 16 / 9);
  for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, 'широкий', null, undefined]) {
    assert.deepEqual(stageSize({ w: 1.6 }, bad), expected, `aspect: ${String(bad)}`);
  }
});

test('умолчания x, y, w', () => {
  const s = stageSize({}, 16 / 9);
  assert.equal(s.w, 1.1);
  assert.equal(s.x, 0);
  assert.equal(s.y, 0.35);
  assert.equal(s.h, 0.6188);
});

test('значения округляются до 4 знаков', () => {
  const s = stageSize({ w: 1 }, 3);
  assert.equal(s.h, 0.3333);
});

test('без конфига берутся умолчания', () => {
  const s = stageSize(null, 2);
  assert.equal(s.w, 1.1);
  assert.equal(s.h, 0.55);
});
