// Lernkarten- und Quiz-Engine für die Abitur-Trainer.
// Erwartet globale Konstanten DECKS und QUIZ (siehe englisch.html / franzoesisch.html).
(function () {
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

  if (!$("fcard")) return;
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

  // ---------- Quiz ----------
  let qIdx = 0, qPunkte = 0, qFragen = [];
  $("btnQuiz").onclick = () => { qFragen = mischen([...QUIZ]); qIdx = 0; qPunkte = 0; $("btnQuiz").hidden = true; zeigeFrage(); };

  function zeigeFrage() {
    const box = $("quizBox");
    if (qIdx >= qFragen.length) {
      const wert = qPunkte / qFragen.length;
      const prozent = Math.round(wert * 100);
      const fazit = wert >= 0.8 ? "Starkes Fundament. Die Lernkarten oben schließen die letzten Lücken."
        : wert >= 0.5 ? "Solide Basis. Geh die Kategorien durch, in denen du geraten hast."
        : "Die Lernkarten oben sind der schnellste Weg nach vorn, Kategorie für Kategorie.";
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
