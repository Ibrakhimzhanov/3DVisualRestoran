// Сцены рекламного ролика MenuLive. Сценарий: docs/plans/2026-09-06-promo-script.md
import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { T, FONT, type, radius } from './theme';
import { Phone, Plate, Chip, Btn, Icons, DishCard, Header, OrderPill, Caption, Vignette } from './ui';

const DISH = {
  name: 'Мясное плато Brest',
  price: '265 000',
  weight: '980 г',
  kcal: '1 240 ккал',
  tags: [
    { icon: Icons.hit, label: 'Хит' },
    { icon: Icons.halal, label: 'Халяль' },
  ],
  desc: 'четыре вида мяса на углях, булгур, печёные овощи, три соуса',
  allergens: 'глютен, кунжут',
  pairs: ['Лимонад домашний', 'Салат Брест'],
  promo: 'Только в AR: соус от шефа в подарок',
};

const CATS = ['Гриль', 'Море', 'Салаты'];
const FILTERS = ['Все', 'Хит', 'Халяль'];

// Живой кадр камеры: страница меню на столе, лёгкое дыхание кадра
const CameraView = ({ zoom = 1 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 44) * 0.5;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#0A0908' }}>
      <Img
        src={staticFile('brest/menu-preview.jpg')}
        style={{
          position: 'absolute',
          width: '128%',
          left: '-14%',
          top: '-6%',
          transform: `scale(${zoom}) rotate(${drift}deg)`,
          filter: 'brightness(.34) saturate(.7) blur(1.2px)',
        }}
      />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.28) 42%, rgba(0,0,0,.72))' }} />
      {/* тёплое пятно света под блюдом: даёт ощущение, что оно лежит на странице */}
      <AbsoluteFill style={{ background: 'radial-gradient(46% 26% at 50% 46%, rgba(255,196,120,.20), transparent 70%)' }} />
    </AbsoluteFill>
  );
};

// Блюдо поверх бумаги. mixBlendMode screen убирает чёрный фон ролика,
// это тот же приём, что luma-key в самом продукте.
const FloatingDish = ({ startAt = 0, src = 'alpha/plate.webm' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - startAt, fps, config: { damping: 22, mass: 0.7 }, durationInFrames: 26 });
  const bob = Math.sin((frame - startAt) / 30) * 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 248,
        width: 470,
        transform: `translate(-50%,0) scale(${interpolate(s, [0, 1], [0.88, 1])}) translateY(${bob}px)`,
        opacity: s,
        // настоящий альфа-канал, как luma-ключ в шейдере продукта:
        // блюдо непрозрачное, сквозь него ничего не просвечивает
        filter: 'drop-shadow(0 18px 26px rgba(0,0,0,.75)) saturate(1.12) contrast(1.06)',
      }}
    >
      <OffthreadVideo src={staticFile(src)} muted loop transparent style={{ width: '100%' }} />
    </div>
  );
};

// 1. Проблема: в меню только слова
export const SceneProblem = () => {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, 150], [1.04, 1.14]);
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile('brest/menu-preview.jpg')}
          style={{ position: 'absolute', width: '70%', left: '15%', top: '-16%', transform: `scale(${z})`, filter: 'brightness(.62)' }}
        />
      </AbsoluteFill>
      <Vignette />
      <Caption sub="В меню только строчки и цены">Гость выбирает глазами</Caption>
    </AbsoluteFill>
  );
};

// 2. Привычка
export const SceneHabit = () => {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, 150], [1.14, 1.2]);
  const dim = interpolate(frame, [0, 60], [0.62, 0.4], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile('brest/menu-preview.jpg')}
          style={{ position: 'absolute', width: '70%', left: '15%', top: '-16%', transform: `scale(${z})`, filter: `brightness(${dim})` }}
        />
      </AbsoluteFill>
      <Vignette />
      <Caption sub="Новое блюдо остаётся незамеченным">И берёт то же, что всегда</Caption>
    </AbsoluteFill>
  );
};

