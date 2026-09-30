/* 動きのしかけ（CSSでできない3つだけ）
   ・見出しの1文字送り … 文字を <span> に包む
   ・数字のカウントアップ … 画面に入ったら0から数える
   ・カーソル追従のドット絵
   いずれも「動きを減らす」設定の人には動かさない。 */
(() => {
  'use strict';
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── C：見出しを1文字ずつ ── */
  // トップは .cover h1、詳細ページは .detail-head h1
  const h1 = document.querySelector('.cover h1, .detail-head h1');
  const onTop = !!document.querySelector('.cover h1');
  if (h1 && !calm) {
    let i = 0;
    const wrap = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {                       // テキストノード
          const frag = document.createDocumentFragment();
          [...n.textContent].forEach((c) => {
            if (c.trim() === '') { frag.appendChild(document.createTextNode(c)); return; }
            const s = document.createElement('span');
            s.className = 'ch';
            s.textContent = c;
            // トップはローディングが消えきってから（2.7秒）、詳細ページはすぐ
            s.style.animationDelay = ((onTop ? 2700 : 120) + i++ * 38) + 'ms';
            frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          wrap(n);                                     // <mark> の中も対象
        }
      });
    };
    wrap(h1);
  }

  /* ── B：数字のカウントアップ ── */
  const nums = document.querySelectorAll('.figures dd');
  if (nums.length && !calm && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const dd = e.target;
        const unit = dd.querySelector('small');
        const raw = (dd.childNodes[0].textContent || '').trim();
        const goal = Number(raw.replace(/,/g, ''));
        if (!isFinite(goal) || goal <= 0) return;      // 「毎日」などの文字はそのまま
        const dur = 900, t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          const v = Math.round(goal * (1 - Math.pow(1 - p, 3)));   // 最後だけゆっくり
          dd.childNodes[0].textContent = v.toLocaleString('ja-JP');
          if (p < 1) requestAnimationFrame(step);
          else dd.childNodes[0].textContent = goal.toLocaleString('ja-JP');
        };
        dd.childNodes[0].textContent = '0';
        requestAnimationFrame(step);
        if (unit) dd.appendChild(unit);
      });
    }, { threshold: 0.4 });
    nums.forEach((n) => io.observe(n));
  }

  /* ── AIとの仕事のしかた：1枚ずつめくるカード ──
     タブ・矢印ボタン・キーボード（←→）・スワイプの4通りで動かせる。
     見た目の入れ替えはCSS側（.is-on / .to-left / .to-right）に任せて、
     ここは「いま何枚目か」を決めて、前後の位置を割り当てるだけ。 */
  const deck = document.querySelector('.ai-deck');
  if (deck) {
    const cards = [...deck.querySelectorAll('.ai-item')];
    const tabs  = [...deck.querySelectorAll('.ai-tab')];
    const now   = deck.querySelector('.ai-count b');
    const stage = deck.querySelector('.ai-stage');
    let cur = 0;

    // 舞台の高さを、いま出ているカードに合わせる（下に余白が空かないように）
    const fit = () => { stage.style.height = cards[cur].offsetHeight + 'px'; };

    const len = cards.length;
    const half = Math.floor(len / 2);

    // n枚目を中央にして、前後1枚を端から覗かせる配置にする
    const place = (n) => {
      cards.forEach((c, i) => {
        // いまの札から見て何枚ぶん左右か（端はつながっている前提で -2〜+2 に畳む）
        const rel = ((i - n + len + half) % len) - half;
        c.classList.remove('is-on', 'to-left', 'to-right', 'far-left', 'far-right');
        if (rel === 0) c.classList.add('is-on');
        else if (rel === -1) c.classList.add('to-left');
        else if (rel === 1) c.classList.add('to-right');
        else c.classList.add(rel < 0 ? 'far-left' : 'far-right');
        c.toggleAttribute('aria-hidden', i !== n);
      });
    };

    const show = (n) => {
      n = ((n % len) + len) % len;            // 端まで行ったら先頭へ戻る
      if (n === cur) return;
      cur = n;
      place(n);
      tabs.forEach((t, i) => {
        t.classList.toggle('is-on', i === n);
        t.setAttribute('aria-selected', i === n ? 'true' : 'false');
        t.tabIndex = i === n ? 0 : -1;
      });
      if (now) now.textContent = n + 1;
      fit();
    };

    place(cur);          // 読み込み時にも前後の位置を計算しておく
    fit();
    addEventListener('resize', fit);
    addEventListener('load', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

    tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));
    deck.querySelectorAll('.ai-nav').forEach((b) => {
      const d = Number(b.dataset.d);
      b.addEventListener('click', () => show(cur + d));
    });

    // タブの上で左右キー
    deck.querySelector('.ai-tabs').addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      show(cur + d);
      tabs[cur].focus();
    });

    // スマホのスワイプ（横に40px以上動いたら送る。縦スクロールは邪魔しない）
    let sx = 0, sy = 0;
    stage.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(cur + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  /* ── ヘッダーの矢印 ──
     ナビの下を、いま見ている場所まで矢印がのびる。
     TOP→WORKS→AI→ABOUT ME→CONTACT の各見出しに先端が届くように、
     「リンクの中心x」と「その行き先セクションのスクロール位置」を対応づけて補間する。 */
  const nav = document.querySelector('.site-nav');
  const navArrow = nav && nav.querySelector('.nav-arrow');
  let placeArrow = () => {};
  if (navArrow) {
    const links = [...nav.querySelectorAll('a')];
    const fixed = navArrow.dataset.at ? Number(navArrow.dataset.at) : null;  // 詳細ページは固定
    let stops = [];   // 各リンクの中心x（ナビ内の座標）
    let marks = [];   // 各セクションのスクロール位置

    const measure = () => {
      const nb = nav.getBoundingClientRect();
      stops = links.map((a) => {
        const r = a.getBoundingClientRect();
        return r.left - nb.left + r.width / 2;
      });
      navArrow.style.setProperty('--na-start', stops[0] + 'px');
      navArrow.style.setProperty('--na-full', (stops[stops.length - 1] - stops[0]) + 'px');

      const head = document.querySelector('.site-head');
      const off = (head ? head.offsetHeight : 0) + 8;   // 固定ヘッダーに隠れるぶん
      marks = links.map((a) => {
        const id = (a.getAttribute('href') || '').split('#')[1];
        const el = id ? document.getElementById(id) : null;
        return el ? Math.max(0, el.getBoundingClientRect().top + scrollY - off) : 0;
      });
      // 最後の区間：ページ末尾で必ず矢印が届くようにする
      const bottom = document.documentElement.scrollHeight - innerHeight;
      if (marks.length) marks[marks.length - 1] = Math.min(marks[marks.length - 1], bottom);
    };

    const paint = (tip, at) => {
      navArrow.style.setProperty('--na-tip', tip + 'px');
      navArrow.style.setProperty('--na-len', Math.max(0, tip - stops[0]) + 'px');
      links.forEach((a, k) => a.classList.toggle('here', k === at));
    };

    placeArrow = () => {
      if (!stops.length) return;
      if (fixed !== null) { paint(stops[fixed], fixed); return; }   // 詳細ページ
      const y = scrollY;
      let i = 0;
      while (i < marks.length - 1 && y >= marks[i + 1]) i++;
      let t = 0;
      if (i < marks.length - 1) {
        const span = marks[i + 1] - marks[i];
        if (span > 0) t = Math.min(1, Math.max(0, (y - marks[i]) / span));
      }
      if (calm) t = t > 0.5 ? 1 : 0;              // 動きを減らす設定では区間ごとに飛ばす
      const next = Math.min(i + 1, stops.length - 1);
      paint(stops[i] + (stops[next] - stops[i]) * t, t > 0.5 ? next : i);
    };

    const remeasure = () => { measure(); placeArrow(); };
    remeasure();
    addEventListener('resize', remeasure);
    addEventListener('load', remeasure);
    // 書体が届くと文字幅が変わるので測り直す
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  }

  /* ── 「上へ」ボタン ──
     見え隠れは CSS のスクロール連動に任せる。ここは「跳ねてから戻る」だけ。 */
  const top = document.createElement('button');
  top.type = 'button';
  top.className = 'to-top';
  top.setAttribute('aria-label', 'ページの先頭へもどる');
  // 矢印は角を丸めたSVG（線の端と角を round にすると柔らかく見える）
  top.innerHTML =
    '<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M5 15 L12 8 L19 15" fill="none" stroke="currentColor" ' +
      'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  document.body.appendChild(top);

  const arrow = top.querySelector('.arrow');
  top.addEventListener('click', () => {
    if (calm) { scrollTo(0, 0); return; }
    arrow.classList.remove('jump');
    void arrow.offsetWidth;                 // アニメを最初から流し直すための再計算
    arrow.classList.add('jump');
    setTimeout(() => scrollTo({ top: 0, behavior: 'smooth' }), 330);  // ためが終わって浮いた頃に動きだす
  });
  arrow.addEventListener('animationend', () => arrow.classList.remove('jump'));

  // 少し下げたら出す。スクロールのたびに計算しないよう1フレームに1回へ間引く
  let ticking = false;
  const sync = () => {
    top.classList.toggle('show', scrollY > 260);
    placeArrow();
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(sync);
  }, { passive: true });
  sync();
})();
