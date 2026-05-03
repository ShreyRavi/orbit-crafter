# OrbitCraft Design System

> **Aesthetic:** Mission Control Readout — not photorealistic space, but the mathematical structure of space.
> Precision instrumentation. Dark void. Bodies as radiating point sources.

---

## Scope

Canvas-only app. No web UI components. Design system covers:

- Background / canvas surface
- Body glow palette (star / planet / moon)
- Trail colors
- HUD typography + chrome (pills, readout panels)
- Interaction overlays (hover ring, drag vector, ghost body, collision pulse)
- Error banner

Desktop-only. No mobile breakpoints.

---

## Color Tokens

```css
--bg:             #050a14;             /* deep navy void, canvas fill */
--glow-star:      #FFF5E0;             /* warm white — O/B stellar */
--glow-planet:    #C0D8FF;             /* cool blue-white */
--glow-moon:      #8899AA;             /* blue-gray, dimmer */

--text-primary:   rgba(255,255,255,0.70);
--text-dim:       rgba(255,255,255,0.45);

--hud-bg:         rgba(0,0,0,0.50);    /* pill + panel fills */

--overlay-ring:   rgba(255,255,255,0.60);  /* hover selection ring */
--overlay-vector: rgba(255,255,255,0.70);  /* drag velocity arrow */
--overlay-ghost:  rgba(255,255,255,0.40);  /* placement ghost body */
```

### Glow Rendering

Bodies render with `ctx.globalCompositeOperation = 'lighter'` (additive blend). Three layers per body:

```
core     — sharp bright disk at body.radius
mid-glow — radial gradient to 3× radius, 18% alpha peak
outer    — radial gradient to 8× radius, 6% alpha peak
```

Canvas background must be cleared to `--bg` each frame before drawing (no `clearRect` + transparent — must fill with `#050a14` to reset additive accumulation).

---

## Typography

**Font:** Geist Mono (Google Fonts)
**Fallback:** monospace

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
--font-mono:      'Geist Mono', monospace;
--font-size-hud:  13px;
--font-size-hint: 14px;
```

All HUD readouts use `font-variant-numeric: tabular-nums` so values don't jitter as digits change width.

**Do not use Courier New.** Courier New is a typewriter face with uneven stroke weight — wrong for precision instrumentation readouts.

---

## Spacing

```css
--base-unit: 8px;
```

All padding, gap, and margin values are multiples of 8px.

---

## HUD Pill

Corner readout panels (body count, time, speed).

```css
.hud-pill {
  position: absolute;
  font-family: var(--font-mono);
  font-size: var(--font-size-hud);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  background: var(--hud-bg);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  padding: 8px 12px;
  line-height: 1.6;
  pointer-events: none;
  user-select: none;
}
```

Position: top-left, 16px inset from canvas edge.

Label text uses `--text-dim`. Value text uses `--text-primary`.

---

## Interaction Overlays (Canvas 2D)

Overlays draw on the same canvas, on top of body glow.

| Overlay | When | Style |
|---|---|---|
| Hover ring | `hoveredIndex ≥ 0` | Circle at `body.radius + 4px`, `--overlay-ring`, lineWidth 1 |
| Drag vector | Dragging body | Arrow from body center to projected position, `--overlay-vector`, lineWidth 1.5 |
| Ghost body | Mouse button held before release | Semi-transparent disk + cross-hair, `--overlay-ghost` |
| Collision pulse | On merge | White ring expanding from merge point, fades over 12 frames |

Overlays use `ctx.globalCompositeOperation = 'source-over'` (not additive) so they remain legible against bright star cores.

---

## Error Banner

Shown when WebGPU is unavailable.

```css
.error-banner {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #050a14;
  font-family: 'Geist Mono', monospace;
  color: rgba(255,255,255,0.70);
  font-size: 14px;
  line-height: 2;
  text-align: center;
}

.error-banner .error-code {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  margin-top: 16px;
  font-variant-numeric: tabular-nums;
}
```

---

## Trail Rendering

Trails are stored as a ring buffer of `TRAIL_BUFFER_LENGTH = 300` positions per body.

Render oldest → newest with decreasing alpha:

```
opacity = (i / TRAIL_BUFFER_LENGTH) * 0.4   // 0 at tail, 0.4 at head
```

Trail color matches body glow color. lineWidth: 1px.

---

## Canvas Setup

```typescript
canvas.width  = window.innerWidth  * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
canvas.style.width  = window.innerWidth  + 'px';
canvas.style.height = window.innerHeight + 'px';
ctx.scale(devicePixelRatio, devicePixelRatio);
```

Repeat in `resize` handler (debounced 100ms). Failure to set DPR causes blurry bodies on Retina/HiDPI.

---

## Keyboard Hint Row

Single row of key labels at bottom-center of canvas (drawn in canvas 2D, not DOM).

```
[Click] Add body   [Drag] Move   [Delete] Remove   [Space] Pause   [.] Step   [Scroll] Zoom
```

Font: `--font-mono` at `--font-size-hint`. Color: `--text-dim`. Fade out 3s after last input event.

---

## Decisions (for future reference)

| Decision | Choice | Why |
|---|---|---|
| Font | Geist Mono | Consistent stroke weight, open apertures, legible at 13px |
| Glow blend | `lighter` (additive) | Physically accurate light accumulation, no hard edges |
| HUD chrome | Dark pill + blur | Low visual weight, doesn't compete with simulation |
| Canvas background | Fill `#050a14` each frame | Additive blend requires opaque reset, not clearRect |
| Overlays composite | `source-over` | Hover ring must read against bright star, additive would wash out |
| Trail opacity | Linear fade 0→0.4 | Communicates direction; bright tail would compete with body |
| Mobile | Not supported | Canvas interaction model (hover/drag) requires mouse precision |
