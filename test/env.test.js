import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWebView, escapeUrl, pickLang, isLikelyDesktop } from '../engine/core/env.js';

const UA_IOS_TELEGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Telegram-iOS';
const UA_ANDROID_INSTAGRAM =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 Chrome/120 Mobile Instagram 300.0';
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const UA_IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1';
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

test('detectWebView узнаёт Telegram', () => {
  assert.equal(detectWebView(UA_IOS_TELEGRAM), 'telegram');
  assert.equal(detectWebView('Mozilla/5.0 TgWebView Android'), 'telegram');
});

test('detectWebView узнаёт Instagram и Facebook', () => {
  assert.equal(detectWebView(UA_ANDROID_INSTAGRAM), 'instagram');
  assert.equal(detectWebView('Mozilla/5.0 [FBAN/FBIOS;FBAV/440.0]'), 'facebook');
});

test('detectWebView для обычного браузера даёт null', () => {
  assert.equal(detectWebView(UA_IOS_SAFARI), null);
  assert.equal(detectWebView(''), null);
  assert.equal(detectWebView(undefined), null);
});

test('escapeUrl для iOS', () => {
  assert.equal(
    escapeUrl('https://armenu.shumtuber.uz/mu', UA_IOS_TELEGRAM),
    'x-safari-https://armenu.shumtuber.uz/mu'
  );
});

test('escapeUrl для Android', () => {
  const href = 'https://armenu.shumtuber.uz/mu?lang=ru';
  const url = escapeUrl(href, UA_ANDROID_INSTAGRAM);
  assert.equal(
    url,
    'intent://armenu.shumtuber.uz/mu?lang=ru#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
      encodeURIComponent(href) +
      ';end'
  );
  assert.ok(!url.includes('https://armenu'), 'схема из intent-части убрана');
});

test('escapeUrl для десктопа и пустого href даёт null', () => {
  assert.equal(escapeUrl('https://armenu.shumtuber.uz/mu', UA_DESKTOP), null);
  assert.equal(escapeUrl('', UA_ANDROID_CHROME), null);
});

test('pickLang берёт язык браузера', () => {
  assert.equal(pickLang(['uz-UZ', 'ru-RU'], ['ru', 'uz'], 'ru', true), 'uz');
  assert.equal(pickLang(['RU-ru'], ['ru', 'uz'], 'uz', true), 'ru');
});

test('pickLang падает на defaultLang', () => {
  assert.equal(pickLang(['de-DE', 'fr'], ['ru', 'uz'], 'ru', true), 'ru');
  assert.equal(pickLang([], ['ru', 'uz'], 'uz', true), 'uz');
  assert.equal(pickLang(undefined, ['ru', 'uz'], 'ru', true), 'ru');
});

test('pickLang игнорирует браузер при autoLang = false', () => {
  assert.equal(pickLang(['uz-UZ'], ['ru', 'uz'], 'ru', false), 'ru');
});

test('isLikelyDesktop', () => {
  assert.equal(isLikelyDesktop(UA_DESKTOP, 1440), true);
  assert.equal(isLikelyDesktop(UA_DESKTOP, 800), false);
  assert.equal(isLikelyDesktop(UA_ANDROID_CHROME, 1440), false);
  assert.equal(isLikelyDesktop(UA_IOS_SAFARI, 1440), false);
  assert.equal(isLikelyDesktop(UA_DESKTOP, 1024), true);
});
