/** Отзывы покупателей NulletVPN. Хранятся в Netlify Blobs. */
const BOT_API = "https://nullet-vpn-bot.onrender.com";
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(statusCode, data) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(data) };
}

function canonTg(value) {
  let s = String(value || "").trim().toLowerCase();
  if (s.startsWith("https://")) {
    const i = s.indexOf("t.me/");
    s = i >= 0 ? s.slice(i + 5) : "";
  }
  if (s.startsWith("t.me/")) s = s.slice(5);
  if (s.startsWith("@")) s = s.slice(1);
  return "@" + s.replace(/[^a-z0-9_]/g, "");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }

  const { getStore } = await import("@netlify/blobs");
  const store = getStore({
    name: "nulletvpn-reviews",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });

  let reviews = [];
  try {
    reviews = JSON.parse(await store.get("list", { type: "json" })) || [];
    if (!Array.isArray(reviews)) reviews = [];
  } catch (e) {
    reviews = [];
  }

  if (event.httpMethod === "GET") {
    return json(200, { ok: true, reviews });
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Метод не поддерживается" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { ok: false, error: "Неверный запрос" });
  }

  const tg = canonTg(body.tg);
  const text = String(body.text || "").trim();
  const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5));
  if (!tg || tg.length < 3) {
    return json(400, { ok: false, error: "Укажите Telegram-аккаунт" });
  }
  if (text.length < 10 || text.length > 600) {
    return json(400, { ok: false, error: "Отзыв должен быть от 10 до 600 символов" });
  }

  let sub = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(BOT_API + "/site/status?tg=" + encodeURIComponent(tg), {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data && data.ok && data.active) sub = data.sub;
  } catch (e) {
    if (body.clientVerified === true) sub = { label: "Покупатель" };
  }
  if (!sub && body.clientVerified === true) sub = { label: "Покупатель" };
  if (!sub) {
    return json(403, {
      ok: false,
      error: "Отзыв могут оставить только покупатели с активной подпиской. Оплатите через сайт или @Nulletbot.",
    });
  }

  const review = {
    tg,
    name: tg,
    rating,
    text,
    plan: sub.label || "",
    ts: new Date().toISOString(),
  };
  reviews = reviews.filter((r) => r.tg !== tg);
  reviews.unshift(review);
  reviews = reviews.slice(0, 100);

  try {
    await store.set("list", JSON.stringify(reviews));
  } catch (e) {
    return json(500, { ok: false, error: "Не удалось сохранить отзыв" });
  }
  return json(200, { ok: true, reviews });
};
