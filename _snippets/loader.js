/* loader.js — 첫 로드 진행률 로딩 화면 v14 (공용, 2026-09-22, Justin "영상·이미지 전부 받을 때까지 페이지를 보여주지 말고, 로딩바는 실제 다운로드에 맞춰")
   PC(≥1024) 첫 로드에만. <head> 에서 동기 실행돼 html[data-loading="on"] 을 먼저 심는다(loader.css 가 이 속성으로 본문을 감추고 잉크 덮개를 보인다).
   받는 것(전부 끝나야 걷힘) — URL 은 DOM 에서 모은다, 페이지별 설정 없음:
     (1) 모든 <img>(lazy 는 eager 로 바꿔 지금) + <picture> 는 화면 폭에 맞는 <source> + 히어로 poster   → 요소 자체의 load 로 완료, 크기는 HEAD 의 Content-Length
     (2) [data-preload="url url …"] 에 적힌 추가 파일(클래스 캐러셀 PNG 8장 등)                      → fetch 스트림으로 바이트 실측(HTTP 캐시에 들어가 뒤의 요청은 즉시)
     (3) 히어로 <video>(.kv video) — 파서가 <source> 를 넣는 순간 떼어 두어(MutationObserver, 브라우저 요청 0) canPlayType 으로 고른 소스 1개를 fetch 전량 수신 → blob 으로 재생(걷힐 때 0초부터)
     (4) 웹폰트 — window load 뒤 document.fonts.ready(막대는 99% 에서 대기)
   진행률 = 받은 바이트 / 전체 바이트(단조 증가). 완료: 100% 에서 HOLD_MS → data-loading="fade"(본문이 덮개 아래에 나타나고 영상 재생 시작) → FADE_MS 페이드 → 덮개 제거 → html[data-loaded].
   생략(덮개 없이 바로 본문): <1024 · file: · navigator.webdriver(캡처·검사 도구 → 촬영 결과·덱 불변) · html[data-shot] · 같은 탭 뒤로/앞으로 재방문(sessionStorage de_loaded — 새로고침은 예외, 다시 보임) · ?loader=0
   새로고침(PC): history.scrollRestoration=manual + load 뒤·걷히기 직전 scrollTo(behavior:'instant') → 항상 맨 위부터, 애니메이션 없이(v16).
   강제: ?loader=force(도구 검증용 — 폭·file: 조건은 못 넘김). 로드 중 data-shot 이 붙으면 즉시 제거.
   안전 해제: 스트림(영상·PNG)이 진행 중인데 STALL_MS(3초) 동안 수신 0 → 해제(첫 바이트 전·이미지만 남은 구간은 판정 안 함), 절대 상한 CAP_MS(20초 — 총 ~21MB 가 20Mbps 에서 13초라 12초는 짧다, 실측 2026-09-22) → 해제(받던 것은 중단, 영상은 원래 <source> 스트리밍으로 복귀).
   html[data-loader-end]=ok|stall|cap|shot 로 사유를, html[data-loader-t] 에 bytes·load·fonts·video·end 시점(ms)을 남긴다.
   로딩 중 휠·터치는 캡처 단계에서 막는다(걷힌 뒤 맨 위에서 시작). reduced-motion: 막대 전환·페이드 없음.
   마크업(페이지 <body> 첫 줄, 스타일은 loader.css):
     <div id="loader" class="loader" role="progressbar" aria-label="페이지 불러오는 중" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="loader__bar"><i class="loader__fill"></i></div><span class="loader__pct">0%</span></div>
   사용: <head> 첫 인라인 스크립트 뒤에 <link rel="stylesheet" href="_snippets/loader.css"> + <script src="_snippets/loader.js"></script> (defer·async 없이).
   주의: 이미지·영상 응답에 캐시 헤더(max-age)가 있어야 뒤의 <img>·캐러셀 요청이 캐시를 탄다(GitHub Pages 는 max-age=600). no-store 서버면 두 번 받는다. */
