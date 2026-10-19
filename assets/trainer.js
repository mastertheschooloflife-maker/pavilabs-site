/* PaviLabs Lernwerkzeuge: gemeinsame Komponenten (window.PaviTools)
   Dokumentation mit HTML-Mustern und Optionen: /TOOL-COMPONENTS.md

   Automatisch initialisiert (über data-Attribute):
     [data-seg]        Segment-Umschalter, auch als Schwierigkeitsfilter
     [data-checklist]  Checkliste mit Speicherstand
     [data-compare]    Vorher/Nachher-Vergleich
     [data-steps]      Schritt-für-Schritt-Anleitung mit Markierung
     [data-timer]      Timer mit Ring
     a[data-start]     "Übung starten": scrollt zum Übungsbereich und setzt den Fokus
   Per Aufruf:
     PaviTools.deck(el, { decks })   Lernkarten
     PaviTools.quiz(el, { fragen })  Quiz
     PaviTools.timer(el, { ... })    Timer mit Optionen oder Phasen
     PaviTools.progress(el, { ... }) Fortschritt mit Neustart
     PaviTools.store                 localStorage, immer in try/catch

   Ältere Seiten mit globalem DECKS/QUIZ und #fcard laufen weiter über die
   Legacy-Engine am Ende dieser Datei. */
