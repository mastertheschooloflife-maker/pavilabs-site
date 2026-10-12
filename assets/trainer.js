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

  function neuerStapel() {
    stapel = mischen([...DECKS[deck][kat]]);
    gesamt = stapel.length;
    geschafft = 0;
    $("deckFertig").hidden = true;
    $("buehne").style.display = "";
    document.querySelector(".fcard-aktionen").style.display = "";
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
      document.querySelector(".fcard-aktionen").style.display = "none";
      $("fertigText").textContent = "Alle " + gesamt + " Karten aus „" + kat + "“ sitzen. Wähle die nächste Kategorie oder mische neu.";
      $("deckFertig").hidden = false;
      return;
    }
    const [frage, antwort, detail, note] = stapel[0];
    offen = false;
    $("fcard").classList.remove("flipped");
    $("fcKatV").textContent = kat;
    $("fcKatR").textContent = kat;
    $("fcFrage").textContent = frage;
    $("fcAntwort").textContent = antwort;
    $("fcDetail").innerHTML = detail ? '<span class="bsp">' + detail + "</span>" : "";
    $("fcNote").textContent = note || "";
    $("fcNote").style.display = note ? "" : "none";
  }

  function flip() { offen = !offen; $("fcard").classList.toggle("flipped", offen); }
  function nochmal() { if (!stapel.length) return; stapel.push(stapel.shift()); zeigeKarte(); }
  function sitzt() { if (!stapel.length) return; stapel.shift(); geschafft++; zeigeKarte(); }

  $("fcard").addEventListener("click", flip);
  $("fcard").addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") { e.preventDefault(); sitzt(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); nochmal(); }
    if (e.key === " " && e.target === document.body) { e.preventDefault(); flip(); }
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
      const fazit = wert >= 0.8 ? "Starkes Fundament. Die Lernkarten oben schließen die letzten Lücken."
        : wert >= 0.5 ? "Solide Basis. Geh die Kategorien durch, in denen du geraten hast."
        : "Die Lernkarten oben sind der schnellste Weg nach vorn, Kategorie für Kategorie.";
      box.innerHTML = '<div class="karte"><div class="k-frage">' + qPunkte + " von " + qFragen.length + ' richtig.</div><div class="k-antwort">' + fazit + "</div></div>";
      const again = document.createElement("button");
      again.className = "btn"; again.textContent = "Noch einmal";
      again.onclick = () => { $("btnQuiz").hidden = false; box.innerHTML = ""; };
      box.appendChild(again);
      return;
    }
    const q = qFragen[qIdx];
    box.innerHTML = '<div style="color:var(--cream-dim);font-size:0.9rem;margin-top:12px">Frage ' + (qIdx + 1) + " von " + qFragen.length + '</div><div style="font-size:1.1rem;margin:8px 0 4px">' + q.f + "</div>";
    q.o.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "quiz-opt"; b.textContent = opt;
      b.onclick = () => {
        if (box.querySelector(".richtig")) return;
        box.querySelectorAll(".quiz-opt").forEach((x, j) => x.classList.add(j === q.r ? "richtig" : (x === b ? "falsch" : "neutral")));
        if (i === q.r) qPunkte++;
        const e = document.createElement("div");
        e.className = "quiz-erkl"; e.textContent = q.e;
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
