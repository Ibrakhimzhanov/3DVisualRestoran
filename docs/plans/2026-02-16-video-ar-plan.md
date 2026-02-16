# Video AR Implementation Plan

> **For Claude:** REQUIRED: Use /superpower-execute-plan to implement this plan task-by-task.

**Goal:** Replace the 3D GLB model with a flat video plane in AR that auto-plays when the image marker is detected.

**Architecture:** Single-file change to `index.html`. Replace `<a-gltf-model>` with `<a-plane>` using HTML5 `<video>` as texture. A-Frame component `video-handler` manages play/pause lifecycle tied to MindAR's `targetFound`/`targetLost` events. Sound toggle button is a plain HTML overlay.

**Tech Stack:** A-Frame 1.5.0, MindAR 1.2.5 (existing), HTML5 Video API

---

### Task 1: Remove old 3D model components

**Files:**
- Modify: `index.html:9-100` (script block)
- Modify: `index.html:159-161` (lights)
- Modify: `index.html:163-165` (assets)
- Modify: `index.html:169-177` (model entity)

**Step 1: Remove `gesture-handler` and `appear-animation` components**

In `index.html`, replace the entire `<script>` block (lines 9-101) with a new empty script block. We'll fill it in Task 2.

Replace lines 9-101 with:

```html
  <script>
    // Video handler: auto-play/pause tied to marker detection
  </script>
```

**Step 2: Remove lights (not needed for flat video)**

Delete these 3 lines (159-161):

```html
    <a-light type="ambient" intensity="1.2"></a-light>
    <a-light type="directional" intensity="1.0" position="0 5 3"></a-light>
    <a-light type="directional" intensity="0.4" position="0 -2 -1"></a-light>
```

**Step 3: Replace `<a-assets>` GLB with video element**

Replace lines 163-165:

```html
    <a-assets>
      <a-asset-item id="dish-0" src="./Chicken.glb"></a-asset-item>
    </a-assets>
```

With:

```html
    <a-assets>
      <video id="video-src" src="./video.mp4" muted autoplay playsinline loop crossorigin="anonymous"></video>
    </a-assets>
```

**Step 4: Replace `<a-gltf-model>` with `<a-plane>`**

Replace lines 169-177:

```html
    <a-entity mindar-image-target="targetIndex: 0">
      <a-gltf-model
        src="#dish-0"
        position="0 0 0.2"
        rotation="0 180 0"
        appear-animation="targetScale: 10 10 10; duration: 1000"
        gesture-handler>
      </a-gltf-model>
    </a-entity>
```

With:

```html
    <a-entity mindar-image-target="targetIndex: 0">
      <a-plane
        id="video-plane"
        src="#video-src"
        material="shader: flat"
        width="1.6"
        height="0.9"
        position="0 0.5 0"
        video-handler>
      </a-plane>
    </a-entity>
```

Key notes:
- `shader: flat` — no lighting needed for video, ensures colors are accurate
- `width: 1.6, height: 0.9` — 16:9 aspect ratio
- `position: 0 0.5 0` — floating above the marker center

**Step 5: Commit**

```bash
git add index.html
git commit -m "Replace 3D model with video plane in AR scene"
```

---

### Task 2: Add video-handler A-Frame component

**Files:**
- Modify: `index.html` — the `<script>` block from Task 1

**Step 1: Write the `video-handler` component**

Replace the placeholder `<script>` from Task 1 with:

```html
  <script>
    AFRAME.registerComponent('video-handler', {
      init: function () {
        const video = document.querySelector('#video-src');
        const target = this.el.closest('[mindar-image-target]');
        this.el.setAttribute('visible', false);

        if (target) {
          target.addEventListener('targetFound', () => {
            this.el.setAttribute('visible', true);
            video.play().catch(() => {});
          });

          target.addEventListener('targetLost', () => {
            this.el.setAttribute('visible', false);
            video.pause();
          });
        }
      }
    });
  </script>
```

