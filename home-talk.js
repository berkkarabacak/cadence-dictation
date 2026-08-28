(() => {
  if (!document.body.classList.contains("sell")) return;

  const $ = (s, r = document) => r.querySelector(s);
  const holdTalk = $("#hold-talk");
  const navTalk = $("#nav-talk");
  const typed = $("#win-typed");
  const status = $("#talk-status");
  const heroRaw = $("#hero-raw");
  if (!holdTalk && !navTalk) return;

  const FILLERS = new Set([
    "um", "umm", "uh", "uhh", "er", "ah", "hmm", "huh",
    "like", "basically", "literally", "actually",
  ]);
  const FILLER_PHRASES = [
    /\byou know\b/gi,
    /\bi mean\b/gi,
    /\bsort of\b/gi,
    /\bkind of\b/gi,
    /\bat the end of the day\b/gi,
  ];

  function collapseRepeats(text) {
    return text.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");
  }

  function stripFillers(text) {
    let t = text;
    FILLER_PHRASES.forEach((re) => { t = t.replace(re, " "); });
    t = t.replace(/\b[\w']+\b/g, (word, offset, full) => {
      const lower = word.toLowerCase();
      if (!FILLERS.has(lower)) return word;
      if (lower === "like") {
        const before = full.slice(Math.max(0, offset - 12), offset).toLowerCase();
        if (/\b(i|we|they|you|would|looks?|feels?|sounds?)\s+$/.test(before)) return word;
      }
      if (lower === "actually") return word;
      return "";
    });
    return t.replace(/\s+/g, " ").trim();
  }

  function applyCorrections(text) {
    let t = text;
    t = t.replace(/\bnot\s+(\w+)(?:\s+the)?\s+following\s+(\w+)/gi, "$2");
    t = t.replace(/\b(?:wait(?:\s+no)?|no wait|sorry)\s+/gi, "§ ");
    t = t.replace(/\bactually\s+/gi, "§ ");
    t = t.split(/(?<=[.!?])\s+/).map((clause) => {
      if (!clause.includes("§")) return clause;
      const parts = clause.split("§").map((s) => s.trim()).filter(Boolean);
      return parts[parts.length - 1] || clause;
    }).join(" ");
    t = t.replace(/\bend of week\s+(?:end of day\s+)?/gi, "end of day ");
    return t.replace(/\s+/g, " ").trim();
  }

  function punctuate(text) {
    let t = text.trim();
    if (!t) return "";
    t = t.replace(/\s+/g, " ");
    const qStart = /^(can|could|would|will|do|does|did|is|are|was|were|what|when|where|why|how|who|should)\b/i;
    const sentences = [];
    const chunks = t.split(/\s+(?:and then|also)\s+/i);
    chunks.forEach((chunk) => {
      let c = chunk.trim();
      if (!c) return;
      c = c.charAt(0).toUpperCase() + c.slice(1);
      const isQ = qStart.test(c) || /\b(right|okay)\s*$/i.test(c);
      if (!/[.!?]$/.test(c)) c += isQ ? "?" : ".";
      sentences.push(c);
    });
    return sentences.join(" ").replace(/\s+([,.!?])/g, "$1");
  }

  function cleanTranscript(raw) {
    let t = (raw || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    t = collapseRepeats(t);
    t = applyCorrections(t);
    t = stripFillers(t);
    t = collapseRepeats(t);
    t = t.replace(/\s+/g, " ").trim();
    t = punctuate(t);
    t = t.replace(/\bgonna\b/gi, "going to").replace(/\bwanna\b/gi, "want to");
    return t.trim();
  }

  const setStatus = (msg) => {
    if (!status) return;
    status.hidden = !msg;
    status.textContent = msg || "";
  };

  const pauseHero = () => {
    window.CadenceHeroPause = true;
  };

  const idleLabel = holdTalk ? holdTalk.textContent : "Hold to talk";
  let rec = null;
  let listening = false;
  let session = "";

  const paintHot = (on) => {
    holdTalk?.classList.toggle("is-hot", on);
    navTalk?.classList.toggle("is-hot", on);
    if (holdTalk) holdTalk.textContent = on ? "Listening…" : idleLabel;
  };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    holdTalk && (holdTalk.title = "Use Chrome or Edge");
    navTalk && (navTalk.title = "Use Chrome or Edge");
    setStatus("Use Chrome or Edge");
  } else {
    rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const piece = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += piece + " ";
        else interim += piece;
      }
      session = (final + interim).trim();
      if (heroRaw) heroRaw.textContent = session;
      if (typed) typed.textContent = session;
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") setStatus("Allow the mic — then hold again");
      else if (ev.error === "no-speech") setStatus("");
      else if (ev.error !== "aborted") setStatus("Mic error — hold again");
      listening = false;
      paintHot(false);
      try { rec.stop(); } catch { /* */ }
    };
    rec.onend = () => {
      if (listening) {
        try { rec.start(); } catch { /* */ }
      }
    };
  }

  const start = (e) => {
    e?.preventDefault?.();
    pauseHero();
    if (listening) return;
    if (!rec) return;
    listening = true;
    session = "";
    setStatus("");
    paintHot(true);
    try { rec.start(); } catch { /* */ }
  };

  const stop = () => {
    if (!listening) return;
    listening = false;
    paintHot(false);
    try { rec && rec.stop(); } catch { /* */ }
    const cleaned = cleanTranscript(session);
    if (typed) typed.textContent = cleaned;
    if (heroRaw && session) heroRaw.textContent = session;
  };

  const bind = (el) => {
    if (!el) return;
    el.addEventListener("pointerdown", start);
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("pointerup", stop);
    el.addEventListener("touchend", stop);
    el.addEventListener("mouseleave", stop);
  };
  bind(holdTalk);
  bind(navTalk);
  window.addEventListener("pointerup", stop);
  window.addEventListener("touchend", stop);


  document.querySelectorAll(".proof-grid img").forEach((img) => {
    img.addEventListener("error", () => {
      img.hidden = true;
      img.parentElement?.classList.add("is-fallback");
    });
  });
  $("#talk-free")?.addEventListener("click", (e) => {
    e.preventDefault();
    holdTalk?.scrollIntoView({ behavior: "smooth", block: "center" });
    holdTalk?.focus();
  });
})();
