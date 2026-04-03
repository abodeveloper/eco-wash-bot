/**
 * 🌿 Eco Wash Navoiy — Telegram Bot
 * =========================================
 * Ishga tushirish:
 *   npm install node-telegram-bot-api
 *   node gilam_bot.js
 */

const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

// ── SOZLAMALAR ────────────────────────────────────────────────────────────────
// Tokenni kod ichiga yozmang. `BOT_TOKEN` env var orqali ishlating.
// Masalan: `export BOT_TOKEN="..."; node gilam_bot.js`
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN env var. Set it before starting the bot.");
}
const ADMIN_ID = Number(process.env.ADMIN_ID);
const GROUP_ID = Number(process.env.GROUP_ID);
if (!process.env.ADMIN_ID || !Number.isFinite(ADMIN_ID)) {
  throw new Error("Missing/invalid ADMIN_ID env var. Example: ADMIN_ID=123456789");
}
if (!process.env.GROUP_ID || !Number.isFinite(GROUP_ID)) {
  throw new Error("Missing/invalid GROUP_ID env var. Example: GROUP_ID=-1001234567890");
}
/** Vercel (yoki boshqa HTTPS) dagi Mini App URL. Bo'sh bo'lsa tugma ko'rinmaydi. */
const MINI_APP_URL = String(process.env.MINI_APP_URL || "").trim();
// ─────────────────────────────────────────────────────────────────────────────

// Rasm qo'shish uchun: "./banner.jpg" yoki "https://..." URL
// Unsplash dan bepul, chiroyli tozalash xizmati rasmi:
const WELCOME_PHOTO =
  process.env.WELCOME_PHOTO ||
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const sessions = {};

// ── HOLAT TARTIBI (navigatsiya uchun) ────────────────────────────────────────
const STATE = {
  IDLE: "IDLE",
  ASK_NAME: "ASK_NAME",
  ASK_PHONE: "ASK_PHONE",
  ASK_ADDRESS: "ASK_ADDRESS",
  ASK_SERVICE: "ASK_SERVICE",
  ASK_AMOUNT: "ASK_AMOUNT",
  ASK_ADD_MORE: "ASK_ADD_MORE",
  ASK_NOTE: "ASK_NOTE",
  CONFIRM: "CONFIRM",
};

// Holat tartibi — "Orqaga" qaysi bosqichga qaytadi
const PREV_STATE = {
  ASK_NAME: null, // Birinchi bosqich — orqagasi yo'q
  ASK_PHONE: "ASK_NAME",
  ASK_ADDRESS: "ASK_PHONE",
  ASK_SERVICE: "ASK_ADDRESS",
  ASK_AMOUNT: "ASK_SERVICE",
  ASK_ADD_MORE: "ASK_AMOUNT",
  ASK_NOTE: "ASK_ADD_MORE",
  CONFIRM: "ASK_NOTE",
};

// Bosqich raqamlari
const STEP_NUM = {
  ASK_NAME: "1/6",
  ASK_PHONE: "2/6",
  ASK_ADDRESS: "3/6",
  ASK_SERVICE: "4/6",
  ASK_AMOUNT: "5/6",
  ASK_NOTE: "6/6",
};

const BACK_BTN = "⬅️ Orqaga";
const ADD_MORE_YES = "➕ Yana xizmat qo'shish";
const ADD_MORE_NO = "➡️ Davom etish";
const CART_VIEW = "🧾 Savatni ko'rish";
const CART_REMOVE_LAST = "➖ Oxirgisini o'chirish";
const CART_CLEAR = "🗑 Savatni tozalash";

// ── XIZMATLAR (services.json — bot va Mini App bir xil ro'yxat) ───────────────
const SERVICES = require("./services.json");

// ── YORDAMCHI FUNKSIYALAR ─────────────────────────────────────────────────────

/** Buyurtma oqimi faqat shaxsiy chatda; guruh/superguruhda javob bermaymiz. */
function isPrivateChat(chat) {
  return Boolean(chat && chat.type === "private");
}

/** Shaxsiy chatda chat.id foydalanuvchi id si bilan bir xil. */
function isAdmin(telegramId) {
  return Number(telegramId) === ADMIN_ID;
}