Key notes:
- `video.play().catch(() => {})` — catches autoplay promise rejection on iOS (expected)
- `visible: false` by default — plane hidden until marker found
- On `targetLost` — pause video, hide plane

**Step 2: Commit**

```bash
git add index.html
git commit -m "Add video-handler component for play/pause on marker detect"
```

---

### Task 3: Add sound toggle button

**Files:**
- Modify: `index.html` — CSS styles and HTML body

**Step 1: Add CSS for the sound button**

Add this CSS after the existing `#dish-name` styles (after line ~137):

```css
    #sound-btn {
      position: fixed; bottom: 30px; right: 20px;
      width: 50px; height: 50px;
      background: rgba(0,0,0,0.7); color: white;
      border: none; border-radius: 50%;
      font-size: 22px; z-index: 100;
      display: none; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
```

**Step 2: Add the button HTML**

Add after the `<div id="dish-name"></div>` line:

```html
  <button id="sound-btn">🔇</button>
```

**Step 3: Add sound toggle logic in the bottom `<script>`**

In the existing bottom `<script>` block (lines 181-205), replace the entire block with:

```html
  <script>
    const video = document.querySelector('#video-src');
    const soundBtn = document.getElementById('sound-btn');
    const scene = document.querySelector('a-scene');
    const hint = document.getElementById('hint');
    const dishName = document.getElementById('dish-name');

    scene.addEventListener('arReady', () => {
      document.getElementById('loading').style.display = 'none';
    });

    soundBtn.addEventListener('click', () => {
      video.muted = !video.muted;
      soundBtn.textContent = video.muted ? '🔇' : '🔊';
    });

    document.querySelectorAll('[mindar-image-target]').forEach((target) => {
      target.addEventListener('targetFound', () => {
        dishName.textContent = 'AR Видео';
        dishName.style.display = 'block';
        hint.style.display = 'none';
        soundBtn.style.display = 'block';
      });

      target.addEventListener('targetLost', () => {
        dishName.style.display = 'none';
        hint.style.display = 'block';
        soundBtn.style.display = 'none';
      });
    });
  </script>
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "Add mute/unmute sound toggle button for AR video"
```

---

### Task 4: Final verification and cleanup

**Files:**
- Verify: `index.html` (complete file)

**Step 1: Verify the complete file structure**

The final `index.html` should have this structure:
1. `<head>` — meta, title, A-Frame + MindAR scripts
2. `<script>` — `video-handler` component only (no gesture-handler, no appear-animation)
3. `<style>` — loading, hint, dish-name, sound-btn
4. `<body>`:
   - `#loading` div
   - `#hint` div
   - `#dish-name` div
   - `#sound-btn` button
   - `<a-scene>` with:
     - `<a-assets>` containing `<video>` (not GLB)
     - `<a-camera>`
     - `<a-entity mindar-image-target>` containing `<a-plane>` (not `<a-gltf-model>`)
   - Bottom `<script>` with arReady, sound toggle, targetFound/Lost UI

**Step 2: Verify video.mp4 is not in .gitignore**

Check `.gitignore` — if `video.mp4` is listed or matched by a pattern, remove it. The file must be served alongside `index.html`.

**Step 3: Test plan (manual)**

1. Deploy to HTTPS server (AR camera requires HTTPS)
2. Open on phone
3. Point camera at the marker image (image.png)
4. Expected: video plane appears floating above marker, video auto-plays muted
5. Tap 🔇 button — sound should turn on, icon changes to 🔊
6. Move camera away from marker — video pauses, plane hides, button hides
7. Point back at marker — video resumes

**Step 4: Add nginx MIME type for mp4 (if needed on server)**

Ensure the server serves `.mp4` with correct Content-Type. Add to nginx config if not present:

```nginx
location ~* \.mp4$ {
    add_header Content-Type video/mp4;
    add_header Access-Control-Allow-Origin *;
}
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "AR video: replace 3D model with video playback on marker"
```

---

## Expected Final `index.html`

