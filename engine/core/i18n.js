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
  'order.open': { ru: 'Открыть', uz: 'Ochish', en: 'Open' },
  'order.empty': { ru: 'Пока пусто', uz: "Hozircha bo'sh", en: 'Nothing here yet' },

  // Отправка заказа на сервер.
  'order.send': { ru: 'Отправить официанту', uz: 'Ofitsiantga yuborish', en: 'Send to the waiter' },
  'order.sending': { ru: 'Отправляем...', uz: 'Yuborilmoqda...', en: 'Sending...' },
  'order.retry': { ru: 'Повторить', uz: 'Qayta urinish', en: 'Try again' },
  'order.sent': { ru: 'Заказ отправлен', uz: 'Buyurtma yuborildi', en: 'Order sent' },
  'order.table': { ru: 'Стол {table}', uz: '{table}-stol', en: 'Table {table}' },
  'order.note.label': { ru: 'Пожелание кухне', uz: 'Oshxonaga izoh', en: 'Note for the kitchen' },
  'order.note.hint': {
    ru: 'Например: приборы отдельно, без лука',
    uz: 'Masalan: asboblar alohida, piyozsiz',
    en: 'For example: cutlery separately, no onion'
  },
  'order.notable.title': {
    ru: 'Отсканируйте код на столе',
    uz: 'Stoldagi kodni skanerlang',
    en: 'Scan the code on your table'
  },
  'order.notable.body': {
    ru: 'Заказ уходит на кухню вместе с номером стола. Откройте меню по QR-коду со своего стола, выбор сохранится.',
    uz: "Buyurtma oshxonaga stol raqami bilan boradi. Menyuni o'z stolingizdagi QR-kod orqali oching, tanlovingiz saqlanadi.",
    en: 'The order goes to the kitchen with your table number. Open the menu from the QR code on your table, your selection is kept.'
  },
  'error.network': {
    ru: 'Не отправлено: нет связи. Заказ остался у вас, попробуйте ещё раз.',
    uz: "Yuborilmadi: aloqa yo'q. Buyurtma sizda qoldi, qayta urinib ko'ring.",
    en: 'Not sent: no connection. Your order is still here, please try again.'
  },
  'error.server': {
    ru: 'Не отправлено: ресторан не ответил. Попробуйте ещё раз.',
    uz: "Yuborilmadi: restoran javob bermadi. Qayta urinib ko'ring.",
    en: 'Not sent: the restaurant did not answer. Please try again.'
  },
  'error.order': {
    ru: 'Не отправлено: проверьте состав заказа.',
    uz: 'Yuborilmadi: buyurtma tarkibini tekshiring.',
    en: 'Not sent: please check the order contents.'
  },
  'error.limit': {
    ru: 'Слишком много заказов с этого стола. Позовите официанта.',
    uz: "Bu stoldan juda ko'p buyurtma. Ofitsiantni chaqiring.",
    en: 'Too many orders from this table. Please call the waiter.'
  },

  // Экран статуса заказа.
  'status.number': { ru: 'Заказ {number}', uz: '{number} buyurtma', en: 'Order {number}' },
  'status.sentat': { ru: 'отправлен в {time}', uz: 'soat {time} da yuborildi', en: 'sent at {time}' },
  'status.acceptedat': {
    ru: 'принял заказ в {time}',
    uz: 'buyurtmani soat {time} da qabul qildi',
    en: 'accepted the order at {time}'
  },
  'status.back': { ru: 'В меню', uz: 'Menyuga', en: 'Back to menu' },
  'status.more': { ru: 'Дозаказ', uz: "Qo'shimcha", en: 'Order more' },
  'status.open': { ru: 'Мой заказ', uz: 'Mening buyurtmam', en: 'My order' },
  'status.elapsed': { ru: 'минут', uz: 'daqiqa', en: 'minutes' },
  'status.offline': {
    ru: 'Связь пропала, обновим сами, как только появится',
    uz: "Aloqa uzildi, paydo bo'lishi bilan yangilaymiz",
    en: 'Connection lost, we will refresh as soon as it is back'
  },
  'status.state.new': { ru: 'У официанта', uz: 'Ofitsiantda', en: 'With the waiter' },
  'status.state.accepted': { ru: 'Заказ принят', uz: 'Buyurtma qabul qilindi', en: 'Order accepted' },
  'status.state.kitchen': { ru: 'Готовится', uz: 'Tayyorlanmoqda', en: 'Cooking' },
  'status.state.served': { ru: 'Подано', uz: 'Berildi', en: 'Served' },
  'status.state.paid': { ru: 'Оплачено', uz: "To'landi", en: 'Paid' },
  'status.state.cancelled': { ru: 'Заказ отменён', uz: 'Buyurtma bekor qilindi', en: 'Order cancelled' },
  'status.step.new': { ru: 'Заказ отправлен', uz: 'Buyurtma yuborildi', en: 'Order sent' },
  'status.step.accepted': { ru: 'Официант принял', uz: 'Ofitsiant qabul qildi', en: 'Waiter accepted' },
  'status.step.kitchen': { ru: 'Кухня готовит', uz: 'Oshxona tayyorlamoqda', en: 'Kitchen is cooking' },
  'status.step.served': { ru: 'Подано к столу', uz: 'Stolga berildi', en: 'Served to the table' },
  'status.hint.new': { ru: 'Со стола {table} через QR', uz: '{table}-stoldan QR orqali', en: 'From table {table} via QR' },
  'status.hint.accepted': {
    ru: 'Официант подтвердил состав и пожелания',
    uz: 'Ofitsiant tarkib va istaklarni tasdiqladi',
    en: 'The waiter confirmed the items and your notes'
  },
  'status.hint.kitchen': {
    ru: 'Блюда на кухне, напитки уже в баре',
    uz: 'Taomlar oshxonada, ichimliklar barda',
    en: 'Dishes are in the kitchen, drinks are at the bar'
  },
  'status.hint.served': {
    ru: 'Официант принесёт и отметит в приложении',
    uz: 'Ofitsiant olib keladi va ilovada belgilaydi',
    en: 'The waiter will bring it and mark it in the app'
  },
  'status.step.wait': { ru: 'ждём', uz: 'kutamiz', en: 'waiting' },
  'status.waiter': { ru: 'ваш официант', uz: 'sizning ofitsiantingiz', en: 'your waiter' },
  'status.waiter.none': {
    ru: 'Официант скоро подойдёт',
    uz: 'Ofitsiant tez orada keladi',
    en: 'The waiter will come shortly'
  },
  'status.total': { ru: 'Со счётом и сервисом', uz: 'Hisob va xizmat bilan', en: 'With bill and service' },
  'status.call': { ru: 'Позвать официанта', uz: 'Ofitsiantni chaqirish', en: 'Call the waiter' },
  'status.call.sending': { ru: 'Зовём...', uz: 'Chaqirmoqdamiz...', en: 'Calling...' },
  'status.call.sent': { ru: 'Официант идёт', uz: 'Ofitsiant kelmoqda', en: 'The waiter is coming' },
  'status.call.ack': { ru: 'Вызов принят', uz: 'Chaqiruv qabul qilindi', en: 'Call accepted' },
  'status.bill': { ru: 'Попросить счёт', uz: 'Hisobni so\'rash', en: 'Ask for the bill' },
  'status.bill.sending': { ru: 'Просим...', uz: "So'ramoqdamiz...", en: 'Asking...' },
  'status.bill.sent': { ru: 'Счёт несут', uz: 'Hisob olib kelinmoqda', en: 'The bill is on its way' },
  'status.bill.ack': { ru: 'Вызов принят', uz: 'Chaqiruv qabul qilindi', en: 'Call accepted' },
  'status.note': {
    ru: 'Счёт можно разделить на гостей. Наличными, картой или Payme.',
    uz: "Hisobni mehmonlar orasida bo'lish mumkin. Naqd, karta yoki Payme.",
    en: 'The bill can be split between guests. Cash, card or Payme.'
  },
  'status.callfail': {
    ru: 'Вызов не ушёл, попробуйте ещё раз',
    uz: "Chaqiruv yuborilmadi, qayta urinib ko'ring",
    en: 'The call did not go through, please try again'
  },
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
