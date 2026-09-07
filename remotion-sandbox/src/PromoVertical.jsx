// Вертикальная нарезка 9:16 на 30 секунд. Весь текст в верхней трети:
// низ кадра закрывает интерфейс соцсети.
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/GolosText';
import { T, FONT, type, radius } from './theme';
import { Phone, Chip, Btn, DishCard, Header, OrderPill, Icons } from './ui';

loadFont();

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

// Подпись вверху кадра
const TopCaption = ({ children, sub, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 16 });
  return (
    <div
      style={{
        position: 'absolute',
        top: 150,
        left: 60,
        right: 60,
        textAlign: 'center',
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px)`,
        fontFamily: FONT,
        color: T.text,
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, textWrap: 'balance' }}>{children}</div>
      {sub ? <div style={{ marginTop: 16, fontSize: 30, fontWeight: 500, color: T.text2 }}>{sub}</div> : null}
    </div>
  );
};

const Bg = ({ blur = 10, bright = 0.3 }) => (
  <AbsoluteFill style={{ background: T.stage, overflow: 'hidden' }}>
    <Img
      src={staticFile('brest/menu-preview.jpg')}
      style={{ position: 'absolute', width: '160%', left: '-30%', top: '-10%', filter: `brightness(${bright}) blur(${blur}px)` }}
    />
  </AbsoluteFill>
);

// 1. Наведи телефон
const VTap = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: T.text }}>
      <Bg />
      <Phone scale={interpolate(e, [0, 1], [0.92, 1])} y={190}>
        <AbsoluteFill style={{ background: T.surface, padding: '59px 16px 34px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ flex: 1 }} />
          <Img src={staticFile('brest/logo.png')} style={{ width: 108, borderRadius: 20, marginBottom: 28 }} />
          <div style={{ ...type.h1, textAlign: 'center', marginBottom: 10 }}>Наведите камеру на меню, и блюда оживут</div>
          <div style={{ ...type.body, color: T.text2, textAlign: 'center', marginBottom: 26 }}>Камера нужна, чтобы показать блюдо прямо на вашем меню</div>
          <Btn style={{ width: '100%' }}>Открыть камеру</Btn>
          <div style={{ flex: 1 }} />
        </AbsoluteFill>
      </Phone>
      <TopCaption sub="Без приложения, прямо в браузере">Наведите телефон на меню</TopCaption>
    </AbsoluteFill>
  );
};

// 2. Блюдо появляется
const VReveal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 20, fps, config: { damping: 22, mass: 0.7 }, durationInFrames: 24 });
  const bob = Math.sin(frame / 30) * 5;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: T.text }}>
      <Bg blur={14} bright={0.25} />
      <Phone scale={1} y={190}>
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img src={staticFile('brest/menu-preview.jpg')} style={{ position: 'absolute', width: '128%', left: '-14%', top: '-6%', filter: 'brightness(.34) saturate(.7) blur(1.2px)' }} />
        </AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 248,
            width: 470,
            transform: `translate(-50%,0) scale(${interpolate(s, [0, 1], [0.88, 1])}) translateY(${bob}px)`,
            opacity: s,
            // настоящий альфа-канал вместо режима screen: блюдо непрозрачное
            filter: 'drop-shadow(0 18px 26px rgba(0,0,0,.75)) saturate(1.12) contrast(1.06)',
          }}
        >
          <OffthreadVideo src={staticFile('alpha/plate.webm')} muted loop transparent style={{ width: '100%' }} />
        </div>
        <div style={{ opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <Header cats={['Гриль', 'Море', 'Салаты']} active="Гриль" />
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 46 }}>
            <DishCard dish={DISH} />
          </div>
        </div>
      </Phone>
      <TopCaption delay={26} sub="Прямо на бумажной странице">Блюдо появляется в меню</TopCaption>
    </AbsoluteFill>
  );
};

// 3. Карточка и сочетания
const VCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pill = spring({ frame: frame - 70, fps, config: { damping: 18 }, durationInFrames: 18 });
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: T.text }}>
      <Bg blur={16} bright={0.22} />
      <div style={{ position: 'absolute', left: '50%', top: '62%', width: 358, transform: 'translate(-50%,-50%) scale(1.9)' }}>
        <div style={{ opacity: pill, marginBottom: 10 }}>
          <OrderPill text="2 блюда · 310 000 сум" />
        </div>
        <DishCard dish={DISH} qty={frame > 70 ? 1 : 0} expanded showPairs />
      </div>
      <TopCaption sub="И сразу считает заказ">Состав, аллергены и подсказка, что взять</TopCaption>
    </AbsoluteFill>
  );
};

// 4. Официант
const VWaiter = () => {
  const frame = useCurrentFrame();
  const rows = [
    ['Мясное плато', '1'],
    ['Лимонад', '2'],
    ['Салат Брест', '1'],
  ];
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: T.text }}>
      <Bg blur={18} bright={0.18} />
      <Phone scale={1} y={190}>
        <AbsoluteFill style={{ background: T.waiterBg, padding: '80px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Img src={staticFile('brest/logo.png')} style={{ width: 64, borderRadius: 14, opacity: 0.9 }} />
          {rows.map(([n, q], i) => (
            <div
              key={n}
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingBottom: 14,
                borderBottom: `1px solid ${T.line}`,
                opacity: interpolate(frame, [10 + i * 10, 24 + i * 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              <div style={{ ...type.h2, flex: 1 }}>{n}</div>
              <div style={{ ...type.h2, color: T.accent }}>×{q}</div>
            </div>
          ))}
        </AbsoluteFill>
      </Phone>
      <TopCaption sub="Ничего не надо диктовать">Официант читает готовый заказ</TopCaption>
    </AbsoluteFill>
  );
};

// 5. Финал
const VFinal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  return (
    <AbsoluteFill style={{ background: T.stage, fontFamily: FONT, color: T.text, alignItems: 'center', justifyContent: 'center', gap: 34 }}>
      <div style={{ opacity: s, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
        <div style={{ fontSize: 108, fontWeight: 800, letterSpacing: '-.02em' }}>
          Menu<span style={{ color: T.accent }}>Live</span>
        </div>
        <div style={{ fontSize: 34, fontWeight: 500, color: T.text2, textAlign: 'center' }}>Работает на вашем бумажном меню</div>
        <div style={{ background: '#fff', padding: 18, borderRadius: 24, marginTop: 16 }}>
          <Img src={staticFile('brest/qr.png')} style={{ width: 300, display: 'block' }} />
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, color: T.accent }}>armenu.shumtuber.uz</div>
      </div>
    </AbsoluteFill>
  );
};

const V = [
  { c: VTap, f: 120 },
  { c: VReveal, f: 240 },
  { c: VCard, f: 150 },
  { c: VWaiter, f: 120 },
  { c: VFinal, f: 120 },
];

export const VERTICAL_TOTAL = V.reduce((s, x) => s + x.f, 0);

export const PromoVertical = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: T.stage }}>
      {V.map(({ c: C, f }, i) => {
        const el = (
          <Sequence key={i} from={from} durationInFrames={f}>
            <C />
          </Sequence>
        );
        from += f;
        return el;
      })}
    </AbsoluteFill>
  );
};
