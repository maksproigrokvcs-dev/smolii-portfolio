// POST /api/admin/login {password} → cookie на 30 днів
// GET  /api/admin/login → чи залогінений
// DELETE /api/admin/login → вихід
// Захист від перебору: 8 невдалих спроб з однієї адреси за 15 хв → блок на 15 хв (+ сповіщення в Telegram).
import { json, checkPassword, sessionCookie, clearCookie, isAdmin, ipKey, readBody, tg } from "../../_lib.js";

const MAX_FAILS = 8, WINDOW = 900;

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json(500, { ok: false, error: "no_password_set" });
  const ip = await ipKey(request);
  const key = `rl:login:${ip}:${Math.floor(Date.now() / 1000 / WINDOW)}`;
  const fails = parseInt((env.DB && (await env.DB.get(key))) || "0", 10);
  if (fails >= MAX_FAILS) return json(429, { ok: false, error: "too_many" }, { "retry-after": String(WINDOW) });

  const raw = await readBody(request, 2000);
  let d;
  try { d = JSON.parse(raw); } catch { return json(400, { ok: false, error: "bad_json" }); }

  if (!(await checkPassword(env, d && d.password))) {
    if (env.DB) await env.DB.put(key, String(fails + 1), { expirationTtl: WINDOW * 2 });
    if (fails + 1 === MAX_FAILS) await tg(env, "sendMessage", { text: "⚠️ <b>Адмінка SMOLII</b>: 8 невдалих спроб входу підряд з однієї адреси. Вхід для неї заблоковано на 15 хв." });
    await new Promise(r => setTimeout(r, 900)); // гальмуємо підбір
    return json(401, { ok: false, error: "wrong" });
  }
  return json(200, { ok: true }, { "set-cookie": await sessionCookie(env) });
}

export async function onRequestGet({ request, env }) {
  return json(200, { ok: await isAdmin(request, env) });
}

export const onRequestDelete = () => json(200, { ok: true }, { "set-cookie": clearCookie() });
