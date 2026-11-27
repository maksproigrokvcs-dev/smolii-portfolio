// Спільні помічники для Pages Functions (файл без onRequest — маршрутом не стає).
// Потрібно в Cloudflare Pages → Settings:
//   KV binding  DB              — сховище (статус, заявки, перегляди)
//   Secret      ADMIN_PASSWORD  — пароль від /admin
//   Secret      TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — сповіщення (вже є)

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
      "x-content-type-options": "nosniff", "x-robots-tag": "noindex", ...headers,
    },
  });

// ---------- захист від спаму / перебору ----------
// IP не зберігаємо як є — тільки короткий хеш.
export async function ipKey(request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "0";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("smolii:" + ip));
  return [...new Uint8Array(h)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Швидкий лічильник у пам’яті (в межах одного сервера Cloudflare) — проти флуду з однієї адреси.
const MEM = new Map();
export function memLimit(key, limit, windowMs) {
  const now = Date.now();
  if (MEM.size > 5000) for (const [k, v] of MEM) if (v.reset < now) MEM.delete(k);
  const e = MEM.get(key);
  if (!e || e.reset < now) { MEM.set(key, { n: 1, reset: now + windowMs }); return true; }
  e.n++;
  return e.n <= limit;
}

// Лічильник у KV (працює між усіма серверами) — для входу, заявок, нових переглядів.
export async function kvLimit(env, key, limit, windowSec) {
  if (!env.DB) return true;
  const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const n = parseInt((await env.DB.get(k)) || "0", 10);
  if (n >= limit) return false;
  await env.DB.put(k, String(n + 1), { expirationTtl: Math.max(60, windowSec * 2) });
  return true;
}

// Читання тіла з обмеженням розміру (захист від величезних запитів).
export async function readBody(request, maxBytes) {
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (len > maxBytes) return null;
  const t = await request.text();
  return t.length > maxBytes ? null : t;
}
export const tooMany = () => json(429, { ok: false, error: "too_many" }, { "retry-after": "600" });

export const esc = (v, max = 600) =>
  String(v ?? "").slice(0, max).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

export const clip = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Ключі KV сортуються за алфавітом — «перевернутий» час дає найновіші першими.
export const inv = ts => String(1e13 - Math.floor(ts)).padStart(13, "0");
export const rid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");

// ---------- сесія адміна: cookie "sa" = <expires>.<hmac> ----------
const COOKIE = "sa";
const DAYS = 30;
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode("smolii-admin:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function checkPassword(env, pass) {
  if (!env.ADMIN_PASSWORD || typeof pass !== "string") return false;
  // порівнюємо хеші, щоб довжина пароля не «світилась»
  const h = async s => b64u(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return same(await h(pass), await h(env.ADMIN_PASSWORD));
}

export async function sessionCookie(env) {
  const exp = Date.now() + DAYS * 864e5;
  const v = `${exp}.${await sign(env.ADMIN_PASSWORD, String(exp))}`;
  return `${COOKIE}=${v}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)sa=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await sign(env.ADMIN_PASSWORD, exp));
}

// ---------- статус «беру проєкти» ----------
export const DEFAULT_STATUS = { mode: "open", slots: 2, month: 11, until: "", uk: "", en: "" };

export async function readStatus(env) {
  try {
    const s = env.DB && (await env.DB.get("status", "json"));
    return { ...DEFAULT_STATUS, ...(s || {}) };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

// ---------- налаштування сайту: ціни, акція, роботи, відгуки ----------
export const DEFAULT_SITE = {
  prices: { plans: [300, 500, 400], extras: [50, 400], urgent: 30 }, // лендинг, бізнес-сайт, магазин
  promo: { on: false, uk: "", en: "", until: "" },
  works: { order: [], hidden: [] },
  reviews: [],
};

export async function readSite(env) {
  try {
    const s = env.DB && (await env.DB.get("site", "json"));
    return { ...DEFAULT_SITE, ...(s || {}) };
  } catch {
    return { ...DEFAULT_SITE };
  }
}

const int = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
const key = v => String(v ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
const link = v => { const s = clip(v, 200); return /^https:\/\/[^\s<>"]+$/i.test(s) ? s : ""; };

export function cleanSite(d = {}) {
  const P = DEFAULT_SITE.prices, p = d.prices || {};
  return {
    prices: {
      plans: P.plans.map((def, i) => int(p.plans?.[i], 10, 50000, def)),
      extras: P.extras.map((def, i) => int(p.extras?.[i], 0, 50000, def)),
      urgent: int(p.urgent, 0, 300, P.urgent),
    },
    promo: { on: !!d.promo?.on, uk: clip(d.promo?.uk, 120), en: clip(d.promo?.en, 120), until: date(d.promo?.until) },
    works: {
      order: (Array.isArray(d.works?.order) ? d.works.order : []).map(key).filter(Boolean).slice(0, 30),
      hidden: (Array.isArray(d.works?.hidden) ? d.works.hidden : []).map(key).filter(Boolean).slice(0, 30),
    },
    reviews: (Array.isArray(d.reviews) ? d.reviews : []).slice(0, 20).map(r => ({
      name: clip(r?.name, 60), role: clip(r?.role, 90), text: clip(r?.text, 700), en: clip(r?.en, 700), link: link(r?.link),
      on: r?.on !== false,
    })).filter(r => r.name && r.text),
    at: Date.now(),
  };
}

// ---------- Telegram ----------
export async function tg(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, parse_mode: "HTML", disable_web_page_preview: true, ...body }),
    });
    return await r.json();
  } catch {
    return null;
  }
}
