/* stack.js — 섹션 전환 v11 "패럴랙스 리빌 + 스태거 인" (공용, 2026-09-22, Justin A안)
   PC(≥1024)에서 스크롤로 섹션 경계를 지날 때:
   (1) 앞 섹션은 스크롤의 절반 속도로 밀려 올라가며 어두워지고 살짝 줄어든다(패럴랙스)
   (2) 뒤 섹션은 그대로 올라와 앞을 덮는다(문서 순서 = 그리기 순서, z-index 순차 부여). 덮으려면 뒤 섹션이 불투명해야 하므로
       배경이 투명한 섹션에는 잉크 배경을 인라인으로 준다(정지 화면은 body 와 같은 잉크라 픽셀 동일)
   (3) 뒤 섹션 머리(.sec__head 직계 자식)가 소제목 → 제목 → 서브 순으로 시차를 두고 떠오른다(스태거)
   전부 스크롤 위치에 묶여 역스크롤이면 자동으로 되감긴다. 시간 기반 애니메이션 없음.
   전환 구간 = 뒤 섹션 머리가 화면 아래(100vh)에서 화면 위(0)에 닿기까지 = 화면 높이 1개. 섹션 높이와 무관.
   구간 밖에서는 인라인 스타일을 전부 지워 지금과 픽셀 동일 → 캡처(html[data-shot])·검수 불변.
   갱신은 scroll·resize 이벤트에 rAF 1회(chrome.js 방식) — 상시 루프 없음. will-change 는 전환 중인 섹션에만.
   끄는 조건: <1024 · prefers-reduced-motion · html[data-shot](캡처) · 모달 열림(is-modal-open) — 속성 변화는 MutationObserver 로 감지.
   사용: 페이지 끝에 <script src="_snippets/stack.js" defer></script> 한 줄(chrome.js 뒤). 페이지별 설정 없음. */
(function () {
  var doc = document, win = window, root = doc.documentElement;
  var CFG = { parallax: .5, dim: .35, scale: .02, stagger: .10, span: .6 };   /* A안 */
  var MQ = '(min-width: 1024px)';
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var secs = [].slice.call(doc.querySelectorAll('section[data-slot]'));
  if (secs.length < 2) return;
  var heads = secs.map(function (s) { return s.querySelector('.sec__head'); });
  var vh = win.innerHeight, active = false, raf = 0, dirty = false;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function transparent(el) { var c = win.getComputedStyle(el).backgroundColor; return c === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(c); }
  function paused() { return root.hasAttribute('data-shot') || root.classList.contains('is-modal-open') || doc.body.classList.contains('is-modal-open'); }

  function clearSec(s, i) {
    s.style.transform = ''; s.style.filter = ''; s.style.willChange = '';
    var h = heads[i]; if (h) [].forEach.call(h.children, function (k) { k.style.opacity = ''; k.style.transform = ''; });
  }
  function clear() { secs.forEach(clearSec); }

  function render() {
    raf = 0;
    if (!active) return;
    if (paused()) { if (dirty) { clear(); dirty = false; } return; }
    var y = win.pageYOffset || root.scrollTop || 0, any = false;
    for (var i = 0; i < secs.length - 1; i++) {
      var a = secs[i], b = secs[i + 1];
      var end = b.offsetTop, start = end - vh;              /* offsetTop 은 transform 에 영향받지 않는다 */
      var t = clamp((y - start) / vh, 0, 1);
      var h = heads[i + 1];
      if (t <= 0 || t >= 1) {
        if (a.style.transform) { a.style.transform = ''; a.style.filter = ''; a.style.willChange = ''; }
        if (h) [].forEach.call(h.children, function (k) { if (k.style.opacity) { k.style.opacity = ''; k.style.transform = ''; } });
        continue;
      }
      any = true;
      a.style.willChange = 'transform, filter';
      a.style.transform = 'translateY(' + (CFG.parallax * vh * t).toFixed(1) + 'px) scale(' + (1 - CFG.scale * t).toFixed(4) + ')';
      a.style.filter = 'brightness(' + (1 - CFG.dim * t).toFixed(3) + ')';
      if (!h) continue;
      var kids = h.children, n = kids.length;
      var width = CFG.span - (n - 1) * CFG.stagger; if (width <= 0) width = CFG.span / n;
      for (var k = 0; k < n; k++) {
        var s0 = 1 - CFG.span + k * CFG.stagger;
        var e = ease(clamp((t - s0) / width, 0, 1));
        kids[k].style.opacity = String(e);
        kids[k].style.transform = 'translateY(' + ((1 - e) * 28).toFixed(1) + 'px)';
      }
    }
    dirty = any;
  }
  function schedule() { if (!raf) raf = win.requestAnimationFrame(render); }

  function start() {
    if (active) return; active = true;
    secs.forEach(function (s, i) {
      s.style.position = 'relative'; s.style.zIndex = String(10 + i);
      if (transparent(s)) { s.style.backgroundColor = 'var(--ink, #07070B)'; s.setAttribute('data-stk-bg', ''); }   /* 덮는 섹션은 불투명해야 한다 */
    });
    schedule();
  }
  function stop() {
    active = false; if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
    clear(); dirty = false;
    secs.forEach(function (s) { s.style.zIndex = ''; s.style.position = ''; if (s.hasAttribute('data-stk-bg')) { s.style.backgroundColor = ''; s.removeAttribute('data-stk-bg'); } });
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