function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { state: STATE.IDLE, data: {} };
  return sessions[chatId];
}

function clearSession(chatId) {
  sessions[chatId] = { state: STATE.IDLE, data: {} };
}

function getServiceByLabel(label) {
  return SERVICES.find((s) => s.label === label);
}

/** Tugmalar + pastda har doim "Orqaga" tugmasi */
function buildKeyboard(buttons, nCols = 3, showBack = true) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += nCols) {
    rows.push(buttons.slice(i, i + nCols).map((b) => ({ text: b })));
  }
  if (showBack) rows.push([{ text: BACK_BTN }]);
  return { keyboard: rows, resize_keyboard: true, one_time_keyboard: false };
}

/** Faqat "Orqaga" tugmasi */
function backOnlyKeyboard() {
  return {
    keyboard: [[{ text: BACK_BTN }]],
    resize_keyboard: true,
  };
}

// Telegram "Markdown" (v1) parse_mode'ida user kiritgan matn formatni sinib yubormasligi uchun
// maxsus belgilarni escape qilamiz. Markdown V1 da faqat ushbu format belgilar qochirilishi mumkin.
function escapeMarkdown(text) {
  const s = String(text ?? "");
  return s.replace(/([_*\[`\\])/g, "\\$1");
}

function formatMoney(num) {
  const n = Math.round(Number(num) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parseMoney(priceText) {
  const s = String(priceText ?? "");
  const m = s.match(/([\d\s]+)\s*so'm/i);
  if (!m) return null;
  return Number(m[1].replace(/\s+/g, ""));
}

function parseQuantity(amountText) {
  const s = String(amountText ?? "").trim();
  const isPlus = s.includes("+");
  const m = s.match(/([\d]+)\s*\+?/);
  if (!m) return null;
  return { qty: Number(m[1]), isPlus };
}

function formatAmount(qty, unit, isPlus) {
  const q = Number(qty);
  const plus = isPlus ? "+" : "";
  if (!unit) return `${q}${plus}`;
  if (unit === "m²") return `${q}${plus} m²`;
  return `${q}${plus}`;
}

function ensureItems(sess) {
  if (!Array.isArray(sess.data.items)) sess.data.items = [];
  return sess.data.items;
}

function formatCart(items) {
  const line = "━━━━━━━━━━━━━━━━━━━━━━";
  if (!items?.length) {
    return `🧾 *Savat bo'sh*\n${line}\n➕ Xizmat qo'shish uchun xizmat tanlang.`;
  }

  const rows = [];
  rows.push(`🧾 *Savat*`);
  rows.push(line);
  items.forEach((it, idx) => {
    const service = escapeMarkdown(it.service || "—");
    const amount = escapeMarkdown(it.amountText || "—");
    const unit = escapeMarkdown(it.unit || "");
    const unitPriceText =
      it.unitPrice != null
        ? escapeMarkdown(
            `${formatMoney(it.unitPrice)} so'm/${unit || ""}`.replace(/\/$/, ""),
          )
        : "—";
    const totalText =
      it.total != null
        ? escapeMarkdown(`${it.isPlus ? "~" : ""}${formatMoney(it.total)} so'm`)
        : "—";

    rows.push(`*${idx + 1})* ${service}`);
    rows.push(`   📦 Miqdor: *${amount}*`);
    rows.push(`   💰 Narx (1 ${unit}): *${unitPriceText}*`);
    rows.push(`   💰 Jami taxminiy narx: *${totalText}*`);
    rows.push("");
  });
  const grand = computeGrandTotal(items);
  rows.push(
    `💰 *Umumiy taxminiy narx:* *${grand.hasPlus ? "~" : ""}${formatMoney(grand.total)} so'm*`,
  );
  return rows.join("\n");
}

function computeGrandTotal(items) {
  let total = 0;
  let hasPlus = false;
  for (const it of items) {
    if (!it) continue;
    if (it.isPlus) hasPlus = true;
    const n = Number(it.total || 0);
    if (Number.isFinite(n)) total += n;
  }
  return { total, hasPlus };
}

/** Mini App dan kelgan JSON: narx va miqdorni serverda qayta hisoblaymiz. */
function normalizeMiniAppOrder(payload) {
  if (!payload || typeof payload !== "object") return null;
  const name = String(payload.name || "").trim();
  const phone = String(payload.phone || "").trim();
  const address = String(payload.address || "").trim();
  if (!name || !phone || !address) return null;
  const cleaned = phone.replace(/\s+/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return null;
  const phoneNorm = cleaned.startsWith("+") ? cleaned : "+" + cleaned;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!rawItems.length) return null;

  const merged = new Map();
  for (const it of rawItems) {
    const label = String(it.service || "").trim();
    const service = getServiceByLabel(label);
    if (!service) return null;
    const amountStr =
      String(it.amountText || "").trim() || String(it.qty ?? "");
    const parsed = parseQuantity(amountStr);
    if (!parsed || !parsed.qty) return null;
    const unit = parseMoney(service.price);
    if (!unit) return null;

    if (merged.has(service.label)) {
      const ex = merged.get(service.label);
      ex.qty += parsed.qty;
      ex.isPlus = Boolean(ex.isPlus) || parsed.isPlus;
      ex.unitPrice = unit;
      ex.total = ex.qty * unit;
      ex.amountText = formatAmount(ex.qty, ex.unit, ex.isPlus);
    } else {
      merged.set(service.label, {
        service: service.label,
        unit: service.unit,
        amountText: formatAmount(parsed.qty, service.unit, parsed.isPlus),
        qty: parsed.qty,
        isPlus: parsed.isPlus,
        unitPrice: unit,
        total: parsed.qty * unit,
      });
    }
  }
  const noteRaw = String(payload.note || "").trim().slice(0, 1000);

  return {
    name,
    phone: phoneNorm,
    address,
    items: [...merged.values()],
    ...(noteRaw ? { note: noteRaw } : {}),
  };
}

async function handleMiniAppOrder(chatId, fromId, rawData) {
  if (isAdmin(fromId)) {
    return bot.sendMessage(
      chatId,
      "⚠️ Administrator sifatida buyurtma yuborib bo'lmaydi.",
    );
  }
  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch {
    return bot.sendMessage(
      chatId,
      "⚠️ Ma'lumotni o'qib bo'lmadi. Qayta urinib ko'ring.",
    );
  }
  const data = normalizeMiniAppOrder(payload);
  if (!data) {
    return bot.sendMessage(
      chatId,
      "⚠️ Buyurtma ma'lumotlari to'liq emas yoki noto'g'ri. Mini ilovada qayta to'ldiring.",
    );
  }
  clearSession(chatId);
  const text = formatZayavka(data);
  await sendToAdminAndGroup(text);
  return bot.sendMessage(
    chatId,
    "✅ *Buyurtmangiz qabul qilindi!*\n\nTez orada xodimimiz siz bilan bog'lanadi.\n\n/start — bosh menyuga.",
    { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } },
  );
}

