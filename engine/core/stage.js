// Геометрия плоскости, на которой играет видео блюда.

const DEFAULT_ASPECT = 16 / 9;
const Z = 0.01;

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// aspect это ширина/высота видео. Мусорный aspect заменяется на 16:9.
export function stageSize(stageCfg, aspect) {
  const cfg = stageCfg && typeof stageCfg === 'object' ? stageCfg : {};
  const w = num(cfg.w, 1.1);
  const safeAspect =
    typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
  const h = num(cfg.h, w / safeAspect);
  return {
    w: round4(w),
    h: round4(h),
    x: round4(num(cfg.x, 0)),
    y: round4(num(cfg.y, 0.35)),
    z: Z
  };
}
