// GET/POST /api/admin/site — ціни, акція, порядок робіт, відгуки.
import { json, readSite, cleanSite } from "../../_lib.js";

export const onRequestGet = async ({ env }) => json(200, await readSite(env));

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }
  const site = cleanSite(d);
  await env.DB.put("site", JSON.stringify(site));
  return json(200, { ok: true, site });
}
