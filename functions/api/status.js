// GET /api/status — публічні налаштування для головної: плашка + ціни, акція, роботи, відгуки.
import { json, readStatus, readSite } from "../_lib.js";

export async function onRequestGet({ env }) {
  const [s, site] = await Promise.all([readStatus(env), readSite(env)]);
  // зайнятість з минулою датою — вже знову «беру проєкти»
  if (s.mode === "busy" && s.until && new Date(s.until + "T23:59:59") < new Date()) s.mode = "open";
  // акція з минулою датою — вимикається сама
  if (site.promo.on && site.promo.until && new Date(site.promo.until + "T23:59:59") < new Date()) site.promo.on = false;
  site.reviews = site.reviews.filter(r => r.on !== false);
  return json(200, { ...s, site }, { "cache-control": "public, max-age=30" });
}