function formatZayavka(data) {
  const line = "━━━━━━━━━━━━━━━━━━━━━━";
  const name = escapeMarkdown(data.name || "—");
  const phone = escapeMarkdown(data.phone || "—");
  const address = escapeMarkdown(data.address || "—");
  const items = Array.isArray(data.items) ? data.items : null;

  const serviceLines = [];
  if (items && items.length) {
    serviceLines.push(`🧺 Buyurtmalar: *${items.length} ta*`);
    serviceLines.push("");
    items.forEach((it, idx) => {
      const service = escapeMarkdown(it.service || "—");
      const amount = escapeMarkdown(it.amountText || it.amount || "—");
      const unit = escapeMarkdown(it.unit || "");
      const unitPriceText =
        it.unitPrice != null
          ? escapeMarkdown(
              `${formatMoney(it.unitPrice)} so'm/${unit || ""}`.replace(/\/$/, ""),
            )
          : "";
      const totalText =
        it.total != null
          ? escapeMarkdown(`${it.isPlus ? "~" : ""}${formatMoney(it.total)} so'm`)
          : escapeMarkdown(it.totalText || "—");

      serviceLines.push(`*${idx + 1})* ${service}`);
      serviceLines.push(`   📦 Miqdor: *${amount}*`);
      if (unitPriceText) serviceLines.push(`   💰 Narx (1 ${unit}): *${unitPriceText}*`);
      serviceLines.push(`   💰 Jami taxminiy narx: *${totalText}*`);
      serviceLines.push("");
    });

    const grand = computeGrandTotal(items);
    serviceLines.push(
      `💰 *Umumiy taxminiy narx:* *${grand.hasPlus ? "~" : ""}${formatMoney(grand.total)} so'm*`,
    );
  } else {
    // Orqaga moslik (eski bitta xizmatli format)
    const service = escapeMarkdown(data.service || "—");
    const amount = escapeMarkdown(data.amount || "—");
    const totalPrice = escapeMarkdown(data.price || "—");
    const serviceUnit = escapeMarkdown(data.serviceUnit || "");
    const unitPrice = escapeMarkdown(
      data.pricePerUnit != null
        ? `${formatMoney(data.pricePerUnit)} so'm/${serviceUnit || ""}`.replace(/\/$/, "")
        : "",
    );

    serviceLines.push(`🛠 Xizmat:   *${service}*`);
    serviceLines.push(`📦 Miqdor:   *${amount}*`);
    if (unitPrice) serviceLines.push(`💰 Narx (1 ${serviceUnit}): *${unitPrice}*`);
    serviceLines.push(`💰 Jami taxminiy narx: *${totalPrice}*`);
  }

  let text = [
    `🌿 *ECO WASH NAVOIY — YANGI BUYURTMA*`,
    line,
    `👤 Mijoz:    *${name}*`,
    `📞 Telefon:  *${phone}*`,
    `📍 Manzil:   *${address}*`,
    line,
    ...serviceLines,
  ];
  if (data.note) text.push(`\n💬 Izoh: _${escapeMarkdown(data.note)}_`);
  text.push(line);
  text.push(`📲 _Operator tez orada bog'lanadi_`);
  return text.join("\n");
}

