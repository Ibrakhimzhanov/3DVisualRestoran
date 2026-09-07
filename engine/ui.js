// MenuLive UI: слой интерфейса поверх AR-сцены.
// Экраны: приветствие, подсказка сканирования, шапка с категориями и фильтрами,
// лента блюд, карточка, плашка и лист заказа, экран официанта, ошибки, тосты.
// Состояния переключаются классами ml-state-* на корневом элементе, без инлайнового display.
import { Emitter } from './core/emitter.js';
import { pick, t, dishCountLabel } from './core/i18n.js';
import { price as fmtPrice, kcal as fmtKcal } from './core/format.js';
import { ICONS, ERROR_ICONS } from './icons.js';

const STATES = ['welcome', 'starting', 'scanning', 'found', 'lost', 'nocam', 'error'];
const SCAN_TIP_MS = 8000; // суммарное время сканирования до второго совета
const TOAST_MS = 2000;
const DOT = ' · '; // точка-разделитель с неразрывными пробелами
const HIDDEN = 'ml-hidden';
const LANGS_ALL = ['ru', 'uz', 'en']; // чтобы узнать текст тоста об ошибке видео на любом языке

// Короткий конструктор узла.
function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

// Обёртка вокруг иконки. Разметка своя, статичная, из icons.js.
function icon(markup, small) {
  const node = h('span', small ? 'ml-i ml-i--sm' : 'ml-i');
  node.innerHTML = markup || '';
  return node;
}

