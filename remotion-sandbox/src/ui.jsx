// Кусочки интерфейса MenuLive, нарисованные теми же токенами, что и продукт.
// Нужны, чтобы «экранка» в ролике была чистой, без муара и бликов настоящей съёмки.
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { T, FONT, type, radius } from './theme';

export const Screen = ({ children, style }) => (
  <div style={{ position: 'absolute', inset: 0, fontFamily: FONT, color: T.text, ...style }}>{children}</div>
);

// Корпус телефона 390 на 844, рисуем в масштабе
export const Phone = ({ children, scale = 1, rotate = 0, x = 0, y = 0, glow = true }) => (
  <div
    style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 390,
      height: 844,
      transform: `translate(-50%,-50%) translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`,
      borderRadius: 54,
      background: '#000',
      padding: 11,
      boxShadow: glow
        ? '0 60px 120px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.10), 0 0 90px rgba(242,178,76,.10)'
        : 'none',
    }}
  >
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 44, overflow: 'hidden', background: T.surface }}>
      {children}
      {/* чёлка */}
      <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 116, height: 32, borderRadius: 20, background: '#000', zIndex: 60 }} />
      {/* нижняя полоса */}
      <div style={{ position: 'absolute', bottom: 9, left: '50%', transform: 'translateX(-50%)', width: 136, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.55)', zIndex: 60 }} />
    </div>
  </div>
);

// Затемнение со стеклом: база всех плашек интерфейса
export const Plate = ({ children, style }) => (
  <div
    style={{
      color: T.text,
      background: `rgba(18,16,14,.82)`,
      backdropFilter: 'blur(20px)',
      border: `1px solid ${T.line}`,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Chip = ({ children, active, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 34,
      padding: '0 14px',
      borderRadius: radius.chip,
      background: active ? T.accent : 'rgba(18,16,14,.82)',
      color: active ? T.onAccent : T.text,
      border: active ? 'none' : `1px solid ${T.line}`,
      ...type.small,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Btn = ({ children, style, variant = 'accent' }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: radius.button,
      background: variant === 'accent' ? T.accent : 'rgba(255,255,255,.10)',
      color: variant === 'accent' ? T.onAccent : T.text,
      ...type.base,
      fontWeight: 700,
      ...style,
    }}
  >
    {children}
  </div>
);

// Иконки 24 на 24, штрих 1.75, как в дизайн-системе
const svg = (d, extra) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {d}
    {extra}
  </svg>
);

export const Icons = {
  hit: svg(<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />),
  halal: svg(<path d="M16.5 5.2a7 7 0 100 13.6A7.6 7.6 0 0116.5 5.2z" />, <path d="M18.5 9.2l.8 1.7 1.8.2-1.4 1.3.4 1.8-1.6-.9-1.6.9.4-1.8-1.4-1.3 1.8-.2z" />),
  spicy: svg(<path d="M13 6c3.5 0 6 3 6 6.5S16 20 12 20s-7-2.5-7-6c2.5 0 4-1.5 5-3s1.7-3 2-4c.4 1.7 1 3 1 3z" />),
  veg: svg(<path d="M20 4C11 4 5 8.5 5 15c0 2 .7 3.6 1.6 4.6C8 17 11.5 13 16 11c-3.5 2.7-6 6-7 9.5C15.5 21.5 20 16 20 4z" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  minus: svg(<path d="M5 12h14" />),
  share: svg(<path d="M12 15V4m0 0L8 8m4-4l4 4" />, <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" />),
  sound: svg(<path d="M4 9v6h4l5 4V5L8 9z" />, <path d="M17 8.5a5 5 0 010 7M20 6a9 9 0 010 12" />),
};

// Карточка блюда: та же анатомия, что в продукте
export const DishCard = ({ dish, qty = 0, expanded = false, showPairs = false, style }) => (
  <Plate style={{ borderRadius: radius.card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
    {dish.promo ? (
      <div style={{ alignSelf: 'flex-start', background: T.accent2, color: T.onAccent, borderRadius: radius.chip, padding: '4px 10px', ...type.caps }}>
        {dish.promo}
      </div>
    ) : null}
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <div style={{ ...type.h3, flex: 1 }}>{dish.name}</div>
      <div style={{ ...type.h3, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>{dish.price}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...type.small, color: T.text2 }}>
      <span>{dish.weight}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{dish.kcal}</span>
      {dish.tags?.map((t) => (
        <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.text }}>
          {t.icon}
          {t.label}
        </span>
      ))}
    </div>
    <div style={{ ...type.body, color: T.text2 }}>{dish.desc}</div>
    {expanded ? (
      <div style={{ ...type.small, color: T.text2 }}>
        Содержит: <span style={{ color: T.text }}>{dish.allergens}</span>
      </div>
    ) : null}
    {showPairs ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <div style={{ ...type.caps, color: T.text2, whiteSpace: 'nowrap' }}>Сочетается с</div>
        {dish.pairs.map((p) => (
          <Chip key={p}>{p}</Chip>
        ))}
      </div>
    ) : null}
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
      {qty > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,.10)', borderRadius: radius.button, padding: '0 14px', height: 44 }}>
          {Icons.minus}
          <span style={{ ...type.base, minWidth: 14, textAlign: 'center' }}>{qty}</span>
          <span style={{ color: T.accent2 }}>{Icons.plus}</span>
        </div>
      ) : (
        <Btn style={{ width: 140, height: 44 }}>Добавить</Btn>
      )}
    </div>
  </Plate>
);

// Верхняя панель: вкладки и круглые кнопки
export const Header = ({ cats, active, filters = [] }) => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 59, zIndex: 40 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px' }}>
      {cats.map((c) => (
        <div key={c} style={{ ...type.base, color: c === active ? T.text : T.text2, position: 'relative', paddingBottom: 6 }}>
          {c}
          {c === active ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 2, background: T.accent }} /> : null}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ width: 40, height: 40, borderRadius: 999, background: 'rgba(18,16,14,.82)', border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {Icons.share}
      </div>
    </div>
    {filters.length ? (
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px 0' }}>
        {filters.map((f, i) => (
          <Chip key={f} active={i === 0}>
            {f}
          </Chip>
        ))}
      </div>
    ) : null}
  </div>
);

// Плашка заказа
export const OrderPill = ({ text }) => (
  <Plate style={{ borderRadius: radius.chip, height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px 0 16px' }}>
    <div style={{ ...type.base, flex: 1 }}>{text}</div>
    <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: radius.chip, padding: '8px 16px', ...type.small, fontWeight: 600 }}>Открыть</div>
  </Plate>
);

// Подпись-плашка поверх монтажной сцены
export const Caption = ({ children, sub, delay = 0, align = 'center', width = 900 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 18 });
  const y = interpolate(s, [0, 1], [26, 0]);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 96,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        paddingLeft: align === 'center' ? 0 : 96,
        opacity: s,
        transform: `translateY(${y}px)`,
        fontFamily: FONT,
      }}
    >
      <div style={{ maxWidth: width, fontSize: 54, fontWeight: 800, lineHeight: 1.12, color: T.text, textAlign: align, textWrap: 'balance' }}>{children}</div>
      {sub ? <div style={{ marginTop: 14, fontSize: 22, fontWeight: 500, color: T.text2, textAlign: align }}>{sub}</div> : null}
    </div>
  );
};

export const Vignette = () => (
  <AbsoluteFill
    style={{
      background: 'radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 30%, rgba(0,0,0,.72) 100%)',
    }}
  />
);