// 3. Телефон и тап по кнопке
export const SceneTap = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const tap = spring({ frame: frame - 110, fps, config: { damping: 14 }, durationInFrames: 16 });
  const ripple = interpolate(frame, [110, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text }}>
      <AbsoluteFill style={{ overflow: 'hidden', opacity: 0.5 }}>
        <Img src={staticFile('brest/menu-preview.jpg')} style={{ position: 'absolute', width: '80%', left: '10%', top: '-24%', filter: 'brightness(.4) blur(3px)' }} />
      </AbsoluteFill>
      <Phone scale={interpolate(enter, [0, 1], [0.84, 0.9])} y={interpolate(enter, [0, 1], [40, -46])} rotate={-2}>
        <AbsoluteFill style={{ background: T.surface, padding: '59px 16px 34px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: FONT }}>
          <div style={{ alignSelf: 'flex-end', display: 'flex', gap: 2, background: 'rgba(255,255,255,.08)', borderRadius: 999, padding: 3 }}>
            {['RU', 'UZ', 'EN'].map((l, i) => (
              <div key={l} style={{ padding: '6px 12px', borderRadius: 999, background: i === 0 ? '#fff' : 'transparent', color: i === 0 ? T.onAccent : T.text2, ...type.small, fontWeight: 600 }}>
                {l}
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <Img src={staticFile('brest/logo.png')} style={{ width: 108, borderRadius: 20, marginBottom: 28 }} />
          <div style={{ ...type.h1, textAlign: 'center', marginBottom: 10 }}>Наведите камеру на меню, и блюда оживут</div>
          <div style={{ ...type.body, color: T.text2, textAlign: 'center', marginBottom: 26 }}>Камера нужна, чтобы показать блюдо прямо на вашем меню</div>
          <div style={{ position: 'relative', width: '100%' }}>
            <Btn style={{ width: '100%', transform: `scale(${1 - tap * 0.03})` }}>Открыть камеру</Btn>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 120,
                height: 120,
                marginLeft: -60,
                marginTop: -60,
                borderRadius: 999,
                border: `2px solid ${T.accent}`,
                transform: `scale(${0.4 + ripple * 1.8})`,
                opacity: (1 - ripple) * 0.7,
              }}
            />
          </div>
          <div style={{ ...type.base, marginTop: 18, textDecoration: 'underline' }}>Посмотреть меню без камеры</div>
          <div style={{ flex: 1 }} />
          <div style={{ ...type.caps, color: T.text2 }}>Работает на MenuLive</div>
        </AbsoluteFill>
      </Phone>
      <Caption delay={16} sub="Без приложения, прямо в браузере">Пока не наведёт телефон</Caption>
    </AbsoluteFill>
  );
};

// 4. Появление блюда: главный кадр ролика
export const SceneReveal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const push = interpolate(frame, [0, 300], [1, 1.06]);
  const scanOut = interpolate(frame, [50, 70], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text }}>
      <AbsoluteFill style={{ overflow: 'hidden', opacity: 0.45 }}>
        <Img src={staticFile('brest/menu-preview.jpg')} style={{ position: 'absolute', width: '90%', left: '5%', top: '-30%', filter: 'brightness(.35) blur(6px)' }} />
      </AbsoluteFill>
      <Phone scale={interpolate(enter, [0, 1], [0.86, 0.92]) * push} y={-46} rotate={-1}>
        <CameraView zoom={1.02} />
        {/* уголки рамки сканирования, уходят после захвата */}
        <div style={{ position: 'absolute', inset: 0, opacity: scanOut }}>
          {[[64, 236], [292, 236], [64, 512], [292, 512]].map(([x, y], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 34,
                height: 34,
                borderTop: i < 2 ? `3px solid ${T.accent}` : 'none',
                borderBottom: i >= 2 ? `3px solid ${T.accent}` : 'none',
                borderLeft: i % 2 === 0 ? `3px solid ${T.accent}` : 'none',
                borderRight: i % 2 === 1 ? `3px solid ${T.accent}` : 'none',
                borderRadius: 6,
              }}
            />
          ))}
        </div>
        <FloatingDish startAt={58} />
        <div style={{ opacity: interpolate(frame, [70, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <Header cats={CATS} active="Гриль" filters={FILTERS} />
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 46 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <Chip active>Мясное плато · 265 000</Chip>
              <Chip>Кебаб · 148 000</Chip>
            </div>
            <DishCard dish={DISH} />
          </div>
        </div>
      </Phone>
      <Caption delay={64} sub="Прямо на бумажной странице">Блюдо появляется в меню</Caption>
    </AbsoluteFill>
  );
};

// 5. Карточка крупно
export const SceneCard = () => {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, 250], [1.6, 1.78]);
  const expand = frame > 90;
  return (
    <AbsoluteFill style={{ background: T.stage2, fontFamily: FONT, color: T.text }}>
      <AbsoluteFill style={{ overflow: 'hidden', opacity: 0.35 }}>
        <Img src={staticFile('brest/menu-preview.jpg')} style={{ position: 'absolute', width: '110%', left: '-5%', top: '-40%', filter: 'brightness(.3) blur(10px)' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: '50%', top: '46%', width: 358, transform: `translate(-50%,-50%) scale(${z})` }}>
        <DishCard dish={DISH} expanded={expand} />
      </div>
      <Caption delay={10} sub="Гость понимает, что заказывает">Состав, вес, калории, аллергены</Caption>
    </AbsoluteFill>
  );
};

