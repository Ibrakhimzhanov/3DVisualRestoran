// AR-слой MenuLive.
// Регистрирует компоненты A-Frame (smooth-track, pinch-zoom) и шейдер ключа ml-key,
// собирает сцену A-Frame + MindAR и отдаёт её наружу как ARScene.
// Зависимости только глобальные: window.AFRAME и window.THREE подключаются
// обычными тегами script до загрузки этого модуля.

import { Emitter } from './core/emitter.js';
import { stageSize } from './core/stage.js';

// Числовые коды режимов ключа для шейдера.
const KEY_MODES = { none: 0, luma: 1, chroma: 2 };

// Умолчания трекинга совпадают с текущими продовыми значениями index.html.
const TRACKING_DEFAULTS = {
  filterMinCF: 0.0001,
  filterBeta: 0.5,
  missTolerance: 5,
  warmupTolerance: 0,
  smoothFactor: 0.02,
  posThreshold: 0.005,
  rotThreshold: 0.008
};

const STAGE_DEFAULTS = {
  x: 0,
  y: 0.35,
  w: 1.1,
  key: 'luma',
  luma: { threshold: 0.1, smoothing: 0.1 },
  chroma: { color: '#00ff00', similarity: 0.4, smoothness: 0.1, spill: 0.1 },
  feather: 0.08
};

const IDS = { video: 'ml-video', stage: 'ml-stage', loader: 'ml-loader' };

// Длительность анимации появления сцены, мс.
const APPEAR_MS = 300;

// ---------------------------------------------------------------------------
// Шейдер ml-key
// ---------------------------------------------------------------------------

const VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform sampler2D src;
uniform int mode;
uniform float threshold;
uniform float smoothing;
uniform vec3 keyColor;
uniform float similarity;
uniform float smoothness;
uniform float spill;
uniform float feather;
uniform float fade;

varying vec2 vUv;