(function () {
  var doc = document, win = window, root = doc.documentElement, nav = win.navigator;
  var HOLD_MS = 300, FADE_MS = 400, STALL_MS = 3000, CAP_MS = 20000, SIZES_WAIT_MS = 1500, MQ = '(min-width: 1024px)';
  var q = /[?&]loader=([^&#]*)/.exec(win.location.search), mode = q ? q[1] : '';
  var reduce = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var navType = ''; try { var ne = win.performance.getEntriesByType('navigation')[0]; navType = ne ? ne.type : ''; } catch (e) {}
  var pc = win.matchMedia(MQ).matches;
  /* v16: 새로고침(Ctrl+R)은 PC 에서 항상 맨 위부터 — 브라우저의 스크롤 위치 복원을 끄고, 같은 탭 재방문 생략은 뒤로/앞으로 이동에만 적용(새로고침은 로더를 다시 보여 준다, Justin 2026-09-22) */
  var isReload = pc && navType === 'reload';
  function toTop() { try { win.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (e) { win.scrollTo(0, 0); } }   /* 페이지 CSS scroll-behavior:smooth 를 타지 않게(PD v16 조건) */
  if (isReload) { try { win.history.scrollRestoration = 'manual'; } catch (e) {} win.addEventListener('load', toTop); }
  var skip = nav.webdriver === true || root.hasAttribute('data-shot') || mode === '0';
  try { if (navType !== 'reload' && win.sessionStorage.getItem('de_loaded') === '1') skip = true; } catch (e) {}
  if (mode === 'force') skip = false;
  if (!pc || win.location.protocol === 'file:' || !win.fetch || !win.ReadableStream || !win.AbortController || !('MutationObserver' in win)) skip = true;
  root.setAttribute('data-loading', skip ? 'skip' : 'on');
  if (skip) { root.setAttribute('data-loaded', ''); return; }

  function block(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  var BLOCK = ['wheel', 'touchmove'];
  BLOCK.forEach(function (ev) { win.addEventListener(ev, block, { capture: true, passive: false }); });

  /* (3) 히어로 <source> 를 파서가 넣는 즉시 떼어 둔다 — 브라우저의 자체 영상 요청(파싱~DOMContentLoaded 사이 수백 KB~수 MB 낭비)을 아예 막는다.
     크로미움은 소스 선택을 별도 태스크로 미루므로 마이크로태스크인 옵저버가 먼저 돈다. 못 잡으면 run() 의 폴백(제거 후 load())이 처리. */
  var stash = [];
  function isHero(n) { return !!(n && n.tagName === 'VIDEO' && n.closest && n.closest('.kv')); }
  function stashSources(v) { [].slice.call(v.querySelectorAll('source')).forEach(function (s) { stash.push(s); v.removeChild(s); }); }
  var srcObs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'SOURCE' && isHero(n.parentNode)) { stash.push(n); n.parentNode.removeChild(n); }
        else if (isHero(n)) stashSources(n);
      }
    }
  });
  srcObs.observe(doc, { childList: true, subtree: true });

  var box, fill, pct, shown = 0, done = false;
  function el() {
    if (!box) { box = doc.getElementById('loader'); if (box) { fill = box.querySelector('.loader__fill'); pct = box.querySelector('.loader__pct'); } }
    return box;
  }
  function paint(p) {
    p = Math.max(shown, Math.min(1, p)); shown = p;
    if (!el()) return;
    fill.style.width = (p * 100).toFixed(1) + '%';
    if (pct) pct.textContent = Math.round(p * 100) + '%';
    box.setAttribute('aria-valuenow', Math.round(p * 100));
  }

  /* ── 항목 ── */
  var items = [], ctrls = [], video = null, sources = [], videoReady = false, gatesDone = false, firstByte = false;
  var marked = {}, now = function () { return Date.now(); }, startAt = 0, lastAt = 0, pendingSizes = 0, sizesKnown = false, capT = 0, stallT = 0;
  function mark(k) { root.setAttribute('data-loader-t', ((root.getAttribute('data-loader-t') || '') + ' ' + k + ':' + (now() - startAt)).trim()); }
  function abs(u) { try { return new URL(u, doc.baseURI).href; } catch (e) { return u; } }
  function firstUrl(srcset) { return (srcset || '').split(',')[0].trim().split(/\s+/)[0] || ''; }
  function pickImg(img) {
    if (img.currentSrc) return img.currentSrc;
    var pic = img.parentElement;
    if (pic && pic.tagName === 'PICTURE') {
      var ss = pic.querySelectorAll('source');
      for (var i = 0; i < ss.length; i++) {
        var m = ss[i].getAttribute('media');
        if (m && !win.matchMedia(m).matches) continue;
        var u = firstUrl(ss[i].getAttribute('srcset'));
        if (u) return u;
      }
    }
    return firstUrl(img.getAttribute('srcset')) || img.getAttribute('src') || '';
  }
  function add(url, kind) {
    url = abs(url);
    if (!url || url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return null;
    for (var i = 0; i < items.length; i++) if (items[i].url === url) return items[i];
    var it = { url: url, kind: kind, size: -1, got: 0, done: false, el: null };
    items.push(it); return it;
  }
  function total() { var t = 0; for (var i = 0; i < items.length; i++) if (items[i].size > 0) t += items[i].size; return t; }
  function received() { var r = 0; for (var i = 0; i < items.length; i++) r += items[i].done ? Math.max(items[i].size, 0) : items[i].got; return r; }
  function allDone() { for (var i = 0; i < items.length; i++) if (!items[i].done) return false; return true; }
  function streaming() { for (var i = 0; i < items.length; i++) if (items[i].kind !== 'elem' && !items[i].done) return true; return false; }
  function sizeArrived() { pendingSizes--; if (pendingSizes <= 0) sizesKnown = true; progress(); }
  function progress() {
    if (done) return;
    lastAt = now();
    var t = total(), known = sizesKnown || (now() - startAt > SIZES_WAIT_MS);
    if (allDone() && !marked.bytes) { marked.bytes = 1; mark('bytes'); }
    var complete = allDone() && gatesDone && (!video || videoReady);
    if (complete) { finish('ok'); return; }
    if (t > 0 && known) paint(Math.min(.99, received() / t));
  }
  function entrySize(url) {
    try { var e = win.performance.getEntriesByName(url); if (e.length) { var x = e[e.length - 1]; return x.encodedBodySize || x.transferSize || 0; } } catch (e) {}
    return 0;
  }
  /* (1) 요소가 직접 받는 것 — 크기만 HEAD 로 */
  function headSize(it) {
    pendingSizes++;
    win.fetch(it.url, { method: 'HEAD' }).then(function (r) { var n = +r.headers.get('content-length'); if (n > 0 && it.size < 0) it.size = n; }, function () {}).then(sizeArrived, sizeArrived);
  }
  function watchElem(img, it) {
    if (img.loading === 'lazy') img.loading = 'eager';
    function fin() { if (it.done) return; it.done = true; if (it.size < 0) it.size = entrySize(it.url); it.got = Math.max(it.size, 0); progress(); }
    if (img.complete) { fin(); return; }
    img.addEventListener('load', fin); img.addEventListener('error', fin);
  }
  /* (2)(3) 스트림으로 받는 것 */
  function stream(it, keep, onBlob) {
    var ctrl = new win.AbortController(); ctrls.push(ctrl);
    pendingSizes++;
    var sized = false;
    function sizeOnce() { if (!sized) { sized = true; sizeArrived(); } }
    win.fetch(it.url, { signal: ctrl.signal }).then(function (r) {
      var n = +r.headers.get('content-length'); if (n > 0) it.size = n; sizeOnce();
      if (!r.ok || !r.body) throw new Error('http ' + r.status);
      var reader = r.body.getReader(), chunks = [], type = r.headers.get('content-type') || '';
      function pump() {
        return reader.read().then(function (x) {
          if (x.done) return;
          it.got += x.value.length; if (keep) chunks.push(x.value); firstByte = true;
          progress(); return pump();
        });
      }
      return pump().then(function () { if (it.size < it.got) it.size = it.got; it.done = true; return keep ? new win.Blob(chunks, { type: type }) : null; });
    }).then(function (blob) { if (onBlob && blob) onBlob(blob); progress(); }, function () { sizeOnce(); if (!done) { it.done = true; if (it.size < 0) it.size = 0; progress(); } });
  }

  function run() {
    startAt = lastAt = now();
    srcObs.disconnect();
    /* (3) 영상 — 떼어 둔 <source> 중 재생 가능한 것 1개를 fetch 로 전량 */
    video = doc.querySelector('.kv video');
    var vit = null;
    if (video) {
      var late = [].slice.call(video.querySelectorAll('source'));       /* 옵저버가 못 잡은 경우의 폴백 */
      if (late.length) { try { video.pause(); } catch (e) {} late.forEach(function (s) { stash.push(s); video.removeChild(s); }); video.removeAttribute('src'); video.load(); }
      sources = stash;
      var pick = '';
      for (var i = 0; i < sources.length; i++) { var t = sources[i].getAttribute('type'); if (!t || video.canPlayType(t)) { pick = sources[i].getAttribute('src'); break; } }
      if (pick) vit = add(pick, 'video');
      var poster = video.getAttribute('poster');
      if (poster) { var pit = add(poster, 'elem'); if (pit) { var pi = new Image(); pit.el = pi; pi.src = poster; } }
    }
    /* (1) 이미지 */
    [].slice.call(doc.images).forEach(function (img) { var it = add(pickImg(img), 'elem'); if (it && !it.el) it.el = img; });
    /* (2) 추가 목록 */
    [].slice.call(doc.querySelectorAll('[data-preload]')).forEach(function (n) {
      (n.getAttribute('data-preload') || '').split(/[\s,]+/).forEach(function (u) { if (u) add(u, 'fetch'); });
    });
    /* 시작 */
    items.forEach(function (it) {
      if (it.kind === 'elem') { headSize(it); watchElem(it.el, it); }
      else if (it.kind === 'fetch') stream(it, false, null);
    });
    if (vit) stream(vit, true, function (blob) { video.src = win.URL.createObjectURL(blob); videoReady = true; mark('video'); progress(); });
    /* (4) 폰트 — 첫 레이아웃 뒤 요청된 웹폰트가 다 올 때까지 */
    function fontsGate() { mark('load'); (doc.fonts && doc.fonts.ready ? doc.fonts.ready : win.Promise.resolve()).then(function () { mark('fonts'); gatesDone = true; progress(); }, function () { mark('fonts'); gatesDone = true; progress(); }); }
    if (doc.readyState === 'complete') fontsGate(); else win.addEventListener('load', fontsGate);
    capT = win.setTimeout(function () { finish('cap'); }, CAP_MS);
    stallT = win.setInterval(function () { if (firstByte && streaming() && now() - lastAt > STALL_MS) finish('stall'); }, 250);
    if (!items.length && !video) progress();
  }

  function startVideo() {
    if (!video) return;
    try { if (videoReady) video.currentTime = 0; var p = video.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function remove() {
    BLOCK.forEach(function (ev) { win.removeEventListener(ev, block, { capture: true }); });
    if (el() && box.parentNode) box.parentNode.removeChild(box);
    root.removeAttribute('data-loading'); root.setAttribute('data-loaded', '');
  }
  function finish(reason) {
    if (done) return; done = true;
    win.clearTimeout(capT); win.clearInterval(stallT); srcObs.disconnect();
    try { win.sessionStorage.setItem('de_loaded', '1'); } catch (e) {}
    root.setAttribute('data-loader-end', reason); mark('end');
    if (reason !== 'ok') {
      ctrls.forEach(function (c) { try { c.abort(); } catch (e) {} });
      if (video && !videoReady && sources.length) { sources.forEach(function (s) { video.appendChild(s); }); video.load(); }   /* 원래 스트리밍으로 복귀 */
    }
    if (reason === 'shot') { remove(); startVideo(); return; }
    paint(1);
    var hold = reduce ? 0 : HOLD_MS, fade = reduce ? 0 : FADE_MS;
    win.setTimeout(function () {
      root.setAttribute('data-loading', 'fade');   /* 본문이 덮개 아래에 나타난다(loader.css: 숨김은 "on" 만, 덮개는 on·fade 둘 다) */
      if (isReload) toTop();                      /* 걷히는 순간 한 번 더 — 그 사이 복원이 다시 밀어 넣는 경우 대비 */
      startVideo();
      if (el()) { box.style.transition = 'opacity ' + fade + 'ms ease'; box.style.opacity = '0'; }
      win.setTimeout(remove, fade);
    }, hold);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run); else run();
  new MutationObserver(function () { if (root.hasAttribute('data-shot')) finish('shot'); }).observe(root, { attributes: true, attributeFilter: ['data-shot'] });
})();