async function sendToAdminAndGroup(text) {
  try {
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("❌ Adminga yuborishda xato:", e.message);
  }
  try {
    await bot.sendMessage(GROUP_ID, text, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("❌ Guruhga yuborishda xato:", e.message);
  }
}

// ── STEP FUNKSIYALAR ──────────────────────────────────────────────────────────

async function stepStart(chatId) {
  clearSession(chatId);

  if (isAdmin(chatId)) {
    return bot.sendMessage(
      chatId,
      "🔐 *Administrator* — bu akkauntdan mijoz buyurtmasi yuborib bo'lmaydi.",
      {
        parse_mode: "Markdown",
        reply_markup: { remove_keyboard: true },
      },
    );
  }

  const caption =
    `🌿 *ECO WASH NAVOIY*\n` +
    `_Navoiy shahridagi professional tozalash xizmati_\n\n` +
    `✨ *Nima uchun bizni tanlashingiz kerak?*\n` +
    `✅ Tezkor va sifatli xizmat\n` +
    `✅ Uyingizdan olib ketamiz — yetkazib beramiz\n` +
    `✅ Ekologik toza vositalar\n` +
    `✅ Tajribali mutaxassislar\n` +
    `✅ Qulay narxlar, chegirmalar\n\n` +
    `💎 *Xizmatlarimiz va narxlar:*\n` +
    SERVICES.map((s) => `${s.label} — *${s.price}*`).join("\n") +
    `\n\n🤝 Bizga ishoning — sizning qulayligingiz bizning maqsadimiz!\n\n` +
    `👇 Buyurtma berish uchun tugmalardan birini tanlang:` +
    (MINI_APP_URL
      ? `\n\n_📱 Mini ilova_ — barcha bosqichlarni bir joyda to'ldirish.`
      : "");

  const startKeyboard = [[{ text: "📝 Buyurtma berish" }]];
  if (MINI_APP_URL) {
    startKeyboard.push([
      { text: "📱 Mini ilova orqali", web_app: { url: MINI_APP_URL } },
    ]);
  }
  const replyMarkup = {
    reply_markup: {
      keyboard: startKeyboard,
      resize_keyboard: true,
    },
  };

  if (WELCOME_PHOTO) {
    try {
      await bot.sendPhoto(chatId, WELCOME_PHOTO, {
        caption,
        parse_mode: "Markdown",
        ...replyMarkup,
      });
      return;
    } catch (e) {
      console.error("Rasm yuborishda xato:", e.message);
    }
  }
  await bot.sendMessage(chatId, caption, {
    parse_mode: "Markdown",
    ...replyMarkup,
  });
}

async function stepAskName(chatId) {
  const sess = getSession(chatId);
  sess.state = STATE.ASK_NAME;
  await bot.sendMessage(
    chatId,
    `📋 *Bosqich ${STEP_NUM.ASK_NAME}*\n\n👤 Ismingizni kiriting:`,
    { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } },
  );
}