void main() {
  vec4 c = texture2D(src, vUv);
  vec3 rgb = c.rgb;
  float alpha = 1.0;

  if (mode == 1) {
    // Luma-ключ: чем темнее пиксель, тем он прозрачнее.
    float l = dot(rgb, vec3(0.299, 0.587, 0.114));
    alpha = smoothstep(threshold, threshold + max(smoothing, 0.0001), l);
  } else if (mode == 2) {
    // Chroma-ключ: расстояние до ключевого цвета.
    float d = distance(rgb, keyColor);
    alpha = smoothstep(similarity, similarity + max(smoothness, 0.0001), d);

    // Подавление зелёного разлива по краям объекта.
    float rb = (rgb.r + rgb.b) * 0.5;
    if (rgb.g > rb) {
      rgb.g = mix(rgb.g, rb, clamp(spill, 0.0, 1.0));
    }
  }

  // Растушёвка краёв плоскости. При feather = 0 края остаются резкими.
  if (feather > 0.0001) {
    float f = max(feather, 0.0001);
    float ex = min(smoothstep(0.0, f, vUv.x), smoothstep(0.0, f, 1.0 - vUv.x));
    float ey = min(smoothstep(0.0, f, vUv.y), smoothstep(0.0, f, 1.0 - vUv.y));
    alpha *= ex * ey;
  }

  alpha = clamp(alpha * c.a * fade, 0.0, 1.0);
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(rgb, alpha);
}
`;

// ---------------------------------------------------------------------------
// Регистрация
// ---------------------------------------------------------------------------

let registered = false;

// Идемпотентная регистрация компонентов и шейдера.
export function registerAll() {
  if (registered) return;
  const AFRAME = globalThis.AFRAME;
  if (!AFRAME || typeof AFRAME.registerComponent !== 'function') {
    throw new Error('[ml-ar] AFRAME не найден: подключите A-Frame до модулей движка');
  }
  registered = true;
  registerSmoothTrack(AFRAME);
  registerPinchZoom(AFRAME);
  registerKeyShader(AFRAME);
}

// Стабилизатор: сглаживает позицию и поворот таргета, мёртвая зона гасит дрожание.
// Перенесён из index.html без изменения логики, параметры задаются из config.tracking.
function registerSmoothTrack(AFRAME) {
  if (AFRAME.components && AFRAME.components['smooth-track']) return;
  const THREE = getThree(AFRAME);

  AFRAME.registerComponent('smooth-track', {
    schema: {
      factor: { type: 'number', default: 0.04 },
      posThreshold: { type: 'number', default: 0.002 },
      rotThreshold: { type: 'number', default: 0.003 }
    },

    init: function () {
      this.smoothPos = new THREE.Vector3();
      this.smoothQuat = new THREE.Quaternion();
      this.prevRawPos = new THREE.Vector3();
      this.prevRawQuat = new THREE.Quaternion();
      this.started = false;
    },

    tick: function () {
      const obj = this.el.object3D;
      if (!obj.visible) { this.started = false; return; }

      if (!this.started) {
        this.smoothPos.copy(obj.position);
        this.smoothQuat.copy(obj.quaternion);
        this.prevRawPos.copy(obj.position);
        this.prevRawQuat.copy(obj.quaternion);
        this.started = true;
        return;
      }

      const posDelta = obj.position.distanceTo(this.prevRawPos);
      const rotDelta = this.prevRawQuat.angleTo(obj.quaternion);

      this.prevRawPos.copy(obj.position);
      this.prevRawQuat.copy(obj.quaternion);

      const f = this.data.factor;

      if (posDelta > this.data.posThreshold) {
        this.smoothPos.lerp(obj.position, f);
      }
      if (rotDelta > this.data.rotThreshold) {
        this.smoothQuat.slerp(obj.quaternion, f);
      }

      obj.position.copy(this.smoothPos);
      obj.quaternion.copy(this.smoothQuat);
    }
  });
}

// Масштаб щипком. Перенесён из index.html: математика зума не менялась.
// Добавлено: поиск канваса динамически созданной сцены, сброс двойным тапом,
// снятие слушателей в remove и пересчёт базы при смене размера сцены.
function registerPinchZoom(AFRAME) {
  if (AFRAME.components && AFRAME.components['pinch-zoom']) return;

  AFRAME.registerComponent('pinch-zoom', {
    schema: {
      min: { type: 'number', default: 0.5 },
      max: { type: 'number', default: 3.0 },
      // Максимальный интервал между двумя тапами для сброса масштаба, мс.
      tapMs: { type: 'number', default: 300 }
    },

    init: function () {
      this.initialDist = 0;
      this.initialScale = 1;
      this.currentScale = 1;
      this.baseWidth = toNumber(this.el.getAttribute('width'), 1);
      this.baseHeight = toNumber(this.el.getAttribute('height'), 1);
      this.lastTap = 0;
      this.pinching = false;
      this.canvas = null;

      this.onTouchStart = this.onTouchStart.bind(this);
      this.onTouchMove = this.onTouchMove.bind(this);
      this.onTouchEnd = this.onTouchEnd.bind(this);
      this.onDoubleClick = this.onDoubleClick.bind(this);
      this.bindCanvas = this.bindCanvas.bind(this);

      this.bindCanvas();
      if (!this.canvas) {
        const sceneEl = this.el.sceneEl;
        if (sceneEl) {
          sceneEl.addEventListener('render-target-loaded', this.bindCanvas);
          sceneEl.addEventListener('loaded', this.bindCanvas);
        }
      }
    },

    // Канвас появляется только когда сцена отрисовалась, поэтому привязка отложенная.
    bindCanvas: function () {
      if (this.canvas) return;
      const sceneEl = this.el.sceneEl;
      const canvas = (sceneEl && sceneEl.canvas) || document.querySelector('canvas');
      if (!canvas) return;
      this.canvas = canvas;
      canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
      canvas.addEventListener('touchmove', this.onTouchMove, { passive: true });
      canvas.addEventListener('touchend', this.onTouchEnd, { passive: true });
      canvas.addEventListener('dblclick', this.onDoubleClick);
    },

    onTouchStart: function (e) {
      if (e.touches.length === 2) {
        this.pinching = true;
        this.initialDist = this._dist(e.touches[0], e.touches[1]);
        this.initialScale = this.currentScale;
      }
    },

    onTouchMove: function (e) {
      if (e.touches.length === 2) {
        const dist = this._dist(e.touches[0], e.touches[1]);
        if (!this.initialDist) return;
        const ratio = dist / this.initialDist;
        this.currentScale = Math.min(this.data.max,
          Math.max(this.data.min, this.initialScale * ratio));
        this.applyScale();
      }
    },

    // Двойной тап по канвасу возвращает масштаб к единице.
    onTouchEnd: function (e) {
      if (e.touches && e.touches.length > 0) return;
      if (this.pinching) { this.pinching = false; this.lastTap = 0; return; }
      const now = Date.now();
      if (now - this.lastTap < this.data.tapMs) {
        this.lastTap = 0;
        this.reset();
      } else {
        this.lastTap = now;
      }
    },

    onDoubleClick: function () {
      this.reset();
    },

    applyScale: function () {
      const scale = toNumber(this.currentScale, 1);
      const w = toNumber(this.baseWidth, NaN);
      const h = toNumber(this.baseHeight, NaN);
      if (!isFinite(w) || !isFinite(h)) return;
      this.currentScale = scale;
      this.el.setAttribute('width', w * scale);
      this.el.setAttribute('height', h * scale);
    },

    // Новый базовый размер плоскости, текущий зум сохраняется.
    setBase: function (w, h) {
      this.baseWidth = toNumber(w, this.baseWidth);
      this.baseHeight = toNumber(h, this.baseHeight);
      this.applyScale();
    },

    reset: function () {
      if (this.currentScale === 1) return;
      this.currentScale = 1;
      this.initialScale = 1;
      this.applyScale();
      this.el.emit('zoom-reset', null, false);
    },

    remove: function () {
      const sceneEl = this.el.sceneEl;
      if (sceneEl) {
        sceneEl.removeEventListener('render-target-loaded', this.bindCanvas);
        sceneEl.removeEventListener('loaded', this.bindCanvas);
      }
      const canvas = this.canvas;
      if (!canvas) return;
      canvas.removeEventListener('touchstart', this.onTouchStart);
      canvas.removeEventListener('touchmove', this.onTouchMove);
      canvas.removeEventListener('touchend', this.onTouchEnd);
      canvas.removeEventListener('dblclick', this.onDoubleClick);
      this.canvas = null;
    },

    _dist: function (a, b) {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
  });
}

// Шейдер ключа: none, luma, chroma плюс растушёвка краёв.
function registerKeyShader(AFRAME) {
  if (AFRAME.shaders && AFRAME.shaders['ml-key']) return;
  const THREE = getThree(AFRAME);

  AFRAME.registerShader('ml-key', {
    schema: {
      src: { type: 'map' },
      mode: { type: 'int', is: 'uniform', default: KEY_MODES.luma },
      threshold: { type: 'number', is: 'uniform', default: 0.1 },
      smoothing: { type: 'number', is: 'uniform', default: 0.1 },
      keyColor: { type: 'color', is: 'uniform', default: '#00ff00' },
      similarity: { type: 'number', is: 'uniform', default: 0.4 },
      smoothness: { type: 'number', is: 'uniform', default: 0.1 },
      spill: { type: 'number', is: 'uniform', default: 0.1 },
      feather: { type: 'number', is: 'uniform', default: 0.08 },
      // Множитель альфы для анимации появления. Отдельно от material.opacity,
      // чтобы не конфликтовать со схемой компонента material.
      fade: { type: 'number', is: 'uniform', default: 1 }
    },

    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,

    // Материал собираем сами: так текстура видео и типы униформ под нашим контролем.
    init: function (data) {
      this.uniforms = {
        src: { value: null },
        mode: { value: KEY_MODES.luma },
        threshold: { value: 0.1 },
        smoothing: { value: 0.1 },
        keyColor: { value: new THREE.Color('#00ff00') },
        similarity: { value: 0.4 },
        smoothness: { value: 0.1 },
        spill: { value: 0.1 },
        feather: { value: 0.08 },
        fade: { value: 1 }
      };
      this.textureSrc = undefined;
      this.ownTexture = null;

      this.material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      this.update(data);
      return this.material;
    },

    update: function (data) {
      const u = this.uniforms;
      if (!u) return;
      u.mode.value = toInt(data.mode, KEY_MODES.luma);
      u.threshold.value = toNumber(data.threshold, 0.1);
      u.smoothing.value = toNumber(data.smoothing, 0.1);
      u.similarity.value = toNumber(data.similarity, 0.4);
      u.smoothness.value = toNumber(data.smoothness, 0.1);
      u.spill.value = toNumber(data.spill, 0.1);
      u.feather.value = toNumber(data.feather, 0.08);
      u.fade.value = toNumber(data.fade, 1);
      if (data.keyColor !== undefined && data.keyColor !== null) {
        try { u.keyColor.value.set(data.keyColor); } catch (e) { /* мусорный цвет игнорируем */ }
      }
      this.updateSrc(data.src);
    },

    // Источник может быть элементом video/img/canvas (селектор #id уже разобран
    // A-Frame) либо строкой с адресом файла.
    updateSrc: function (src) {
      if (src === this.textureSrc) return;
      this.textureSrc = src;

      if (this.ownTexture) {
        this.ownTexture.dispose();
        this.ownTexture = null;
      }
      if (!src) {
        this.uniforms.src.value = null;
        return;
      }

      const THREE = getThree(globalThis.AFRAME);
      let texture;
      if (typeof src === 'string') {
        texture = new THREE.TextureLoader().load(src);
      } else if (src.tagName === 'VIDEO') {
        texture = new THREE.VideoTexture(src);
      } else {
        texture = new THREE.Texture(src);
        texture.needsUpdate = true;
        if (src.tagName === 'IMG' && !src.complete) {
          src.addEventListener('load', function () { texture.needsUpdate = true; }, { once: true });
        }
      }

      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      // Управление цветом: three r152+ использует colorSpace, старые сборки encoding.
      if ('colorSpace' in texture && THREE.SRGBColorSpace !== undefined) {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if (THREE.sRGBEncoding !== undefined) {
        texture.encoding = THREE.sRGBEncoding;
      }

      this.ownTexture = texture;
      this.uniforms.src.value = texture;
      if (this.material) this.material.needsUpdate = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Сцена
// ---------------------------------------------------------------------------

export class ARScene extends Emitter {
  constructor({ config, mount } = {}) {
    super();
    this.config = config || {};
    this.mount = mount || null;
    this.started = false;
    this.destroyed = false;

    this._startPromise = null;
    this._fadeRaf = 0;
    this._camError = null;
    this._restoreGum = null;

    this._onFound = () => { this.emit('found'); };
    this._onLost = () => { this.emit('lost'); };

    this._build();
  }

  // Сборка дерева сцены. Элементы создаются отдельно и попадают в DOM только в start.
  _build() {
    const cfg = this.config;
    const tracking = Object.assign({}, TRACKING_DEFAULTS, cfg.tracking || {});
    const stageCfg = Object.assign({}, STAGE_DEFAULTS, cfg.stage || {});
    const theme = cfg.theme || {};
    const accent = theme.accent || '#c8a050';
    const mind = (cfg.target && cfg.target.mind) || '';

    this.stageCfg = stageCfg;
    this.stageSize = stageSize(stageCfg, null);

    // a-scene
    const scene = document.createElement('a-scene');
    scene.setAttribute('mindar-image', [
      'imageTargetSrc: ' + mind,
      'maxTrack: 1',
      'filterMinCF: ' + tracking.filterMinCF,
      'filterBeta: ' + tracking.filterBeta,
      'warmupTolerance: ' + tracking.warmupTolerance,
      'missTolerance: ' + tracking.missTolerance,
      // Своё оформление, служебные экраны MindAR не нужны.
      'uiLoading: no',
      'uiScanning: no',
      'uiError: no'
    ].join('; '));
    scene.setAttribute('color-space', 'sRGB');
    scene.setAttribute('renderer', 'colorManagement: true');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
    scene.setAttribute('loading-screen', 'enabled: false');
    scene.setAttribute('embedded', '');

    // a-assets. Таймаут короткий: видео без источника иначе держит загрузку 3 секунды.
    const assets = document.createElement('a-assets');
    assets.setAttribute('timeout', '200');

    const video = document.createElement('video');
    video.id = IDS.video;
    video.setAttribute('muted', '');
    video.muted = true;
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('loop', '');
    video.setAttribute('preload', 'auto');
    video.setAttribute('crossorigin', 'anonymous');
    assets.appendChild(video);
    scene.appendChild(assets);

    // Камера без управления с устройства: позицию задаёт MindAR.
    const camera = document.createElement('a-camera');
    camera.setAttribute('position', '0 0 0');
    camera.setAttribute('look-controls', 'enabled: false');
    scene.appendChild(camera);

    // Таргет
    const target = document.createElement('a-entity');
    target.setAttribute('mindar-image-target', 'targetIndex: 0');
    target.setAttribute('smooth-track', [
      'factor: ' + tracking.smoothFactor,
      'posThreshold: ' + tracking.posThreshold,
      'rotThreshold: ' + tracking.rotThreshold
    ].join('; '));

    // Плоскость с видео
    const plane = document.createElement('a-plane');
    plane.id = IDS.stage;
    plane.setAttribute('material', this._materialData(stageCfg));
    plane.setAttribute('width', this.stageSize.w);
    plane.setAttribute('height', this.stageSize.h);
    plane.setAttribute('position', positionString(this.stageSize));
    plane.setAttribute('visible', 'false');
    plane.setAttribute('pinch-zoom', 'min: 0.5; max: 3');
    target.appendChild(plane);

    // Кольцо-лоадер
    const loader = document.createElement('a-ring');
    loader.id = IDS.loader;
    loader.setAttribute('radius-inner', '0.05');
    loader.setAttribute('radius-outer', '0.065');
    loader.setAttribute('theta-length', '270');
    loader.setAttribute('material', {
      shader: 'flat',
      color: accent,
      side: 'double',
      transparent: true,
      depthTest: false
    });
    loader.setAttribute('position', positionString(this.stageSize, 0.001));
    loader.setAttribute('animation', 'property: rotation; from: 0 0 0; to: 0 0 -360; dur: 1200; easing: linear; loop: true');
    loader.setAttribute('visible', 'false');
    target.appendChild(loader);

    scene.appendChild(target);

    target.addEventListener('targetFound', this._onFound);
    target.addEventListener('targetLost', this._onLost);

    this.el = scene;
    this.videoEl = video;
    this.cameraEl = camera;
    this.targetEl = target;
    this.stageEl = plane;
    this.loaderEl = loader;
  }

  // Данные материала плоскости из конфига сцены.
  _materialData(stageCfg) {
    const luma = stageCfg.luma || STAGE_DEFAULTS.luma;
    const chroma = stageCfg.chroma || STAGE_DEFAULTS.chroma;
    return {
      shader: 'ml-key',
      src: '#' + IDS.video,
      side: 'double',
      transparent: true,
      depthWrite: false,
      mode: modeToInt(stageCfg.key),
      threshold: toNumber(luma.threshold, 0.1),
      smoothing: toNumber(luma.smoothing, 0.1),
      keyColor: chroma.color || '#00ff00',
      similarity: toNumber(chroma.similarity, 0.4),
      smoothness: toNumber(chroma.smoothness, 0.1),
      spill: toNumber(chroma.spill, 0.1),
      feather: toNumber(stageCfg.feather, 0.08),
      fade: 1
    };
  }

  // Добавляет сцену в mount и ждёт готовности MindAR.
  // Резолвится по arReady. При ошибке камеры эмитит 'error' и реджектит промис
  // ошибкой с полем kind.
  start() {
    if (this._startPromise) return this._startPromise;
    if (this.destroyed) {
      return Promise.reject(new Error('[ml-ar] сцена уже уничтожена'));
    }
    const mount = this.mount || document.body;

    this._patchGetUserMedia();

    this._startPromise = new Promise((resolve, reject) => {
      const cleanup = () => {
        this.el.removeEventListener('arReady', onReady);
        this.el.removeEventListener('arError', onError);
        this._restoreGetUserMedia();
      };

      const onReady = () => {
        cleanup();
        this.started = true;
        this.emit('ready');
        resolve(this);
      };

      const onError = (evt) => {
        cleanup();
        const raw = this._camError || (evt && evt.detail && evt.detail.error) || null;
        const kind = classifyCameraError(raw);
        this.emit('error', { kind, error: raw });
        const err = new Error('[ml-ar] ' + kind);
        err.kind = kind;
        err.cause = raw;
        reject(err);
      };

      this.el.addEventListener('arReady', onReady);
      this.el.addEventListener('arError', onError);
      mount.appendChild(this.el);
    });

    return this._startPromise;
  }

  // Размер и положение плоскости в единицах таргета.
  setStageSize(size) {
    if (!size || this.destroyed) return;
    const s = Object.assign({}, this.stageSize, size);
    s.z = toNumber(s.z, 0.01);
    this.stageSize = s;

    this.stageEl.setAttribute('width', s.w);
    this.stageEl.setAttribute('height', s.h);
    this.stageEl.setAttribute('position', positionString(s));
    this.loaderEl.setAttribute('position', positionString(s, 0.001));

    // Базу зума тоже двигаем, иначе щипок вернёт старый размер.
    // До инициализации компонента этого не требуется: init сам прочитает атрибуты.
    const pinch = this.stageEl.components && this.stageEl.components['pinch-zoom'];
    if (pinch && pinch.initialized && pinch.setBase) pinch.setBase(s.w, s.h);
  }

  // mode: 'none' | 'luma' | 'chroma'.
  // params: {luma:{threshold, smoothing}, chroma:{color, similarity, smoothness, spill}, feather}.
  // Плоские параметры (threshold прямо в params) тоже принимаются.
  setKey(mode, params) {
    if (this.destroyed) return;
    const p = params || {};
    const luma = p.luma || p;
    const chroma = p.chroma || p;
    const patch = { mode: modeToInt(mode) };

    if (luma.threshold !== undefined) patch.threshold = toNumber(luma.threshold, 0.1);
    if (luma.smoothing !== undefined) patch.smoothing = toNumber(luma.smoothing, 0.1);
    if (chroma.color !== undefined) patch.keyColor = chroma.color;
    if (chroma.similarity !== undefined) patch.similarity = toNumber(chroma.similarity, 0.4);
    if (chroma.smoothness !== undefined) patch.smoothness = toNumber(chroma.smoothness, 0.1);
    if (chroma.spill !== undefined) patch.spill = toNumber(chroma.spill, 0.1);
    if (p.feather !== undefined) patch.feather = toNumber(p.feather, 0.08);

    this.stageEl.setAttribute('material', patch);
  }

  // Кольцо-лоадер поверх сцены.
  setLoading(on) {
    if (this.destroyed) return;
    this.loaderEl.setAttribute('visible', !!on);
  }

  // Показ или скрытие плоскости. При показе короткая анимация появления.
  setVisible(visible) {
    if (this.destroyed) return;
    this._cancelFade();

    if (!visible) {
      this.stageEl.setAttribute('visible', false);
      return;
    }

    this.stageEl.setAttribute('visible', true);

    if (prefersReducedMotion()) {
      this._applyAppear(1);
      return;
    }

    const start = now();
    this._applyAppear(0);
    const step = () => {
      if (this.destroyed) return;
      const t = Math.min(1, (now() - start) / APPEAR_MS);
      // easeOutCubic
      this._applyAppear(1 - Math.pow(1 - t, 3));
      if (t < 1) {
        this._fadeRaf = requestAnimationFrame(step);
      } else {
        this._fadeRaf = 0;
      }
    };
    this._fadeRaf = requestAnimationFrame(step);
  }

  // t от 0 до 1: масштаб 0.9 -> 1, прозрачность 0 -> 1.
  _applyAppear(t) {
    const k = 0.9 + 0.1 * t;
    const obj = this.stageEl.object3D;
    if (obj) obj.scale.set(k, k, k);
    const mesh = this.stageEl.getObject3D && this.stageEl.getObject3D('mesh');
    const uniforms = mesh && mesh.material && mesh.material.uniforms;
    if (uniforms && uniforms.fade) uniforms.fade.value = t;
  }

  _cancelFade() {
    if (this._fadeRaf) {
      cancelAnimationFrame(this._fadeRaf);
      this._fadeRaf = 0;
    }
  }

  // Ошибка getUserMedia не доезжает до arError, поэтому перехватываем её сами.
  _patchGetUserMedia() {
    const md = globalThis.navigator && navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function' || this._restoreGum) return;

    const original = md.getUserMedia;
    const hadOwn = Object.prototype.hasOwnProperty.call(md, 'getUserMedia');
    const self = this;

    const patched = function (constraints) {
      return original.call(md, constraints).catch(function (err) {
        self._camError = err;
        throw err;
      });
    };

    md.getUserMedia = patched;
    this._restoreGum = function () {
      if (md.getUserMedia !== patched) return;
      if (hadOwn) md.getUserMedia = original;
      else delete md.getUserMedia;
    };
  }

  _restoreGetUserMedia() {
    if (!this._restoreGum) return;
    try { this._restoreGum(); } catch (e) { /* нечего восстанавливать */ }
    this._restoreGum = null;
  }

  // Снимает слушатели, останавливает камеру и убирает сцену из DOM.
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._cancelFade();
    this._restoreGetUserMedia();

    if (this.targetEl) {
      this.targetEl.removeEventListener('targetFound', this._onFound);
      this.targetEl.removeEventListener('targetLost', this._onLost);
    }

    // MindAR держит свой video с камерой в родителе сцены, поэтому чистим и его.
    const sys = this.el && this.el.systems && this.el.systems['mindar-image-system'];
    if (sys) {
      try {
        if (typeof sys.stop === 'function') sys.stop();
      } catch (e) { /* MindAR мог не успеть стартовать */ }
      try {
        const stream = sys.video && sys.video.srcObject;
        if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop());
        if (sys.video && sys.video.parentNode) sys.video.parentNode.removeChild(sys.video);
      } catch (e) { /* видео камеры уже убрано */ }
    }

    try {
      if (this.videoEl) {
        this.videoEl.pause();
        this.videoEl.removeAttribute('src');
        this.videoEl.load();
      }
    } catch (e) { /* видео уже мертво */ }

    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.clear();
  }
}

// Создаёт сцену. mount это DOM-элемент, куда сцена попадёт при start().
export function createScene({ config, mount } = {}) {
  registerAll();
  return new ARScene({ config, mount });
}

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------

function getThree(AFRAME) {
  const THREE = globalThis.THREE || (AFRAME && AFRAME.THREE);
  if (!THREE) throw new Error('[ml-ar] THREE не найден');
  return THREE;
}

function toNumber(value, fallback) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback) {
  const n = toNumber(value, NaN);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function modeToInt(mode) {
  if (typeof mode === 'number') return toInt(mode, KEY_MODES.luma);
  return KEY_MODES[mode] !== undefined ? KEY_MODES[mode] : KEY_MODES.luma;
}

function positionString(size, dz) {
  const z = toNumber(size.z, 0.01) + (dz || 0);
  return toNumber(size.x, 0) + ' ' + toNumber(size.y, 0) + ' ' + z;
}

function classifyCameraError(err) {
  const name = (err && (err.name || err.code)) || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'camera-denied';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' ||
      name === 'DevicesNotFoundError' || name === 'ConstraintNotSatisfiedError') {
    return 'camera-unavailable';
  }
  return 'camera-error';
}

function prefersReducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

function now() {
  return (globalThis.performance && performance.now) ? performance.now() : Date.now();
}

export { KEY_MODES };
