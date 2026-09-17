/* ============================================================
   embers.js — 파티클 수렴 리빌 (⑨)
   제작 M09-2 · 사용 M06 · PD 확정 조건(D) 반영

   mountEmberReveal(imgEl, {
     count: 3500,            // 입자 수. ≤768px 에서는 1500 으로 자동 감산된다.
     color: '#E0A93B',       // 기준 금빛. 여기서 밝은/중간/어두운 3톤을 만들어 쓴다(금빛 외 색 없음).
     duration: 1300,         // 입자 이동 시간(ms). 크로스페이드를 더한 전체가 1800ms 를 넘지 않게 자동으로 깎인다.
     once: true,             // sessionStorage 로 세션당 1회만 재생(키는 이미지 src)
     fallback: false         // true 면 무조건 즉시 크로스페이드로 대체
   })

   동작
     1. imgEl 위에 캔버스를 겹친다(같은 위치·같은 크기).
     2. 이미지를 160×90 으로 다운샘플해 밝기 상위 픽셀을 타깃으로 잡는다.
     3. 금빛 입자가 화면 밖 무작위 지점에서 2차 베지어 궤적으로 타깃에 이징 수렴한다.
     4. 전부 도착하면 캔버스 페이드아웃 · 이미지 페이드인(0.4초) 후 캔버스를 제거한다.
     5. IntersectionObserver 로 화면에 들어올 때 1회만 실행.

   즉시 크로스페이드로 대체하는 경우(파티클을 아예 돌리지 않는다)
     · prefers-reduced-motion: reduce
     · navigator.hardwareConcurrency ≤ 4 (저사양 단말에서 프레임이 무너지느니 안 돌린다)
     · opts.fallback === true
     · once:true 인데 이미 이번 세션에 재생한 이미지

   의존성 없음. ES 모듈이 아니라 전역 함수라 file:// 에서 그대로 돌아간다.
   <script src="_snippets/embers.js"></script> 로 불러 window.mountEmberReveal 로 쓴다.

   ⚠ file:// 제약 — 브라우저는 file:// 이미지를 캔버스에 그리면 보안상 픽셀 읽기를 막는다.
     이때는 밝기 샘플링을 못 하므로 중앙 가중 분포를 타깃으로 쓰는 폴백으로 자동 전환한다
     (연출은 그대로, 형상만 이미지 윤곽을 따르지 않는다). http(s) 로 서빙하면 정상 동작한다.
     반환 객체의 .sampled 로 어느 쪽인지 알 수 있다.
   ============================================================ */
