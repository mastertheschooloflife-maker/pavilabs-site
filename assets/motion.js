/* PaviLabs Bewegungssystem
   Dauer und Easing stehen als Custom Properties in site.css (:root, --dur-*, --ease-*, --stagger).
   Dieses Modul setzt nur Klassen und Verzögerungen:
   1. .reveal       blendet ein (Opacity, 16 px, Blur 6 px), Geschwister staffeln sich um --stagger
   2. [data-trace]  Leiterbahn zeichnet sich, danach erscheinen die Knoten nacheinander
   3. .hero         Ladesequenz: Baum als Scale-Fade, Headline zeilenweise, dann der Rest
   Ohne JS, bei prefers-reduced-motion oder ohne IntersectionObserver bleibt alles sofort sichtbar
   (Klasse .motion-off auf <html>). */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduce = !!(mq && mq.matches);
  var api = { reduce: reduce, reveal: revealNow, observe: observe };
  window.PaviMotion = api;

  function cssMs(name, fallback) {
    var v = getComputedStyle(root).getPropertyValue(name).trim();
    var n = parseFloat(v);
    if (isNaN(n)) return fallback;
    return /ms$/.test(v) ? n : (/s$/.test(v) ? n * 1000 : n);
  }
  var STAGGER = cssMs("--stagger", 60);
  var REVEAL = cssMs("--dur-reveal", 700);
  var TRACE = cssMs("--dur-trace", 1200);

  function allOn() {
    root.classList.add("motion-off");
    Array.prototype.forEach.call(document.querySelectorAll(".reveal, [data-trace]"), function (el) {
      el.classList.add("is-in", "is-drawn");
    });
  }

  if (reduce || !("IntersectionObserver" in window)) { allOn(); return; }
  if (mq && mq.addEventListener) mq.addEventListener("change", function (e) { if (e.matches) allOn(); });

  function domOrder(a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  /* ---------- 1. Einblenden mit Staffelung ---------- */
  var queue = [];
  var pending = false;
  function flush() {
    pending = false;
    queue.sort(domOrder);
    // Staffel je Elternelement: Geschwister, die gemeinsam ins Bild kommen, folgen im 60-ms-Takt
    var perParent = new Map();
    queue.forEach(function (el) {
      var p = el.parentNode;
      var i = perParent.get(p) || 0;
      perParent.set(p, i + 1);
      revealNow(el, Math.min(i, 8) * STAGGER);
    });
    queue = [];
  }
  function revealNow(el, delay) {
    el.style.setProperty("--reveal-delay", (delay || 0) + "ms");
    el.classList.add("is-in");
    setTimeout(function () { el.style.removeProperty("--reveal-delay"); el.classList.add("is-settled"); }, (delay || 0) + REVEAL + 80);
  }
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { queue.push(e.target); revealIO.unobserve(e.target); }
    });
    if (queue.length && !pending) { pending = true; requestAnimationFrame(flush); }
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  /* ---------- 2. Leiterbahnen ---------- */
  var traceIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var t = e.target;
      traceIO.unobserve(t);
      t.classList.add("is-drawn");
      setTimeout(function () { t.classList.add("is-settled"); }, TRACE + 1200);
    });
  }, { threshold: 0.45 });

  function observe(scope) {
    var s = scope || document;
    Array.prototype.forEach.call(s.querySelectorAll(".reveal:not(.is-in)"), function (el) {
      if (el.closest(".hero")) return;
      revealIO.observe(el);
    });
    Array.prototype.forEach.call(s.querySelectorAll("[data-trace]:not(.is-drawn)"), function (el) {
      traceIO.observe(el);
    });
  }

  /* ---------- 3. Hero-Ladesequenz ---------- */
  function splitLines(h) {
    if (!h || h.children.length) return 0;
    var original = h.innerHTML;
    var words = h.textContent.trim().split(/ +/);
    h.textContent = "";
    var spans = words.map(function (w, i) {
      var s = document.createElement("span");
      s.textContent = w;
      h.appendChild(s);
      if (i < words.length - 1) h.appendChild(document.createTextNode(" "));
      return s;
    });
    var lines = [];
    var top = null;
    spans.forEach(function (s) {
      if (top === null || Math.abs(s.offsetTop - top) > 4) { lines.push([]); top = s.offsetTop; }
      lines[lines.length - 1].push(s.textContent);
    });
    h.textContent = "";
    lines.forEach(function (ws, i) {
      var outer = document.createElement("span");
      outer.className = "hero-line";
      var inner = document.createElement("span");
      inner.textContent = ws.join(" ");
      inner.style.setProperty("--line-delay", (120 + i * 110) + "ms");
      outer.appendChild(inner);
      h.appendChild(outer);
      if (i < lines.length - 1) h.appendChild(document.createTextNode(" "));
    });
    h.classList.add("is-split");
    // Danach den Originaltext zurücksetzen, damit Umbrüche bei Größenänderung wieder frei fließen
    setTimeout(function () { h.innerHTML = original; h.classList.remove("is-split"); }, 120 + lines.length * 110 + REVEAL + 200);
    return lines.length;
  }

  function runHero() {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    var tree = hero.querySelector(".hero-tree");
    var h1 = hero.querySelector("h1");
    var n = splitLines(h1);
    if (tree) revealNow(tree, 0);
    if (h1) revealNow(h1, 0);
    var t = 120 + Math.max(n, 1) * 110 + 80;
    Array.prototype.forEach.call(hero.querySelectorAll(".reveal"), function (el) {
      if (el === tree || el === h1) return;
      revealNow(el, t);
      t += STAGGER * 1.5;
    });
  }

  function start() {
    var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var timeout = new Promise(function (r) { setTimeout(r, 700); });
    Promise.race([fontsReady, timeout]).then(function () {
      requestAnimationFrame(function () { runHero(); observe(document); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
