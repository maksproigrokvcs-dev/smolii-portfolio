// GET  /api/admin/leads            — список заявок (найновіші першими)
// POST /api/admin/leads {id, status, note} — змінити статус / нотатку
// POST /api/admin/leads {id, remove:true}  — видалити заявку
import { json, clip } from "../../_lib.js";

const STATUSES = ["new", "work", "deal", "lost"];

export async function onRequestGet({ env }) {
  const out = [];
  let cursor;
  do {
    const r = await env.DB.list({ prefix: "l:", cursor, limit: 1000 });
    const vals = await Promise.all(r.keys.map(k => env.DB.get(k.name, "json")));
    vals.forEach((v, i) => v && out.push({ ...v, id: r.keys[i].name }));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < 500);
  return json(200, { ok: true, leads: out });
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }
  if (typeof d.id !== "string" || !d.id.startsWith("l:")) return json(400, { ok: false, error: "id" });
  if (d.remove) { await env.DB.delete(d.id); return json(200, { ok: true }); }
  const cur = await env.DB.get(d.id, "json");
  if (!cur) return json(404, { ok: false, error: "not_found" });
  if (STATUSES.includes(d.status)) cur.status = d.status;
  if (d.note != null) cur.memo = clip(d.note, 500);
  await env.DB.put(d.id, JSON.stringify(cur));
  return json(200, { ok: true, lead: cur });
}
