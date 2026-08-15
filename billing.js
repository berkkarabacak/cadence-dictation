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

  const remaining = () => {
    if (isPro()) return Infinity;
    return Math.max(0, FREE_WEEKLY_LIMIT - used());
  };

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
    if (isPro()) {
      const paid = read(KEYS.plan, "free") === "pro";
      return paid ? "Pro · unlimited" : "Pro trial · unlimited";
    }
    const u = used();
    return `${u.toLocaleString()} / ${FREE_WEEKLY_LIMIT.toLocaleString()} words this week`;
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
