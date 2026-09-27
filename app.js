(function () {
  "use strict";

  var COLORS = [
    { id: 0, name: "Červená", hex: "#e11d48" },
    { id: 1, name: "Oranžová", hex: "#f97316" },
    { id: 2, name: "Žlutá", hex: "#facc15" },
    { id: 3, name: "Zelená", hex: "#22c55e" },
    { id: 4, name: "Tyrkysová", hex: "#0d9488" },
    { id: 5, name: "Modrá", hex: "#2563eb" },
    { id: 6, name: "Fialová", hex: "#9333ea" },
    { id: 7, name: "Růžová", hex: "#f472b6" }
  ];
  var CODE_LENGTH = 5;
  var MAX_GUESSES = 12;
  var STORAGE_KEY = "lamac-kodu:v1";

  var state = {
    secret: [],
    guesses: [],
    input: [],
    selected: -1,
    status: "playing",
    celebrated: false,
    lastGuessCount: 0,
    scrollPending: true,
    toast: "",
    popSlot: -1,
    busy: false,
    played: 0,
    won: 0
  };
  var toastTimer = null;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function colorById(id) {
    for (var i = 0; i < COLORS.length; i++) {
      if (COLORS[i].id === id) return COLORS[i];
    }
    return null;
  }

  function emptyInput() {
    var arr = [];
    for (var i = 0; i < CODE_LENGTH; i++) arr.push(null);
    return arr;
  }

  function isColorId(value) {
    return typeof value === "number" && value >= 0 && value < COLORS.length;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        secret: state.secret,
        guesses: state.guesses,
        status: state.status,
        celebrated: state.celebrated,
        played: state.played,
        won: state.won
      }));
    } catch (e) {}
  }

  function restore() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data || !Array.isArray(data.secret) || data.secret.length !== CODE_LENGTH) return false;
    if (!data.secret.every(isColorId)) return false;
    if (!Array.isArray(data.guesses)) return false;
    var guesses = [];
    for (var i = 0; i < data.guesses.length; i++) {
      var g = data.guesses[i];
      if (!g || !Array.isArray(g.guess) || g.guess.length !== CODE_LENGTH || !g.guess.every(isColorId)) return false;
      guesses.push({ guess: g.guess.slice(), whites: Number(g.whites) || 0, blacks: Number(g.blacks) || 0 });
    }
    state.secret = data.secret.slice();
    state.guesses = guesses;
    state.status = data.status === "won" || data.status === "lost" ? data.status : "playing";
    state.celebrated = !!data.celebrated;
    state.played = Number(data.played) || 0;
    state.won = Number(data.won) || 0;
    state.lastGuessCount = guesses.length;
    state.scrollPending = true;
    state.popSlot = -1;
    return true;
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function generateSecret() {
    var pool = COLORS.map(function (c) { return c.id; });
    for (var i = pool.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, CODE_LENGTH);
  }

  function computeFeedback(secret, guess) {
    var secretCounts = {}, guessCounts = {};
    COLORS.forEach(function (c) { secretCounts[c.id] = 0; guessCounts[c.id] = 0; });
    var whites = 0;
    for (var i = 0; i < CODE_LENGTH; i++) {
      if (secret[i] === guess[i]) whites++;
      secretCounts[secret[i]]++;
      guessCounts[guess[i]]++;
    }
    var total = 0;
    COLORS.forEach(function (c) { total += Math.min(secretCounts[c.id], guessCounts[c.id]); });
    return { whites: whites, blacks: total - whites };
  }

  function paint(node, colorId) {
    if (colorId === null || colorId === undefined) return node;
    node.classList.add("filled");
    node.style.backgroundColor = colorById(colorId).hex;
    return node;
  }

  function celebrate() {
    var box = el("div", "confetti");
    for (var i = 0; i < 60; i++) {
      var piece = el("i");
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = COLORS[randomInt(COLORS.length)].hex;
      piece.style.animationDuration = 1.1 + Math.random() * 0.9 + "s";
      piece.style.animationDelay = Math.random() * 0.35 + "s";
      piece.style.width = 7 + Math.random() * 8 + "px";
      piece.style.height = 10 + Math.random() * 8 + "px";
      box.appendChild(piece);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 2600);
  }

  function showToast(text) {
    state.toast = text;
    render();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      state.toast = "";
      render();
    }, 2600);
  }

  function feedbackGrid(whites, blacks) {
    var grid = el("div", "fb");
    var total = 0;
    for (var w = 0; w < whites && total < CODE_LENGTH; w++, total++) grid.appendChild(el("div", "fb-peg white"));
    for (var b = 0; b < blacks && total < CODE_LENGTH; b++, total++) grid.appendChild(el("div", "fb-peg black"));
    while (total < CODE_LENGTH) { grid.appendChild(el("div", "fb-empty")); total++; }
    return grid;
  }

  function formatSecret(secret) {
    return secret.map(function (id) { return colorById(id).name; }).join(", ");
  }

  function renderStatus() {
    if (state.status === "won") {
      return el("div", "status-pill won", "Vyhrál jsi! Uhodl jsi za " + state.guesses.length + " pokusů.");
    }
    if (state.status === "lost") {
      return el("div", "status-pill lost", "Prohrál jsi. Kód byl " + formatSecret(state.secret) + ".");
    }
    return el("div", "status-pill playing", "Hádej kód — pokus " + (state.guesses.length + 1) + " z " + MAX_GUESSES);
  }

  function renderStats() {
    var wrap = el("div", "stats");
    wrap.appendChild(el("span", null, "Odehráno: "));
    wrap.appendChild(el("b", null, String(state.played)));
    wrap.appendChild(el("span", null, "Vyhráno: "));
    wrap.appendChild(el("b", null, String(state.won)));
    return wrap;
  }

  function renderReveal() {
    var wrap = el("div", "reveal");
    wrap.appendChild(el("span", "label", "tajný kód"));
    var slots = el("div", "slots");
    for (var i = 0; i < state.secret.length; i++) slots.appendChild(paint(el("div", "slot"), state.secret[i]));
    wrap.appendChild(slots);
    return wrap;
  }

  function pop(i) {
    state.popSlot = i;
    setTimeout(function () {
      if (state.popSlot === i) {
        state.popSlot = -1;
        render();
      }
    }, 650);
  }

  function makeInputSlot(i) {
    var slot = paint(el("div", "slot"), state.input[i]);
    if (state.selected === i) slot.classList.add("selected");
    if (state.popSlot === i) slot.classList.add("plop");
    slot.setAttribute("data-slot", String(i));
    slot.setAttribute("role", "button");
    slot.setAttribute("tabindex", "0");
    slot.setAttribute("aria-label", "pozice " + (i + 1));
    slot.addEventListener("click", function () {
      state.selected = i;
      render();
    });
    return slot;
  }

  function renderBoard() {
    var board = el("div", "board");
    for (var i = 0; i < MAX_GUESSES; i++) {
      var row = el("div", "row");
      row.setAttribute("data-row", String(i));
      row.appendChild(el("div", "row-num", String(i + 1)));
      var slots = el("div", "slots");

      if (i < state.guesses.length) {
        var g = state.guesses[i];
        for (var s = 0; s < g.guess.length; s++) slots.appendChild(paint(el("div", "slot"), g.guess[s]));
        row.appendChild(slots);
        row.appendChild(feedbackGrid(g.whites, g.blacks));
        if (state.status !== "playing" && i === state.guesses.length - 1) {
          row.classList.add(state.status === "won" ? "won" : "lost");
        }
      } else {
        for (var e = 0; e < CODE_LENGTH; e++) slots.appendChild(el("div", "slot"));
        row.appendChild(slots);
        row.appendChild(el("div", "fb"));
      }

      if (state.status === "playing" && i === state.guesses.length) {
        row.classList.add("current");
        slots.textContent = "";
        for (var k = 0; k < CODE_LENGTH; k++) slots.appendChild(makeInputSlot(k));
      }
      board.appendChild(row);
    }
    return board;
  }

  function renderControls() {
    var controls = el("div", "controls");

    var palette = el("div", "palette");
    COLORS.forEach(function (c) {
      var b = el("button", "swatch");
      b.type = "button";
      b.style.backgroundColor = c.hex;
      b.title = c.name;
      b.setAttribute("aria-label", c.name);
      b.setAttribute("data-color", String(c.id));
      b.disabled = state.busy;
      b.addEventListener("click", function () {
        var target = state.input.indexOf(null);
        if (target === -1) {
          if (state.selected === -1) return;
          target = state.selected;
          state.input[target] = c.id;
        } else {
          state.input[target] = c.id;
          state.selected = state.input.indexOf(null);
        }
        pop(target);
        render();
      });
      palette.appendChild(b);
    });
    controls.appendChild(palette);

    var actions = el("div", "btn-row");
    var submit = el("button", "btn", "Hádat");
    submit.type = "button";
    submit.setAttribute("data-action", "submit");
    submit.disabled = state.busy || state.input.indexOf(null) !== -1;
    submit.addEventListener("click", submitGuess);
    actions.appendChild(submit);

    var reset = el("button", "btn ghost", "Smazat");
    reset.type = "button";
    reset.setAttribute("data-action", "clear");
    reset.disabled = state.busy;
    reset.addEventListener("click", function () {
      state.input = emptyInput();
      state.selected = -1;
      render();
    });
    actions.appendChild(reset);
    controls.appendChild(actions);

    var legend = el("div", "legend");
    var w = el("span");
    w.appendChild(el("i", "w"));
    w.appendChild(el("span", null, "bílá = barva i pozice"));
    legend.appendChild(w);
    var b = el("span");
    b.appendChild(el("i", "b"));
    b.appendChild(el("span", null, "černá = jen barva"));
    legend.appendChild(b);
    controls.appendChild(legend);

    return controls;
  }

  function render() {
    var root = document.getElementById("game-root");
    root.textContent = "";

    root.appendChild(renderStats());

    var status = renderStatus();
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    root.appendChild(status);

    if (state.status !== "playing") root.appendChild(renderReveal());

    root.appendChild(renderBoard());

    if (state.guesses.length !== state.lastGuessCount) {
      state.lastGuessCount = state.guesses.length;
      state.scrollPending = true;
    }
    if (state.scrollPending) {
      var current = root.querySelector(".row.current");
      if (current) current.scrollIntoView({ block: "center" });
      state.scrollPending = false;
    }

    if (state.status === "playing") {
      root.appendChild(renderControls());
    } else {
      var again = el("button", "btn block", "Hrát znovu");
      again.type = "button";
      again.addEventListener("click", newGame);
      root.appendChild(again);
    }

    if (state.toast) root.appendChild(el("div", "toast", state.toast));

    if (state.status === "won" && !state.celebrated) {
      state.celebrated = true;
      save();
      celebrate();
    }
  }

  function showEvaluation(guess, feedback, done) {
    var overlay = el("div", "overlay");
    var card = el("div", "eval-card");

    var title = "Vyhodnocení";
    if (feedback.whites === CODE_LENGTH) title = "Správně!";
    else if (feedback.whites + feedback.blacks === 0) title = "Nic nesedí";
    card.appendChild(el("div", "eval-title", title));

    var slots = el("div", "slots eval-slots");
    for (var i = 0; i < CODE_LENGTH; i++) slots.appendChild(paint(el("div", "slot"), guess[i]));
    card.appendChild(slots);

    var fbWrap = el("div", "eval-fb");
    var pegs = [];
    var w;
    for (w = 0; w < feedback.whites; w++) {
      var pw = el("div", "fb-peg white");
      fbWrap.appendChild(pw);
      pegs.push(pw);
    }
    for (var b = 0; b < feedback.blacks; b++) {
      var pb = el("div", "fb-peg black");
      fbWrap.appendChild(pb);
      pegs.push(pb);
    }
    if (pegs.length === 0) fbWrap.appendChild(el("div", "eval-none", "žádná shoda"));
    card.appendChild(fbWrap);

    var counts = el("div", "eval-counts");
    counts.appendChild(el("span", "eval-count", feedback.whites + "× správná barva i pozice"));
    counts.appendChild(el("span", "eval-count", feedback.blacks + "× správná barva, špatná pozice"));
    card.appendChild(counts);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var PAUSE = 500;
    var STEP = 500;
    pegs.forEach(function (peg, idx) {
      setTimeout(function () { peg.classList.add("shown"); }, PAUSE + STEP * idx);
    });
    setTimeout(function () { counts.classList.add("shown"); }, PAUSE + STEP * pegs.length);
    setTimeout(function () {
      overlay.classList.add("closing");
      setTimeout(function () {
        overlay.remove();
        done();
      }, 200);
    }, 5000);
  }

  function commitGuess(guess, feedback) {
    state.guesses.push({ guess: guess, whites: feedback.whites, blacks: feedback.blacks });
    state.input = emptyInput();
    state.selected = -1;
    if (feedback.whites === CODE_LENGTH) {
      state.status = "won";
      state.played++;
      state.won++;
    } else if (state.guesses.length >= MAX_GUESSES) {
      state.status = "lost";
      state.played++;
    }
    save();
    render();
  }

  function submitGuess() {
    if (state.status !== "playing" || state.busy) return;
    if (state.input.indexOf(null) !== -1) return;
    var guess = state.input.slice();
    var feedback = computeFeedback(state.secret, guess);
    state.busy = true;
    render();
    showEvaluation(guess, feedback, function () {
      state.busy = false;
      commitGuess(guess, feedback);
    });
  }

  function newGame() {
    state.secret = generateSecret();
    state.guesses = [];
    state.input = emptyInput();
    state.selected = -1;
    state.status = "playing";
    state.celebrated = false;
    state.lastGuessCount = 0;
    state.scrollPending = true;
    state.toast = "";
    state.popSlot = -1;
    save();
    render();
  }

  document.getElementById("new-game").addEventListener("click", newGame);

  if (/[?&]debug\b/.test(location.search)) {
    window.__lamac = {
      getSecret: function () { return state.secret.slice(); },
      getStatus: function () { return state.status; },
      newGame: newGame
    };
  }

  if (restore()) render();
  else newGame();
})();
