/* stack.js — 섹션 전환 v13 "패럴랙스 리빌" (공용, 2026-09-22, Justin A안 → 경량화)
   PC(≥1024)에서 스크롤로 섹션 경계를 지날 때:
   (1) 앞 섹션은 스크롤의 절반 속도로 밀려 올라가며 어두워진다(패럴랙스)
   (2) 뒤 섹션은 그대로 올라와 앞을 덮는다(문서 순서 = 그리기 순서, z-index 순차 부여). 덮으려면 뒤 섹션이 불투명해야 하므로
       배경이 투명한 섹션에는 잉크 배경을 인라인으로 준다(정지 화면은 body 와 같은 잉크라 픽셀 동일)
   v16(2026-09-22): 되감기 끝(t→0)에 막 opacity 를 ''(=1) 로 지우던 결함 수정 → '0'.
   v13 경량화(Justin "PC 가 느려진다"): 어두워짐을 filter:brightness()(섹션 전체 재래스터화) 대신 섹션 위 잉크 막(.stk-veil)의 opacity 로 —
   합성만 일어나 비용이 수십 분의 일. scale() 제거. 섹션 타이틀 스태거 제거(Justin "나타나기 연출 불필요"). 히어로가 밀려 올라가는 동안 배경 영상 일시정지.
   전부 스크롤 위치에 묶여 역스크롤이면 자동으로 되감긴다. 전환 구간 = 뒤 섹션 머리가 화면 아래(100vh)에서 화면 위(0)에 닿기까지.
   구간 밖에서는 인라인 스타일을 전부 지워 지금과 픽셀 동일 → 캡처(html[data-shot])·검수 불변.
   갱신은 scroll·resize 이벤트에 rAF 1회 — 상시 루프 없음. will-change 는 전환 중인 섹션에만.
   끄는 조건: <1024 · prefers-reduced-motion · html[data-shot](캡처) · 모달 열림(is-modal-open) — 속성 변화는 MutationObserver 로 감지.
   사용: 페이지 끝에 <script src="_snippets/stack.js" defer></script> 한 줄(chrome.js 뒤). 페이지별 설정 없음. */
(function () {
  var doc = document, win = window, root = doc.documentElement;
  var CFG = { parallax: .5, dim: .35 };
  var MQ = '(min-width: 1024px)';
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var secs = [].slice.call(doc.querySelectorAll('section[data-slot]'));
  if (secs.length < 2) return;
  var veils = [], vh = win.innerHeight, active = false, raf = 0, dirty = false;
  var heroVideo = secs[0].querySelector('video'), heroPaused = false;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function transparent(el) { var c = win.getComputedStyle(el).backgroundColor; return c === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(c); }
  function paused() { return root.hasAttribute('data-shot') || root.classList.contains('is-modal-open') || doc.body.classList.contains('is-modal-open'); }
  function heroPlay() { if (heroPaused && heroVideo) { heroPaused = false; try { heroVideo.play(); } catch (e) {} } }
  function heroPause() { if (!heroPaused && heroVideo && !heroVideo.paused) { heroPaused = true; try { heroVideo.pause(); } catch (e) {} } }

  function clearSec(s, i) {
    s.style.transform = ''; s.style.willChange = '';
    if (veils[i]) { veils[i].style.opacity = '0'; veils[i].style.willChange = ''; }   /* v16: '' 로 지우면 인라인 opacity:0 까지 사라져 계산값 1 → 되감기 끝에 섹션이 검게 덮였다(Justin 2026-09-22) */
  }
  function clear() { secs.forEach(clearSec); heroPlay(); }

  function render() {
    raf = 0;
    if (!active) return;
    if (paused()) { if (dirty) { clear(); dirty = false; } return; }
    var y = win.pageYOffset || root.scrollTop || 0, any = false;
    for (var i = 0; i < secs.length - 1; i++) {
      var a = secs[i], b = secs[i + 1];
      var end = b.offsetTop, start = end - vh;              /* offsetTop 은 transform 에 영향받지 않는다 */
      var t = clamp((y - start) / vh, 0, 1);
      if (t <= 0 || t >= 1) {
        if (a.style.transform) clearSec(a, i);
        if (i === 0 && t <= 0) heroPlay();
        continue;
      }
      any = true;
      a.style.willChange = 'transform';
      a.style.transform = 'translateY(' + (CFG.parallax * vh * t).toFixed(1) + 'px)';
      if (veils[i]) { veils[i].style.willChange = 'opacity'; veils[i].style.opacity = (CFG.dim * t).toFixed(3); }
      if (i === 0) heroPause();                              /* 히어로가 밀려 올라가는 동안 영상 디코드를 멈춘다 */
    }
    dirty = any;
  }
  function schedule() { if (!raf) raf = win.requestAnimationFrame(render); }

  function start() {
    if (active) return; active = true;
    secs.forEach(function (s, i) {
      s.style.position = 'relative'; s.style.zIndex = String(10 + i);
      if (transparent(s)) { s.style.backgroundColor = 'var(--ink, #07070B)'; s.setAttribute('data-stk-bg', ''); }   /* 덮는 섹션은 불투명해야 한다 */
      if (i < secs.length - 1 && !veils[i]) {                /* 마지막 섹션은 덮이지 않으므로 막 불필요 */
        var v = doc.createElement('i'); v.className = 'stk-veil'; v.setAttribute('aria-hidden', 'true');
        v.style.cssText = 'position:absolute;inset:0;background:#07070B;opacity:0;pointer-events:none;z-index:9';
        s.appendChild(v); veils[i] = v;
      }
    });
    schedule();
  }
  function stop() {
    active = false; if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
    clear(); dirty = false;
    secs.forEach(function (s, i) { s.style.zIndex = ''; s.style.position = ''; if (s.hasAttribute('data-stk-bg')) { s.style.backgroundColor = ''; s.removeAttribute('data-stk-bg'); }
      if (veils[i]) { veils[i].remove(); veils[i] = null; } });
  }
  function check() { if (win.matchMedia(MQ).matches) start(); else stop(); }

  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', function () { vh = win.innerHeight; check(); schedule(); });
  win.addEventListener('load', schedule);
  if ('MutationObserver' in win) {
    new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-shot', 'class'] });
    new MutationObserver(schedule).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  }
  check();
})();
