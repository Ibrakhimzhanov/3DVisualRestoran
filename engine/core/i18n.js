// Языки интерфейса: выбор строки, склонения, словарь.

// Иконки тегов блюд.
export const TAG_ICONS = {
  hit: '★',
  chef: '👨‍🍳',
  spicy: '🌶',
  veg: '🌿',
  halal: '☪',
  new: '✦'
};

// Взять строку нужного языка из строки или словаря переводов.
export function pick(strings, lang, defaultLang) {
  if (strings === null || strings === undefined) return '';
  if (typeof strings === 'string') return strings;
  if (typeof strings === 'number') return String(strings);
  if (typeof strings !== 'object' || Array.isArray(strings)) return '';

  const direct = strings[lang];
  if (typeof direct === 'string' && direct !== '') return direct;

  const fallback = strings[defaultLang];
  if (typeof fallback === 'string' && fallback !== '') return fallback;

  for (const value of Object.values(strings)) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}

// Подпись количества блюд с учётом склонения.
export function dishCountLabel(n, lang) {
  const num = Number(n) || 0;
  if (lang === 'ru') {
    const mod10 = Math.abs(num) % 10;
    const mod100 = Math.abs(num) % 100;
    let word = 'блюд';
    if (mod10 === 1 && mod100 !== 11) word = 'блюдо';
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'блюда';
    return `${num} ${word}`;
  }
  if (lang === 'uz') return `${num} ta taom`;
  return `${num} ${Math.abs(num) === 1 ? 'dish' : 'dishes'}`;
}

