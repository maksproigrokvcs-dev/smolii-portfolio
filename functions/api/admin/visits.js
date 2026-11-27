// GET  /api/admin/visits             — список переглядів (з метаданих, без зайвих читань)
// GET  /api/admin/visits?id=v:...    — один перегляд повністю
// POST /api/admin/visits {id, remove:true} — видалити перегляд
import { json } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    if (!id.startsWith("v:")) return json(400, { ok: false });
    const v = await env.DB.get(id, "json");
    return v ? json(200, { ok: true, visit: { ...v, id } }) : json(404, { ok: false });
  }
  const out = [];
  let cursor;
  do {
    const r = await env.DB.list({ prefix: "v:", cursor, limit: 1000 });
    r.keys.forEach(k => k.metadata && out.push({ id: k.name, ...k.metadata }));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && out.length < 2000);
  return json(200, { ok: true, visits: out });
}

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { return json(400, { ok: false }); }
  if (typeof d.id !== "string" || !d.id.startsWith("v:") || !d.remove) return json(400, { ok: false });
  await env.DB.delete(d.id);
  return json(200, { ok: true });
}