async function stepAskPhone(chatId) {
  const sess = getSession(chatId);
  sess.state = STATE.ASK_PHONE;
  await bot.sendMessage(
    chatId,
    `📋 *Bosqich ${STEP_NUM.ASK_PHONE}*\n\n📞 Telefon raqamingizni yuboring:\n_(Namuna: +998901234567)_`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          [{ text: "📞 Raqamni avtomatik ulashish", request_contact: true }],
          [{ text: BACK_BTN }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    },
  );
}

async function stepAskAddress(chatId) {
  const sess = getSession(chatId);
  sess.state = STATE.ASK_ADDRESS;
  await bot.sendMessage(
    chatId,
    `📋 *Bosqich ${STEP_NUM.ASK_ADDRESS}*\n\n📍 Manzilingizni kiriting:\n_(Ko'cha nomi, uy raqami yoki yaqin mo'ljal)_`,
    { parse_mode: "Markdown", reply_markup: backOnlyKeyboard() },
  );
}

async function stepAskService(chatId) {
  const sess = getSession(chatId);
  sess.state = STATE.ASK_SERVICE;
  await bot.sendMessage(
    chatId,
    `📋 *Bosqich ${STEP_NUM.ASK_SERVICE}*\n\n🛠 Qaysi xizmatdan foydalanmoqchisiz?\n\n💡 _Bir nechta xizmat qo'shishingiz mumkin — har bir xizmat uchun miqdorni alohida kiritasiz._`,
    {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(
        SERVICES.map((s) => s.label),
        2,
        true,
      ),
    },
  );
}

async function stepAskAmount(chatId, service) {
  const sess = getSession(chatId);
  sess.state = STATE.ASK_AMOUNT;
  await bot.sendMessage(
    chatId,
    `📋 *Bosqich ${STEP_NUM.ASK_AMOUNT}*\n\n${service.ask}`,
    {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(service.amounts, 3, true),
    },
  );
}

async function stepAskNote(chatId) {
  const sess = getSession(chatId);
  sess.state = STATE.ASK_NOTE;
  await bot.sendMessage(
    chatId,
    `📋 *Bosqich ${STEP_NUM.ASK_NOTE}*\n\n💬 Qo'shimcha izoh yoki eslatma bor bo'lsa yozing.\n_(Masalan: gilam rangi, maxsus holat va h.k.)_`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          [{ text: "✏️ Izoh yozish" }],
          [{ text: "🚫 Izohsiz davom etish" }],
          [{ text: BACK_BTN }],
        ],
        resize_keyboard: true,
        // Agar foydalanuvchi klaviaturadagi tugmani bosmay, oddiy matn yozsa ham,
        // Telegram klaviaturani yuborgandan keyin yashiradi.
        one_time_keyboard: true,
      },
    },
  );
}

async function stepAskAddMore(chatId) {
  const sess = getSession(chatId);
  sess.state = STATE.ASK_ADD_MORE;
  const items = ensureItems(sess);
  const grand = computeGrandTotal(items);
  const summary =
    `🧺 Hozircha savatda: *${items.length} ta* xizmat\n` +
    `💰 Umumiy taxminiy narx: *${grand.hasPlus ? "~" : ""}${formatMoney(grand.total)} so'm*`;

  await bot.sendMessage(
    chatId,
    `${summary}\n\nYana xizmat qo'shasizmi?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          [{ text: ADD_MORE_YES }],
          [{ text: ADD_MORE_NO }],
          [{ text: CART_VIEW }],
          [{ text: CART_REMOVE_LAST }, { text: CART_CLEAR }],
          [{ text: BACK_BTN }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    },
  );
}

async function stepConfirm(chatId) {
  const sess = getSession(chatId);
  sess.state = STATE.CONFIRM;
  const text = formatZayavka(sess.data);

  await bot.sendMessage(
    chatId,
    `${text}\n\n❓ *Barcha ma'lumotlar to'g'rimi?*`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Tasdiqlash", callback_data: "confirm" },
            { text: "✏️ Qayta kiritish", callback_data: "restart" },
          ],
          [
            { text: "⬅️ Orqaga", callback_data: "back" },
            { text: "❌ Bekor qilish", callback_data: "cancel" }
          ],
        ],
      },
    },
  );
}

