/* chrome.js — 고정 크롬(공용, 2026-09-21)
   (1) 헤더 스크롤 배경   : 스크롤 8px 초과 시 .site-header.is-scrolled (스타일은 base.css, 1024px 이상에서만 보인다)
   (2) 오른쪽 위치 레일    : 상단 GNB 링크를 그대로 읽어 세로 레일을 만든다 — 항목·이름·순서가 GNB 와 항상 같다
   (3) 모바일 하단 CTA 가림: [data-cta-cover] 요소가 화면에 하나라도 보이면 .mobile-cta.is-covered
   사용: 페이지 끝에 script 태그 한 줄(src="_snippets/chrome.js", defer). 페이지별 설정 없음.
   캡처(html[data-shot])·모달 열림·1024px 미만에서 레일은 CSS 로 숨는다. */
(function () {
  var doc = document, win = window;
  var header = doc.querySelector('.site-header');
  var gnb = header ? [].slice.call(header.querySelectorAll('nav a[href^="#"]')) : [];

  /* ── (2) 레일 만들기 ── */
  var items = [];
  gnb.forEach(function (a) {
    var el = doc.querySelector(a.getAttribute('href'));
    if (el) items.push({ el: el, href: a.getAttribute('href'), label: (a.textContent || '').trim() });
  });
  var rail = null, links = [], fill = null, PITCH = 34, current = null, flashTimer = 0;
  if (items.length >= 2) {
    rail = doc.createElement('nav');
    rail.className = 'prail';
    rail.setAttribute('aria-label', '페이지 위치');
    fill = doc.createElement('span');
    fill.className = 'prail__fill';
    fill.setAttribute('aria-hidden', 'true');
    var ol = doc.createElement('ol');
    items.forEach(function (it) {
      var li = doc.createElement('li'), a = doc.createElement('a'), b = doc.createElement('b'), i = doc.createElement('i');
      a.href = it.href;
      b.textContent = it.label;
      i.setAttribute('aria-hidden', 'true');
      a.appendChild(b); a.appendChild(i); li.appendChild(a); ol.appendChild(li);
      links.push(a);
    });
    rail.appendChild(fill);
    rail.appendChild(ol);
    doc.body.appendChild(rail);
  }

  /* ── 스크롤에 따른 갱신 (1)(2) ── */
  function update() {
    var y = win.pageYOffset || doc.documentElement.scrollTop || 0;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (!rail) return;
    /* GNB 활성 판정과 같은 기준선(화면 위에서 18%) — 두 표시가 어긋나지 않게.
       starts[k] = k번째 섹션이 '현재'가 되기 시작하는 스크롤 위치. 첫 섹션이 페이지 맨 위면 0 이라 맨 위에서 채움이 0 이다. */
    var lead = win.innerHeight * 0.18;
    var starts = items.map(function (it) { return Math.max(0, it.el.getBoundingClientRect().top + y - lead); });
    var idx = -1;   /* -1 = 아직 첫 항목 전(예: 론칭 히어로) — 현재 표시 없음 */
    for (var k = 0; k < starts.length; k++) { if (starts[k] <= y) idx = k; }
    /* 채움: 항목 사이를 실제 스크롤 거리로 나눠 끊김 없이 자란다(GNB 에 없는 구간에서도 멈추지 않는다) */
    var frac = 0;
    if (idx >= 0 && idx < starts.length - 1) {
      frac = Math.max(0, Math.min(1, (y - starts[idx]) / Math.max(1, starts[idx + 1] - starts[idx])));
    }
    fill.style.height = (idx < 0 ? 0 : (idx + frac) * PITCH).toFixed(1) + 'px';
    if (idx !== current) {
      links.forEach(function (a, n) {
        if (n === idx) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        a.classList.toggle('is-passed', n < idx);
        a.classList.remove('is-flash');
      });
      /* 섹션이 바뀔 때만 이름표를 1.5초 보여 준다(첫 로드는 제외 — 첫 화면을 비워 둔다) */
      if (current !== null && idx >= 0) {
        var cur = links[idx];
        cur.classList.add('is-flash');
        win.clearTimeout(flashTimer);
        flashTimer = win.setTimeout(function () { cur.classList.remove('is-flash'); }, 1500);
      }
      current = idx;
    }
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    win.requestAnimationFrame(function () { ticking = false; update(); });
  }
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onScroll);
  win.addEventListener('load', update);
  update();

  /* ── (3) 모바일 하단 CTA 가림 ── */
  var cta = doc.querySelector('.mobile-cta');
  var covers = [].slice.call(doc.querySelectorAll('[data-cta-cover]'));
  if (cta && covers.length && 'IntersectionObserver' in win) {
    var seen = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var n = seen.indexOf(e.target);
        if (e.isIntersecting && n < 0) seen.push(e.target);
        if (!e.isIntersecting && n >= 0) seen.splice(n, 1);
      });
      cta.classList.toggle('is-covered', seen.length > 0);
    }, { threshold: 0 });
    covers.forEach(function (el) { io.observe(el); });
  }
})();
