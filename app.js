(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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
    chunks.forEach((chunk, i) => {
      let c = chunk.trim();
      if (!c) return;
      c = c.charAt(0).toUpperCase() + c.slice(1);
      const isQ = qStart.test(c) || /\b(right|okay)\s*$/i.test(c);
      if (!/[.!?]$/.test(c)) c += isQ ? "?" : ".";
      if (i > 0 && !isQ) c = c.replace(/^/, "");
      sentences.push(c);
    });
    return sentences.join(" ").replace(/\s+([,.!?])/g, "$1");
  }

  function toneRewrite(text, tone) {
    if (!text) return "";
    if (tone === "formal") {
      return text
        .replace(/\bHey\b/g, "Hello")
        .replace(/\bhi\b/gi, "Hello")
        .replace(/\bcan't\b/gi, "cannot")
        .replace(/\bwon't\b/gi, "will not")
        .replace(/\bI'm\b/g, "I am")
        .replace(/\blet's\b/gi, "let us")
        .replace(/\bgonna\b/gi, "going to")
        .replace(/\bwanna\b/gi, "want to")
        .replace(/\bkind of\b/gi, "somewhat")
        .replace(/\ba bit\b/gi, "slightly");
    }
    if (tone === "very") {
      return text
        .replace(/\bHello\b/g, "hey")
        .replace(/\bHi\b/g, "hey")
        .replace(/\blet us\b/gi, "let's")
        .replace(/\bcannot\b/gi, "can't")
        .replace(/\bI am\b/g, "I'm")
        .replace(/([.])\s+/g, " — ")
        .replace(/— $/,"")
        .replace(/^./, (c) => c.toLowerCase())
        .replace(/\s+/g, " ")
        .replace(/\s+$/,"")
        .replace(/[.]$/, "");
    }
    return text
      .replace(/\bgonna\b/gi, "going to")
      .replace(/\bwanna\b/gi, "want to");
  }

  function cleanTranscript(raw, tone) {
    let t = (raw || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    t = collapseRepeats(t);
    t = applyCorrections(t);
    t = stripFillers(t);
    t = collapseRepeats(t);
    t = t.replace(/\s+/g, " ").trim();
    t = punctuate(t);
    t = toneRewrite(t, tone);
    return t.trim();
  }

  const rawEl = $("#raw-out");
  const cleanEl = $("#clean-out");
  const composer = $("#composer");
  const status = $("#app-status");
  const wordCount = $("#word-count");
  const mic = $("#mic");
  const banner = $("#app-banner");
  const chip = $("#plan-chip");
  const paywall = $("#paywall");
  const paywallBody = $("#paywall-body");
  const paywallRemain = $("#paywall-remain");
  const Billing = window.CadenceBilling;

  let tone = "casual";
  let committed = "";
  let session = "";
  let rec = null;
  let listening = false;
  let hold = false;

  const spoken = () => [committed, session].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const paintChip = () => {
    if (!chip || !Billing) return;
    chip.textContent = Billing.formatChip();
    chip.classList.toggle("is-pro", Billing.isPro());
  };

  const hidePaywall = () => {
    if (!paywall) return;
    if (typeof paywall.close === "function" && paywall.open) paywall.close();
    else paywall.removeAttribute("open");
  };

  const showPaywall = ({ needed } = {}) => {
    if (!paywall || !Billing) return;
    const left = Billing.remaining();
    const limit = Billing.FREE_WEEKLY_LIMIT;
    const leftLabel = Number.isFinite(left) ? left.toLocaleString() : "unlimited";
    if (paywallRemain) {
      paywallRemain.textContent = Number.isFinite(left)
        ? `${leftLabel} of ${limit.toLocaleString()} words left this week`
        : "Pro · unlimited";
    }
    if (paywallBody) {
      if (!Number.isFinite(left) || left <= 0) {
        paywallBody.textContent = `You've reached the ${limit.toLocaleString()}-word free allowance for this week. The counter resets next Monday. Start a 14-day Pro trial or go to checkout — both unlock unlimited dictation. Nothing from this take was added.`;
      } else {
        const need = Number(needed) || 0;
        paywallBody.textContent = `This take is ${need.toLocaleString()} cleaned words. You have ${leftLabel} of ${limit.toLocaleString()} left this week, so it was not added. Shorten it, wait until next Monday, or unlock Pro.`;
      }
    }
    if (typeof paywall.showModal === "function") {
      if (!paywall.open) paywall.showModal();
    } else {
      paywall.setAttribute("open", "");
    }
  };

  const canAccept = (n) => {
    if (!Billing) return true;
    if (Billing.isPro()) return true;
    if (n <= 0) return true;
    return n <= Billing.remaining();
  };

  const paint = () => {
    const raw = spoken();
    if (rawEl) rawEl.textContent = raw || "Your spoken words land here, ums and all.";
    const cleaned = cleanTranscript(raw, tone);
    if (cleanEl) cleanEl.textContent = cleaned || "Cadence writes the version you meant.";
    if (composer && document.activeElement !== composer) composer.value = cleaned;
    const words = cleaned.trim() ? cleaned.trim().split(/\s+/).length : 0;
    if (wordCount) wordCount.textContent = words + (words === 1 ? " word" : " words");
    paintChip();
  };

  const commitSession = () => {
    const piece = session.trim();
    session = "";
    if (!piece) {
      paint();
      return false;
    }
    const cleaned = cleanTranscript(piece, tone);
    const n = Billing ? Billing.countWords(cleaned) : 0;
    if (!canAccept(n)) {
      showPaywall({ needed: n });
      paint();
      return false;
    }
    committed = [committed, piece].filter(Boolean).join(" ");
    if (n && Billing) Billing.addWords(n);
    paint();
    return true;
  };

  $$("[data-app-tone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-app-tone]").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      tone = btn.dataset.appTone;
      paint();
    });
  });

  $("#copy-btn")?.addEventListener("click", async () => {
    const text = cleanTranscript(spoken(), tone);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      status && (status.textContent = "Copied");
      setTimeout(() => { if (status) status.textContent = listening ? "Listening" : "Ready"; }, 1200);
    } catch {
      status && (status.textContent = "Copy failed");
    }
  });

  $("#clear-btn")?.addEventListener("click", () => {
    committed = "";
    session = "";
    if (composer) composer.value = "";
    paint();
  });

  composer?.addEventListener("input", () => {
    if (wordCount) {
      const words = composer.value.trim() ? composer.value.trim().split(/\s+/).length : 0;
      wordCount.textContent = words + (words === 1 ? " word" : " words");
    }
  });

  const gated = () => {
    if (!Billing || Billing.isPro()) return false;
    if (Billing.remaining() > 0) return false;
    showPaywall();
    return true;
  };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (banner) {
      banner.hidden = false;
      banner.textContent = "This browser does not expose Speech Recognition. Try Chrome or Edge, or use the scripted rooms on the Demo page.";
    }
    mic?.setAttribute("disabled", "true");
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
      paint();
      if (final.trim() && Billing && !Billing.isPro()) {
        const n = Billing.countWords(cleanTranscript(final.trim(), tone));
        if (n > Billing.remaining()) {
          session = "";
          stop();
          showPaywall({ needed: n });
          paint();
        }
      }
    };
    rec.onerror = (ev) => {
      if (banner) {
        banner.hidden = false;
        banner.classList.remove("ok");
        if (ev.error === "not-allowed") banner.textContent = "Microphone permission was denied. Allow the mic for this site and try again.";
        else if (ev.error === "no-speech") banner.textContent = "No speech heard. Hold the button and talk a little closer to the mic.";
        else banner.textContent = "Recognition error: " + ev.error;
      }
      stop();
    };
    rec.onend = () => {
      if (listening) {
        try { rec.start(); } catch {}
      }
    };
  }

  const start = () => {
    if (listening) return;
    if (gated()) return;
    if (!rec) return;
    listening = true;
    session = "";
    mic?.classList.add("is-hot");
    status && (status.textContent = "Listening");
    if (banner) { banner.hidden = true; }
    try { rec.start(); } catch {}
  };
  const stop = () => {
    const was = listening;
    listening = false;
    mic?.classList.remove("is-hot");
    status && (status.textContent = "Ready");
    try { rec && rec.stop(); } catch {}
    if (was) commitSession();
  };

  const down = (e) => {
    e.preventDefault();
    hold = true;
    start();
  };
  const up = () => {
    if (!hold) return;
    hold = false;
    stop();
  };
  mic?.addEventListener("mousedown", down);
  mic?.addEventListener("touchstart", down, { passive: false });
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
  mic?.addEventListener("click", (e) => {
    if (e.detail === 0) return;
  });
  $("#toggle-listen")?.addEventListener("click", () => {
    if (listening) stop();
    else start();
  });

  $("#paywall-close")?.addEventListener("click", hidePaywall);
  $("#paywall-trial")?.addEventListener("click", () => {
    if (!Billing) return;
    Billing.startTrial();
    hidePaywall();
    paintChip();
    if (banner) {
      banner.hidden = false;
      banner.classList.add("ok");
      banner.textContent = "Pro trial is on for 14 days — unlimited words in this browser. No card charged.";
    }
  });
  paywall?.addEventListener("cancel", (e) => {
    e.preventDefault();
    hidePaywall();
  });

  window.addEventListener("cadence-billing", paintChip);

  try {
    const just = sessionStorage.getItem("cadence_just_unlocked");
    if (just && banner) {
      sessionStorage.removeItem("cadence_just_unlocked");
      banner.hidden = false;
      banner.classList.add("ok");
      banner.textContent = just === "paid"
        ? "Pro is on in this browser — unlimited dictation."
        : "Pro is on in this browser — unlimited dictation. Payment isn't connected yet.";
    }
  } catch { /* */ }

  paint();
  window.CadenceClean = { cleanTranscript };
  window.CadenceApp = {
    simulate(text) {
      if (gated()) return false;
      session = String(text || "").trim();
      return commitSession();
    },
  };
})();
