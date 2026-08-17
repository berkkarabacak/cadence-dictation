(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const nav = $("#nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    $("#nav-toggle")?.addEventListener("click", () => nav.classList.toggle("is-open"));
  }

  $$(".faq-item button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const open = item.classList.contains("is-open");
      $$(".faq-item").forEach((el) => el.classList.remove("is-open"));
      if (!open) item.classList.add("is-open");
    });
  });

  /* ---------- Hero live cleanup ---------- */
  const heroRaw = $("#hero-raw");
  const heroClean = $("#hero-clean");
  const winTyped = $("#win-typed");
  const sellHold = document.body.classList.contains("sell") && $("#hold-talk");
  const cleanTarget = heroClean || winTyped;
  if (heroRaw && cleanTarget && (heroClean || sellHold || winTyped)) {
    const raw =
      "uh so hey just wanted to um check in about the the deck for Thursday wait no Friday's review I think Maya's gonna take the first half but I'm not totally sure and like can you also see if the notes from the kickoff got sent I mentioned it to her but she didn't confirm and now I'm kind of lost honestly";
    const clean =
      "Hey — just checking in about the deck for Friday's review. I think Maya will take the first half, but I'm not totally sure. Can you also see if the notes from the kickoff were sent? I mentioned it to her, but she didn't confirm, and now I'm a bit lost.";

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const paused = () => !!window.CadenceHeroPause;
    const typeInto = async (el, text, ms, cls) => {
      if (!el || paused()) return;
      if (el.classList && el.classList.contains("stage-text")) {
        el.className = "stage-text " + cls;
      }
      el.textContent = "";
      for (let i = 0; i < text.length; i++) {
        if (paused()) return;
        el.textContent = text.slice(0, i + 1);
        if (i % 2 === 0) await sleep(ms);
      }
    };

    const highlightRaw = () => {
      if (paused() || !heroRaw) return;
      if (!heroRaw.classList.contains("stage-text")) {
        heroRaw.textContent = raw;
        return;
      }
      const parts = [
        ["uh so hey just wanted to ", ""],
        ["um ", "hl-fill"],
        ["check in about ", ""],
        ["the the ", "hl-rep"],
        ["deck for ", ""],
        ["Thursday wait no Friday's", "hl-corr"],
        [" review I think Maya's gonna take the first half but I'm not totally sure and ", ""],
        ["like ", "hl-fill"],
        ["can you also see if the notes from the kickoff got sent I mentioned it to her but she didn't confirm and now I'm kind of lost honestly", ""],
      ];
      if (heroRaw.classList && heroRaw.classList.contains("stage-text")) {
        heroRaw.className = "stage-text is-raw";
      }
      heroRaw.innerHTML = parts
        .map(([t, c]) => (c ? `<mark class="${c}">${t}</mark>` : t))
        .join("");
    };

    const loop = async () => {
      while (!paused()) {
        if (heroClean) heroClean.textContent = "";
        if (winTyped) winTyped.textContent = "";
        await typeInto(heroRaw, raw, 12, "is-raw");
        if (paused()) return;
        await sleep(500);
        if (paused()) return;
        highlightRaw();
        await sleep(900);
        if (paused()) return;
        if (heroClean) await typeInto(heroClean, clean, 10, "is-clean");
        if (paused()) return;
        if (winTyped) await typeInto(winTyped, clean, 10, "is-clean");
        if (paused()) return;
        await sleep(3200);
      }
    };
    loop();
  }

  /* ---------- Speed streams ---------- */
  const streamText =
    "I'm getting started on the brief. Want me to open a fresh file, or pull in the one from last week? Give me a second — structure is up. Walk me through what you're building, or start from a template. I'll follow your lead.";
  const runStream = (el, wpm) => {
    if (!el) return;
    const cps = (wpm * 5) / 60;
    let i = 0;
    let acc = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      acc += dt * cps;
      const n = Math.floor(acc);
      if (n > 0) {
        i = (i + n) % (streamText.length * 3);
        acc -= n;
        const buf = (streamText + " ").repeat(4);
        el.textContent = buf.slice(i, i + 420);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  runStream($("#kb-stream"), 45);
  runStream($("#voice-stream"), 220);

  /* ---------- Cleanup chips demo ---------- */
  const rawEl = $("#cleanup-raw");
  const outEl = $("#cleanup-out");
  if (rawEl && outEl) {
    const raw =
      "hey so um can you actually wait can you tell Jordan that the the vendor call is gonna move I think to like not Tuesday the following Wednesday because we're still waiting on uh finance to approve the the new quote and yeah just let them know we'll have a real number by by end of week sorry end of day Thursday";
    const clean =
      "Can you tell Jordan the vendor call is moving to Wednesday? We're still waiting on finance to approve the new quote. We'll have a firm number by end of day Thursday.";
    rawEl.textContent = raw;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cycle = async () => {
      while (true) {
        $$(".flag").forEach((f) => f.classList.remove("on"));
        outEl.textContent = "Listening…";
        await sleep(800);
        rawEl.innerHTML =
          'hey so <mark class="hl-fill">um</mark> can you <mark class="hl-corr">actually wait can you</mark> tell Jordan that <mark class="hl-rep">the the</mark> vendor call is gonna move I think to <mark class="hl-corr">like not Tuesday the following Wednesday</mark> because we\'re still waiting on <mark class="hl-fill">uh</mark> finance to approve <mark class="hl-rep">the the</mark> new quote and yeah just let them know we\'ll have a real number <mark class="hl-rep">by by</mark> end of week <mark class="hl-corr">sorry end of day Thursday</mark>';
        await sleep(400);
        $("#chip-fill")?.classList.add("on");
        await sleep(350);
        $("#chip-corr")?.classList.add("on");
        await sleep(350);
        $("#chip-rep")?.classList.add("on");
        await sleep(500);
        outEl.textContent = clean;
        await sleep(3600);
      }
    };
    cycle();
  }

  /* ---------- Pillar mini demos ---------- */
  const minis = [
    {
      el: "#mini-speak",
      frames: [
        "so the thing is wait no the other thing — we should push the review, I think, unless Maya already booked the room",
        "We should push the review, unless Maya already booked the room.",
      ],
    },
    {
      el: "#mini-edit",
      frames: [
        "um yeah can you send the recap like with the three action items and uh the owners",
        "Can you send the recap with the three action items and the owners?",
      ],
    },
    {
      el: "#mini-anywhere",
      frames: [
        "Cursor · Slack · Mail · Notes · Linear",
        "Wherever the caret is, Cadence types.",
      ],
    },
  ];
  minis.forEach(({ el, frames }) => {
    const node = $(el);
    if (!node) return;
    let i = 0;
    node.textContent = frames[0];
    setInterval(() => {
      i = (i + 1) % frames.length;
      node.textContent = frames[i];
    }, 2800);
  });

  /* ---------- Tone switcher ---------- */
  const tones = {
    formal:
      "Would you be available for lunch tomorrow? Twelve o'clock works well on my side if that suits you.",
    casual: "Hey, are you free for lunch tomorrow? Let's do 12 if that works for you.",
    very: "hey you free for lunch tomorrow? 12 works if you're down",
  };
  const sample = $("#tone-sample");
  $$("[data-tone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-tone]").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      if (sample) sample.textContent = tones[btn.dataset.tone];
    });
  });

  /* ---------- Pricing billing toggle ---------- */
  const priceAmt = $("#pro-amt");
  const priceNote = $("#pro-note");
  $$("[data-bill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-bill]").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      const annual = btn.dataset.bill === "annual";
      if (priceAmt) priceAmt.innerHTML = annual ? '$12<small>/user/mo</small>' : '$15<small>/user/mo</small>';
      if (priceNote) priceNote.textContent = annual ? "Billed $144/year · 20% off" : "Billed monthly · cancel anytime";
      const tablePro = $("#table-pro-price");
      if (tablePro) tablePro.textContent = annual ? "$12 / user / mo" : "$15 / user / mo";
    });
  });

  /* ---------- ROI ---------- */
  const hours = $("#roi-hours");
  const rate = $("#roi-rate");
  const paintRoi = () => {
    if (!hours || !rate) return;
    const h = Number(hours.value);
    const r = Number(rate.value);
    $("#roi-hours-val") && ($("#roi-hours-val").textContent = h.toFixed(1));
    $("#roi-rate-val") && ($("#roi-rate-val").textContent = r.toFixed(0));
    const savedMonth = h * 0.75 * 22;
    const annual = savedMonth * r * 12 - 144;
    $("#roi-hours-saved") && ($("#roi-hours-saved").textContent = Math.round(savedMonth) + " hrs");
    $("#roi-money") && ($("#roi-money").textContent = "$" + Math.max(0, Math.round(annual)).toLocaleString());
  };
  hours?.addEventListener("input", paintRoi);
  rate?.addEventListener("input", paintRoi);
  paintRoi();

  /* ---------- Demo rooms (scripted + optional live mic) ---------- */
  const rooms = {
    prompt: {
      raw: "um okay write me a uh python script that like reads a csv and wait no a json file and then um prints the top ten items by revenue actually make it a function I can import",
      clean: "Write a Python function I can import that reads a JSON file and prints the top ten items by revenue.",
    },
    message: {
      raw: "hey are you free for lunch tomorrow wait no Thursday let's do like noon if that works also bring the um the notes from last week actually don't I already have them",
      clean: "Hey, are you free for lunch Thursday? Let's do noon if that works. Don't bring the notes from last week — I already have them.",
    },
    list: {
      raw: "okay I need milk eggs the good bread not the white one um avocados if they're ripe cilantro and wait also limes",
      clean: "1. Milk\n2. Eggs\n3. The good bread (not white)\n4. Avocados, if they're ripe\n5. Cilantro\n6. Limes",
    },
    email: {
      raw: "hi priya just circling back on the um Q3 forecast I attached the latest numbers and uh let me know if you want to walk through them this week thanks",
      clean: "Hi Priya,\n\nJust circling back on the Q3 forecast. I attached the latest numbers — let me know if you want to walk through them this week.\n\nThanks",
    },
  };

  const roomRaw = $("#room-raw");
  const roomOut = $("#room-out");
  const roomStatus = $("#room-status");
  let currentRoom = "prompt";
  let holding = false;

  const setRoom = (id) => {
    currentRoom = id;
    $$("[data-room]").forEach((b) => b.classList.toggle("is-on", b.dataset.room === id));
    if (roomRaw) roomRaw.textContent = "Hold Control, or tap the button, and talk.";
    if (roomOut) roomOut.textContent = "";
    if (roomStatus) roomStatus.textContent = "Ready";
    $$(".flag").forEach((f) => f.classList.remove("on"));
  };
  $$("[data-room]").forEach((b) => b.addEventListener("click", () => setRoom(b.dataset.room)));

  const playRoom = async () => {
    const r = rooms[currentRoom];
    if (!r || !roomRaw) return;
    roomStatus && (roomStatus.textContent = "Listening…");
    roomRaw.textContent = "";
    for (let i = 0; i < r.raw.length; i++) {
      roomRaw.textContent = r.raw.slice(0, i + 1);
      if (i % 2 === 0) await new Promise((res) => setTimeout(res, 8));
    }
    roomStatus && (roomStatus.textContent = "Cleaning up…");
    $("#chip-fill")?.classList.add("on");
    await new Promise((res) => setTimeout(res, 280));
    $("#chip-corr")?.classList.add("on");
    await new Promise((res) => setTimeout(res, 280));
    $("#chip-rep")?.classList.add("on");
    await new Promise((res) => setTimeout(res, 320));
    if (roomOut) roomOut.textContent = r.clean;
    roomStatus && (roomStatus.textContent = "Ready to send");
  };

  const holdBtn = $("#hold-talk");
  const sellPage = document.body.classList.contains("sell");
  const startHold = (e) => {
    e?.preventDefault?.();
    if (holding) return;
    holding = true;
    holdBtn?.classList.add("is-hot");
    playRoom();
  };
  const endHold = () => {
    holding = false;
    holdBtn?.classList.remove("is-hot");
  };
  if (!sellPage) {
    holdBtn?.addEventListener("mousedown", startHold);
    holdBtn?.addEventListener("touchstart", startHold, { passive: false });
    window.addEventListener("mouseup", endHold);
    window.addEventListener("touchend", endHold);
    window.addEventListener("keydown", (e) => {
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        if (!e.repeat) startHold(e);
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ControlLeft" || e.code === "ControlRight") endHold();
    });
  }
})();