// Кнопка с обработчиком тапа.
function btn(cls, text, onTap, label) {
  const node = h('button', cls, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  if (onTap) node.addEventListener('click', onTap);
  return node;
}

// Кнопка, у которой вместо текста иконка.
function iconBtn(cls, markup, onTap, label) {
  const node = btn(cls, null, onTap, label);
  node.appendChild(icon(markup));
  return node;
}

// Плоский список блюд из конфига, у каждого проставлен categoryId.
function flatDishes(config) {
  const out = [];
  const cats = Array.isArray(config && config.categories) ? config.categories : [];
  for (const cat of cats) {
    const dishes = Array.isArray(cat.dishes) ? cat.dishes : [];
    for (const dish of dishes) out.push(Object.assign({ categoryId: cat.id }, dish));
  }
  return out;
}

function show(node, visible) {
  if (node) node.classList.toggle(HIDDEN, !visible);
}

export class UI extends Emitter {
  constructor({ root, config, lang } = {}) {
    super();
    this.root = root || document.body;
    this.config = config || {};
    this.langs = Array.isArray(this.config.languages) && this.config.languages.length
      ? this.config.languages.slice()
      : ['ru'];
    this.defaultLang = this.config.defaultLang || this.langs[0];
    this.lang = lang || this.defaultLang;

    this._dishes = flatDishes(this.config);
    this._qty = new Map(); // локальные количества, чтобы лист заказа жил без данных снаружи
    this._state = 'welcome';
    this._detail = null;
    this._filter = null;
    this._categoryId = this._firstCategoryId();
    this._activeDishId = null;
    this._cardDish = null;
    this._cardQty = 0;
    this._count = 0;
    this._total = 0;
    this._descOpen = false;
    this._sheetDishes = null;
    this._waiterDishes = null;
    this._scanElapsed = 0;
    this._scanFrom = 0;
    this._scanTimer = null;
    this._toastTimer = null;
    this._nodes = {};

    this._build();
    this._applyStatic();
    // до первого renderCard карточки нет, пустая панель мелькать не должна
    this.root.classList.add('ml-no-card');
    this.setState('welcome');
    this.renderCategories(this._categoryId);
    this.renderDishes(this._categoryId, null, null);
    this.renderOrder(0, 0);
  }

  // ---------- служебное ----------

  _t(key, vars) {
    return t(key, this.lang, vars);
  }

  _pick(strings) {
    return pick(strings, this.lang, this.defaultLang);
  }

  // format.price ждёт словарь валют вида {ru:'сум'}. Строку заворачиваем в словарь.
  _currency() {
    const c = this.config.currency;
    if (typeof c === 'string' && c) return { [this.lang]: c };
    return c && typeof c === 'object' ? c : {};
  }

  _price(value) {
    return fmtPrice(value, this.lang, this._currency());
  }

  _firstCategoryId() {
    const cats = Array.isArray(this.config.categories) ? this.config.categories : [];
    return cats.length ? cats[0].id : null;
  }

  _category(id) {
    const cats = Array.isArray(this.config.categories) ? this.config.categories : [];
    return cats.find((c) => c.id === id) || cats[0] || null;
  }

  _dish(id) {
    return this._dishes.find((d) => d.id === id) || null;
  }

  _qtyOf(id) {
    return this._qty.get(id) || 0;
  }

  _bump(id, delta) {
    const next = Math.max(0, this._qtyOf(id) + delta);
    if (next === 0) this._qty.delete(id);
    else this._qty.set(id, next);
  }

  // Пересчёт плашки по локальным количествам, чтобы интерфейс отвечал сразу.
  _recount() {
    let count = 0;
    let total = 0;
    for (const [id, qty] of this._qty) {
      const dish = this._dish(id);
      count += qty;
      total += (dish && Number(dish.price)) ? Number(dish.price) * qty : 0;
    }
    this.renderOrder(count, total);
  }

  // ---------- сборка DOM ----------

  _build() {
    const n = this._nodes;
    this.root.classList.add('ml-root');

    // приветствие
    n.welcome = h('div', 'ml-welcome');
    n.welcomeLangs = h('div', 'ml-langs ml-welcome__langs');
    n.welcomeBody = h('div', 'ml-welcome__body');
    n.logo = h('img', 'ml-welcome__logo');
    n.logo.alt = this.config.name || '';
    if (this.config.logo) n.logo.src = this.config.logo;
    n.welcomeTitle = h('h1', 'ml-welcome__title');
    n.welcomeWhy = h('p', 'ml-welcome__why');
    n.start = btn('ml-btn ml-btn--primary ml-welcome__start', '', () => this.emit('start'));
    n.startLabel = h('span', 'ml-btn__label');
    n.startRing = h('span', 'ml-ring');
    n.start.append(n.startLabel, n.startRing);
    n.welcomeNocam = btn('ml-link ml-welcome__nocam', '', () => this.emit('nocam'));
    n.welcomeBody.append(n.logo, n.welcomeTitle, n.welcomeWhy, n.start, n.welcomeNocam);
    n.powered = h('div', 'ml-welcome__powered');
    n.welcome.append(n.welcomeLangs, n.welcomeBody, n.powered);

    // шапка
    n.header = h('header', 'ml-header');
    n.headerRow = h('div', 'ml-header__row');
    n.cats = h('div', 'ml-cats ml-scroller');
    n.actions = h('div', 'ml-header__actions');
    n.langBtn = btn('ml-icon ml-icon--lang', '', () => this._cycleLang());
    n.shareBtn = iconBtn('ml-icon ml-icon--share', ICONS.share, () => this.emit('share'));
    n.soundBtn = iconBtn('ml-icon ml-icon--sound', ICONS.soundOn, () => this.emit('sound'), 'sound');
    n.soundBtn.classList.add(HIDDEN);
    n.actions.append(n.langBtn, n.shareBtn, n.soundBtn);
    n.headerRow.append(n.cats, n.actions);
    n.filters = h('div', 'ml-filters ml-scroller');
    n.header.append(n.headerRow, n.filters);

    // середина: подсказка, кнопка «Смотреть», блок без камеры
    n.mid = h('div', 'ml-mid');
    n.scan = h('div', 'ml-scan');
    n.scanFrame = h('div', 'ml-scan__frame');
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      n.scanFrame.appendChild(h('i', 'ml-scan__corner ml-scan__corner--' + corner));
    }
    n.scanPreview = h('img', 'ml-scan__preview');
    n.scanPreview.alt = '';
    const preview = this.config.target && this.config.target.preview;
    if (preview) n.scanPreview.src = preview;
    else n.scanPreview.classList.add(HIDDEN);
    n.scanText = h('div', 'ml-scan__text');
    n.scanTip = h('div', 'ml-scan__tip');
    n.scan.append(n.scanFrame, n.scanPreview, n.scanText, n.scanTip);

    n.watch = h('div', 'ml-watch');
    n.watchBtn = btn('ml-btn ml-btn--primary ml-watch__btn', '', () => this.emit('watch'));
    n.watch.appendChild(n.watchBtn);

    n.nocam = h('div', 'ml-nocam');
    n.nocamTitle = h('div', 'ml-nocam__title');
    n.nocamSlot = h('div', 'ml-nocam__slot');
    n.nocam.append(n.nocamTitle, n.nocamSlot);
    // тост живёт в свободном центре: снизу его перекрыла бы карточка блюда
    n.toast = h('div', 'ml-toast');
    n.mid.append(n.scan, n.watch, n.nocam, n.toast);

    // низ: плашка заказа, лента блюд, карточка
    n.bottom = h('div', 'ml-bottom');
    // Плашка заказа: лист открывает и кнопка справа, и тап по самой плашке.
    n.orderPill = h('div', 'ml-order');
    n.orderPill.addEventListener('click', () => this._openSheet());
    n.orderText = h('span', 'ml-order__text');
    n.orderOpen = btn('ml-order__open', '', (e) => {
      e.stopPropagation();
      this._openSheet();
    });
    n.orderPill.append(n.orderText, n.orderOpen);
    n.strip = h('div', 'ml-strip ml-scroller');
    n.card = h('div', 'ml-card');
    n.cardPromo = h('div', 'ml-card__promo');
    n.cardTop = h('div', 'ml-card__top');
    n.cardTitle = h('div', 'ml-card__title');
    n.cardPrice = h('div', 'ml-card__price');
    n.cardTop.append(n.cardTitle, n.cardPrice);
    n.cardMeta = h('div', 'ml-card__meta');
    n.cardDesc = btn('ml-card__desc', '', () => this._toggleDesc());
    n.cardAllergens = h('div', 'ml-card__allergens');
    n.cardFoot = h('div', 'ml-card__foot');
    n.cardPairs = h('div', 'ml-card__pairs');
    n.cardActions = h('div', 'ml-card__actions');
    n.addBtn = btn('ml-btn ml-btn--add', '', () => this._onAdd());
    n.stepper = h('div', 'ml-stepper');
    n.stepMinus = iconBtn('ml-stepper__btn', ICONS.minus, () => this._onStep(-1), 'minus');
    n.stepQty = h('span', 'ml-stepper__qty', '0');
    n.stepPlus = iconBtn('ml-stepper__btn', ICONS.plus, () => this._onStep(1), 'plus');
    n.stepper.append(n.stepMinus, n.stepQty, n.stepPlus);
    n.cardActions.append(n.addBtn, n.stepper);
    n.cardFoot.append(n.cardPairs, n.cardActions);
    n.card.append(n.cardPromo, n.cardTop, n.cardMeta, n.cardDesc, n.cardAllergens, n.cardFoot);
    n.bottom.append(n.orderPill, n.strip, n.card);

    // лист заказа
    n.sheet = h('div', 'ml-sheet');
    n.sheetBack = h('div', 'ml-sheet__backdrop');
    n.sheetBack.addEventListener('click', () => this.closeOrderSheet());
    n.sheetPanel = h('div', 'ml-sheet__panel');
    n.sheetGrip = h('div', 'ml-sheet__grip');
    n.sheetHead = h('div', 'ml-sheet__head');
    n.sheetTitle = h('h2', 'ml-sheet__title');
    n.sheetClose = iconBtn('ml-icon ml-sheet__close', ICONS.close, () => this.closeOrderSheet(), 'close');
    n.sheetHead.append(n.sheetTitle, n.sheetClose);
    n.sheetList = h('div', 'ml-sheet__list');
    n.sheetEmpty = h('div', 'ml-sheet__empty');
    n.sheetTotal = h('div', 'ml-sheet__total');
    n.sheetTotalLabel = h('span', 'ml-sheet__total-label');
    n.sheetTotalValue = h('b', 'ml-sheet__total-value');
    n.sheetTotal.append(n.sheetTotalLabel, n.sheetTotalValue);
    n.sheetActions = h('div', 'ml-sheet__actions');
    n.sheetShow = btn('ml-btn ml-btn--primary ml-sheet__show', '', () => this.showWaiterScreen(this._sheetDishes));
    n.sheetWrite = h('a', 'ml-btn ml-btn--ghost ml-sheet__write');
    n.sheetWrite.target = '_blank';
    n.sheetWrite.rel = 'noopener noreferrer';
    n.sheetReview = btn('ml-btn ml-btn--ghost ml-sheet__review', '', () => this.emit('review'));
    n.sheetActions.append(n.sheetShow, n.sheetWrite, n.sheetReview);
    n.sheetPanel.append(n.sheetGrip, n.sheetHead, n.sheetList, n.sheetEmpty, n.sheetTotal, n.sheetActions);
    n.sheet.append(n.sheetBack, n.sheetPanel);

    // экран официанта
    n.waiter = h('div', 'ml-waiter');
    n.waiterLogo = h('img', 'ml-waiter__logo');
    n.waiterLogo.alt = this.config.name || '';
    if (this.config.logo) n.waiterLogo.src = this.config.logo;
    n.waiterList = h('div', 'ml-waiter__list');
    n.waiterTotal = h('div', 'ml-waiter__total');
    n.waiterDone = btn('ml-btn ml-btn--primary ml-waiter__done', '', () => this._onWaiterDone());
    n.waiter.append(n.waiterLogo, n.waiterList, n.waiterTotal, n.waiterDone);

    // ошибки
    n.error = h('div', 'ml-error');
    n.errBox = h('div', 'ml-error__box');
    n.errIcon = h('div', 'ml-error__icon');
    n.errTitle = h('h2', 'ml-error__title');
    n.errBody = h('p', 'ml-error__body');
    n.errQr = h('img', 'ml-error__qr');
    n.errQr.alt = '';
    n.errDetail = h('pre', 'ml-error__detail');
    n.errActions = h('div', 'ml-error__actions');
    n.errBox.append(n.errIcon, n.errTitle, n.errBody, n.errQr, n.errDetail, n.errActions);
    n.error.appendChild(n.errBox);

    this._mounted = [n.welcome, n.header, n.mid, n.bottom, n.sheet, n.waiter, n.error];
    for (const node of this._mounted) this.root.appendChild(node);
    this._renderLangs();
  }

  // Статические тексты интерфейса.
  _applyStatic() {
    const n = this._nodes;
    n.welcomeTitle.textContent = this._t('welcome.title');
    n.welcomeWhy.textContent = this._t('welcome.why');
    n.startLabel.textContent = this._t('welcome.start');
    n.welcomeNocam.textContent = this._t('welcome.nocam');
    n.powered.textContent = this._t('welcome.powered');
    n.scanText.textContent = this._t('scan.aim');
    n.scanTip.textContent = this._t('scan.tip');
    n.watchBtn.textContent = this._t('watch.button');
    n.nocamTitle.textContent = this._t('nocam.title');
    n.shareBtn.setAttribute('aria-label', this._t('share.button'));
    n.orderOpen.textContent = this._t('order.open');
    n.sheetTitle.textContent = this._t('order.title');
    n.sheetEmpty.textContent = this._t('order.empty');
    n.sheetTotalLabel.textContent = this._t('order.total');
    n.sheetShow.textContent = this._t('order.show');
    n.sheetWrite.textContent = this._t('order.write');
    n.sheetReview.textContent = this._t('order.review');
    n.waiterDone.textContent = this._t('order.done');
    n.addBtn.textContent = this._t('card.add');
    n.langBtn.textContent = String(this.lang || '').toUpperCase();

    const waiterUrl = (this.config.waiter && this.config.waiter.url) || '';
    if (waiterUrl) n.sheetWrite.href = waiterUrl;
    show(n.sheetWrite, Boolean(waiterUrl));
    show(n.sheetReview, Boolean(this.config.reviewUrl));
  }

  // ---------- язык ----------

  _renderLangs() {
    const box = this._nodes.welcomeLangs;
    box.textContent = '';
    if (this.langs.length < 2) {
      box.classList.add(HIDDEN);
      this._nodes.langBtn.classList.add(HIDDEN);
      return;
    }
    box.classList.remove(HIDDEN);
    this._nodes.langBtn.classList.remove(HIDDEN);
    for (const code of this.langs) {
      const b = btn('ml-lang', String(code).toUpperCase(), () => this._chooseLang(code));
      b.classList.toggle('is-active', code === this.lang);
      box.appendChild(b);
    }
  }

  _chooseLang(code) {
    if (code === this.lang) return;
    this.emit('lang', code);
    this.setLang(code);
  }

  _cycleLang() {
    if (this.langs.length < 2) return;
    const i = this.langs.indexOf(this.lang);
    this._chooseLang(this.langs[(i + 1) % this.langs.length]);
  }

  setLang(lang) {
    if (!lang) return;
    this.lang = lang;
    this._applyStatic();
    this._renderLangs();
    this.renderCategories(this._categoryId);
    this.renderDishes(this._categoryId, this._activeDishId, this._filter);
    this.renderCard(this._cardDish, this._cardQty);
    this.renderOrder(this._count, this._total);
    if (this.root.classList.contains('ml-sheet-open')) this._renderSheet();
    if (this.root.classList.contains('ml-waiter-open')) this._renderWaiter();
    if (this._state === 'error') this._renderError(this._detail || {});
  }

  // ---------- состояния ----------

  setState(state, detail) {
    if (STATES.indexOf(state) === -1) return;
    this._state = state;
    this._detail = detail || null;
    for (const s of STATES) this.root.classList.toggle('ml-state-' + s, s === state);
    this._nodes.start.disabled = state === 'starting';

    if (state === 'scanning') this._scanStart();
    else this._scanStop();

    if (state === 'found') {
      this._scanElapsed = 0;
      this._nodes.scanTip.classList.remove('is-visible');
    }
    if (state !== 'found' && state !== 'nocam') this.setWatchVisible(false);
    if (state === 'error') this._renderError(this._detail || {});
  }

  _scanStart() {
    if (this._scanTimer) return;
    this._scanFrom = Date.now();
    const left = Math.max(0, SCAN_TIP_MS - this._scanElapsed);
    this._scanTimer = setTimeout(() => {
      this._scanTimer = null;
      this._scanElapsed = SCAN_TIP_MS;
      this._nodes.scanTip.classList.add('is-visible');
    }, left);
  }

  _scanStop() {
    if (!this._scanTimer) return;
    clearTimeout(this._scanTimer);
    this._scanTimer = null;
    this._scanElapsed += Date.now() - this._scanFrom;
  }

  // ---------- категории и фильтры ----------

  renderCategories(activeId) {
    const cats = Array.isArray(this.config.categories) ? this.config.categories : [];
    if (activeId) this._categoryId = activeId;
    else if (!this._categoryId) this._categoryId = this._firstCategoryId();
    const box = this._nodes.cats;
    box.textContent = '';
    for (const cat of cats) {
      const b = btn('ml-cat', this._pick(cat.name), () => {
        this.emit('category', cat.id);
        this._markActive(box, cat.id);
      });
      b.dataset.id = cat.id;
      b.classList.toggle('is-active', cat.id === this._categoryId);
      box.appendChild(b);
    }
    show(box, cats.length > 1);
  }

  _markActive(box, id) {
    for (const node of box.children) node.classList.toggle('is-active', node.dataset.id === id);
  }

  // Чипы фильтров строятся по тегам, которые реально есть у блюд категории.
  _renderFilters(dishes) {
    const box = this._nodes.filters;
    box.textContent = '';
    const tags = [];
    for (const dish of dishes) {
      for (const tag of (dish.tags || [])) if (tags.indexOf(tag) === -1) tags.push(tag);
    }
    if (!tags.length) {
      box.classList.add(HIDDEN);
      return;
    }
    box.classList.remove(HIDDEN);
    const all = btn('ml-chip', this._t('filter.all'), () => {
      this.emit('filter', null);
      this._filter = null;
      this._markActive(box, '');
    });
    all.dataset.id = '';
    all.classList.toggle('is-active', !this._filter);
    box.appendChild(all);
    for (const tag of tags) {
      const chip = btn('ml-chip', null, () => {
        const next = this._filter === tag ? null : tag;
        this.emit('filter', next);
        this._filter = next;
        this._markActive(box, next || '');
      });
      if (ICONS[tag]) chip.appendChild(icon(ICONS[tag], true));
      chip.appendChild(h('span', 'ml-chip__label', this._t('tag.' + tag)));
      chip.dataset.id = tag;
      chip.classList.toggle('is-active', this._filter === tag);
      box.appendChild(chip);
    }
  }

  // ---------- лента блюд ----------

  renderDishes(categoryId, activeId, filter) {
    if (categoryId) this._categoryId = categoryId;
    this._filter = filter || null;
    this._activeDishId = activeId || null;

    const cat = this._category(this._categoryId);
    const dishes = cat && Array.isArray(cat.dishes) ? cat.dishes : [];
    this._renderFilters(dishes);

    const list = this._filter
      ? dishes.filter((d) => Array.isArray(d.tags) && d.tags.indexOf(this._filter) !== -1)
      : dishes;

    const box = this._nodes.strip;
    box.textContent = '';
    let activeNode = null;
    for (const dish of list) {
      const chip = btn('ml-dish', null, () => {
        this.emit('dish', dish.id);
        this._activeDishId = dish.id;
        this._markActive(box, dish.id);
      });
      chip.dataset.id = dish.id;
      chip.append(
        h('span', 'ml-dish__name', this._pick(dish.name)),
        h('span', 'ml-dish__sep', DOT),
        h('span', 'ml-dish__price', this._price(dish.price))
      );
      if (dish.id === this._activeDishId) {
        chip.classList.add('is-active');
        activeNode = chip;
      }
      box.appendChild(chip);
    }
    show(box, list.length > 0);
    if (activeNode && activeNode.scrollIntoView) {
      activeNode.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  // ---------- карточка блюда ----------

  renderCard(dish, qty) {
    const n = this._nodes;
    // то же блюдо перерисовали (например, после «Добавить»): описание не схлопываем
    const same = Boolean(dish && this._cardDish && this._cardDish.id === dish.id);
    this._cardDish = dish || null;
    this._cardQty = Number(qty) || 0;
    if (!dish) {
      this.root.classList.add('ml-no-card');
      return;
    }
    this.root.classList.remove('ml-no-card');
    if (this._cardQty > 0) this._qty.set(dish.id, this._cardQty);
    else this._qty.delete(dish.id);

    const promo = this._pick(dish.promo);
    n.cardPromo.textContent = promo;
    show(n.cardPromo, Boolean(promo));

    n.cardTitle.textContent = this._pick(dish.name);
    n.cardPrice.textContent = this._price(dish.price);

    // вес, калории и значки тегов
    n.cardMeta.textContent = '';
    const parts = [];
    if (dish.weight) parts.push(String(dish.weight));
    if (dish.kcal) parts.push(fmtKcal(dish.kcal, this.lang));
    if (parts.length) n.cardMeta.appendChild(h('span', 'ml-card__facts', parts.join(DOT)));
    const tags = Array.isArray(dish.tags) ? dish.tags : [];
    if (tags.length) {
      const tagBox = h('span', 'ml-tags');
      for (const tag of tags) {
        const item = h('span', 'ml-tag');
        if (ICONS[tag]) item.appendChild(icon(ICONS[tag], true));
        item.appendChild(h('span', 'ml-tag__label', this._t('tag.' + tag)));
        tagBox.appendChild(item);
      }
      n.cardMeta.appendChild(tagBox);
    }

    const desc = this._pick(dish.desc);
    n.cardDesc.textContent = desc;
    show(n.cardDesc, Boolean(desc));
    this._descOpen = same ? this._descOpen : false;
    n.card.classList.toggle('is-expanded', this._descOpen);

    const allergens = Array.isArray(dish.allergens) ? dish.allergens : [];
    if (allergens.length) {
      const names = allergens.map((code) => this._t('allergen.' + code)).join(', ');
      n.cardAllergens.textContent = this._t('card.contains') + ': ' + names;
    } else {
      n.cardAllergens.textContent = '';
    }

    // «Сочетается с»: не больше двух кнопок
    n.cardPairs.textContent = '';
    const pairs = (Array.isArray(dish.pairs) ? dish.pairs : [])
      .map((id) => this._dish(id))
      .filter(Boolean)
      .slice(0, 2);
    if (pairs.length) {
      n.cardPairs.appendChild(h('span', 'ml-card__pairs-label', this._t('card.pairs')));
      for (const pair of pairs) {
        // сначала локальный счётчик, потом событие: иначе renderCard
        // из главного модуля успеет записать qty и получится двойной счёт
        n.cardPairs.appendChild(btn('ml-pair', this._pick(pair.name), () => {
          this._bump(pair.id, 1);
          this._recount();
          this.emit('add', pair.id);
        }));
      }
    }
    show(n.cardPairs, pairs.length > 0);

    // кнопка «Добавить» или степпер
    n.stepQty.textContent = String(this._cardQty);
    show(n.addBtn, this._cardQty === 0);
    show(n.stepper, this._cardQty > 0);
  }

  _toggleDesc() {
    if (!this._cardDish) return;
    this._descOpen = !this._descOpen;
    this._nodes.card.classList.toggle('is-expanded', this._descOpen);
  }

  _onAdd() {
    if (!this._cardDish) return;
    const id = this._cardDish.id;
    this._bump(id, 1);
    this.renderCard(this._cardDish, this._qtyOf(id));
    this._recount();
    this.emit('add', id);
  }

  _onStep(delta) {
    if (!this._cardDish) return;
    const id = this._cardDish.id;
    this._bump(id, delta);
    this.renderCard(this._cardDish, this._qtyOf(id));
    this._recount();
    this.emit(delta > 0 ? 'inc' : 'dec', id);
  }

  // ---------- плашка заказа ----------

  renderOrder(count, total) {
    this._count = Number(count) || 0;
    this._total = Number(total) || 0;
    // заказ обнулили снаружи: чистим и локальные количества
    if (this._count === 0) this._qty.clear();
    this._nodes.orderText.textContent = this._count
      ? dishCountLabel(this._count, this.lang) + DOT + this._price(this._total)
      : '';
    this.root.classList.toggle('ml-has-order', this._count > 0);
  }

  // Открыть лист заказа: и кнопкой «Открыть», и тапом по плашке.
  _openSheet() {
    this.openOrderSheet(this._sheetDishes || this._dishes);
  }

  // ---------- лист заказа ----------

  // items необязателен: [{dishId, qty}]. Если его нет, количества берутся
  // из поля qty у блюда либо из локального счётчика интерфейса.
  openOrderSheet(dishes, items) {
    this._sheetDishes = Array.isArray(dishes) && dishes.length ? dishes : this._dishes;
    if (Array.isArray(items)) this._syncQty(this._rows(this._sheetDishes, items));
    else this._syncQty(this._rows(this._sheetDishes, null));
    this._renderSheet();
    this.root.classList.add('ml-sheet-open');
  }

  closeOrderSheet() {
    this.root.classList.remove('ml-sheet-open');
  }

  _rows(dishes, items) {
    const list = Array.isArray(dishes) && dishes.length ? dishes : this._dishes;
    const byId = new Map(list.map((d) => [d.id, d]));
    if (Array.isArray(items) && items.length) {
      return items
        .map((it) => ({ dish: byId.get(it.dishId), qty: Number(it.qty) || 0 }))
        .filter((r) => r.dish && r.qty > 0);
    }
    const out = [];
    for (const dish of list) {
      const qty = Number.isFinite(dish.qty) ? dish.qty : this._qtyOf(dish.id);
      if (qty > 0) out.push({ dish, qty });
    }
    return out;
  }

  _syncQty(rows) {
    if (!rows.length) return;
    for (const row of rows) this._qty.set(row.dish.id, row.qty);
  }

  _sum(rows) {
    return rows.reduce((acc, r) => acc + (Number(r.dish.price) || 0) * r.qty, 0);
  }

  _renderSheet() {
    const n = this._nodes;
    const rows = this._rows(this._sheetDishes, null);
    n.sheetList.textContent = '';
    for (const row of rows) {
      const line = h('div', 'ml-line');
      line.appendChild(h('span', 'ml-line__name', this._pick(row.dish.name)));
      const stepper = h('div', 'ml-stepper ml-stepper--sm');
      stepper.append(
        iconBtn('ml-stepper__btn', ICONS.minus, () => this._sheetStep(row.dish.id, -1), 'minus'),
        h('span', 'ml-stepper__qty', String(row.qty)),
        iconBtn('ml-stepper__btn', ICONS.plus, () => this._sheetStep(row.dish.id, 1), 'plus')
      );
      line.appendChild(stepper);
      line.appendChild(h('span', 'ml-line__sum', this._price((Number(row.dish.price) || 0) * row.qty)));
      n.sheetList.appendChild(line);
    }
    const empty = rows.length === 0;
    show(n.sheetEmpty, empty);
    show(n.sheetTotal, !empty);
    show(n.sheetActions, !empty);
    n.sheetTotalValue.textContent = this._price(this._sum(rows));
  }

  _sheetStep(id, delta) {
    this._bump(id, delta);
    this._renderSheet();
    if (this._cardDish && this._cardDish.id === id) this.renderCard(this._cardDish, this._qtyOf(id));
    this._recount();
    this.emit(delta > 0 ? 'inc' : 'dec', id);
  }

  // ---------- экран официанта ----------

  showWaiterScreen(dishes) {
    this._waiterDishes = Array.isArray(dishes) && dishes.length ? dishes : (this._sheetDishes || this._dishes);
    this._renderWaiter();
    this.root.classList.add('ml-waiter-open');
  }

  _renderWaiter() {
    const n = this._nodes;
    const rows = this._rows(this._waiterDishes, null);
    n.waiterList.textContent = '';
    for (const row of rows) {
      const line = h('div', 'ml-waiter__line');
      line.append(
        h('span', 'ml-waiter__name', this._pick(row.dish.name)),
        h('span', 'ml-waiter__qty', '× ' + row.qty)
      );
      n.waiterList.appendChild(line);
    }
    if (!rows.length) n.waiterList.appendChild(h('div', 'ml-waiter__empty', this._t('order.empty')));
    n.waiterTotal.textContent = this._t('order.total') + ': ' + this._price(this._sum(rows));
    show(n.waiterTotal, rows.length > 0);
  }

  _onWaiterDone() {
    this.root.classList.remove('ml-waiter-open');
    this.closeOrderSheet();
    // главный модуль решает, очищать заказ или нет
    this.emit('reset');
  }

  // ---------- ошибки ----------

  _renderError(detail) {
    const n = this._nodes;
    const kind = detail.kind || 'config';
    n.errActions.textContent = '';
    n.errQr.classList.add(HIDDEN);
    n.errDetail.classList.add(HIDDEN);
    n.errBody.classList.remove(HIDDEN);

    const nocamLink = () => btn('ml-link', this._t('welcome.nocam'), () => this.emit('nocam'));
    // Иконка в квадрате. Красная рамка только у ошибки камеры.
    const setIcon = (markup, isError) => {
      n.errIcon.textContent = '';
      n.errIcon.appendChild(icon(markup));
      n.errIcon.classList.toggle('is-error', Boolean(isError));
    };

    if (kind === 'camera-denied' || kind === 'camera-unavailable') {
      setIcon(ERROR_ICONS.camera, true);
      n.errTitle.textContent = this._t('error.camera.title');
      n.errBody.textContent = this._t('error.camera.body');
      n.errActions.append(
        btn('ml-btn ml-btn--primary', this._t('error.camera.retry'), () => this.emit('retry')),
        nocamLink()
      );
      return;
    }

    if (kind === 'webview') {
      setIcon(ERROR_ICONS.browser, false);
      n.errTitle.textContent = this._t('error.webview.title');
      n.errBody.textContent = this._t('error.webview.body');
      const isIos = (detail.detail && detail.detail.platform) === 'ios' || detail.platform === 'ios';
      const label = isIos ? this._t('error.webview.safari') : this._t('error.webview.chrome');
      let escape;
      if (detail.escapeHref) {
        // ссылка нужна как настоящий переход по жесту пользователя
        escape = h('a', 'ml-btn ml-btn--primary', label);
        escape.href = detail.escapeHref;
        escape.rel = 'noopener noreferrer';
        escape.addEventListener('click', () => this.emit('escape'));
      } else {
        escape = btn('ml-btn ml-btn--primary', label, () => this.emit('escape'));
      }
      n.errActions.append(escape, nocamLink());
      return;
    }

    if (kind === 'desktop') {
      setIcon(ERROR_ICONS.phone, false);
      n.errTitle.textContent = this._t('error.desktop.title');
      n.errBody.textContent = this._t('error.desktop.body');
      const qr = detail.qr || this.config.qr;
      if (qr) {
        n.errQr.src = qr;
        n.errQr.classList.remove(HIDDEN);
      }
      return;
    }

    // config и всё неизвестное
    setIcon(ERROR_ICONS.alert, false);
    n.errTitle.textContent = this._t('error.config.title');
    n.errBody.classList.add(HIDDEN);
    const text = typeof detail.detail === 'string' ? detail.detail : (detail.detail ? String(detail.detail.message || detail.detail) : '');
    if (text) {
      n.errDetail.textContent = text;
      n.errDetail.classList.remove(HIDDEN);
    }
  }

  // ---------- мелочи ----------

  toast(text) {
    const n = this._nodes.toast;
    const value = text == null ? '' : String(text);
    n.textContent = value;
    // Тост об ошибке видео красный. Контракт toast(text) один аргумент,
    // поэтому узнаём его по самому тексту на любом из трёх языков.
    const isError = value !== '' && LANGS_ALL.some((code) => value === t('error.video', code));
    n.classList.toggle('is-error', isError);
    n.classList.add('is-visible');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toastTimer = null;
      n.classList.remove('is-visible');
    }, TOAST_MS);
  }

  setSoundVisible(b) {
    show(this._nodes.soundBtn, Boolean(b));
  }

  setMuted(b) {
    const node = this._nodes.soundBtn;
    node.textContent = '';
    node.appendChild(icon(b ? ICONS.soundOff : ICONS.soundOn));
    node.classList.toggle('is-muted', Boolean(b));
  }

  setWatchVisible(b) {
    this.root.classList.toggle('ml-watch-on', Boolean(b));
  }

  // Пустой контейнер под обычный <video> в режиме без камеры.
  noCamSlot() {
    return this._nodes.nocamSlot;
  }

  destroy() {
    this._scanStop();
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = null;
    for (const node of this._mounted || []) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }
    this._mounted = [];
    this.root.classList.remove('ml-root', 'ml-has-order', 'ml-no-card', 'ml-sheet-open', 'ml-waiter-open', 'ml-watch-on');
    for (const s of STATES) this.root.classList.remove('ml-state-' + s);
    this.clear();
  }
}