// 6. Сочетания и заказ
export const SceneUpsell = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pillIn = spring({ frame: frame - 120, fps, config: { damping: 18 }, durationInFrames: 20 });
  const qty = frame > 120 ? 1 : 0;
  return (
    <AbsoluteFill style={{ background: T.stage2, fontFamily: FONT, color: T.text }}>
      <AbsoluteFill style={{ overflow: 'hidden', opacity: 0.3 }}>
        <Img src={staticFile('brest/menu-preview.jpg')} style={{ position: 'absolute', width: '110%', left: '-5%', top: '-40%', filter: 'brightness(.3) blur(10px)' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: '50%', top: '44%', width: 358, transform: 'translate(-50%,-50%) scale(1.7)' }}>
        <div style={{ opacity: pillIn, transform: `translateY(${interpolate(pillIn, [0, 1], [16, 0])}px)`, marginBottom: 10 }}>
          <OrderPill text="2 блюда · 310 000 сум" />
        </div>
        <DishCard dish={DISH} qty={qty} showPairs />
      </div>
      <Caption delay={10} sub="И сразу считает заказ">Меню подсказывает, что взять к блюду</Caption>
    </AbsoluteFill>
  );
};

// 7. Экран для официанта
export const SceneWaiter = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const turn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const rows = [
    ['Мясное плато Brest', '1'],
    ['Лимонад домашний', '2'],
    ['Салат Брест', '1'],
  ];
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text }}>
      <Phone scale={0.92} y={-46} rotate={interpolate(turn, [0, 1], [-14, 0])} x={interpolate(turn, [0, 1], [-60, 0])}>
        <AbsoluteFill style={{ background: T.waiterBg, padding: '80px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Img src={staticFile('brest/logo.png')} style={{ width: 64, borderRadius: 14, opacity: 0.9 }} />
          {rows.map(([n, q], i) => (
            <div
              key={n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                paddingBottom: 14,
                borderBottom: `1px solid ${T.line}`,
                opacity: interpolate(frame, [20 + i * 12, 34 + i * 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              <div style={{ ...type.h2, flex: 1 }}>{n}</div>
              <div style={{ ...type.h2, color: T.accent }}>×{q}</div>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', ...type.h3 }}>
            <span style={{ color: T.text2 }}>Итого</span>
            <span>355 000 сум</span>
          </div>
        </AbsoluteFill>
      </Phone>
      <Caption delay={20} sub="Ничего не надо диктовать и переспрашивать">Официант читает готовый заказ</Caption>
    </AbsoluteFill>
  );
};

// 8. Цифры с источниками
export const SceneStats = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const items = [
    { big: '39%', txt: 'Блюдо с движением заказывали чаще', src: 'Frontiers in Computer Science, 2021' },
    { big: '11,7 млн', txt: 'Иностранных гостей в 2025 году', src: 'Госкомстат Узбекистана' },
    { big: '75%', txt: 'Заведений без меню на узбекском', src: 'Комитет по конкуренции, 2024' },
  ];
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 28 }}>
        {items.map((it, i) => {
          const s = spring({ frame: frame - i * 10, fps, config: { damping: 200 }, durationInFrames: 22 });
          return (
            <div
              key={it.big}
              style={{
                width: 420,
                height: 380,
                borderRadius: 28,
                border: `1px solid ${T.line}`,
                background: 'rgba(255,255,255,.03)',
                padding: 36,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
              }}
            >
              <div style={{ fontSize: 92, fontWeight: 800, color: T.accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{it.big}</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.3, marginBottom: 14 }}>{it.txt}</div>
                <div style={{ fontSize: 15, color: T.text2 }}>{it.src}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', top: 130, fontSize: 44, fontWeight: 800 }}>Это не наши обещания, это исследования</div>
    </AbsoluteFill>
  );
};

// 9. Финал
export const SceneFinal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 26 });
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text, alignItems: 'center', justifyContent: 'center', gap: 30 }}>
      <div style={{ opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.94, 1])})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: '-.02em' }}>
          Menu<span style={{ color: T.accent }}>Live</span>
        </div>
        <div style={{ fontSize: 30, fontWeight: 500, color: T.text2 }}>Работает на вашем бумажном меню</div>
        <div style={{ background: '#fff', padding: 16, borderRadius: 20, marginTop: 10 }}>
          <Img src={staticFile('brest/qr.png')} style={{ width: 190, display: 'block' }} />
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: T.accent }}>armenu.shumtuber.uz</div>
      </div>
      <div style={{ position: 'absolute', bottom: 90, fontSize: 22, color: T.text2 }}>Наведите камеру телефона на код и попробуйте прямо сейчас</div>
    </AbsoluteFill>
  );
};