const DICT = {
  'welcome.title': {
    ru: 'Наведите камеру на меню, и блюда оживут',
    uz: 'Kamerani menyuga qarating, taomlar jonlanadi',
    en: 'Point the camera at the menu and the dishes come alive'
  },
  'welcome.why': {
    ru: 'Камера нужна, чтобы показать блюдо прямо на вашем меню',
    uz: "Kamera taomni menyuingizning ustida ko'rsatish uchun kerak",
    en: 'The camera is needed to show the dish right on your menu'
  },
  'welcome.start': { ru: 'Открыть камеру', uz: 'Kamerani ochish', en: 'Open camera' },
  'welcome.nocam': {
    ru: 'Посмотреть меню без камеры',
    uz: "Menyuni kamerasiz ko'rish",
    en: 'View the menu without camera'
  },
  'welcome.powered': {
    ru: 'Работает на MenuLive',
    uz: 'MenuLive asosida ishlaydi',
    en: 'Powered by MenuLive'
  },
  'scan.aim': {
    ru: 'Наведите на страницу меню',
    uz: 'Menyu sahifasiga qarating',
    en: 'Point at the menu page'
  },
  'scan.tip': {
    ru: 'Держите меню ровно, нужно больше света',
    uz: "Menyuni tekis ushlang, ko'proq yorug'lik kerak",
    en: 'Hold the menu steady, more light is needed'
  },
  'card.add': { ru: 'Добавить', uz: "Qo'shish", en: 'Add' },
  'card.pairs': { ru: 'Сочетается с', uz: 'Mos keladi', en: 'Goes well with' },
  'card.contains': { ru: 'Содержит', uz: 'Tarkibida', en: 'Contains' },
  'card.kcal': { ru: 'ккал', uz: 'kkal', en: 'kcal' },
  'order.show': {
    ru: 'Показать официанту',
    uz: "Ofitsiantga ko'rsatish",
    en: 'Show to the waiter'
  },
  'order.write': { ru: 'Написать', uz: 'Yozish', en: 'Send a message' },
  'order.review': { ru: 'Оставить отзыв', uz: 'Sharh qoldirish', en: 'Leave a review' },
  'order.total': { ru: 'Итого', uz: 'Jami', en: 'Total' },
  'order.done': { ru: 'Готово', uz: 'Tayyor', en: 'Done' },
  'order.title': { ru: 'Ваш выбор', uz: 'Sizning tanlovingiz', en: 'Your selection' },
  'order.empty': { ru: 'Пока пусто', uz: "Hozircha bo'sh", en: 'Nothing here yet' },
  'error.camera.title': {
    ru: 'Нет доступа к камере',
    uz: "Kameraga ruxsat yo'q",
    en: 'No camera access'
  },
  'error.camera.body': {
    ru: 'Разрешите камеру в настройках браузера и попробуйте снова',
    uz: "Brauzer sozlamalarida kameraga ruxsat bering va qayta urinib ko'ring",
    en: 'Allow the camera in your browser settings and try again'
  },
  'error.camera.retry': { ru: 'Повторить', uz: 'Qayta urinish', en: 'Try again' },
  'error.webview.title': {
    ru: 'Откройте страницу в браузере',
    uz: 'Sahifani brauzerda oching',
    en: 'Open this page in a browser'
  },
  'error.webview.body': {
    ru: 'Внутри Telegram камера часто не работает',
    uz: "Telegram ichida kamera ko'pincha ishlamaydi",
    en: 'The camera often does not work inside Telegram'
  },
  'error.webview.safari': { ru: 'Открыть в Safari', uz: 'Safarida ochish', en: 'Open in Safari' },
  'error.webview.chrome': { ru: 'Открыть в Chrome', uz: 'Chromeda ochish', en: 'Open in Chrome' },
  'error.desktop.title': { ru: 'Откройте на телефоне', uz: 'Telefonda oching', en: 'Open on your phone' },
  'error.desktop.body': {
    ru: 'Наведите камеру телефона на этот код',
    uz: 'Telefon kamerasini shu kodga qarating',
    en: 'Point your phone camera at this code'
  },
  'error.config.title': {
    ru: 'Меню временно недоступно',
    uz: 'Menyu vaqtincha mavjud emas',
    en: 'The menu is temporarily unavailable'
  },
  'error.video': {
    ru: 'Не удалось загрузить видео, проверьте интернет',
    uz: "Videoni yuklab bo'lmadi, internetni tekshiring",
    en: 'Could not load the video, check your connection'
  },
  'toast.added': { ru: 'Добавлено', uz: "Qo'shildi", en: 'Added' },
  'toast.copied': { ru: 'Ссылка скопирована', uz: 'Havola nusxalandi', en: 'Link copied' },
  'watch.button': { ru: 'Смотреть', uz: "Ko'rish", en: 'Watch' },
  'share.button': { ru: 'Поделиться', uz: 'Ulashish', en: 'Share' },
  'nocam.title': { ru: 'Меню', uz: 'Menyu', en: 'Menu' },
  'filter.all': { ru: 'Все', uz: 'Hammasi', en: 'All' },
  'tag.hit': { ru: 'Хит', uz: 'Xit', en: 'Hit' },
  'tag.chef': { ru: 'Выбор шефа', uz: 'Oshpaz tanlovi', en: "Chef's choice" },
  'tag.spicy': { ru: 'Острое', uz: 'Achchiq', en: 'Spicy' },
  'tag.veg': { ru: 'Вегетарианское', uz: 'Vegetarian', en: 'Vegetarian' },
  'tag.halal': { ru: 'Халяль', uz: 'Halol', en: 'Halal' },
  'tag.new': { ru: 'Новинка', uz: 'Yangi', en: 'New' },
  'allergen.gluten': { ru: 'глютен', uz: 'glyuten', en: 'gluten' },
  'allergen.egg': { ru: 'яйцо', uz: 'tuxum', en: 'egg' },
  'allergen.milk': { ru: 'молоко', uz: 'sut', en: 'milk' },
  'allergen.nuts': { ru: 'орехи', uz: "yong'oq", en: 'nuts' },
  'allergen.fish': { ru: 'рыба', uz: 'baliq', en: 'fish' },
  'allergen.seafood': { ru: 'морепродукты', uz: 'dengiz mahsulotlari', en: 'seafood' },
  'allergen.soy': { ru: 'соя', uz: 'soya', en: 'soy' },
  'allergen.sesame': { ru: 'кунжут', uz: 'kunjut', en: 'sesame' }
};

// Строка интерфейса. Нет ключа - вернём сам ключ.
export function t(key, lang = 'ru', vars = null) {
  const entry = DICT[key];
  if (!entry) return key;
  let text = entry[lang];
  if (typeof text !== 'string' || text === '') text = entry.ru;
  if (typeof text !== 'string') return key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

// Список ключей словаря, удобно для проверок и отладки.
export function keys() {
  return Object.keys(DICT);
}