// ── ORQAGA QAYTISH LOGIKASI ───────────────────────────────────────────────────

async function goBack(chatId) {
  const sess = getSession(chatId);
  const prevStateName = PREV_STATE[sess.state];

  if (!prevStateName) {
    // Birinchi bosqich — bosh sahifaga qaytamiz
    return stepStart(chatId);
  }

  // Orqaga qaytganda o'sha bosqich ma'lumotini tozalaymiz
  switch (sess.state) {
    case STATE.ASK_PHONE:
      delete sess.data.phone;
      break;
    case STATE.ASK_ADDRESS:
      delete sess.data.address;
      break;
    case STATE.ASK_SERVICE:
      delete sess.data.currentServiceLabel;
      break;
    case STATE.ASK_AMOUNT:
      delete sess.data.currentServiceLabel;
      break;
    case STATE.ASK_ADD_MORE: {
      // Oxirgi qo'shilgan xizmatni tahrirlash uchun qaytamiz
      const items = ensureItems(sess);
      const last = items.pop();
      if (last?.service) {
        sess.data.currentServiceLabel = last.service;
      }
      break;
    }
    case STATE.ASK_NOTE:
      delete sess.data.note;
      break;
    case STATE.CONFIRM:
      delete sess.data.note;
      break;
  }

  sess.state = STATE[prevStateName];

  // To'g'ri bosqichga qaytamiz
  switch (prevStateName) {
    case "ASK_NAME":
      return stepAskName(chatId);
    case "ASK_PHONE":
      return stepAskPhone(chatId);
    case "ASK_ADDRESS":
      return stepAskAddress(chatId);
    case "ASK_SERVICE":
      return stepAskService(chatId);
    case "ASK_AMOUNT": {
      const label = sess.data.currentServiceLabel || sess.data.service;
      const service = getServiceByLabel(label);
      return service ? stepAskAmount(chatId, service) : stepAskService(chatId);
    }
    case "ASK_ADD_MORE":
      return stepAskAddMore(chatId);
    case "ASK_NOTE":
      return stepAskNote(chatId);
    default:
      return stepStart(chatId);
  }
}

