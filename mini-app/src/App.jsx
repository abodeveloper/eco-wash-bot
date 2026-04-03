import { useEffect, useMemo, useState } from "react";
import services from "@shared/services.json";
import {
  addCartLine,
  computeGrandTotal,
  formatMoney,
  normalizePhone,
} from "./orderUtils";
import "./App.css";

const STEPS = [
  "name",
  "phone",
  "address",
  "service",
  "amount",
  "addMore",
  "note",
  "confirm",
];

function stepIndex(step) {
  const i = STEPS.indexOf(step);
  return i < 0 ? 0 : i;
}

function initialNameFromTelegram() {
  if (typeof window === "undefined") return "";
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!u?.first_name) return "";
  return [u.first_name, u.last_name].filter(Boolean).join(" ");
}

export default function App() {
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
  const inTelegram = Boolean(tg?.initData || tg?.initDataUnsafe?.user);

  const [step, setStep] = useState("name");
  const [name, setName] = useState(initialNameFromTelegram);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [cart, setCart] = useState([]);
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const w = window.Telegram?.WebApp;
    w?.ready?.();
    w?.expand?.();
  }, []);

  const grand = useMemo(() => computeGrandTotal(cart), [cart]);
  const progress = `${stepIndex(step) + 1}/${STEPS.length}`;

  function goBack() {
    setError("");
    switch (step) {
      case "phone":
        setStep("name");
        break;
      case "address":
        setStep("phone");
        break;
      case "service":
        setStep("address");
        break;
      case "amount":
        setPicked(null);
        setStep("service");
        break;
      case "addMore":
        setPicked(null);
        setStep("service");
        break;
      case "note":
        setStep("addMore");
        break;
      case "confirm":
        setStep("note");
        break;
      default:
        break;
    }
  }

  function nextFromName() {
    if (!name.trim()) {
      setError("Ismingizni kiriting");
      return;
    }
    setError("");
    setStep("phone");
  }

  function nextFromPhone() {
    if (!normalizePhone(phone)) {
      setError("Telefon: +998901234567 ko‘rinishida kiriting");
      return;
    }
    setError("");
    setStep("address");
  }

  function nextFromAddress() {
    if (!address.trim()) {
      setError("Manzilni kiriting");
      return;
    }
    setError("");
    setStep("service");
  }

  function pickService(svc) {
    setPicked(svc);
    setStep("amount");
    setError("");
  }

  function pickAmount(amountLabel) {
    if (!picked) return;
    setCart((c) => addCartLine(c, picked, amountLabel));
    setPicked(null);
    setStep("addMore");
    setError("");
    tg?.HapticFeedback?.selectionChanged?.();
  }

  function addMoreYes() {
    setStep("service");
  }

  function addMoreNo() {
    setStep("note");
  }

  function skipNote() {
    setNote("");
    setStep("confirm");
  }

  function saveNote() {
    setStep("confirm");
  }

  function removeLast() {
    setCart((c) => c.slice(0, -1));
    tg?.HapticFeedback?.impactOccurred?.("light");
  }

  function clearCart() {
    setCart([]);
    setStep("service");
    tg?.HapticFeedback?.impactOccurred?.("light");
  }

  function submitOrder() {
    const p = normalizePhone(phone);
    if (!name.trim() || !p || !address.trim() || !cart.length) {
      setError("Barcha maydonlar to‘ldirilgan va savat bo‘sh emasligini tekshiring");
      return;
    }
    const payload = {
      name: name.trim(),
      phone: p,
      address: address.trim(),
      items: cart.map((i) => ({
        service: i.service,
        amountText: i.amountText,
      })),
      note: note.trim(),
    };
    const raw = JSON.stringify(payload);
    if (raw.length > 4000) {
      setError("Ma’lumot juda katta. Savatdan bir nechta qatorni olib tashlang.");
      return;
    }
    setError("");
    tg?.HapticFeedback?.notificationOccurred?.("success");
    if (typeof tg?.sendData === "function") {
      tg.sendData(raw);
      tg.close();
    } else {
      // Brauzerda lokal test
      console.info("Mini App payload (Telegramda sendData ishlaydi):", payload);
      alert(
        "Bu sahifani Telegram Mini App sifatida oching. Test uchun ma’lumot konsolga yozildi.",
      );
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <p className="hero-badge">🌿 Eco Wash Navoiy</p>
        <h1 className="hero-title">Buyurtma</h1>
        <p className="hero-sub">Bosqich {progress}</p>
      </header>

      {!inTelegram && (
        <div className="banner banner-warn">
          Telegram ichida ochilsa, buyurtma botga yuboriladi.
        </div>
      )}

      {error ? <div className="banner banner-err">{error}</div> : null}

      <main className="card">
        {step === "name" && (
          <section className="step">
            <label className="label">Ismingiz</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Aziz"
              autoComplete="name"
            />
            <div className="actions">
              <button type="button" className="btn primary" onClick={nextFromName}>
                Davom etish
              </button>
            </div>
          </section>
        )}

        {step === "phone" && (
          <section className="step">
            <label className="label">Telefon</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998901234567"
              inputMode="tel"
              autoComplete="tel"
            />
            <div className="actions">
              <button type="button" className="btn ghost" onClick={goBack}>
                Orqaga
              </button>
              <button type="button" className="btn primary" onClick={nextFromPhone}>
                Davom etish
              </button>
            </div>
          </section>
        )}

        {step === "address" && (
          <section className="step">
            <label className="label">Manzil</label>
            <textarea
              className="input area"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ko‘cha, uy, mo‘ljal"
              rows={3}
            />
            <div className="actions">
              <button type="button" className="btn ghost" onClick={goBack}>
                Orqaga
              </button>
              <button type="button" className="btn primary" onClick={nextFromAddress}>
                Davom etish
              </button>
            </div>
          </section>
        )}

        {step === "service" && (
          <section className="step">
            <p className="hint">Xizmat turini tanlang</p>
            <div className="grid2">
              {services.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="tile"
                  onClick={() => pickService(s)}
                >
                  <span className="tile-title">{s.label}</span>
                  <span className="tile-meta">{s.price}</span>
                </button>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={goBack}>
                Orqaga
              </button>
            </div>
          </section>
        )}

        {step === "amount" && picked && (
          <section className="step">
            <p className="hint">{picked.ask}</p>
            <div className="grid3">
              {picked.amounts.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="chip"
                  onClick={() => pickAmount(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={goBack}>
                Orqaga
              </button>
            </div>
          </section>
        )}

        {step === "addMore" && (
          <section className="step">
            <div className="summary">
              <p>
                Savat: <strong>{cart.length}</strong> xizmat
              </p>
              <p className="sum-price">
                Taxminiy jami:{" "}
                <strong>
                  {grand.hasPlus ? "~" : ""}
                  {formatMoney(grand.total)} so&apos;m
                </strong>
              </p>
            </div>
            <div className="stack">
              <button type="button" className="btn primary block" onClick={addMoreYes}>
                ➕ Yana xizmat
              </button>
              <button type="button" className="btn secondary block" onClick={addMoreNo}>
                ➡️ Davom etish
              </button>
              <button type="button" className="btn ghost block" onClick={removeLast}>
                ➖ Oxirgisini olib tashlash
              </button>
              <button type="button" className="btn danger ghost block" onClick={clearCart}>
                🗑 Savatni tozalash
              </button>
            </div>
          </section>
        )}

        {step === "note" && (
          <section className="step">
            <label className="label">Izoh (ixtiyoriy)</label>
            <textarea
              className="input area"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Rang, maxsus talab…"
              rows={3}
            />
            <div className="actions">
              <button type="button" className="btn ghost" onClick={goBack}>
                Orqaga
              </button>
              <button type="button" className="btn ghost" onClick={skipNote}>
                Izohsiz
              </button>
              <button type="button" className="btn primary" onClick={saveNote}>
                Keyingi
              </button>
            </div>
          </section>
        )}

        {step === "confirm" && (
          <section className="step">
            <h2 className="confirm-title">Tekshiring</h2>
            <ul className="confirm-list">
              <li>
                <span>Mijoz</span> <strong>{name}</strong>
              </li>
              <li>
                <span>Telefon</span> <strong>{phone}</strong>
              </li>
              <li>
                <span>Manzil</span> <strong>{address}</strong>
              </li>
            </ul>
            <div className="cart-block">
              <p className="label">Savat</p>
              {cart.map((it, i) => (
                <div key={`${it.service}-${i}`} className="cart-row">
                  <span>{it.service}</span>
                  <span className="muted">{it.amountText}</span>
                </div>
              ))}
              <p className="sum-price">
                Jami: {grand.hasPlus ? "~" : ""}
                {formatMoney(grand.total)} so&apos;m
              </p>
            </div>
            {note.trim() ? (
              <p className="note-preview">
                <span className="label">Izoh</span> {note}
              </p>
            ) : null}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={goBack}>
                Orqaga
              </button>
              <button type="button" className="btn primary" onClick={submitOrder}>
                ✅ Yuborish
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="foot">Navoiy · ekologik tozalash</footer>
    </div>
  );
}
