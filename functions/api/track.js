// POST /api/track — «маячок» із сайтів-концептів (/concepts/*).
// Клієнт щоразу шле повний накопичений стан візиту — сервер просто перезаписує запис.
// Перегляди самого адміна (cookie sa) не записуються.
import { json, clip, inv, esc, isAdmin, tg, ipKey, memLimit, kvLimit, readBody } from "../_lib.js";

// Приймаємо дані тільки для справжніх сторінок-концептів, де стоїть наш скрипт (кеш на 10 хв).
const SITES = new Map();
async function realSite(env, request, site) {
  if (!env.ASSETS) return true; // локальний тест
  const c = SITES.get(site);
  if (c && c.exp > Date.now()) return c.ok;
  let ok = false;
  try {
    const r = await env.ASSETS.fetch(new URL(`/concepts/${site}/`, request.url));
    ok = r.ok && (await r.text()).includes('src="/t.js"');
  } catch {}
  SITES.set(site, { ok, exp: Date.now() + 600e3 });
  return ok;
}

const fmtT = s => (s >= 60 ? `${Math.floor(s / 60)} хв ${s % 60} с` : `${s} с`);
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function summary(v, live) {
  const top = [...v.secs].filter(x => x[1] >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const counts = {};
  v.clicks.forEach(c => { counts[c[1]] = (counts[c[1]] || 0) + 1; });
  const cl = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([l, n]) => `«${esc(l, 40)}»${n > 1 ? " ×" + n : ""}`).join(", ");
  const where = [v.dev === "mobile" ? "телефон" : "комп’ютер", v.city].filter(Boolean).join(", ");
  return [
    `${live ? "🟢" : "👀"} <b>${esc(v.title || v.site, 60)}</b> — ${v.n > 1 ? `перегляд №${v.n}` : "новий перегляд"} (${esc(where, 60)})`,
    live ? "Дивляться прямо зараз…" : `⏱ ${fmtT(v.dur)} · догорнули до ${v.depth}%`,
    !live && top.length && `🔥 Найдовше: ${top.map(x => `«${esc(x[0], 40)}» ${mmss(x[1])}`).join(" · ")}`,
    !live && (cl ? `👆 Натискали: ${cl}` : "👆 Нічого не натискали"),
    !live && v.exit && `🚪 Вийшли на блоці «${esc(v.exit, 40)}»`,
  ].filter(Boolean).join("\n");
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json(200, { ok: false, error: "no_kv" });
  if (await isAdmin(request, env)) return json(200, { ok: true, skipped: "admin" });

  // антифлуд: не більше 40 запитів за хвилину з однієї адреси, тіло до 32 КБ
  const ip = await ipKey(request);
  if (!memLimit("t:" + ip, 40, 60e3)) return json(429, { ok: false });
  const raw = await readBody(request, 32000);
  if (raw == null) return json(413, { ok: false });
  let d;
  try { d = JSON.parse(raw); } catch { return json(400, { ok: false }); }
  if (!d || typeof d !== "object") return json(400, { ok: false });
  if (!/^[a-f0-9]{16}$/.test(d.v || "")) return json(400, { ok: false, error: "id" });
  const site = clip(d.site, 40).replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!site || !(await realSite(env, request, site))) return json(400, { ok: false, error: "site" });
  const now = Date.now();
  const ts = Number(d.ts);
  if (!(Math.abs(now - ts) < 6 * 3600e3)) return json(400, { ok: false, error: "ts" });

  const key = `v:${inv(ts)}:${d.v}`;
  const prev = await env.DB.get(key, "json");
  if (!prev) {
    // нових переглядів з однієї адреси — до 15 на годину
    if (!(await kvLimit(env, "nv:" + ip, 15, 3600))) return json(429, { ok: false });
  } else if ((prev.u || 0) >= 300) {
    return json(200, { ok: true }); // занадто багато оновлень одного візиту — ігноруємо
  }
  const cf = request.cf || {};
  const v = {
    site,
    title: clip(d.title, 60),
    ts,
    last: now,
    dur: Math.max(0, Math.min(36000, parseInt(d.dur, 10) || 0)),
    depth: Math.max(0, Math.min(100, parseInt(d.depth, 10) || 0)),
    dev: d.dev === "mobile" ? "mobile" : "desktop",
    n: Math.max(1, Math.min(999, parseInt(d.n, 10) || 1)),
    ref: clip(d.ref, 60),
    city: prev?.city ?? clip(cf.city, 40),
    country: prev?.country ?? clip(cf.country, 4),
    secs: (Array.isArray(d.secs) ? d.secs : []).slice(0, 30)
      .map(x => [clip(x?.[0], 50), Math.max(0, Math.min(36000, parseInt(x?.[1], 10) || 0))]),
    clicks: (Array.isArray(d.clicks) ? d.clicks : []).slice(0, 80)
      .map(x => [Math.max(0, parseInt(x?.[0], 10) || 0), clip(x?.[1], 50), clip(x?.[2], 50)]),
    exit: clip(d.exit, 50),
    tg: prev?.tg || null,
    ended: !!d.end || !!prev?.ended,
    u: (prev?.u || 0) + 1,
  };

  // Telegram: перше сповіщення «дивляться зараз», при виході — редагуємо в підсумок.
  // Не більше 60 нових сповіщень на добу — щоб твій Telegram не можна було заспамити.
  if (!v.tg && v.dur >= 3 && (await kvLimit(env, "tg", 60, 86400))) {
    const r = await tg(env, "sendMessage", { text: summary(v, !d.end) });
    v.tg = r?.result?.message_id || null;
  } else if (v.tg && d.end && v.dur >= 3) {
    await tg(env, "editMessageText", { message_id: v.tg, text: summary(v, false) });
  }

  const meta = { s: site, t: v.title, ts, d: v.dur, p: v.depth, dv: v.dev, c: v.city, n: v.n, k: v.clicks.length, x: v.exit };
  await env.DB.put(key, JSON.stringify(v), { metadata: meta, expirationTtl: 180 * 86400 });
  return json(200, { ok: true });
}

export const onRequest = () => json(405, { ok: false });