(function () {
  "use strict";

  var T = window.PaviTools = window.PaviTools || {};
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(mq && mq.matches); }
  T.reduced = reduced;

  /* ---------- Hilfen ---------- */

  function q(sel, root) { return typeof sel === "string" ? (root || document).querySelector(sel) : sel; }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function hash(s) { var x = 5381; for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
  var uid = 0;
  function newId(p) { uid += 1; return (p || "t") + "-" + uid; }
  T.h = h; T.shuffle = shuffle;

  var ICON = {
    restart: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.5 2.5v3h3"/></svg>',
    left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H3m4-4.5L2.5 8 7 12.5"/></svg>',
    right: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10m-4-4.5L13.5 8 9 12.5"/></svg>',
    flip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6.5a5 5 0 0 1 9.3-1.5M13 9.5a5 5 0 0 1-9.3 1.5"/><path d="M12.6 2.5v2.8H9.8M3.4 13.5v-2.8h2.8"/></svg>',
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg>'
  };
  T.icon = ICON;

  /* ---------- Speicher (nur auf dem Gerät) ---------- */

  var PAGE = (location.pathname.replace(/\/+$/, "").split("/").pop() || "start").replace(/\.html$/, "");
  function key(k) { return "pavilabs:" + PAGE + ":" + k; }
  T.store = {
    get: function (k, fallback) {
      try { var v = window.localStorage.getItem(key(k)); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set: function (k, v) { try { window.localStorage.setItem(key(k), JSON.stringify(v)); } catch (e) { /* privat oder voll */ } },
    remove: function (k) { try { window.localStorage.removeItem(key(k)); } catch (e) { /* egal */ } }
  };

  /* ---------- Ansage für Screenreader ---------- */

  var liveEl = null;
  T.announce = function (msg) {
    if (!liveEl) {
      liveEl = h("div", { class: "sr-only", "aria-live": "polite", "aria-atomic": "true" });
      document.body.appendChild(liveEl);
    }
    liveEl.textContent = "";
    setTimeout(function () { liveEl.textContent = msg; }, 40);
  };

  /* ---------- Segment-Umschalter ---------- */
  // Markup: <div class="t-seg" data-seg aria-label="Modus">
  //           <button class="t-seg__btn" data-value="a" aria-controls="panelA">A</button> ...
  // Mit aria-controls: Tabs, die Panels ein- und ausblenden. Ohne: Auswahl (radiogroup).
  T.segment = function (root, opts) {
    root = q(root);
    if (!root || root._seg) return root && root._seg;
    opts = opts || {};
    var btns = qa(".t-seg__btn", root);
    var tabs = btns.some(function (b) { return b.hasAttribute("aria-controls"); });
    var storeKey = root.getAttribute("data-seg-store");
    root.setAttribute("role", tabs ? "tablist" : "radiogroup");
    var thumb = h("span", { class: "t-seg__thumb", "aria-hidden": "true" });
    root.insertBefore(thumb, root.firstChild);
    var current = -1;

    var placed = false;
    function place() {
      var b = btns[current];
      if (!b) return;
      if (!b.offsetWidth) { placed = false; return; }
      if (!placed) root.classList.add("is-instant");
      root.style.setProperty("--seg-x", b.offsetLeft + "px");
      root.style.setProperty("--seg-y", b.offsetTop + "px");
      root.style.setProperty("--seg-w", b.offsetWidth + "px");
      root.style.setProperty("--seg-h", b.offsetHeight + "px");
      if (!placed) { placed = true; void root.offsetWidth; requestAnimationFrame(function () { root.classList.remove("is-instant"); }); }
    }
    function select(i, silent, focus) {
      if (i < 0 || i >= btns.length) return;
      current = i;
      btns.forEach(function (b, j) {
        var on = j === i;
        b.setAttribute(tabs ? "aria-selected" : "aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
        var pid = b.getAttribute("aria-controls");
        if (pid) { var p = document.getElementById(pid); if (p) p.hidden = !on; }
      });
      place();
      if (focus) btns[i].focus();
      var value = btns[i].getAttribute("data-value") || String(i);
      if (storeKey) T.store.set("seg:" + storeKey, value);
      if (!silent) {
        if (opts.onChange) opts.onChange(value, i);
        root.dispatchEvent(new CustomEvent("seg:change", { detail: { value: value, index: i }, bubbles: true }));
      }
    }
    btns.forEach(function (b, i) {
      b.type = "button";
      b.setAttribute("role", tabs ? "tab" : "radio");
      if (tabs) {
        if (!b.id) b.id = newId("tab");
        var p = document.getElementById(b.getAttribute("aria-controls"));
        if (p) { p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", b.id); if (!p.hasAttribute("tabindex")) p.tabIndex = -1; }
      }
      b.addEventListener("click", function () { select(i); });
      b.addEventListener("keydown", function (e) {
        var n = btns.length, k = e.key, to = null;
        if (k === "ArrowRight" || k === "ArrowDown") to = (i + 1) % n;
        else if (k === "ArrowLeft" || k === "ArrowUp") to = (i - 1 + n) % n;
        else if (k === "Home") to = 0;
        else if (k === "End") to = n - 1;
        if (to !== null) { e.preventDefault(); select(to, false, true); }
      });
    });
    var start = btns.findIndex(function (b) { return b.getAttribute("aria-selected") === "true" || b.getAttribute("aria-checked") === "true"; });
    if (opts.value != null) start = btns.findIndex(function (b) { return b.getAttribute("data-value") === String(opts.value); });
    if (storeKey && opts.value == null) {
      var saved = T.store.get("seg:" + storeKey, null);
      var si = btns.findIndex(function (b) { return b.getAttribute("data-value") === saved; });
      if (si >= 0) start = si;
    }
    select(start < 0 ? 0 : start, true);
    root.classList.add("is-ready");
    if ("ResizeObserver" in window) new ResizeObserver(place).observe(root);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    var api = {
      get value() { return btns[current].getAttribute("data-value") || String(current); },
      set: function (v, silent) { var i = btns.findIndex(function (b) { return b.getAttribute("data-value") === String(v); }); if (i >= 0) select(i, silent); },
      el: root
    };
    root._seg = api;
    return api;
  };

  /* ---------- Fortschritt mit Neustart ---------- */
  // Leeres <div class="t-progress"></div> genügt, der Inhalt wird erzeugt.
  T.progress = function (root, opts) {
    root = q(root);
    opts = opts || {};
    root.classList.add("t-progress");
    root.innerHTML = "";
    var track = h("div", { class: "t-progress__track", role: "progressbar", "aria-valuemin": "0", "aria-label": opts.label || "Fortschritt" });
    var fill = h("div", { class: "t-progress__fill" });
    track.appendChild(fill);
    var label = h("span", { class: "t-progress__label" });
    root.appendChild(track);
    root.appendChild(label);
    if (opts.onReset !== false) {
      var btn = h("button", { type: "button", class: "t-iconbtn", html: ICON.restart + "<span>" + (opts.resetText || "Neu starten") + "</span>" });
      btn.addEventListener("click", function () { if (opts.onReset) opts.onReset(); });
      root.appendChild(btn);
    }
    var api = {
      set: function (done, total) {
        var p = total ? done / total : 0;
        root.style.setProperty("--p", p.toFixed(4));
        track.setAttribute("aria-valuemax", String(total));
        track.setAttribute("aria-valuenow", String(done));
        track.setAttribute("aria-valuetext", done + " von " + total);
        label.innerHTML = "<strong>" + done + "</strong> von " + total + (opts.unit ? " " + opts.unit : "");
      }
    };
    api.set(0, opts.total || 0);
    return api;
  };

  /* ---------- Lernkarten ---------- */
  // PaviTools.deck("#deck", { decks: DECKS, levels: {1:"Grundlagen",2:"Aufbau",3:"Abiturniveau"} })
  // DECKS = { "Stapel": { "Kategorie": [ [Vorderseite, Antwort, Beispiel, Notiz, Stufe], ... ] } }
  // Karten dürfen auch Objekte sein: { f, a, d, n, lvl }.
  T.deck = function (root, opts) {
    root = q(root);
    opts = opts || {};
    var decks = opts.decks || {};
    var levels = opts.levels || null;
    var storeKey = opts.storageKey || "deck";
    var unit = opts.unit || "sitzen";
    var ALL = "*";

    function norm(c, deckName, cat) {
      var o = Array.isArray(c) ? { f: c[0], a: c[1], d: c[2], n: c[3], lvl: c[4] } : c;
      o.lvl = Number(o.lvl || opts.defaultLevel || 1);
      o.cat = cat; o.deck = deckName;
      o.id = hash(deckName + "|" + o.f);
      return o;
    }
    var cards = {};
    Object.keys(decks).forEach(function (d) {
      cards[d] = {};
      Object.keys(decks[d]).forEach(function (c) { cards[d][c] = decks[d][c].map(function (x) { return norm(x, d, c); }); });
    });

    var saved = T.store.get(storeKey, {}) || {};
    var known = {};
    (saved.known || []).forEach(function (id) { known[id] = true; });
    var sel = saved.sel || {};
    var deckName = cards[sel.deck] ? sel.deck : Object.keys(cards)[0];
    var cat = sel.cat && (sel.cat === ALL || cards[deckName][sel.cat]) ? sel.cat : Object.keys(cards[deckName])[0];
    var level = sel.level || "all";
    var queue = [], flipped = false, busy = false;

    function persist() { T.store.set(storeKey, { known: Object.keys(known), sel: { deck: deckName, cat: cat, level: level } }); }
    function poolOf(d, c, lv) {
      var src = c === ALL ? Object.keys(cards[d]).reduce(function (a, k) { return a.concat(cards[d][k]); }, []) : (cards[d][c] || []);
      return lv === "all" ? src : src.filter(function (x) { return String(x.lvl) === String(lv); });
    }
    function pool() { return poolOf(deckName, cat, level); }

    /* Aufbau */
    root.classList.add("t-deck");
    root.innerHTML = "";
    var controls = h("div", { class: "t-deck__controls" });
    var row1 = h("div", { class: "t-deck__row" });
    var deckSeg = null, levelSeg = null;
    if (Object.keys(cards).length > 1) {
      var segWrap = h("div", null, [h("span", { class: "t-label", id: newId("lbl"), text: opts.deckLabel || "Stapel" })]);
      var seg = h("div", { class: "t-seg", "aria-labelledby": segWrap.firstChild.id });
      Object.keys(cards).forEach(function (d) {
        seg.appendChild(h("button", { class: "t-seg__btn", "data-value": d, text: d }));
      });
      segWrap.appendChild(seg);
      row1.appendChild(segWrap);
      deckSeg = T.segment(seg, { value: deckName, onChange: function (v) { deckName = v; cat = Object.keys(cards[v])[0]; build(); } });
    }
    if (levels) {
      var lvWrap = h("div", null, [h("span", { class: "t-label", id: newId("lbl"), text: opts.levelLabel || "Schwierigkeit" })]);
      var lseg = h("div", { class: "t-seg t-seg--levels", "aria-labelledby": lvWrap.firstChild.id });
      lseg.appendChild(h("button", { class: "t-seg__btn", "data-value": "all", text: "Alle" }));
      Object.keys(levels).forEach(function (k) {
        var b = h("button", { class: "t-seg__btn", "data-value": k });
        b.innerHTML = '<span class="t-bars" data-level="' + k + '" aria-hidden="true"><i></i><i></i><i></i></span>';
        b.appendChild(document.createTextNode(levels[k]));
        lseg.appendChild(b);
      });
      lvWrap.appendChild(lseg);
      row1.appendChild(lvWrap);
      levelSeg = T.segment(lseg, { value: level, onChange: function (v) { level = v; build(); } });
    }
    if (row1.children.length) controls.appendChild(row1);
    var catWrap = h("div", null, [h("span", { class: "t-label", id: newId("lbl"), text: opts.catLabel || "Thema" })]);
    var chips = h("div", { class: "t-chips", role: "group", "aria-labelledby": catWrap.firstChild.id });
    catWrap.appendChild(chips);
    controls.appendChild(catWrap);
    var progEl = h("div");
    controls.appendChild(progEl);
    root.appendChild(controls);
    var prog = T.progress(progEl, { unit: unit, label: "Lernfortschritt", resetText: "Neu starten", onReset: function () {
      pool().forEach(function (c) { delete known[c.id]; });
      persist(); build();
      T.announce("Fortschritt für diese Auswahl zurückgesetzt.");
    } });

    var stage = h("div", { class: "t-stage" });
    var card = h("div", { class: "t-card", role: "button", tabindex: "0", "aria-roledescription": "Lernkarte" });
    var inner = h("div", { class: "t-card__inner" });
    var front = h("div", { class: "t-face t-face--front" });
    var back = h("div", { class: "t-face t-face--back", "aria-hidden": "true" });
    inner.appendChild(front); inner.appendChild(back);
    card.appendChild(inner);
    stage.appendChild(h("span", { class: "t-stage__badge t-stage__badge--again", "aria-hidden": "true", text: opts.againText || "Nochmal" }));
    stage.appendChild(h("span", { class: "t-stage__badge t-stage__badge--known", "aria-hidden": "true", text: opts.knownText || "Sitzt" }));
    stage.appendChild(card);
    root.appendChild(stage);

    var actions = h("div", { class: "t-deck__actions" });
    var bAgain = h("button", { type: "button", class: "btn btn--ghost", html: ICON.left + "<span>" + (opts.againText || "Nochmal") + "</span>" });
    var bFlip = h("button", { type: "button", class: "btn btn--ghost", html: ICON.flip + "<span>Umdrehen</span>" });
    var bKnown = h("button", { type: "button", class: "btn btn--primary", html: "<span>" + (opts.knownText || "Sitzt") + "</span>" + ICON.right });
    actions.appendChild(bAgain); actions.appendChild(bFlip); actions.appendChild(bKnown);
    root.appendChild(actions);
    var meta = h("div", { class: "t-deck__meta" });
    var restInfo = h("span");
    meta.appendChild(restInfo);
    meta.appendChild(h("span", { class: "t-kbd-hint", html: "<kbd>Leertaste</kbd> umdrehen, <kbd>&rarr;</kbd> sitzt, <kbd>&larr;</kbd> nochmal" }));
    meta.appendChild(h("span", { class: "t-touch-hint", text: "Tippen dreht die Karte. Nach rechts wischen: sitzt, nach links: nochmal." }));
    root.appendChild(meta);
    var done = h("div", { class: "t-done", hidden: true });
    root.appendChild(done);

    function chipsBuild() {
      chips.innerHTML = "";
      var cats = Object.keys(cards[deckName]);
      var list = cats.length > 1 ? [ALL].concat(cats) : cats;
      list.forEach(function (c) {
        var p = poolOf(deckName, c, level);
        var k = p.filter(function (x) { return known[x.id]; }).length;
        var b = h("button", { type: "button", class: "t-chip" + (p.length && k === p.length ? " is-complete" : ""), "aria-pressed": c === cat ? "true" : "false", disabled: p.length ? null : true });
        b.appendChild(h("span", { text: c === ALL ? "Alle Themen" : c }));
        b.appendChild(h("span", { class: "t-chip__count", text: k + "/" + p.length }));
        b.addEventListener("click", function () { cat = c; build(); });
        chips.appendChild(b);
        if (c === cat) requestAnimationFrame(function () { if (chips.scrollWidth > chips.clientWidth) chips.scrollLeft = Math.max(0, b.offsetLeft - chips.offsetLeft - 24); });
      });
    }

    function face(el, c, side) {
      el.innerHTML = "";
      var lvl = levels ? '<span class="t-bars" data-level="' + c.lvl + '" aria-hidden="true"><i></i><i></i><i></i></span>' : "";
      var m = h("div", { class: "t-face__meta" });
      m.appendChild(h("span", { text: c.cat }));
      var r = h("span", { html: lvl });
      if (levels) r.appendChild(document.createTextNode(levels[c.lvl] || ""));
      m.appendChild(r);
      el.appendChild(m);
      if (side === "front") {
        el.appendChild(h("p", { class: "t-face__main", text: c.f }));
        el.appendChild(h("p", { class: "t-face__foot", text: opts.frontHint || "Erst selbst antworten, dann umdrehen." }));
      } else {
        el.appendChild(h("p", { class: "t-face__main", text: c.a }));
        if (c.d) el.appendChild(h("p", { class: "t-face__detail", text: c.d }));
        if (c.n) el.appendChild(h("p", { class: "t-face__note", text: c.n }));
      }
    }

    function setFlip(on, announce) {
      flipped = on;
      card.classList.toggle("is-flipped", on);
      front.setAttribute("aria-hidden", on ? "true" : "false");
      back.setAttribute("aria-hidden", on ? "false" : "true");
      card.setAttribute("aria-label", on ? "Rückseite. Antwort: " + (queue[0] ? queue[0].a : "") : "Vorderseite: " + (queue[0] ? queue[0].f : "") + ". Zum Umdrehen Leertaste drücken.");
      if (on && announce && queue[0]) T.announce("Antwort: " + queue[0].a);
    }

    function render(enter) {
      var p = pool();
      var k = p.filter(function (x) { return known[x.id]; }).length;
      prog.set(k, p.length);
      chipsBuild();
      var empty = !queue.length;
      stage.hidden = empty; actions.hidden = empty; meta.hidden = empty;
      done.hidden = !empty;
      if (empty) { showDone(p); return; }
      var c = queue[0];
      face(front, c, "front"); face(back, c, "back");
      card.classList.remove("is-out-left", "is-out-right", "is-flipped", "is-entering");
      card.style.transform = "";
      setFlip(false);
      restInfo.textContent = queue.length === 1 ? "Letzte Karte in dieser Runde" : queue.length + " Karten in dieser Runde";
      if (enter && !reduced()) { void card.offsetWidth; card.classList.add("is-entering"); }
    }

    function showDone(p) {
      done.innerHTML = "";
      done.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="t-done__ring" cx="32" cy="32" r="28" pathLength="1"/><path class="t-done__tick" d="M20 33l8 8 16-18" pathLength="1"/></svg>';
      var name = cat === ALL ? "diesem Stapel" : "„" + cat + "“";
      done.appendChild(h("h3", { text: p.length ? "Alle " + p.length + " Karten aus " + name + " sitzen." : "Keine Karten in dieser Auswahl." }));
      done.appendChild(h("p", { text: p.length ? "Wiederhole den Stapel in ein paar Tagen, dann bleibt er länger hängen. Oder nimm dir das nächste Thema vor." : "Wähle eine andere Schwierigkeit oder ein anderes Thema." }));
      var acts = h("div", { class: "t-actions" });
      var cats = Object.keys(cards[deckName]);
      var idx = cats.indexOf(cat);
      if (cat !== ALL && idx < cats.length - 1) {
        acts.appendChild(h("button", { type: "button", class: "btn btn--primary", text: "Weiter mit " + cats[idx + 1], onclick: function () { cat = cats[idx + 1]; build(); card.focus(); } }));
      }
      if (p.length) acts.appendChild(h("button", { type: "button", class: "btn btn--ghost", text: "Diesen Stapel wiederholen", onclick: function () { p.forEach(function (c) { delete known[c.id]; }); persist(); build(); card.focus(); } }));
      done.appendChild(acts);
      T.announce(p.length ? "Stapel geschafft." : "Keine Karten in dieser Auswahl.");
    }

    function build() {
      queue = shuffle(pool().filter(function (x) { return !known[x.id]; }));
      persist();
      render(true);
    }

    function advance(dir) {
      if (!queue.length || busy) return;
      var c = queue.shift();
      if (dir === "right") { known[c.id] = true; }
      else { queue.splice(Math.min(queue.length, 3), 0, c); } // kommt nach drei Karten wieder
      persist();
      if (reduced()) { render(false); T.announce(dir === "right" ? "Sitzt." : "Kommt später noch einmal."); return; }
      busy = true;
      card.classList.add(dir === "right" ? "is-out-right" : "is-out-left");
      setTimeout(function () { busy = false; render(true); }, 280);
    }

    function flip() { if (queue.length && !busy) setFlip(!flipped, true); }

    /* Bedienung */
    var drag = null, suppress = false;
    card.addEventListener("click", function () { if (suppress) { suppress = false; return; } flip(); });
    card.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    });
    root.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var t = e.target;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest(".t-seg")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); advance("right"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); advance("left"); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.target !== document.body || e.altKey || e.ctrlKey || e.metaKey) return;
      var r = root.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === " ") { e.preventDefault(); flip(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); advance("right"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); advance("left"); }
    });
    card.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || busy) return;
      drag = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, active: false };
    });
    card.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          drag.active = true;
          card.classList.add("is-dragging");
          try { card.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
        } else if (Math.abs(dy) > 10) { drag = null; return; }
        else return;
      }
      drag.dx = dx;
      card.style.transform = reduced() ? "" : "translateX(" + dx + "px) rotate(" + (dx / 28).toFixed(2) + "deg)";
      stage.setAttribute("data-drag", dx > 50 ? "right" : dx < -50 ? "left" : "");
    });
    function endDrag() {
      if (!drag) return;
      var d = drag; drag = null;
      card.classList.remove("is-dragging");
      stage.removeAttribute("data-drag");
      if (!d.active) return;
      suppress = true;
      setTimeout(function () { suppress = false; }, 350);
      if (d.dx > 90) advance("right");
      else if (d.dx < -90) advance("left");
      else card.style.transform = "";
    }
    card.addEventListener("pointerup", endDrag);
    card.addEventListener("pointercancel", endDrag);
    bAgain.addEventListener("click", function () { advance("left"); });
    bKnown.addEventListener("click", function () { advance("right"); });
    bFlip.addEventListener("click", flip);

    build();

    return {
      select: function (d, c) { if (cards[d]) { deckName = d; if (deckSeg) deckSeg.set(d, true); } cat = c || Object.keys(cards[deckName])[0]; build(); },
      setLevel: function (lv) { level = String(lv); if (levelSeg) levelSeg.set(level, true); build(); },
      count: function () { var n = 0; Object.keys(cards).forEach(function (d) { Object.keys(cards[d]).forEach(function (c) { n += cards[d][c].length; }); }); return n; },
      focus: function () { card.focus(); },
      el: root
    };
  };

  /* ---------- Quiz ---------- */
  // PaviTools.quiz("#quiz", { fragen: QUIZ })   QUIZ = [{ f: Frage, o: [Optionen], r: Index richtig, e: Begründung }]
  T.quiz = function (root, opts) {
    root = q(root);
    opts = opts || {};
    var all = opts.fragen || [];
    var storeKey = opts.storageKey || "quiz";
    var set = [], idx = 0, score = 0, wrong = [], answered = false;
    root.classList.add("t-quiz");

    function startScreen() {
      root.innerHTML = "";
      var best = T.store.get(storeKey, null);
      var box = h("div", { class: "t-quiz__start" });
      box.appendChild(h("p", { text: opts.intro || (all.length + " Fragen, jede mit Begründung. Dauer etwa " + Math.max(2, Math.round(all.length * 0.4)) + " Minuten.") }));
      if (best && best.total) box.appendChild(h("p", { text: "Dein bestes Ergebnis auf diesem Gerät: " + best.best + " von " + best.total + "." }));
      var acts = h("div", { class: "t-actions" });
      acts.appendChild(h("button", { type: "button", class: "btn btn--primary", text: opts.startText || "Quiz starten", onclick: function () { begin(all); } }));
      box.appendChild(acts);
      root.appendChild(box);
    }

    function begin(list) {
      set = shuffle(list.slice()); idx = 0; score = 0; wrong = [];
      show();
      var first = root.querySelector(".t-opt");
      if (first) first.focus();
    }

    function show() {
      answered = false;
      root.innerHTML = "";
      if (idx >= set.length) return result();
      var item = set[idx];
      var body = h("div", { class: "t-quiz__body" });
      var head = h("div", { class: "t-quiz__head" }, [h("span", { text: "Frage " + (idx + 1) + " von " + set.length }), h("span", { text: score + " richtig" })]);
      body.appendChild(head);
      var pe = h("div");
      body.appendChild(pe);
      T.progress(pe, { onReset: false, label: "Quizfortschritt" }).set(idx, set.length);
      pe.querySelector(".t-progress__label").remove();
      var qid = newId("q");
      body.appendChild(h("h3", { class: "t-quiz__q", id: qid, text: item.f }));
      var opts2 = h("div", { class: "t-opts", role: "group", "aria-labelledby": qid });
      var order = item.o.map(function (o, i) { return { text: o, ok: i === item.r }; });
      if (opts.shuffleOptions !== false) shuffle(order);
      order.forEach(function (o) {
        var b = h("button", { type: "button", class: "t-opt", text: o.text });
        b._ok = o.ok;
        b.addEventListener("click", function () { choose(b, item, opts2); });
        opts2.appendChild(b);
      });
      body.appendChild(opts2);
      body.appendChild(h("p", { class: "t-deck__meta t-kbd-hint", html: "Tastatur: <kbd>1</kbd> bis <kbd>" + order.length + "</kbd> wählt eine Antwort." }));
      root.appendChild(body);
    }

    function choose(b, item, group) {
      if (answered) return;
      answered = true;
      var ok = b._ok;
      if (ok) score++; else wrong.push(item);
      var right = null;
      qa(".t-opt", group).forEach(function (x) {
        x.setAttribute("aria-disabled", "true");
        if (x._ok) { x.classList.add("is-right"); right = x; }
        else if (x === b) x.classList.add("is-wrong");
        else x.classList.add("is-muted");
      });
      var fb = h("div", { class: "t-feedback " + (ok ? "is-right" : "is-wrong"), role: "status" });
      fb.appendChild(h("strong", { text: ok ? "Richtig. " : "Nicht ganz. " }));
      if (!ok) fb.appendChild(document.createTextNode("Richtig ist: " + right.textContent + ". "));
      fb.appendChild(document.createTextNode(item.e || ""));
      group.parentNode.appendChild(fb);
      var nx = h("div", { class: "t-quiz__next" });
      var last = idx + 1 >= set.length;
      var nb = h("button", { type: "button", class: "btn btn--primary", html: "<span>" + (last ? "Auswertung ansehen" : "Nächste Frage") + "</span>" + ICON.right });
      nb.addEventListener("click", function () { idx++; show(); var f = root.querySelector(".t-opt, .btn"); if (f) f.focus(); });
      nx.appendChild(nb);
      group.parentNode.appendChild(nx);
      nb.focus({ preventScroll: true });
    }

    function result() {
      var total = set.length;
      var prev = T.store.get(storeKey, null);
      if (total === all.length) {
        var best = prev && prev.total === total ? Math.max(prev.best || 0, score) : score;
        T.store.set(storeKey, { best: best, total: total });
      }
      var body = h("div", { class: "t-quiz__body" });
      var sc = h("div", { class: "t-score" });
      sc.appendChild(h("div", { class: "t-score__num", html: score + "<small> von " + total + "</small>" }));
      var verdict = opts.verdict ? opts.verdict(score, total) :
        score === total ? "Alles richtig. Prüf dich in ein paar Tagen noch einmal, dann zeigt sich, was hängen geblieben ist."
        : score / total >= 0.7 ? "Die meisten Antworten sitzen. Unten stehen die Fragen, die du noch einmal ansehen solltest."
        : "Unten stehen die Fragen mit Begründung. Übe die passenden Lernkarten und versuch es danach noch einmal.";
      sc.appendChild(h("p", { text: verdict }));
      body.appendChild(sc);
      if (wrong.length) {
        var ul = h("ul", { class: "t-review" });
        wrong.forEach(function (w) {
          var li = h("li");
          li.appendChild(h("strong", { text: w.f }));
          li.appendChild(document.createTextNode("Richtig: " + w.o[w.r] + ". " + (w.e || "")));
          ul.appendChild(li);
        });
        body.appendChild(ul);
      }
      var acts = h("div", { class: "t-actions" });
      if (wrong.length) acts.appendChild(h("button", { type: "button", class: "btn btn--primary", text: "Nur die " + wrong.length + " Fehler wiederholen", onclick: function () { begin(wrong.slice()); } }));
      acts.appendChild(h("button", { type: "button", class: "btn btn--ghost", text: "Ganzes Quiz neu starten", onclick: function () { begin(all); } }));
      body.appendChild(acts);
      root.appendChild(body);
      T.announce("Auswertung: " + score + " von " + total + " richtig.");
      if (opts.onFinish) opts.onFinish(score, total);
    }

    root.addEventListener("keydown", function (e) {
      if (answered || e.altKey || e.ctrlKey || e.metaKey) return;
      var n = parseInt(e.key, 10);
      var list = qa(".t-opt", root);
      if (n >= 1 && n <= list.length) { e.preventDefault(); list[n - 1].click(); }
    });

    startScreen();
    return { start: function () { begin(all); }, el: root };
  };

  /* ---------- Timer mit Ring ---------- */
  // <div data-timer data-timer-seconds="300" data-timer-options="120,300,600" data-timer-label="Vortrag"></div>
  // Phasen per JS: PaviTools.timer(el, { phases: [{label:"Einatmen", seconds:4, breath:1}, ...], cycles: 4 })
  T.timer = function (root, opts) {
    root = q(root);
    if (!root || root._timer) return root && root._timer;
    opts = opts || {};
    var ds = root.dataset;
    var options = opts.options || (ds.timerOptions ? ds.timerOptions.split(",").map(Number) : null);
    var seconds = opts.seconds || Number(ds.timerSeconds) || (options ? options[0] : 60);
    var phases = opts.phases || null;
    var cycles = opts.cycles || 1;
    var label = opts.label || ds.timerLabel || "Zeit";
    root.classList.add("t-timer");
    root.innerHTML = "";
    var ring = h("div", { class: "t-timer__ring" });
    ring.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="t-timer__core" cx="50" cy="50" r="40"/><circle class="t-timer__track" cx="50" cy="50" r="46"/><circle class="t-timer__bar" cx="50" cy="50" r="46" pathLength="1"/></svg>';
    var center = h("div", { class: "t-timer__center" });
    var timeEl = h("span", { class: "t-timer__time", role: "timer", "aria-live": "off" });
    var phaseEl = h("span", { class: "t-timer__phase" });
    center.appendChild(timeEl); center.appendChild(phaseEl);
    ring.appendChild(center);
    root.appendChild(ring);
    var side = h("div", { class: "t-timer__side" });
    var optSeg = null;
    if (options && !phases) {
      var segEl = h("div", { class: "t-seg", "aria-label": "Dauer" });
      options.forEach(function (s) { segEl.appendChild(h("button", { class: "t-seg__btn", "data-value": String(s), text: fmt(s) + " Min" })); });
      side.appendChild(segEl);
    }
    var acts = h("div", { class: "t-actions" });
    var bStart = h("button", { type: "button", class: "btn btn--primary" });
    var bReset = h("button", { type: "button", class: "btn btn--ghost", html: ICON.restart + "<span>Zurücksetzen</span>" });
    acts.appendChild(bStart); acts.appendChild(bReset);
    side.appendChild(acts);
    root.appendChild(side);

    var running = false, raf = 0, startAt = 0, elapsedBefore = 0, phaseIdx = 0, cycle = 1;
    function fmt(s) { s = Math.max(0, Math.ceil(s)); var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r; }
    function dur() { return phases ? phases[phaseIdx].seconds : seconds; }
    function setBtn() { bStart.innerHTML = (running ? ICON.pause : ICON.play) + "<span>" + (running ? "Pause" : (elapsedBefore > 0 ? "Weiter" : "Start")) + "</span>"; root.classList.toggle("is-running", running); }
    function paint(el) {
      var d = dur();
      var left = Math.max(0, d - el);
      timeEl.textContent = phases ? String(Math.ceil(left)) : fmt(left);
      ring.querySelector(".t-timer__bar").style.strokeDashoffset = String(-Math.min(1, el / d));
      if (phases) phaseEl.textContent = phases[phaseIdx].label + (cycles > 1 ? ", Runde " + cycle + " von " + cycles : "");
      else phaseEl.textContent = label;
    }
    function breath() {
      if (!phases) return;
      var p = phases[phaseIdx];
      var target = p.breath === 1 ? 1 : p.breath === -1 ? 0.62 : null;
      if (target !== null && !reduced()) { ring.style.setProperty("--breath-dur", p.seconds + "s"); ring.style.setProperty("--breath", String(target)); }
    }
    function tick() {
      var el = elapsedBefore + (performance.now() - startAt) / 1000;
      if (el >= dur()) {
        if (phases && (phaseIdx < phases.length - 1 || cycle < cycles)) {
          if (phaseIdx < phases.length - 1) phaseIdx++; else { phaseIdx = 0; cycle++; }
          elapsedBefore = 0; startAt = performance.now();
          breath();
          T.announce(phases[phaseIdx].label);
          paint(0);
          raf = requestAnimationFrame(tick);
          return;
        }
        running = false; elapsedBefore = dur(); paint(dur()); setBtn();
        T.announce(opts.doneText || "Zeit abgelaufen.");
        if (opts.onDone) opts.onDone();
        return;
      }
      paint(el);
      raf = requestAnimationFrame(tick);
    }
    function start() {
      if (elapsedBefore >= dur() && !phases) elapsedBefore = 0;
      running = true; startAt = performance.now(); setBtn(); breath();
      if (phases) T.announce(phases[phaseIdx].label);
      raf = requestAnimationFrame(tick);
    }
    function pause() { running = false; cancelAnimationFrame(raf); elapsedBefore += (performance.now() - startAt) / 1000; setBtn(); }
    function reset() {
      running = false; cancelAnimationFrame(raf); elapsedBefore = 0; phaseIdx = 0; cycle = 1;
      ring.style.setProperty("--breath", "0.62"); ring.style.setProperty("--breath-dur", "0.6s");
      setBtn(); paint(0);
    }
    bStart.addEventListener("click", function () { running ? pause() : start(); });
    bReset.addEventListener("click", reset);
    document.addEventListener("visibilitychange", function () { /* läuft über performance.now weiter, nichts zu tun */ });
    if (options && !phases) {
      optSeg = T.segment(side.querySelector(".t-seg"), { value: String(seconds), onChange: function (v) { seconds = Number(v); reset(); } });
    }
    reset();
    var api = { start: start, pause: pause, reset: reset, set: function (s) { seconds = s; reset(); }, el: root };
    root._timer = api;
    return api;
  };

  /* ---------- Checkliste mit Speicherstand ---------- */
  // <ul class="t-check" data-checklist="vorbereitung"><li><label><input type="checkbox"><span>Text</span></label></li></ul>
  T.checklist = function (root, opts) {
    root = q(root);
    if (!root || root._check) return;
    opts = opts || {};
    var k = "check:" + (root.getAttribute("data-checklist") || "liste");
    var boxes = qa('input[type="checkbox"]', root);
    var saved = T.store.get(k, []) || [];
    boxes.forEach(function (b, i) { if (saved.indexOf(i) >= 0) b.checked = true; });
    var status = null, prog = null;
    if (!root.hasAttribute("data-no-status")) {
      status = h("div", { class: "t-check__status" });
      root.parentNode.insertBefore(status, root.nextSibling);
      prog = T.progress(status, { unit: root.getAttribute("data-unit") || "erledigt", label: "Checkliste", resetText: "Zurücksetzen", onReset: function () {
        boxes.forEach(function (b) { b.checked = false; });
        save(); T.announce("Checkliste zurückgesetzt.");
      } });
    }
    function save() {
      var on = [];
      boxes.forEach(function (b, i) { if (b.checked) on.push(i); });
      T.store.set(k, on);
      if (prog) prog.set(on.length, boxes.length);
      root.dispatchEvent(new CustomEvent("check:change", { detail: { done: on.length, total: boxes.length }, bubbles: true }));
    }
    boxes.forEach(function (b) { b.addEventListener("change", save); });
    save();
    root._check = true;
  };

  /* ---------- Vorher/Nachher-Vergleich ---------- */
  T.compare = function (root) {
    root = q(root);
    if (!root || root._cmp) return;
    root._cmp = true;
    root.classList.add("t-compare");
    var bar = root.querySelector(".t-compare__bar");
    if (!bar) { bar = h("div", { class: "t-compare__bar" }); root.insertBefore(bar, root.firstChild); }
    var tg = h("button", { type: "button", class: "t-iconbtn", "aria-pressed": "true", text: "Unterschiede markiert" });
    tg.addEventListener("click", function () {
      var on = tg.getAttribute("aria-pressed") !== "true";
      tg.setAttribute("aria-pressed", on ? "true" : "false");
      tg.textContent = on ? "Unterschiede markiert" : "Unterschiede ausgeblendet";
      root.classList.toggle("is-plain", !on);
    });
    bar.appendChild(tg);
    function hot(n, on) {
      qa('[data-n="' + n + '"]', root).forEach(function (x) { x.classList.toggle("is-hot", on); });
    }
    qa(".t-compare__notes li[data-n]", root).forEach(function (li) {
      var n = li.getAttribute("data-n");
      li.tabIndex = 0;
      ["mouseenter", "focus"].forEach(function (ev) { li.addEventListener(ev, function () { hot(n, true); }); });
      ["mouseleave", "blur"].forEach(function (ev) { li.addEventListener(ev, function () { hot(n, false); }); });
    });
  };

  /* ---------- Schritt-für-Schritt-Anleitung ---------- */
  T.steps = function (root) {
    root = q(root);
    if (!root || root._steps) return;
    root._steps = true;
    var btns = qa(".t-steps__btn", root);
    var target = root.querySelector("[data-steps-target]");
    var note = root.querySelector("[data-steps-note]");
    function set(n) {
      btns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-step") === n ? "true" : "false"); });
      if (target) qa("mark[data-step]", target).forEach(function (m) { m.classList.toggle("is-active", (" " + m.getAttribute("data-step") + " ").indexOf(" " + n + " ") >= 0); });
      if (note) { var b = btns.filter(function (x) { return x.getAttribute("data-step") === n; })[0]; note.textContent = b ? (b.getAttribute("data-note") || "") : ""; }
    }
    btns.forEach(function (b) { b.type = "button"; b.addEventListener("click", function () { set(b.getAttribute("data-step")); }); });
    if (btns[0]) set(btns[0].getAttribute("data-step"));
  };

  /* ---------- "Übung starten" ---------- */
  function initStart(a) {
    a.addEventListener("click", function (e) {
      var id = (a.getAttribute("href") || "").replace(/^#/, "");
      var zone = id && document.getElementById(id);
      if (!zone) return;
      e.preventDefault();
      zone.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      var f = a.getAttribute("data-start") && document.querySelector(a.getAttribute("data-start"));
      f = f || zone.querySelector(".t-card, .t-opt, button, input, textarea, select") || zone;
      if (!f.hasAttribute("tabindex") && !/^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(f.tagName)) f.tabIndex = -1;
      setTimeout(function () { f.focus({ preventScroll: true }); }, reduced() ? 0 : 450);
      if (history.replaceState) history.replaceState(null, "", "#" + id);
    });
  }

  /* ---------- Automatische Initialisierung ---------- */
  T.init = function (scope) {
    var s = scope || document;
    qa("[data-seg]", s).forEach(function (el) { T.segment(el); });
    qa("[data-checklist]", s).forEach(function (el) { T.checklist(el); });
    qa("[data-compare]", s).forEach(function (el) { T.compare(el); });
    qa("[data-steps]", s).forEach(function (el) { T.steps(el); });
    qa("[data-timer]", s).forEach(function (el) { T.timer(el); });
    qa("a[data-start]", s).forEach(initStart);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { T.init(); });
  else T.init();
})();

