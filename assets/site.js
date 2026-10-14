/* PaviLabs: Einblenden, Überschriften-Wischer, Staffel, Wortlauf, Laufband */
(function () {
  var ruhig = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Staffel: Kindern einen Index geben, damit die Verzögerung per CSS wächst
  document.querySelectorAll(".stagger").forEach(function (box) {
    Array.prototype.forEach.call(box.children, function (kind, i) {
      kind.style.setProperty("--i", String(i));
    });
  });

  // Laufband: Liste verdoppeln, damit die Schleife nahtlos läuft
  document.querySelectorAll(".band-track").forEach(function (track) {
    var liste = track.querySelector("ul");
    if (!liste) return;
    var kopie = liste.cloneNode(true);
    kopie.setAttribute("aria-hidden", "true");
    track.appendChild(kopie);
  });

  // Einblenden per IntersectionObserver
  var ziele = document.querySelectorAll(".reveal, .trail, .wipe, .settle, .stagger");
  if (ruhig || !("IntersectionObserver" in window)) {
    ziele.forEach(function (el) { el.classList.add("in-view"); });
  } else {
    var io = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); }
      });
    }, { threshold: 0.2, rootMargin: "0px 0px -6% 0px" });
    ziele.forEach(function (el) { io.observe(el); });
  }

  // Wortlauf: Wörter leuchten beim Scrollen nacheinander auf
  var scrubs = [];
  document.querySelectorAll(".scrub").forEach(function (el) {
    var woerter = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    woerter.forEach(function (w, i) {
      var s = document.createElement("span");
      s.className = "w";
      s.style.setProperty("--i", String(i));
      s.textContent = w;
      el.appendChild(s);
      if (i < woerter.length - 1) el.appendChild(document.createTextNode(" "));
    });
    el.style.setProperty("--n", String(woerter.length));
    el.style.setProperty("--p", ruhig ? "1" : "0");
    scrubs.push(el);
  });
  if (scrubs.length && !ruhig) {
    var geplant = false;
    var messen = function () {
      geplant = false;
      var vh = window.innerHeight;
      scrubs.forEach(function (el) {
        var top = el.getBoundingClientRect().top;
        var p = Math.min(1, Math.max(0, (vh * 0.9 - top) / (vh * 0.45)));
        el.style.setProperty("--p", p.toFixed(3));
      });
    };
    var anstossen = function () { if (!geplant) { geplant = true; requestAnimationFrame(messen); } };
    window.addEventListener("scroll", anstossen, { passive: true });
    window.addEventListener("resize", anstossen);
    messen();
  }
})();