// ── XABAR HANDLERI ────────────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  try {
    if (!isPrivateChat(msg.chat)) return;

    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const sess = getSession(chatId);

    if (msg.web_app_data?.data) {
      return handleMiniAppOrder(chatId, msg.from.id, msg.web_app_data.data);
    }

  if (text === "/start") return stepStart(chatId);
  if (text === "📝 Buyurtma berish") {
    if (isAdmin(chatId)) {
      return bot.sendMessage(
        chatId,
        "⚠️ Administrator sifatida buyurtma berib bo'lmaydi.",
        { reply_markup: { remove_keyboard: true } },
      );
    }
    return stepAskName(chatId);
  }

  // Orqaga tugmasi — istalgan bosqichda ishlaydi
  if (text === BACK_BTN) return goBack(chatId);

  if (text === "/cancel") {
    clearSession(chatId);
    return bot.sendMessage(
      chatId,
      "❌ Buyurtma bekor qilindi.\n\nQaytadan boshlash uchun: /start",
      {
        reply_markup: { remove_keyboard: true },
      },
    );
  }

  if (isAdmin(chatId) && sess.state !== STATE.IDLE) {
    clearSession(chatId);
    await bot.sendMessage(
      chatId,
      "⚠️ Administrator buyurtma bosqichlarida ishlata olmaydi.\n\n/start — bosh menyuga qaytish.",
      { reply_markup: { remove_keyboard: true } },
    );
    return stepStart(chatId);
  }

  switch (sess.state) {
    case STATE.ASK_NAME:
      if (!text)
        return bot.sendMessage(chatId, "⚠️ Iltimos, ismingizni kiriting:");
      sess.data.name = text;
      return stepAskPhone(chatId);

    case STATE.ASK_PHONE:
      if (msg.contact) {
        const p = msg.contact.phone_number;
        sess.data.phone = p.startsWith("+") ? p : "+" + p;
      } else {
        const cleaned = text.replace(/\s+/g, "");
        if (!/^\+?\d{7,15}$/.test(cleaned)) {
          return bot.sendMessage(
            chatId,
            "⚠️ Telefon raqami noto'g'ri ko'rinadi. Iltimos, +998... formatida yuboring yoki kontaktni tanlang."
          );
        }
        sess.data.phone = cleaned.startsWith("+") ? cleaned : "+" + cleaned;
      }
      return stepAskAddress(chatId);

    case STATE.ASK_ADDRESS:
      if (!text)
        return bot.sendMessage(chatId, "⚠️ Iltimos, manzilingizni kiriting:");
      sess.data.address = text;
      return stepAskService(chatId);

    case STATE.ASK_SERVICE: {
      const service = getServiceByLabel(text);
      if (!service) {
        return bot.sendMessage(
          chatId,
          "⚠️ Iltimos, quyidagi ro'yxatdan xizmat turini tanlang:",
          {
            reply_markup: buildKeyboard(
              SERVICES.map((s) => s.label),
              2,
              true,
            ),
          },
        );
      }
      sess.data.currentServiceLabel = service.label;
      return stepAskAmount(chatId, service);
    }

    case STATE.ASK_AMOUNT:
      if (!text)
        return bot.sendMessage(
          chatId,
          "⚠️ Iltimos, miqdorni tanlang yoki yozing:",
        );
      {
        const service = getServiceByLabel(sess.data.currentServiceLabel);
        if (!service) return stepAskService(chatId);

        const parsed = parseQuantity(text);
        if (!parsed || !parsed.qty) {
          return bot.sendMessage(
            chatId,
            "⚠️ Miqdorni to'g'ri kiriting (masalan: 10 m² yoki 6+)."
          );
        }

        const unit = parseMoney(service.price);
        if (!unit) {
          return bot.sendMessage(
            chatId,
            "⚠️ Narx ma'lumotida xato. Iltimos, xizmat turini qayta tanlang."
          );
        }

        const items = ensureItems(sess);
        const existing = items.find((it) => it?.service === service.label);
        if (existing) {
          existing.qty = Number(existing.qty || 0) + parsed.qty;
          existing.isPlus = Boolean(existing.isPlus) || parsed.isPlus;
          existing.unit = service.unit;
          existing.unitPrice = unit;
          existing.total = existing.qty * unit;
          existing.amountText = formatAmount(existing.qty, existing.unit, existing.isPlus);
        } else {
          items.push({
            service: service.label,
            unit: service.unit,
            amountText: formatAmount(parsed.qty, service.unit, parsed.isPlus),
            qty: parsed.qty,
            isPlus: parsed.isPlus,
            unitPrice: unit,
            total: parsed.qty * unit,
          });
        }

        // eski single-fieldlarni tozalab qo'yamiz (tasdiqlashda items ishlaydi)
        delete sess.data.service;
        delete sess.data.amount;
        delete sess.data.price;
        delete sess.data.pricePerUnit;
        delete sess.data.serviceUnit;
        delete sess.data.currentServiceLabel;

        return stepAskAddMore(chatId);
      }

    case STATE.ASK_ADD_MORE:
      if (text === ADD_MORE_YES) return stepAskService(chatId);
      if (text === ADD_MORE_NO) return stepAskNote(chatId);
      if (text === CART_VIEW) {
        const items = ensureItems(sess);
        await bot.sendMessage(chatId, formatCart(items), { parse_mode: "Markdown" });
        return stepAskAddMore(chatId);
      }
      if (text === CART_REMOVE_LAST) {
        const items = ensureItems(sess);
        items.pop();
        return stepAskAddMore(chatId);
      }
      if (text === CART_CLEAR) {
        sess.data.items = [];
        return stepAskService(chatId);
      }
      return bot.sendMessage(chatId, "⚠️ Iltimos, tugmalardan birini tanlang.");

    case STATE.ASK_NOTE:
      if (text === "✏️ Izoh yozish") {
        // Faqat matn kiritishga ruxsat — klaviaturani yashiramiz
        await bot.sendMessage(chatId, "✏️ Izohingizni yozing:", {
          reply_markup: { remove_keyboard: true },
        });
        return;
      }
      if (text !== "🚫 Izohsiz davom etish") {
        sess.data.note = text;
      }
      
      // Eski pastki menyuni yo'q qilish uchun vaqtincha xabar jo'natib darxol o'chiramiz
      try {
        const tempMsg = await bot.sendMessage(chatId, "⏳...", {
          reply_markup: { remove_keyboard: true }
        });
        await bot.deleteMessage(chatId, tempMsg.message_id);
      } catch (e) {}

      return stepConfirm(chatId);

    default:
      return stepStart(chatId);
  }
  } catch (error) {
    console.error("❌ Xatolik yuz berdi (message handler):", error.message);
  }
});

