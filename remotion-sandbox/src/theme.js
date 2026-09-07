// Токены дизайн-системы MenuLive. Держим их синхронными с docs/plans/2026-09-06-design-system.md
export const T = {
  accent: '#F2B24C',
  accent2: '#46C6A8',
  surface: '#12100E',
  onAccent: '#12100E',
  text: '#FFFFFF',
  text2: '#E5DED2',
  line: 'rgba(255,255,255,.12)',
  error: '#F5665A',
  waiterBg: '#0B0A09',
  // фон монтажных сцен, не интерфейса
  stage: '#0C0B09',
  stage2: '#17140F',
};

export const FONT = "'Golos Text', 'Helvetica Neue', Helvetica, sans-serif";

// Шкала интерфейса из дизайн-системы: размер и вес
export const type = {
  h1: { fontSize: 34, fontWeight: 800, lineHeight: 1.15 },
  h2: { fontSize: 24, fontWeight: 700, lineHeight: 1.15 },
  h3: { fontSize: 20, fontWeight: 700, lineHeight: 1.15 },
  base: { fontSize: 17, fontWeight: 600, lineHeight: 1.45 },
  body: { fontSize: 15, fontWeight: 500, lineHeight: 1.45 },
  small: { fontSize: 13, fontWeight: 500, lineHeight: 1.45 },
  caps: { fontSize: 11, fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase' },
};

export const radius = { chip: 999, button: 16, card: 20, sheet: 28, icon: 12 };

export const FPS = 25;

// Длительности сцен в кадрах, сумма 1875 = 75 секунд
export const SCENES = [
  { id: 'problem', frames: 150 },
  { id: 'habit', frames: 150 },
  { id: 'tap', frames: 200 },
  { id: 'reveal', frames: 300 },
  { id: 'card', frames: 250 },
  { id: 'upsell', frames: 250 },
  { id: 'waiter', frames: 200 },
  { id: 'stats', frames: 200 },
  { id: 'final', frames: 175 },
];

export const TOTAL = SCENES.reduce((s, x) => s + x.frames, 0);
