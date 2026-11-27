/* SMOLII — анонімна аналітика переглядів сайтів-концептів.
   Рахує: час на кожному блоці, глибину прокрутки, натискання, блок виходу.
   Жодних імен, контактів чи вмісту полів — тільки поведінка на сторінці. */
(() => {
  if (navigator.webdriver) return;
  const rnd = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");
  const site = (location.pathname.match(/\/concepts\/([^/]+)/) || [])[1];
  if (!site) return;

  let n = 1;
  try { const k = "smolii-v-" + site; n = (parseInt(localStorage.getItem(k), 10) || 0) + 1; localStorage.setItem(k, n); } catch (e) {}

  const S = {
    v: rnd(), site, n, ts: Date.now(),
    title: (document.title.split(/\s+[—|–-]\s+/)[0] || site).trim(),
    dev: matchMedia("(pointer:coarse)").matches || innerWidth < 760 ? "mobile" : "desktop",
    ref: document.referrer ? (() => { try { return new URL(document.referrer).hostname; } catch (e) { return ""; } })() : "",
    dur: 0, depth: 0, secs: [], clicks: [], exit: "",
  };

  const clean = s => String(s || "").replace(/\s+/g, " ").trim();
  // блоки сторінки: секції верхнього рівня з видимою висотою
  const blocks = [...document.querySelectorAll("section, footer")]
    .filter(el => !el.parentElement.closest("section, footer"))
    .map((el, i) => {
      const h = el.querySelector("h1, h2");
      let label = el.dataset.track || (h && clean(h.textContent)) || el.id || "Блок " + (i + 1);
      if (el.tagName === "FOOTER") label = "Футер";
      if (i === 0 && !el.dataset.track) label = "Перший екран";
      return { el, label: label.slice(0, 50), t: 0 };
    });
  const live = () => blocks.filter(b => b.el.offsetHeight > 40);
  const at = y => { const L = live(); for (const b of L) { const r = b.el.getBoundingClientRect(); if (r.top <= y && r.bottom > y) return b; } return null; };
  const cur = () => at(innerHeight * 0.45);

  let lastAct = Date.now(), dirty = false;
  ["scroll", "pointerdown", "keydown", "touchstart", "mousemove", "wheel"].forEach(e =>
    addEventListener(e, () => { lastAct = Date.now(); }, { passive: true, capture: true }));

  const depth = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    return h <= 0 ? 100 : Math.round(Math.min(1, scrollY / h) * 100);
  };

  setInterval(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastAct > 60000) return;
    S.dur++;
    const b = cur(); if (b) { b.t++; S.exit = b.label; }
    const d = depth(); if (d > S.depth) S.depth = d;
    dirty = true;
  }, 1000);

  addEventListener("click", e => {
    const t = e.target.closest("a, button, [role=button], summary, label, img, input, select, .slot, [data-slot]");
    if (!t) return;
    let l = t.dataset.track || t.getAttribute("aria-label") || "";
    if (!l && t.tagName === "IMG") l = "фото" + (t.alt ? ": " + t.alt : "");
    if (!l && /^(INPUT|SELECT)$/.test(t.tagName)) l = "поле: " + (t.name || t.placeholder || t.type || "");
    if (!l) l = t.textContent;
    l = clean(l).slice(0, 50); if (!l) return;
    const b = blocks.find(x => x.el.contains(t)) || cur();
    if (S.clicks.length < 80) S.clicks.push([S.dur, l, b ? b.label : ""]);
    dirty = true;
  }, true);

  const pack = end => JSON.stringify({ ...S, end, secs: live().map(b => [b.label, b.t]) });
  const send = end => {
    if (!dirty && !end) return;
    dirty = false;
    const body = pack(end);
    if (end && navigator.sendBeacon) { navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" })); return; }
    fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  };

  setTimeout(() => send(false), 4000);
  setInterval(() => send(false), 20000);
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(true); });
  addEventListener("pagehide", () => send(true));
})();
