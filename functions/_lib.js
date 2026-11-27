// Спільні помічники для Pages Functions (файл без onRequest — маршрутом не стає).
// Потрібно в Cloudflare Pages → Settings:
//   KV binding  DB              — сховище (статус, заявки, перегляди)
//   Secret      ADMIN_PASSWORD  — пароль від /admin
//   Secret      TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — сповіщення (вже є)

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

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