// ── CALLBACK QUERY ────────────────────────────────────────────────────────────

bot.on("callback_query", async (query) => {
  try {
    if (!query.message || !isPrivateChat(query.message.chat)) {
      await bot.answerCallbackQuery(query.id).catch(() => {});
      return;
    }

    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    await bot.answerCallbackQuery(query.id);

  if (query.data === "confirm") {
    const sess = getSession(chatId);
    if (sess.state !== STATE.CONFIRM) {
      await bot.sendMessage(chatId, "⚠️ Ushbu buyurtma allaqachon yuborilgan yoki yaroqsiz.");
      return;
    }
    if (isAdmin(query.from.id)) {
      await bot.sendMessage(
        chatId,
        "⚠️ Administrator sifatida buyurtma yuborib bo'lmaydi.",
      );
      return;
    }
    // Race-condition va double-click larni oldini olish uchun qayta bosishni yopamiz
    sess.state = STATE.IDLE;

    const text = formatZayavka(sess.data);
    await sendToAdminAndGroup(text);
    await bot.editMessageText(
      "✅ *Buyurtmangiz muvaffaqiyatli qabul qilindi!*\n\n" +
        "🌿 *Eco Wash Navoiy* jamoasi sizdan minnatdor!\n" +
        "📲 Tez orada xodimimiz siz bilan bog'lanadi.\n\n" +
        "🔄 Yangi buyurtma berish uchun: /start",
      { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" },
    );
    clearSession(chatId);
  } else if (query.data === "restart") {
    if (isAdmin(query.from.id)) {
      await bot.editMessageText(
        "⚠️ Administrator buyurtma formasidan foydalana olmaydi.\n\n/start — bosh menyuga.",
        { chat_id: chatId, message_id: msgId },
      );
      clearSession(chatId);
      return stepStart(chatId);
    }
    await bot.editMessageText("🔄 Qaytadan boshlanmoqda...", {
      chat_id: chatId,
      message_id: msgId,
    });
    
    // Foydalanuvchi joriy sessiyada yiqqan elementlarini butkul yo'qotib qo'ymasligi uchun
    // faqat holatni ismi so'rashga qaytaramiz:
    const sess = getSession(chatId);
    sess.state = STATE.ASK_NAME;
    return stepAskName(chatId);
  } else if (query.data === "cancel") {
    await bot.editMessageText(
      "❌ Buyurtma bekor qilindi.\n\nQaytadan boshlash uchun: /start",
      { chat_id: chatId, message_id: msgId },
    );
    clearSession(chatId);
  } else if (query.data === "back") {
    await bot.deleteMessage(chatId, msgId).catch(() => {});
    return goBack(chatId);
  }
  } catch (error) {
    console.error("❌ Xatolik yuz berdi (callback handler):", error.message);
  }
});

// ── XATOLARNI USHLASH ─────────────────────────────────────────────────────────

bot.on("polling_error", (err) =>
  console.error("⚠️ Polling xatosi:", err.message),
);

console.log("✅ Eco Wash Navoiy boti ishga tushdi...");
