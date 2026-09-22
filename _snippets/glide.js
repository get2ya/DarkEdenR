/* glide.js — 관성 스크롤 v12 (공용, 2026-09-22, Justin "무거운 쪽, PC 만")
   휠 입력을 가로채 목표 위치에 누적하고, 매 프레임 실제 스크롤을 목표로 지수 감쇠시킨다(lerp).
   휠 한 번(약 100px 점프)이 여러 프레임에 걸쳐 풀려 "칸칸이" 느낌이 사라진다. 본문·배경·섹션 전환(stack.js)·위치 레일(chrome.js)은
   전부 실제 scrollY 를 읽으므로 그대로 부드러워진다 — 다른 스크립트 수정 없음.
   건드리지 않는 것: 키보드(스페이스·PageDown·방향키)·스크롤바 드래그·앵커(#) 이동·브라우저 검색 이동은 브라우저 기본 그대로
   (그 순간 목표 위치를 실제 위치에 맞춰 튀지 않게 한다). 트랙패드는 이미 관성이 있어 휠 델타가 작고 잦다 — 같은 경로로 처리해도 자연스럽다.
   끄는 조건: <1024(PC 전용) · prefers-reduced-motion · html[data-shot](캡처) · 모달 열림(is-modal-open, 모달 안 스크롤을 막지 않기 위해)
   · 휠 이벤트 대상이 스크롤 가능한 안쪽 요소(모달 본문 등)일 때.
   값: EASE = 프레임당 남은 거리의 12% 를 따라감(60fps 기준 약 0.35초에 95% 도달). WHEEL_SCALE = 1(브라우저 delta 그대로).
   사용: 페이지 끝에 <script src="_snippets/glide.js" defer></script> 한 줄(stack.js 뒤). 페이지별 설정 없음. */
(function () {
  var doc = document, win = window, root = doc.documentElement;
  var EASE = .12, MAX_STEP = 2400;   /* 휠 한 번에 누적할 수 있는 최대 거리(폭주 방지) */
  var MQ = '(min-width: 1024px)';
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var target = 0, current = 0, raf = 0, active = false, settled = true;
  function maxY() { return Math.max(0, (root.scrollHeight || doc.body.scrollHeight) - win.innerHeight); }
  function paused() { return root.hasAttribute('data-shot') || root.classList.contains('is-modal-open') || doc.body.classList.contains('is-modal-open'); }
  function innerScrollable(el) {   /* 휠 대상이 안쪽 스크롤 요소(모달 본문 등)면 브라우저에 맡긴다 */
    for (var n = el; n && n !== doc.body; n = n.parentElement) {
      var cs = win.getComputedStyle(n), oy = cs.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  }
  function sync() { current = target = win.pageYOffset || root.scrollTop || 0; settled = true; }
  function frame() {
    raf = 0;
    if (!active) return;
    if (paused()) { sync(); return; }
    var d = target - current;
    if (Math.abs(d) < .5) { current = target; win.scrollTo(0, Math.round(current)); settled = true; return; }
    current += d * EASE;
    win.scrollTo(0, Math.round(current));
    raf = win.requestAnimationFrame(frame);
  }
  function onWheel(e) {
    if (!active || paused()) return;
    if (e.ctrlKey || e.metaKey) return;                    /* 확대·축소 제스처 */
    if (innerScrollable(e.target)) return;
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= win.innerHeight;   /* 줄·페이지 단위 브라우저 */
    if (!dy) return;
    e.preventDefault();
    if (settled) { current = win.pageYOffset || root.scrollTop || 0; target = current; settled = false; }
    target = Math.max(0, Math.min(maxY(), target + Math.max(-MAX_STEP, Math.min(MAX_STEP, dy))));
    if (!raf) raf = win.requestAnimationFrame(frame);
  }
  /* 휠 이외의 이동(키보드·스크롤바·앵커·검색): 우리가 움직인 값과 실제가 어긋나면 목표를 실제에 맞춘다 */
  function onScroll() { if (!active || raf) return; var y = win.pageYOffset || root.scrollTop || 0; if (Math.abs(y - current) > 1) sync(); }
  function start() { if (active) return; active = true; sync(); }
  function stop() { active = false; if (raf) { win.cancelAnimationFrame(raf); raf = 0; } sync(); }
  function check() { if (win.matchMedia(MQ).matches) start(); else stop(); }
  win.addEventListener('wheel', onWheel, { passive: false });
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', check);
  win.addEventListener('hashchange', sync);
  if ('MutationObserver' in win) {
    new MutationObserver(function () { if (paused()) { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } sync(); } }).observe(root, { attributes: true, attributeFilter: ['data-shot', 'class'] });
    new MutationObserver(function () { if (paused()) { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } sync(); } }).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  }
  check();
})();
