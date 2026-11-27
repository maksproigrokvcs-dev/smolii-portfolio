// Cloudflare Pages Function: POST /api/lead
// Приймає заявку з сайту і пересилає її в Telegram-бот.
// Змінні беруться з налаштувань Cloudflare Pages (Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN — токен від @BotFather
//   TELEGRAM_CHAT_ID   — ваш chat_id (куди слати заявки)
// (Та сама логіка, що й у netlify/functions/lead.mjs — щоб сайт працював на обох хостингах.)

const esc = (v, max = 600) =>
  String(v ?? "").slice(0, max).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if ((!token || !chatId) && !env.DB) return json(500, { ok: false, error: "not_configured" });

  let d;
  try { d = await request.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }

  // пастка для ботів-спамерів: справжні люди це поле не бачать
  if (d.website) return json(200, { ok: true });

  const contact = esc(d.contact, 120);
  if (!contact) return json(400, { ok: false, error: "no_contact" });

  const lines = [
    "🆕 <b>Нова заявка з сайту SMOLII</b>",
    "—",
    d.name && `👤 <b>Ім’я:</b> ${esc(d.name, 80)}`,
    `📱 <b>Контакт:</b> ${contact}`,
    d.type && `🧩 <b>Тип сайту:</b> ${esc(d.type, 60)}`,
    d.niche && `🏷 <b>Ніша:</b> ${esc(d.niche, 120)}`,
    d.speed && `⏱ <b>Терміни:</b> ${esc(d.speed, 40)}`,
    d.calc && `🧮 <b>Калькулятор:</b> ${esc(d.calc, 200)}`,
    d.gift && "🎁 <b>Хоче безкоштовний перший екран</b>",
    d.note && `📝 <b>Задача:</b> ${esc(d.note, 1500)}`,
    d.lang && `🌐 Мова сайту: ${esc(d.lang, 5)}`,
  ].filter(Boolean).join("\n");

  let r = { ok: false };
  if (token && chatId) {
    try {
      r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: lines, parse_mode: "HTML", disable_web_page_preview: true }),
      });
    } catch {}
  }

  // копія заявки — в адмінку (/admin → Заявки)
  let saved = false;
  if (env.DB) {
    try {
      const now = Date.now();
      const id = `l:${String(1e13 - now).padStart(13, "0")}:${crypto.randomUUID().slice(0, 8)}`;
      const lead = {
        at: now, status: "new", memo: "",
        name: esc(d.name, 80), contact, type: esc(d.type, 60), niche: esc(d.niche, 120),
        speed: esc(d.speed, 40), calc: esc(d.calc, 200), gift: !!d.gift, note: esc(d.note, 1500), lang: esc(d.lang, 5),
      };
      await env.DB.put(id, JSON.stringify(lead));
      saved = true;
    } catch {}
  }

  if (!r.ok && !saved) return json(502, { ok: false, error: "telegram" });
  return json(200, { ok: true });
}

export const onRequest = () => json(405, { ok: false, error: "method" });
