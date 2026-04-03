export function parseMoney(priceText) {
  const s = String(priceText ?? "");
  const m = s.match(/([\d\s]+)\s*so'm/i);
  if (!m) return null;
  return Number(m[1].replace(/\s+/g, ""));
}

export function parseQuantity(amountText) {
  const s = String(amountText ?? "").trim();
  const isPlus = s.includes("+");
  const m = s.match(/([\d]+)\s*\+?/);
  if (!m) return null;
  return { qty: Number(m[1]), isPlus };
}

export function formatAmount(qty, unit, isPlus) {
  const q = Number(qty);
  const plus = isPlus ? "+" : "";
  if (!unit) return `${q}${plus}`;
  if (unit === "m²") return `${q}${plus} m²`;
  return `${q}${plus}`;
}

export function formatMoney(num) {
  const n = Math.round(Number(num) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function computeGrandTotal(items) {
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

export function addCartLine(cart, service, amountText) {
  const parsed = parseQuantity(amountText);
  if (!parsed) return cart;
  const unit = parseMoney(service.price);
  if (!unit) return cart;
  const next = [...cart];
  const idx = next.findIndex((it) => it.service === service.label);
  if (idx >= 0) {
    const ex = { ...next[idx] };
    ex.qty += parsed.qty;
    ex.isPlus = Boolean(ex.isPlus) || parsed.isPlus;
    ex.unitPrice = unit;
    ex.total = ex.qty * unit;
    ex.amountText = formatAmount(ex.qty, ex.unit, ex.isPlus);
    next[idx] = ex;
  } else {
    next.push({
      service: service.label,
      unit: service.unit,
      amountText: formatAmount(parsed.qty, service.unit, parsed.isPlus),
      qty: parsed.qty,
      isPlus: parsed.isPlus,
      unitPrice: unit,
      total: parsed.qty * unit,
    });
  }
  return next;
}

export function normalizePhone(raw) {
  const cleaned = String(raw || "").replace(/\s+/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return null;
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}
