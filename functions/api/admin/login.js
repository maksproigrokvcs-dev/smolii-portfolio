// POST /api/admin/login {password} → cookie на 30 днів
// DELETE /api/admin/login → вихід
import { json, checkPassword, sessionCookie, clearCookie, isAdmin } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json(500, { ok: false, error: "no_password_set" });
  let d;
  try { d = await request.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }
  if (!(await checkPassword(env, d.password))) {
    await new Promise(r => setTimeout(r, 900)); // гальмуємо підбір
    return json(401, { ok: false, error: "wrong" });
  }
  return json(200, { ok: true }, { "set-cookie": await sessionCookie(env) });
}

export async function onRequestGet({ request, env }) {
  return json(200, { ok: await isAdmin(request, env), kv: !!env.DB, pass: !!env.ADMIN_PASSWORD });
}

export const onRequestDelete = () => json(200, { ok: true }, { "set-cookie": clearCookie() });
