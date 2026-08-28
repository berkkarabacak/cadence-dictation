(() => {
  const KEYS = {
    plan: "cadence_plan",
    words: "cadence_words_week",
    week: "cadence_week_id",
    until: "cadence_pro_until",
  };
  const FREE_WEEKLY_LIMIT = 2000;

  const read = (key, fallback = "") => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      if (value == null || value === "") localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
    } catch { /* private mode */ }
  };

  const isoWeekId = (date = new Date()) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };

  const ensureWeek = () => {
    const current = isoWeekId();
    if (read(KEYS.week, "") !== current) {
      write(KEYS.week, current);
      write(KEYS.words, "0");
    }
    return current;
  };

  const countWords = (text) => {
    const t = String(text || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  };

  const used = () => {
    ensureWeek();
    const n = Number(read(KEYS.words, "0"));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  const trialUntil = () => {
    const raw = read(KEYS.until, "");
    if (!raw) return null;
    const end = Date.parse(raw);
    if (!Number.isFinite(end)) {
      write(KEYS.until, null);
      return null;
    }
    if (Date.now() > end) {
      write(KEYS.until, null);
      return null;
    }
    return raw;
  };

  const isPro = () => read(KEYS.plan, "free") === "pro" || Boolean(trialUntil());

  const remaining = () => Infinity;

  const snapshot = () => {
    const until = trialUntil();
    const paid = read(KEYS.plan, "free") === "pro";
    return {
      plan: paid ? "pro" : until ? "trial" : "free",
      used: used(),
      remaining: remaining(),
      limit: FREE_WEEKLY_LIMIT,
      isPro: isPro(),
      trialUntil: until,
      weekId: read(KEYS.week, isoWeekId()),
    };
  };

  const emit = () => {
    window.dispatchEvent(new CustomEvent("cadence-billing", { detail: snapshot() }));
    paintRemaining();
  };

  const addWords = (n) => {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    if (!count) return used();
    if (isPro()) {
      emit();
      return used();
    }
    ensureWeek();
    const next = used() + count;
    write(KEYS.words, String(next));
    emit();
    return next;
  };

  const startTrial = () => {
    const until = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    write(KEYS.until, until.toISOString());
    emit();
    return until.toISOString();
  };

  const activatePro = () => {
    write(KEYS.plan, "pro");
    emit();
  };

  const reset = () => {
    write(KEYS.plan, "free");
    write(KEYS.words, "0");
    write(KEYS.week, isoWeekId());
    write(KEYS.until, null);
    emit();
  };

  const setUsed = (n) => {
    ensureWeek();
    const count = Math.max(0, Math.floor(Number(n) || 0));
    write(KEYS.words, String(count));
    emit();
    return count;
  };

  const formatChip = () => {
    if (read(KEYS.plan, "free") === "pro") return "Pro · unlimited";
    const raw = read(KEYS.until, "");
    const end = Date.parse(raw || "");
    if (Number.isFinite(end) && Date.now() > end) return "Trial expired · still works";
    if (Number.isFinite(end)) {
      const days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
      return days === 1 ? "Trial · 1 day left" : "Trial · " + days + " days left";
    }
    return "Trial · unlimited";
  };

  const paintRemaining = () => {
    const nodes = document.querySelectorAll("[data-billing-remaining]");
    if (!nodes.length) return;
    const snap = snapshot();
    let text;
    if (snap.isPro) {
      text = snap.plan === "pro"
        ? "You're on Pro — unlimited words."
        : "Pro trial is on — unlimited words.";
    } else if (snap.remaining === FREE_WEEKLY_LIMIT) {
      text = `${FREE_WEEKLY_LIMIT.toLocaleString()} words left this week on Free.`;
    } else {
      text = `${snap.remaining.toLocaleString()} of ${FREE_WEEKLY_LIMIT.toLocaleString()} words left this week.`;
    }
    nodes.forEach((el) => { el.textContent = text; });
  };

  const consumeUrlFlags = () => {
    let params;
    try { params = new URLSearchParams(location.search); } catch { return; }
    const success = params.get("success") === "1";
    const pro = params.get("pro") === "1";
    if (!success && !pro) return;
    activatePro();
    try { sessionStorage.setItem("cadence_just_unlocked", success ? "paid" : "pro"); } catch { /* */ }
    params.delete("success");
    params.delete("pro");
    const next = params.toString();
    try {
      history.replaceState({}, "", location.pathname + (next ? `?${next}` : "") + location.hash);
    } catch { /* */ }
  };

  const paymentLink = (plan) => {
    const links = window.CADENCE_STRIPE_PAYMENT_LINKS || {};
    return String(links[plan] || "").trim();
  };

  const initCheckout = () => {
    const root = document.querySelector("[data-checkout]");
    if (!root) return;
    const note = root.querySelector("[data-checkout-note]");
    const showNote = (text, ok) => {
      if (!note) return;
      note.hidden = false;
      note.textContent = text;
      note.classList.toggle("ok", Boolean(ok));
    };

    try {
      if (sessionStorage.getItem("cadence_just_unlocked") === "paid") {
        sessionStorage.removeItem("cadence_just_unlocked");
        showNote("You're on Pro. Unlimited dictation is on in this browser.", true);
      }
    } catch { /* */ }

    root.querySelectorAll("[data-checkout-pay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const plan = btn.getAttribute("data-checkout-pay");
        const url = paymentLink(plan);
        if (url) {
          window.location.href = url;
          return;
        }
        startTrial();
        showNote("Payment isn't connected yet — your trial is on so you can keep working.", true);
        window.setTimeout(() => { window.location.href = "app.html?pro=1"; }, 1200);
      });
    });
  };

  if (!read(KEYS.plan, "")) write(KEYS.plan, "free");
  if (!read(KEYS.until, "") && read(KEYS.plan, "free") !== "pro") {
    write(KEYS.until, new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());
  }
  ensureWeek();
  consumeUrlFlags();

  window.CadenceBilling = {
    FREE_WEEKLY_LIMIT,
    KEYS,
    countWords,
    addWords,
    remaining,
    used,
    isPro,
    isExpired: () => {
      const raw = (function(){ try { return localStorage.getItem("cadence_pro_until") || ""; } catch(e) { return ""; } })();
      if (!raw) return false;
      const end = Date.parse(raw);
      return Number.isFinite(end) && Date.now() > end && ((function(){ try { return localStorage.getItem("cadence_plan") || "free"; } catch(e) { return "free"; } })() !== "pro");
    },
    canDictate: () => true,
    isNagDue: () => {
      try {
        if (localStorage.getItem("cadence_plan") === "pro") return false;
        if (sessionStorage.getItem("cadence_nag_snooze") === "1") return false;
        const raw = localStorage.getItem("cadence_pro_until") || "";
        const end = Date.parse(raw);
        return Number.isFinite(end) && Date.now() > end;
      } catch (e) { return false; }
    },
    snoozeNag: () => { try { sessionStorage.setItem("cadence_nag_snooze", "1"); } catch (e) {} },
    startTrial,
    activatePro,
    reset,
    setUsed,
    snapshot,
    formatChip,
    isoWeekId,
    consumeUrlFlags,
  };

  const boot = () => {
    paintRemaining();
    initCheckout();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
