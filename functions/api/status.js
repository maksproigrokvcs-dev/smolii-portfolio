// GET /api/status — публічний статус для плашки на головній.
import { json, readStatus } from "../_lib.js";

export async function onRequestGet({ env }) {
  const s = await readStatus(env);
  // зайнятість з минулою датою — вже знову «беру проєкти»
  if (s.mode === "busy" && s.until && new Date(s.until + "T23:59:59") < new Date()) s.mode = "open";
  return json(200, s, { "cache-control": "public, max-age=30" });
}
