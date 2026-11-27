// GET/POST /api/admin/status — читати / змінювати плашку.
import { json, clip, readStatus } from "../../_lib.js";

export const onRequestGet = async ({ env }) => json(200, await readStatus(env));

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }
  const s = {
    mode: ["open", "slots", "busy", "custom"].includes(d.mode) ? d.mode : "open",
    slots: Math.max(1, Math.min(9, parseInt(d.slots, 10) || 1)),
    month: Math.max(0, Math.min(11, parseInt(d.month, 10) || 0)),
    until: /^\d{4}-\d{2}-\d{2}$/.test(d.until || "") ? d.until : "",
    uk: clip(d.uk, 60),
    en: clip(d.en, 60),
    at: Date.now(),
  };
  await env.DB.put("status", JSON.stringify(s));
  return json(200, { ok: true, status: s });
}