(function (global) {
  'use strict';

  var SAMPLE_W = 160, SAMPLE_H = 90;   /* 다운샘플 격자 — count 의 4배 정도 후보를 만든다 */
  var MOBILE_BP = 768, MOBILE_MAX = 1500;
  var DPR_MAX = 1.5;                   /* PD 확정: devicePixelRatio 1.5 상한 */
  var FADE_MS = 400;                   /* 크로스페이드 */
  var MAX_TOTAL = 1800;                /* PD 확정: 전체 길이 상한 */
  var MIN_CORES = 4;                   /* 이하면 파티클을 돌리지 않는다 */

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function mix(c, amt) {   /* amt>0 밝게, amt<0 어둡게 — 색상은 유지되므로 금빛 계열을 벗어나지 않는다 */
    var t = amt > 0 ? 255 : 0, a = Math.abs(amt);
    return { r: Math.round(c.r + (t - c.r) * a), g: Math.round(c.g + (t - c.g) * a), b: Math.round(c.b + (t - c.b) * a) };
  }
  function rgba(c, a) { return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }

  /* 입자를 매 프레임 arc() 로 그리면 느리다. 톤별 글로우 스프라이트를 한 번 만들어 drawImage 한다. */
  function makeSprite(tone) {
    var S = 16, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, rgba(mix(tone, 0.5), 1));
    grd.addColorStop(0.35, rgba(tone, 0.85));
    grd.addColorStop(1, rgba(tone, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return c;
  }

  /* 이미지 밝기 상위 픽셀을 타깃으로 뽑는다. 픽셀을 못 읽으면 null 을 돌려준다(폴백 신호). */
  function sampleTargets(img, count) {
    var c = document.createElement('canvas');
    c.width = SAMPLE_W; c.height = SAMPLE_H;
    var g = c.getContext('2d', { willReadFrequently: true });
    var data;
    try {
      g.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
      data = g.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;   /* file:// 에서 여기서 막힌다 */
    } catch (e) {
      return null;
    }
    var px = [];
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] < 8) continue;
      var lum = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      px.push({ x: p % SAMPLE_W, y: (p / SAMPLE_W) | 0, l: lum });
    }
    if (!px.length) return null;
    px.sort(function (a, b) { return b.l - a.l; });
    var out = [], n = Math.min(count, px.length);
    for (var k = 0; k < count; k++) {
      var s = px[k < n ? k : (Math.random() * n) | 0];   /* 후보가 모자라면 상위에서 재추출 */
      out.push({ gx: s.x, gy: s.y, l: s.l });
    }
    return out;
  }

  /* 폴백 — 중앙이 촘촘한 분포. 이미지 윤곽은 못 따르지만 연출은 유지된다. */
  function fallbackTargets(count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = Math.pow(Math.random(), 0.65) * 0.5;
      out.push({
        gx: (0.5 + Math.cos(a) * r * 1.7) * SAMPLE_W,
        gy: (0.5 + Math.sin(a) * r) * SAMPLE_H,
        l: 0.45 + Math.random() * 0.55
      });
    }
    return out;
  }

  function sessionKey(imgEl) { return 'ember:' + (imgEl.getAttribute('src') || 'default'); }
  function seenThisSession(k) { try { return global.sessionStorage.getItem(k) === '1'; } catch (e) { return false; } }
  function markSession(k) { try { global.sessionStorage.setItem(k, '1'); } catch (e) {} }

  function mountEmberReveal(imgEl, opts) {
    if (!imgEl || imgEl.__emberMounted) return null;
    imgEl.__emberMounted = true;
    opts = opts || {};

    var state = { sampled: false, fallback: false, started: false, count: 0, duration: 0, total: 0 };

    /* ---- 즉시 크로스페이드로 대체할 조건들 ---- */
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cores = global.navigator && global.navigator.hardwareConcurrency;
    var lowEnd = typeof cores === 'number' && cores <= MIN_CORES;
    var key = sessionKey(imgEl);
    var repeat = opts.once === true && seenThisSession(key);

    if (opts.fallback === true || reduce || lowEnd || repeat) {
      state.fallback = true;
      state.reason = opts.fallback === true ? 'option' : reduce ? 'reduced-motion' : lowEnd ? 'low-end' : 'once';
      /* 이미 보이는 이미지를 굳이 깜빡이지 않는다 — 숨겨져 있을 때만 페이드인한다 */
      if (global.getComputedStyle(imgEl).opacity !== '1') {
        imgEl.style.transition = 'opacity ' + FADE_MS + 'ms ease';
      }
      imgEl.style.opacity = '1';
      return state;
    }

    var count = opts.count || 3500;
    if (global.innerWidth <= MOBILE_BP) count = Math.min(count, MOBILE_MAX);
    /* 크로스페이드를 포함한 전체가 MAX_TOTAL 을 넘지 않게 이동 시간을 깎는다 */
    var travel = Math.min(opts.duration || 1300, MAX_TOTAL - FADE_MS);
    state.count = count; state.duration = travel; state.total = travel + FADE_MS;

    var base = hexToRgb(opts.color || '#E0A93B');
    var sprites = [makeSprite(mix(base, 0.45)), makeSprite(base), makeSprite(mix(base, -0.32))];

    /* 캔버스를 이미지 위에 겹친다. 부모가 static 이면 relative 로 올린다(최소 개입). */
    var host = imgEl.parentNode;
    if (global.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;pointer-events:none;z-index:2;opacity:1';
    var ctx = canvas.getContext('2d');

    function layout() {
      var dpr = Math.min(global.devicePixelRatio || 1, DPR_MAX);
      var w = imgEl.offsetWidth, h = imgEl.offsetHeight;
      canvas.style.left = imgEl.offsetLeft + 'px';
      canvas.style.top = imgEl.offsetTop + 'px';
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: w, h: h };
    }

    var particles = null, size = null, t0 = 0, raf = 0;

    function build() {
      size = layout();
      var targets = sampleTargets(imgEl, count);
      state.sampled = !!targets;
      if (!targets) targets = fallbackTargets(count);

      particles = new Array(count);
      var W = size.w, H = size.h, diag = Math.sqrt(W * W + H * H);
      for (var i = 0; i < count; i++) {
        var t = targets[i];
        var tx = (t.gx + Math.random()) / SAMPLE_W * W;    /* 격자 티 안 나게 셀 안에서 흔든다 */
        var ty = (t.gy + Math.random()) / SAMPLE_H * H;
        var a = Math.random() * Math.PI * 2;
        var sx = W / 2 + Math.cos(a) * diag * (0.62 + Math.random() * 0.5);
        var sy = H / 2 + Math.sin(a) * diag * (0.62 + Math.random() * 0.5);
        var mx = (sx + tx) / 2, my = (sy + ty) / 2;
        var nx = -(ty - sy), ny = (tx - sx), nl = Math.hypot(nx, ny) || 1;
        var bow = (Math.random() - 0.5) * diag * 0.35;
        /* 출발 지연 + 개별 속도. 마지막 입자도 travel 안에 반드시 도착한다. */
        var d = Math.random() * travel * 0.25;
        particles[i] = {
          sx: sx, sy: sy, tx: tx, ty: ty,
          cx: mx + nx / nl * bow, cy: my + ny / nl * bow,
          d: d, dur: (travel - d) * (0.82 + Math.random() * 0.18),
          l: t.l,
          sp: t.l > 0.62 ? 0 : (t.l > 0.34 ? 1 : 2)        /* 밝은 타깃일수록 밝은 톤 */
        };
      }
    }

    function frame(now) {
      if (!t0) t0 = now;
      var el = now - t0;

      /* 전 프레임을 지우지 않고 알파만 깎아 잔상을 남긴다(투명도 유지) */
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var t = (el - p.d) / p.dur;
        if (t <= 0) continue;
        if (t > 1) t = 1;
        var e = 1 - Math.pow(1 - t, 3);                 /* easeOutCubic */
        var u = 1 - e;
        var x = u * u * p.sx + 2 * u * e * p.cx + e * e * p.tx;
        var y = u * u * p.sy + 2 * u * e * p.cy + e * e * p.ty;
        var s = (2.6 - 1.5 * e) * (0.6 + p.l * 0.7);    /* 다가갈수록 작아지며 앉는다 */
        ctx.globalAlpha = Math.min(1, 0.25 + p.l * 0.9) * (t < 0.12 ? t / 0.12 : 1);
        ctx.drawImage(sprites[p.sp], x - s, y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (el < travel) { raf = global.requestAnimationFrame(frame); return; }
      finish();
    }

    function finish() {
      imgEl.style.transition = 'opacity ' + FADE_MS + 'ms ease';
      canvas.style.transition = 'opacity ' + FADE_MS + 'ms ease';
      imgEl.style.opacity = '1';
      canvas.style.opacity = '0';
      global.setTimeout(function () {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }, FADE_MS + 20);
    }

    function start() {
      if (state.started) return;
      state.started = true;
      if (opts.once === true) markSession(key);
      imgEl.style.opacity = '0';
      host.insertBefore(canvas, imgEl.nextSibling);
      build();
      raf = global.requestAnimationFrame(frame);
    }

    if (!('IntersectionObserver' in global)) {
      imgEl.style.opacity = '1';   /* 관찰자가 없으면 연출보다 콘텐츠가 우선이다 */
      state.fallback = true; state.reason = 'no-io';
      return state;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          if (imgEl.complete) start();
          else imgEl.addEventListener('load', start, { once: true });
          return;
        }
      }
    }, { threshold: 0.25 });
    io.observe(imgEl);

    state.stop = function () { if (raf) global.cancelAnimationFrame(raf); io.disconnect(); };
    return state;
  }

  global.mountEmberReveal = mountEmberReveal;
})(window);
