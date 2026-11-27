// Усе в /api/admin/* — тільки для залогіненого адміна (крім входу).
// + перевірка Origin: зміни можна робити тільки зі сторінки самого сайту (захист від CSRF).
import { json, isAdmin } from "../../_lib.js";

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json(403, { ok: false, error: "origin" });
    if (!(request.headers.get("content-type") || "").includes("application/json")) return json(415, { ok: false, error: "type" });
  }
  if (url.pathname === "/api/admin/login") return next();
  if (!env.DB) return json(500, { ok: false, error: "no_kv" });
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "auth" });
  return next();
}
