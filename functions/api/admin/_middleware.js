// Усе в /api/admin/* — тільки для залогіненого адміна (крім входу).
import { json, isAdmin } from "../../_lib.js";

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const path = new URL(request.url).pathname;
  if (path === "/api/admin/login") return next();
  if (!env.DB) return json(500, { ok: false, error: "no_kv" });
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "auth" });
  return next();
}