/* =====================================================================
   Legacy-Engine: ältere Werkzeugseiten mit globalen DECKS/QUIZ und festen IDs
   (#fcard, #deckRow, #catRow, #quizBox ...). Läuft nur, wenn diese Struktur da ist.
   ===================================================================== */
(function () {
  if (typeof DECKS === "undefined" || !document.getElementById("fcard")) return;
  const $ = id => document.getElementById(id);
  const mischen = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let deck = Object.keys(DECKS)[0];
  let kat = null;
  let stapel = [];
  let gesamt = 0;
  let geschafft = 0;
  let offen = false;

  function baueDeckRow() {
    const row = $("deckRow");
    row.innerHTML = "";
    for (const d of Object.keys(DECKS)) {
      const b = document.createElement("button");
      b.className = "chip" + (d === deck ? " aktiv" : "");
      b.textContent = d;
      b.onclick = () => { deck = d; kat = null; baueDeckRow(); baueKatRow(); neuerStapel(); };
      row.appendChild(b);
    }
  }

  function baueKatRow() {
    const row = $("catRow");
    row.innerHTML = "";
    const kats = Object.keys(DECKS[deck]);
    if (!kats.includes(kat)) kat = kats[0];
    for (const k of kats) {
      const b = document.createElement("button");
      b.className = "chip" + (k === kat ? " aktiv" : "");
      b.textContent = k + " (" + DECKS[deck][k].length + ")";
      b.onclick = () => { kat = k; baueKatRow(); neuerStapel(); };
      row.appendChild(b);
    }
  }

  function kartenAktionen() { return $("btnKnown") ? $("btnKnown").closest(".fcard-aktionen") : null; }

  function neuerStapel() {
    stapel = mischen([...DECKS[deck][kat]]);
    gesamt = stapel.length;
    geschafft = 0;
    $("deckFertig").hidden = true;
    $("buehne").style.display = "";
    kartenAktionen().style.display = "";
    zeigeKarte();
  }

  function updateKopf() {
    $("dkLabel").textContent = deck + ": " + kat;
    $("dkStand").textContent = geschafft + " von " + gesamt + " sitzen";
    $("dkBalken").style.width = (gesamt ? (geschafft / gesamt) * 100 : 0) + "%";
    $("restHint").textContent = stapel.length ? stapel.length + " Karten im Stapel" : "";
  }

  function zeigeKarte() {
    updateKopf();
    if (!stapel.length) {
      $("buehne").style.display = "none";
      kartenAktionen().style.display = "none";
      $("fertigText").textContent = "Alle " + gesamt + " Karten aus „" + kat + "“ sitzen. Wähle die nächste Kategorie oder mische neu.";
      $("deckFertig").hidden = false;
      return;
    }
    const [frage, antwort, detail, note] = stapel[0];
    offen = false;
    $("fcard").classList.remove("flipped");
    const seiten = $("fcard").querySelectorAll(".fcard-seite");
    if (seiten.length === 2) { seiten[0].removeAttribute("aria-hidden"); seiten[1].setAttribute("aria-hidden", "true"); }
    $("fcKatV").textContent = kat;
    $("fcKatR").textContent = kat;
    $("fcFrage").textContent = frage;
    $("fcAntwort").textContent = antwort;
    $("fcDetail").innerHTML = detail ? '<span class="bsp">' + detail + "</span>" : "";
    $("fcNote").textContent = note || "";
    $("fcNote").style.display = note ? "" : "none";
  }

  function flip() {
    offen = !offen;
    $("fcard").classList.toggle("flipped", offen);
    const seiten = $("fcard").querySelectorAll(".fcard-seite");
    if (seiten.length === 2) {
      seiten[0].toggleAttribute("aria-hidden", offen);
      seiten[1].toggleAttribute("aria-hidden", !offen);
    }
  }
  function nochmal() { if (!stapel.length) return; stapel.push(stapel.shift()); zeigeKarte(); }
  function sitzt() { if (!stapel.length) return; stapel.shift(); geschafft++; zeigeKarte(); }

  $("fcard").addEventListener("click", flip);
  $("fcard").addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
  document.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
    if (t.closest && (t.closest("#quizBox") || t.closest("#qBox"))) return;
    if (e.key === "ArrowRight") { e.preventDefault(); sitzt(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); nochmal(); }
    if (e.key === " " && t === document.body) { e.preventDefault(); flip(); }
  });
  $("btnAgain").onclick = nochmal;
  $("btnKnown").onclick = sitzt;
  $("btnShuffle").onclick = neuerStapel;

  let qIdx = 0, qPunkte = 0, qFragen = [];
  if ($("btnQuiz") && typeof QUIZ !== "undefined") {
    $("btnQuiz").onclick = () => { qFragen = mischen([...QUIZ]); qIdx = 0; qPunkte = 0; $("btnQuiz").hidden = true; zeigeFrage(); };
  }

  function zeigeFrage() {
    const box = $("quizBox");
    if (qIdx >= qFragen.length) {
      const wert = qPunkte / qFragen.length;
      const prozent = Math.round(wert * 100);
      const fazit = wert >= 0.8 ? "Die meisten Antworten sitzen. Die Lernkarten oben helfen bei den restlichen Lücken."
        : wert >= 0.5 ? "Eine solide Grundlage. Geh die Kategorien durch, in denen du geraten hast."
        : "Übe die Lernkarten oben Kategorie für Kategorie und versuch es danach noch einmal.";
      box.innerHTML = '<div class="karte"><div class="k-frage">' + qPunkte + " von " + qFragen.length + ' richtig.</div>'
        + '<div class="quiz-balken" style="margin:14px 0 4px"><div style="width:' + prozent + '%"></div></div>'
        + '<div class="k-antwort">' + fazit + "</div></div>";
      const again = document.createElement("button");
      again.className = "btn"; again.textContent = "Noch einmal";
      again.onclick = () => { $("btnQuiz").hidden = false; box.innerHTML = ""; };
      box.appendChild(again);
      return;
    }
    const q = qFragen[qIdx];
    box.innerHTML = '<div class="quiz-kopf"><span>Frage ' + (qIdx + 1) + " von " + qFragen.length + '</span><span class="qk-stand">' + qPunkte + " richtig</span></div>"
      + '<div class="quiz-balken"><div style="width:' + Math.round((qIdx / qFragen.length) * 100) + '%"></div></div>'
      + '<div class="quiz-frage">' + q.f + "</div>";
    const optionen = mischen(q.o.map((opt, i) => ({ opt, ok: i === q.r })));
    optionen.forEach(o => {
      const b = document.createElement("button");
      b.className = "quiz-opt"; b.textContent = o.opt;
      b.dataset.ok = o.ok ? "1" : "";
      b.onclick = () => {
        if (box.querySelector(".richtig")) return;
        box.querySelectorAll(".quiz-opt").forEach(x => x.classList.add(x.dataset.ok ? "richtig" : (x === b ? "falsch" : "neutral")));
        if (o.ok) qPunkte++;
        const e = document.createElement("div");
        e.className = "quiz-erkl"; e.textContent = (o.ok ? "Richtig. " : "Falsch. ") + q.e;
        box.appendChild(e);
        const weiter = document.createElement("button");
        weiter.className = "btn"; weiter.textContent = "Weiter";
        weiter.onclick = () => { qIdx++; zeigeFrage(); };
        box.appendChild(weiter);
      };
      box.appendChild(b);
    });
  }

  baueDeckRow(); baueKatRow(); neuerStapel();
})();