For reference, here is the complete expected file after all tasks:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>AR Меню</title>
  <script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
  <script>
    AFRAME.registerComponent('video-handler', {
      init: function () {
        const video = document.querySelector('#video-src');
        const target = this.el.closest('[mindar-image-target]');
        this.el.setAttribute('visible', false);

        if (target) {
          target.addEventListener('targetFound', () => {
            this.el.setAttribute('visible', true);
            video.play().catch(() => {});
          });

          target.addEventListener('targetLost', () => {
            this.el.setAttribute('visible', false);
            video.pause();
          });
        }
      }
    });
  </script>
  <style>
    body { margin: 0; overflow: hidden; }

    #loading {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); z-index: 9999;
      display: flex; flex-direction: column;
      justify-content: center; align-items: center;
      color: white; font-family: -apple-system, sans-serif;
    }
    #loading h2 { font-size: 20px; margin-bottom: 10px; }
    #loading p { font-size: 14px; color: #aaa; text-align: center; padding: 0 30px; }
    .spinner {
      width: 40px; height: 40px; margin-bottom: 20px;
      border: 4px solid rgba(255,255,255,0.2);
      border-top: 4px solid #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    #hint {
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); color: white;
      padding: 12px 24px; border-radius: 25px;
      font-family: -apple-system, sans-serif; font-size: 14px;
      z-index: 100; text-align: center;
    }

    #dish-name {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.7); color: white;
      padding: 8px 20px; border-radius: 20px;
      font-family: -apple-system, sans-serif; font-size: 16px; font-weight: 600;
      z-index: 100; display: none;
    }

    #sound-btn {
      position: fixed; bottom: 30px; right: 20px;
      width: 50px; height: 50px;
      background: rgba(0,0,0,0.7); color: white;
      border: none; border-radius: 50%;
      font-size: 22px; z-index: 100;
      display: none; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
  </style>
</head>
<body>

  <div id="loading">
    <div class="spinner"></div>
    <h2>AR Меню загружается...</h2>
    <p>Разрешите доступ к камере</p>
  </div>

  <div id="hint">Наведите камеру на меню</div>
  <div id="dish-name"></div>
  <button id="sound-btn">🔇</button>

  <a-scene
    mindar-image="imageTargetSrc: ./targets.mind; maxTrack: 1; filterMinCF: 0.1; filterBeta: 10;"
    color-space="sRGB"
    renderer="colorManagement: true;"
    vr-mode-ui="enabled: false"
    device-orientation-permission-ui="enabled: false"
    loading-screen="enabled: false">

    <a-assets>
      <video id="video-src" src="./video.mp4" muted autoplay playsinline loop crossorigin="anonymous"></video>
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

    <a-entity mindar-image-target="targetIndex: 0">
      <a-plane
        id="video-plane"
        src="#video-src"
        material="shader: flat"
        width="1.6"
        height="0.9"
        position="0 0.5 0"
        video-handler>
      </a-plane>
    </a-entity>

  </a-scene>

  <script>
    const video = document.querySelector('#video-src');
    const soundBtn = document.getElementById('sound-btn');
    const scene = document.querySelector('a-scene');
    const hint = document.getElementById('hint');
    const dishName = document.getElementById('dish-name');

    scene.addEventListener('arReady', () => {
      document.getElementById('loading').style.display = 'none';
    });

    soundBtn.addEventListener('click', () => {
      video.muted = !video.muted;
      soundBtn.textContent = video.muted ? '🔇' : '🔊';
    });

    document.querySelectorAll('[mindar-image-target]').forEach((target) => {
      target.addEventListener('targetFound', () => {
        dishName.textContent = 'AR Видео';
        dishName.style.display = 'block';
        hint.style.display = 'none';
        soundBtn.style.display = 'block';
      });

      target.addEventListener('targetLost', () => {
        dishName.style.display = 'none';
        hint.style.display = 'block';
        soundBtn.style.display = 'none';
      });
    });
  </script>

</body>
</html>
```
