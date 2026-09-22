/* stack.js — 섹션 전환 v11 "패럴랙스 리빌 + 스태거 인" (공용, 2026-09-22, Justin A안)
   PC(≥1024)에서 스크롤로 섹션 경계를 지날 때:
   (1) 앞 섹션은 스크롤의 절반 속도로 밀려 올라가며 어두워지고 살짝 줄어든다(패럴랙스)
   (2) 뒤 섹션은 그대로 올라와 앞을 덮는다(문서 순서 = 그리기 순서, z-index 순차 부여)
   (3) 뒤 섹션 머리(.sec__head 직계 자식)가 소제목 → 제목 → 서브 순으로 시차를 두고 떠오른다(스태거)
   전부 스크롤 위치에 묶여 역스크롤이면 자동으로 되감긴다. 시간 기반 애니메이션 없음.
   전환 구간 = 뒤 섹션 머리가 화면 아래(100vh)에서 화면 위(0)에 닿기까지 = 화면 높이 1개. 섹션 높이와 무관.
   구간 밖에서는 인라인 스타일을 전부 지워 지금과 픽셀 동일 → 캡처(html[data-shot])·검수 불변.
   끄는 조건: <1024 · prefers-reduced-motion · html[data-shot](캡처) · 모달 열림(is-modal-open) 중에는 갱신 정지.
   사용: 페이지 끝에 <script src="_snippets/stack.js" defer></script> 한 줄(chrome.js 뒤). 페이지별 설정 없음. */
(function () {
  var doc = document, win = window;
  var CFG = { parallax: .5, dim: .35, scale: .02, stagger: .10, span: .6 };   /* A안 */
  var MQ = '(min-width: 1024px)';
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (doc.documentElement.hasAttribute('data-shot')) return;   /* 로드 시점 캡처면 아예 시작 안 함(아래 frame 에서도 매번 확인) */

  var secs = [].slice.call(doc.querySelectorAll('section[data-slot]'));
  if (secs.length < 2) return;
  var heads = secs.map(function (s) { return s.querySelector('.sec__head'); });
  var vh = win.innerHeight, active = false, raf = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  function clear() {
    secs.forEach(function (s, i) { s.style.transform = ''; s.style.filter = ''; s.style.zIndex = ''; s.style.willChange = '';
      var h = heads[i]; if (h) [].forEach.call(h.children, function (k) { k.style.opacity = ''; k.style.transform = ''; }); });
  }
  function frame() {
    raf = 0;
    if (!active) return;
    /* 캡처(html[data-shot])·모달 열림: 매 프레임 확인 — 캡처 도구는 로드 뒤에 속성을 붙인다. 캡처 중에는 스타일을 전부 지워 정지 상태 = 지금과 픽셀 동일 */
    if (doc.documentElement.hasAttribute('data-shot')) { clear(); raf = win.requestAnimationFrame(frame); return; }
    if (doc.documentElement.classList.contains('is-modal-open') || doc.body.classList.contains('is-modal-open')) { raf = win.requestAnimationFrame(frame); return; }
    var y = win.pageYOffset || doc.documentElement.scrollTop || 0;
    for (var i = 0; i < secs.length - 1; i++) {
      var a = secs[i], b = secs[i + 1];
      var end = b.offsetTop, start = end - vh;              /* offsetTop 은 transform 에 영향받지 않는다 */
      var t = clamp((y - start) / vh, 0, 1);
      if (t > 0 && t < 1) {
        a.style.transform = 'translateY(' + (CFG.parallax * vh * t).toFixed(1) + 'px) scale(' + (1 - CFG.scale * t).toFixed(4) + ')';
        a.style.filter = 'brightness(' + (1 - CFG.dim * t).toFixed(3) + ')';
      } else { a.style.transform = ''; a.style.filter = ''; }
      var h = heads[i + 1]; if (!h) continue;
      var kids = h.children, n = kids.length;
      var width = CFG.span - (n - 1) * CFG.stagger; if (width <= 0) width = CFG.span / n;
      for (var k = 0; k < n; k++) {
        var s0 = 1 - CFG.span + k * CFG.stagger;
        var u = t <= 0 ? 0 : t >= 1 ? 1 : clamp((t - s0) / width, 0, 1);
        if (t <= 0 || t >= 1) { kids[k].style.opacity = ''; kids[k].style.transform = ''; continue; }
        var e = ease(u);
        kids[k].style.opacity = String(e);
        kids[k].style.transform = 'translateY(' + ((1 - e) * 28).toFixed(1) + 'px)';
      }
    }
    raf = win.requestAnimationFrame(frame);
  }
  function start() {
    if (active) return; active = true;
    secs.forEach(function (s, i) { s.style.position = 'relative'; s.style.zIndex = String(10 + i); s.style.willChange = 'transform, filter'; });
    if (!raf) raf = win.requestAnimationFrame(frame);
  }
  function stop() { active = false; if (raf) { win.cancelAnimationFrame(raf); raf = 0; } clear(); }
  function check() { if (win.matchMedia(MQ).matches) start(); else stop(); }
  win.addEventListener('resize', function () { vh = win.innerHeight; check(); });
  check();
})();
