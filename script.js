/*
  Pocket Budget - script.js
  The app logic. Linked from index.html.
  Your data is saved in the browser (localStorage).
*/

// ============================================================
// 1. SETTINGS: storage key, color themes, saved preferences
// ============================================================

const K = "pocketBudgetV1",
  SKINS = [
    ["forest", "Forest", "#12896C"],
    ["ocean", "Ocean", "#2F7BFF"],
    ["sunset", "Sunset", "#F0527F"],
    ["violet", "Violet", "#7C5CFF"],
  ];
let P = { theme: "auto", skin: "shuffle", bg: "circles", photo: "", lang: /^km/i.test(navigator.language || "") ? "km" : "en" },
  activeSkin = "forest";
try {
  Object.assign(P, JSON.parse(localStorage.getItem("pbPrefs")));
} catch (e) {}
const savePrefs = () => {
  try {
    localStorage.setItem("pbPrefs", JSON.stringify(P));
  } catch (e) {}
};
// Pick a random color theme
function shufflePick() {
  const o = SKINS.filter((s) => s[0] !== activeSkin);
  activeSkin = o[Math.floor(Math.random() * o.length)][0];
}
// Apply saved theme (Auto/White/Black) and color to the page
function applyPrefs() {
  const r = document.documentElement;
  if (P.theme === "auto") delete r.dataset.theme;
  else r.dataset.theme = P.theme;
  if (P.skin !== "shuffle") activeSkin = P.skin;
  r.dataset.skin = activeSkin;
  r.dataset.bg = P.bg;
  r.lang = P.lang;
  if (P.bg === "photo" && P.photo)
    r.style.setProperty("--pat", `url("data:image/svg+xml,${encodeURIComponent(photoSvg(P.photo))}")`);
  else r.style.removeProperty("--pat");
}
if (P.skin === "shuffle") shufflePick();
applyPrefs();
// ============================================================
// 2. APP DATA: spending categories and currencies
// ============================================================

const CATS = [
  { id: "transport", n: "Transport", e: "🛵", c: "#4F7CFF", p: 0.23 },
  { id: "food", n: "Food & meals", e: "🍜", c: "#1FA97A", p: 0.58 },
  { id: "drinks", n: "Drinks & snacks", e: "🧋", c: "#F2A93B", p: 0.11 },
  { id: "other", n: "Other", e: "🛍️", c: "#9B7BE8", p: 0.08 },
];
const CURS = [
  "USD",
  "KHR",
  "EUR",
  "GBP",
  "THB",
  "VND",
  "JPY",
  "INR",
  "PHP",
  "IDR",
  "MYR",
  "SGD",
  "AUD",
  "CAD",
  "CNY",
  "KRW",
];
// ============================================================
// 3. HELPERS: saving data, dates, money formatting, toast
// ============================================================

const $ = (s) => document.querySelector(s);
let S = null,
  tab = "today",
  hm = null,
  editId = null,
  pickCat = "food";
try {
  S = JSON.parse(localStorage.getItem(K));
} catch (e) {
  S = null;
}
const save = () => {
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (e) {}
};
const pad = (n) => String(n).padStart(2, "0"),
  iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const sum = (a) => a.reduce((x, e) => x + e.a, 0),
  cat = (id) => CATS.find((c) => c.id === id) || CATS[3];
// Current currency code
function curNow() {
  return (S && S.p && S.p.cur) || ($("#pc") && $("#pc").value) || "USD";
}
// Format a number as money, e.g. $4.50
function fmt(n) {
  const c = curNow();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: ["KHR", "VND", "JPY", "KRW", "IDR"].includes(c) ? 0 : 2,
    }).format(n);
  } catch (e) {
    return n.toFixed(2);
  }
}
// Currency symbol only, e.g. $
function sym() {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: S.p.cur })
      .formatToParts(0)
      .find((p) => p.type === "currency").value;
  } catch (e) {
    return S.p.cur;
  }
}
// Format a date like "Mon, Oct 19"
function nd(s, o) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(loc(),
    o || { weekday: "short", month: "short", day: "numeric" },
  );
}
// Show a small message at the bottom
function toast(t) {
  const e = $("#toast");
  e.textContent = T(t);
  e.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("show"), 2000);
}
// ============================================================
// 4. CALCULATIONS: daily limit, month totals
// ============================================================

// Work out today, this month and the safe daily limit
function stats() {
  const now = new Date(),
    t = iso(now),
    ym = t.slice(0, 7),
    dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    day = now.getDate(),
    sb = S.p.income - S.p.savings,
    m = S.e.filter((e) => e.d.slice(0, 7) === ym),
    spent = sum(m),
    td = sum(m.filter((e) => e.d === t)),
    before = sum(m.filter((e) => e.d < t)),
    dl = dim - day + 1,
    limit = Math.max(0, (sb - before) / dl);
  return { now, t, ym, dim, day, sb, m, spent, td, limit, dl, left: sb - spent };
}
// ============================================================
// 5. SCREENS: Today, History, Insights, Settings
// ============================================================

// One spending row in a list
function txRow(e) {
  const c = cat(e.c);
  return `<button class="tx" data-edit="${e.id}"><div class="ico" style="background:${c.c}22">${c.e}</div><div class="t"><b>${esc(e.n || c.n)}</b><small>${c.n}</small></div><div class="a">−${fmt(e.a)}</div></button>`;
}
// Small SVG icon for the bottom bar
function icon(p) {
  return `<svg viewBox="0 0 24 24"><path d="${p}"/></svg>`;
}
// Wraps a screen with the bottom navigation bar
function shell(inner) {
  const tabs = [
    ["today", "Today", "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
    ["history", "History", "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
    null,
    ["insights", "Insights", "M4 20V10M10 20V4M16 20v-7M22 20H2"],
    [
      "settings",
      "Settings",
      "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
    ],
  ];
  return (
    inner +
    `<nav class="nav"><div>${tabs.map((t) => (t ? `<button class="t ${tab === t[0] ? "on" : ""}" data-tab="${t[0]}">${icon(t[2])}${t[1]}</button>` : `<button class="fab" data-add aria-label="Add spending"><svg viewBox="0 0 24 24" style="width:28px;height:28px;stroke-width:3"><path d="M12 5v14M5 12h14"/></svg></button>`)).join("")}</div></nav>`
  );
}
// TODAY screen: ring, daily plan, quick add, todays list
function viewToday() {
  const s = stats(),
    over = s.td > s.limit,
    rem = s.limit - s.td,
    pct = s.limit > 0 ? Math.min(1, s.td / s.limit) : s.td > 0 ? 1 : 0,
    R = 96,
    C = 2 * Math.PI * R,
    h = s.now.getHours(),
    g = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
    today = s.m.filter((e) => e.d === s.t).sort((a, b) => b.id - a.id);
  return `<div class="top"><div><h1>${g}, ${esc(S.p.name)}</h1><p class="mut">${nd(s.t, { weekday: "long", month: "long", day: "numeric" })}</p></div><button class="avatar" data-cycle aria-label="Change color theme">${esc(S.p.name.slice(0, 1).toUpperCase())}</button></div>
<div class="card hero"><div class="lbl">Safe to spend today</div><div class="ring"><svg width="216" height="216" viewBox="0 0 216 216"><circle cx="108" cy="108" r="${R}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="14"/><circle cx="108" cy="108" r="${R}" fill="none" stroke="${over ? "#FF8A73" : "#C6F36B"}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset .8s"/></svg><div class="c"><div class="big">${fmt(Math.abs(rem))}</div><div class="sm">${over ? "over today’s limit" : "left of " + fmt(s.limit)}</div></div></div>
<div class="meta"><div>Spent today<b>${fmt(s.td)}</b></div><div>Days left<b>${s.dl}</b></div><div>Daily saving<b>${fmt(S.p.savings / s.dim)}</b></div></div></div>
<div class="row"><div class="stat"><span>Spent this month</span><b>${fmt(s.spent)}</b></div><div class="stat"><span>Budget left</span><b style="color:${s.left < 0 ? "var(--bad)" : "inherit"}">${fmt(s.left)}</b></div><div class="stat"><span>Saving goal</span><b>${fmt(S.p.savings)}</b></div></div>
${inbox.length ? `<button class="btn" id="preview" style="margin:0 0 14px">Review waiting payments (${inbox.length})</button>` : ""}<div class="card"><b style="font-size:14px">Got a bank message?</b><p class="note" style="margin:6px 0 0">Paste your bank SMS or notification and we will ask you if you want to add it.</p><textarea id="pm" rows="3" placeholder="e.g. You paid USD 5.50 to Brown Coffee"></textarea><div class="g2"><button class="btn ghost" id="pchk" style="margin:0">Check message</button><button class="btn ghost" id="pclip" style="margin:0">Paste from clipboard</button></div></div>
<div class="card"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:9px"><span>Month budget used</span><span>${s.sb > 0 ? Math.round((s.spent / s.sb) * 100) : 0}%</span></div><div class="bar"><i style="width:${Math.min(100, s.sb > 0 ? (s.spent / s.sb) * 100 : 0)}%;background:${s.left < 0 ? "var(--bad)" : "var(--brand2)"}"></i></div></div>
<div class="sec"><h2>Daily plan</h2><span>${fmt(s.sb / s.dim)} per day</span></div><div class="card">${CATS.map(
    (c) => {
      const a = (S.p.limits[c.id] || 0) / s.dim,
        u = sum(today.filter((e) => e.c === c.id));
      return `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin:4px 0 7px"><span>${c.e} ${c.n}</span><span style="color:${u > a ? "var(--bad)" : "inherit"}">${fmt(u)} / ${fmt(a)}</span></div><div class="bar" style="margin-bottom:12px"><i style="width:${Math.min(100, a > 0 ? (u / a) * 100 : u > 0 ? 100 : 0)}%;background:${u > a ? "var(--bad)" : c.c}"></i></div>`;
    },
  ).join(
    "",
  )}<p class="note" style="margin:0">Your daily plan is your monthly spending budget divided by the days in this month. The ring above adjusts it for what you have already spent.</p></div><div class="sec"><h2>Quick add</h2><span>Tap a category</span></div><div class="chips">${CATS.map((c) => `<button class="chip" data-add="${c.id}"><i>${c.e}</i>${c.n.split(" ")[0]}</button>`).join("")}</div>
<div class="sec"><h2>Today</h2><span>${today.length} item${today.length === 1 ? "" : "s"}</span></div><div class="card" style="padding:6px 16px">${today.length ? today.map(txRow).join("") : '<div class="empty">Nothing spent today yet.<br>Tap + to record your first payment.</div>'}</div>`;
}
// HISTORY screen: spending grouped by day
function viewHistory() {
  const s = stats();
  hm = hm || s.ym;
  const [y, m] = hm.split("-").map(Number),
    list = S.e
      .filter((e) => e.d.slice(0, 7) === hm)
      .sort((a, b) => b.d.localeCompare(a.d) || b.id - a.id),
    days = {};
  list.forEach((e) => (days[e.d] = days[e.d] || []).push(e));
  return `<div class="top"><h1>History</h1><div style="color:#fff;font-weight:700;font-size:14px">${fmt(sum(list))} spent</div></div><div class="mn"><button data-m="-1" aria-label="Previous month">‹</button><b>${new Date(y, m - 1, 1).toLocaleDateString(loc(), { month: "long", year: "numeric" })}</b><button data-m="1" aria-label="Next month">›</button></div>
${
  Object.keys(days).length
    ? Object.keys(days)
        .map(
          (d) =>
            `<div class="day"><span>${nd(d)}</span><span>${fmt(sum(days[d]))}</span></div><div class="card" style="padding:4px 16px;margin-bottom:6px">${days[d].map(txRow).join("")}</div>`,
        )
        .join("")
    : '<div class="empty">No spending recorded this month.</div>'
}`;
}
// INSIGHTS screen: 7-day chart, projection, categories
function viewInsights() {
  const s = stats(),
    W = 320,
    H = 150,
    days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(s.now);
    d.setDate(d.getDate() - i);
    const k = iso(d);
    days.push({
      k,
      l: d.toLocaleDateString(loc(), { weekday: "narrow" }),
      v: sum(S.e.filter((e) => e.d === k)),
    });
  }
  const mx = Math.max(s.limit * 1.25, ...days.map((d) => d.v), 1),
    bw = 28,
    gap = (W - 7 * bw) / 8,
    ly = H - 24 - (s.limit / mx) * (H - 40);
  const bars = days
    .map((d, i) => {
      const bh = (d.v / mx) * (H - 40),
        x = gap + i * (bw + gap);
      return `<rect x="${x}" y="${H - 24 - bh}" width="${bw}" height="${Math.max(bh, 2)}" rx="8" fill="${d.v > s.limit ? "#E9573F" : "#14A383"}" opacity="${d.k === s.t ? 1 : 0.75}"/><text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--mut)">${d.l}</text>`;
    })
    .join("");
  const avg = s.spent / s.day,
    proj = avg * s.dim,
    wk = sum(days.map((d) => d));
  return `<div class="top"><h1>Insights</h1></div><div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>Last 7 days</b><span class="mut" style="font-size:12px">Dashed line = daily limit</span></div><svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="0" x2="${W}" y1="${ly}" y2="${ly}" stroke="var(--mut)" stroke-dasharray="4 4" opacity=".6"/>${bars}</svg></div>
<div class="row" style="grid-template-columns:1fr 1fr"><div class="stat"><span>Average per day</span><b>${fmt(avg)}</b></div><div class="stat"><span>Projected month total</span><b style="color:${proj > s.sb ? "var(--bad)" : "inherit"}">${fmt(proj)}</b></div></div>
<p class="note">${proj > s.sb ? `At this pace you will pass your ${fmt(s.sb)} spending budget by ${fmt(proj - s.sb)}. Try keeping each day under ${fmt(s.limit)}.` : `You are on track to finish under your ${fmt(s.sb)} spending budget. Keep it up.`}</p>
<div class="sec"><h2>By category</h2><span>This month</span></div><div class="card">${CATS.map(
    (c) => {
      const n = sum(s.m.filter((e) => e.c === c.id)),
        l = S.p.limits[c.id] || 0,
        p = l > 0 ? n / l : n > 0 ? 1 : 0;
      return `<div style="margin:6px 0 16px"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:7px"><span>${c.e} ${c.n}</span><span>${fmt(n)} / ${fmt(l)}</span></div><div class="bar"><i style="width:${Math.min(100, p * 100)}%;background:${p > 1 ? "var(--bad)" : c.c}"></i></div></div>`;
    },
  ).join("")}</div>`;
}
// ============================================================
// 6. FORMS: welcome setup and settings form
// ============================================================

// Shared form for first setup and Settings
function form(setup) {
  const p = (S && S.p) || { name: "", cur: "USD", income: "", savings: "" },
    l = p.limits || {};
  return `<form id="pf"><div class="f"><label for="pn">Your name</label><input id="pn" required maxlength="24" value="${esc(p.name)}" placeholder="e.g. Sophea"></div>
<div class="g2"><div class="f"><label for="pc">Currency</label><select id="pc">${CURS.map((c) => `<option ${c === p.cur ? "selected" : ""}>${c}</option>`).join("")}</select></div><div class="f"><label for="pi">Monthly money</label><input id="pi" required type="number" min="1" step="any" inputmode="decimal" value="${p.income}" placeholder="150"></div></div>
<div class="f"><label for="ps">Amount to save each month</label><input id="ps" required type="number" min="0" step="any" inputmode="decimal" value="${p.savings}" placeholder="20"></div><div id="plan" style="background:var(--chip);border-radius:16px;padding:14px;font-size:13px;line-height:1.7;margin-bottom:12px"></div>
${setup ? '<p class="note">We will split the rest into four spending categories. You can change the split anytime in Settings.</p>' : `<div class="sec" style="margin-top:6px"><h2>Category limits</h2></div>${CATS.map((c) => `<div class="f"><label for="l_${c.id}">${c.e} ${c.n}</label><input id="l_${c.id}" type="number" min="0" step="any" inputmode="decimal" value="${l[c.id] ?? 0}"></div>`).join("")}<p class="note">Change your monthly money or savings above and these limits update automatically. You can still edit each one.</p><p class="note" id="lsum"></p><button type="button" class="btn ghost" id="rsplit" style="margin-bottom:10px">Reset to default split</button>`}
<button class="btn" type="submit">${setup ? "Start tracking" : "Save changes"}</button></form>`;
}
// SETTINGS screen
function viewSettings() {
  const th = document.documentElement.dataset.theme || "auto";
  return `<div class="top"><h1>Settings</h1></div><div class="card">${form(false)}</div>
${settingsExtra()}<div class="card"><b style="font-size:14px">Appearance</b><div class="seg" style="margin-top:10px">${[
    ["auto", "Auto"],
    ["light", "White"],
    ["dark", "Black"],
  ]
    .map((t) => `<button data-theme="${t[0]}" class="${th === t[0] ? "on" : ""}">${t[1]}</button>`)
    .join(
      "",
    )}</div><b style="font-size:14px;display:block;margin:18px 0 10px">Color</b><div style="display:flex;gap:12px;flex-wrap:wrap">${SKINS.map((s) => `<button data-skin="${s[0]}" aria-label="${s[1]}" style="width:44px;height:44px;border-radius:50%;background:${s[2]};border:3px solid ${P.skin === s[0] ? "var(--ink)" : "transparent"}"></button>`).join("")}<button data-skin="shuffle" aria-label="Shuffle colors" style="width:44px;height:44px;border-radius:50%;background:conic-gradient(#12896C,#2F7BFF,#F0527F,#7C5CFF,#12896C);border:3px solid ${P.skin === "shuffle" ? "var(--ink)" : "transparent"}"></button></div><p class="note" style="margin-top:10px">Shuffle picks a new color every time you open the app. Tip: tap your initial at the top of the Today screen to switch colors.</p></div>
<div class="card"><b style="font-size:14px">Your data</b><p class="note">Everything is saved privately on this device. Export a backup any time.</p><button class="btn ghost" id="exp">Export spending as CSV</button><button class="btn del" id="rst">Delete all data</button></div>`;
}
// Handles typing and saving in the form (limits auto-update)
function bindForm(setup) {
  const f = $("#pf");
  if (!f) return;
  const upd = () => {
    const inc = +$("#pi").value || 0,
      sv = +$("#ps").value || 0,
      dm = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
      pl = $("#plan");
    if (pl)
      pl.innerHTML =
        inc > sv
          ? `<b>Your daily plan</b><div>Spend up to <b>${fmt((inc - sv) / dm)}</b> per day</div><div>Save <b>${fmt(sv / dm)}</b> per day</div><small class="mut">Based on ${fmt(inc)} over ${dm} days this month</small>`
          : '<span class="mut">Enter your monthly money to see how much you can spend each day.</span>';
    const el = $("#lsum");
    if (!el) return;
    const t = CATS.reduce((a, c) => a + (+$("#l_" + c.id).value || 0), 0),
      sb = (+$("#pi").value || 0) - (+$("#ps").value || 0);
    el.textContent = `Limits total ${fmt(t)} of ${fmt(sb)} spending budget.${t > sb + 0.001 ? " Limits are higher than your budget." : ""}`;
  };
  f.addEventListener("input", (ev) => {
    if (!setup && (ev.target.id === "pi" || ev.target.id === "ps")) {
      const sb = (+$("#pi").value || 0) - (+$("#ps").value || 0),
        old = CATS.reduce((a, c) => a + (S.p.limits[c.id] || 0), 0);
      CATS.forEach((c) => {
        const r = old > 0 ? (S.p.limits[c.id] || 0) / old : c.p;
        $("#l_" + c.id).value = Math.max(0, Math.round(sb * r * 100) / 100);
      });
    }
    upd();
  });
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const inc = +$("#pi").value,
      sv = +$("#ps").value;
    if (sv >= inc) {
      toast("Savings must be less than your monthly money");
      return;
    }
    const sb = inc - sv,
      limits = {};
    CATS.forEach((c) => {
      limits[c.id] = setup ? Math.round(sb * c.p * 100) / 100 : +$("#l_" + c.id).value || 0;
    });
    S = S || { e: [] };
    S.p = { name: $("#pn").value.trim(), cur: $("#pc").value, income: inc, savings: sv, limits };
    save();
    toast(setup ? "You’re all set" : "Changes saved");
    render();
  });
  try {
    upd();
  } catch (x) {}
}
// ============================================================
// 7. RENDER: draws the right screen
// ============================================================

// Draw the welcome screen or the current tab
function render() {
  const app = $("#app");
  if (!S || !S.p) {
    app.innerHTML = `<div class="onb"><div class="seg" style="margin-bottom:16px">${langBtns()}</div><div class="logo">👛</div><h1>Welcome to Pocket Budget</h1><p class="mut" style="margin-bottom:22px;line-height:1.5">Enter your own monthly money and savings goal. We will work out how much you can safely spend each day.</p><div class="card">${form(true)}</div></div>`;
    bindForm(true);
    tr(app);
    return;
  }
  const v = {
    today: viewToday,
    history: viewHistory,
    insights: viewInsights,
    settings: viewSettings,
  }[tab]();
  app.innerHTML = shell(v);
  if (tab === "settings") bindForm(false);
  tr(app);
}
// ============================================================
// 8. ADD / EDIT SPENDING POPUP
// ============================================================

// Open the add/edit spending popup
function openSheet(id, c) {
  payShown = false;
  editId = id || null;
  const e = id ? S.e.find((x) => x.id === id) : null;
  pickCat = e ? e.c : c || pickCat;
  const t = iso(new Date());
  $("#sheet").innerHTML =
    `<div class="grab"></div><h2 style="text-align:center;font-size:16px">${e ? "Edit payment" : "Add spending"}</h2><div class="amt"><span>${esc(sym())}</span><input id="sa" inputmode="decimal" type="number" step="any" min="0" placeholder="0.00" value="${e ? e.a : ""}" aria-label="Amount"></div>
<div class="cats">${CATS.map((c) => `<button type="button" data-pc="${c.id}" class="${c.id === pickCat ? "on" : ""}"><i>${c.e}</i>${c.n.split(" ")[0]}</button>`).join("")}</div>
<div class="f"><label for="sn">What was it for? (optional)</label><input id="sn" maxlength="60" value="${e ? esc(e.n) : ""}" placeholder="e.g. lunch, petrol, iced coffee"></div><div class="f"><label for="sd">Date</label><input id="sd" type="date" value="${e ? e.d : t}"></div>
<button class="btn" id="ss">${e ? "Save changes" : "Save payment"}</button>${e ? '<button class="btn del" id="sx">Delete payment</button>' : ""}`;
  tr($("#sheet"));
  $("#back").classList.add("show");
  $("#sheet").classList.add("show");
  setTimeout(() => $("#sa").focus(), 250);
}
// Close the popup
function closeSheet() {
  payShown = false;
  $("#back").classList.remove("show");
  $("#sheet").classList.remove("show");
}
// ============================================================
// 9. EVENTS: taps, buttons and keyboard (app starts at the bottom)
// ============================================================

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.tab) {
    tab = t.dataset.tab;
    render();
    scrollTo(0, 0);
  } else if ("add" in t.dataset) openSheet(null, t.dataset.add);
  else if (t.dataset.edit) openSheet(+t.dataset.edit);
  else if (t.dataset.pc) {
    pickCat = t.dataset.pc;
    document.querySelectorAll("[data-pc]").forEach((b) => b.classList.toggle("on", b === t));
  } else if (t.dataset.m) {
    const [y, m] = hm.split("-").map(Number),
      d = new Date(y, m - 1 + +t.dataset.m, 1);
    hm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    render();
  } else if (t.dataset.theme) {
    P.theme = t.dataset.theme;
    savePrefs();
    applyPrefs();
    render();
  } else if (t.dataset.skin) {
    P.skin = t.dataset.skin;
    if (P.skin === "shuffle") shufflePick();
    savePrefs();
    applyPrefs();
    render();
  } else if ("cycle" in t.dataset) {
    const i = SKINS.findIndex((s) => s[0] === activeSkin),
      n = SKINS[(i + 1) % SKINS.length];
    P.skin = n[0];
    savePrefs();
    applyPrefs();
    render();
    toast(n[1] + " theme");
  } else if (t.id === "ss") {
    const a = Math.round(+$("#sa").value * 100) / 100;
    if (!(a > 0)) {
      toast("Enter an amount greater than 0");
      return;
    }
    const o = { a, c: pickCat, n: $("#sn").value.trim(), d: $("#sd").value || iso(new Date()) };
    if (editId)
      Object.assign(
        S.e.find((x) => x.id === editId),
        o,
      );
    else S.e.push({ id: Date.now(), ...o });
    save();
    decidePay();
    closeSheet();
    render();
    toast(editId ? "Payment updated" : "Payment saved");
  } else if (t.id === "sx") {
    S.e = S.e.filter((x) => x.id !== editId);
    save();
    closeSheet();
    render();
    toast("Payment deleted");
  } else if (t.id === "rsplit") {
    const sb = (+$("#pi").value || 0) - (+$("#ps").value || 0);
    CATS.forEach((c) => {
      $("#l_" + c.id).value = Math.max(0, Math.round(sb * c.p * 100) / 100);
    });
    $("#pf").dispatchEvent(new Event("input"));
    toast("Limits reset. Tap Save changes to keep them");
  } else if (t.dataset.lang) {
    P.lang = t.dataset.lang; savePrefs(); applyPrefs(); render();
  } else if (t.dataset.bg) {
    P.bg = t.dataset.bg; savePrefs(); applyPrefs(); render();
  } else if (t.id === "pchk") {
    handlePay($("#pm").value);
  } else if (t.id === "pclip") {
    navigator.clipboard.readText().then(handlePay).catch(() => toast("Clipboard not allowed. Paste the message into the box instead"));
  } else if (t.id === "pcopy") {
    try { navigator.clipboard.writeText($("#plink").value); toast("Link copied"); } catch (x) { $("#plink").select(); }
  } else if (t.id === "preview") {
    nextPay();
  } else if (t.id === "sclose") {
    decidePay();
    closeSheet();
  } else if (t.id === "exp") {
    if (!S.e.length) {
      toast("No spending to export yet");
      return;
    }
    const csv = [
        ["Date", "Category", "Note", "Amount"],
        ...S.e.map((x) => [x.d, cat(x.c).n, x.n, x.a]),
      ]
        .map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","))
        .join("\r\n"),
      u = URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      a = document.createElement("a");
    a.href = u;
    a.download = "pocket-budget.csv";
    a.click();
    URL.revokeObjectURL(u);
  } else if (t.id === "rst") {
    if (confirm(T("Delete your profile and all spending on this device? This cannot be undone."))) {
      S = null;
      try {
        localStorage.removeItem(K);
      } catch (x) {}
      tab = "today";
      render();
    }
  }
});
$("#back").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheet();
  if (e.key === "Enter" && $("#sheet").classList.contains("show") && e.target.id !== "sd")
    $("#ss")?.click();
});
// ============================================================
// 10. LANGUAGE (English / Khmer)
// ============================================================

// Add another language: copy this list, translate the right side, and add a button in langBtns()
const KM = {
 "Today": "ថ្ងៃនេះ",
 "History": "ប្រវត្តិ",
 "Insights": "ការវិភាគ",
 "Settings": "ការកំណត់",
 "Good morning": "អរុណសួស្តី",
 "Good afternoon": "ទិវាសួស្តី",
 "Good evening": "សាយណ្ហសួស្តី",
 "Safe to spend today": "អាចចំណាយបានថ្ងៃនេះ",
 "over today’s limit": "លើសកំណត់ថ្ងៃនេះ",
 "left of ": "នៅសល់ពី ",
 "Spent today": "ចំណាយថ្ងៃនេះ",
 "Days left": "ថ្ងៃនៅសល់",
 "Daily saving": "សន្សំប្រចាំថ្ងៃ",
 "Spent this month": "ចំណាយខែនេះ",
 "Budget left": "ថវិកានៅសល់",
 "Saving goal": "គោលដៅសន្សំ",
 "Month budget used": "ថវិកាខែបានប្រើ",
 "Daily plan": "ផែនការប្រចាំថ្ងៃ",
 " per day": " ក្នុងមួយថ្ងៃ",
 "Quick add": "បន្ថែមរហ័ស",
 "Tap a category": "ចុចលើប្រភេទ",
 " items": " ធាតុ",
 " item": " ធាតុ",
 "Nothing spent today yet.": "មិនទាន់មានការចំណាយថ្ងៃនេះទេ។",
 "Tap + to record your first payment.": "ចុច + ដើម្បីកត់ត្រាការទូទាត់ដំបូង។",
 "Transport": "ធ្វើដំណើរ",
 "Food & meals": "អាហារ",
 "Drinks & snacks": "ភេសជ្ជៈ និងនំ",
 "Food": "អាហារ",
 "Drinks": "ភេសជ្ជៈ",
 "Other": "ផ្សេងៗ",
 " spent": " បានចំណាយ",
 "No spending recorded this month.": "មិនមានការចំណាយក្នុងខែនេះទេ។",
 "Last 7 days": "៧ ថ្ងៃចុងក្រោយ",
 "Dashed line = daily limit": "បន្ទាត់ដាច់ៗ = កម្រិតប្រចាំថ្ងៃ",
 "Average per day": "ជាមធ្យមក្នុងមួយថ្ងៃ",
 "Projected month total": "ប៉ាន់ស្មានសរុបខែ",
 "At this pace you will pass your ": "តាមល្បឿននេះ អ្នកនឹងចំណាយលើសថវិកា ",
 " spending budget by ": " ចំនួន ",
 ". Try keeping each day under ": "។ ព្យាយាមកុំឱ្យលើស ",
 "You are on track to finish under your ": "អ្នកកំពុងដើរត្រូវផ្លូវ ដើម្បីចំណាយក្រោមថវិកា ",
 " spending budget. Keep it up.": "។ បន្តបែបនេះទៀត។",
 "By category": "តាមប្រភេទ",
 "This month": "ខែនេះ",
 "Your name": "ឈ្មោះរបស់អ្នក",
 "Currency": "រូបិយប័ណ្ណ",
 "Monthly money": "ប្រាក់ប្រចាំខែ",
 "Amount to save each month": "ចំនួនសន្សំរៀងរាល់ខែ",
 "Your daily plan": "ផែនការប្រចាំថ្ងៃរបស់អ្នក",
 "Spend up to ": "ចំណាយបានដល់ ",
 "Save ": "សន្សំ ",
 "Based on ": "ផ្អែកលើ ",
 " over ": " ក្នុងរយៈពេល ",
 " days this month": " ថ្ងៃក្នុងខែនេះ",
 "Enter your monthly money to see how much you can spend each day.": "បញ្ចូលប្រាក់ប្រចាំខែ ដើម្បីដឹងថាអាចចំណាយបានប៉ុន្មានក្នុងមួយថ្ងៃ។",
 "We will split the rest into four spending categories. You can change the split anytime in Settings.": "យើងនឹងបែងចែកប្រាក់ដែលនៅសល់ជាបួនប្រភេទ។ អ្នកអាចផ្លាស់ប្តូរបានគ្រប់ពេលក្នុងការកំណត់។",
 "Category limits": "កម្រិតតាមប្រភេទ",
 "Change your monthly money or savings above and these limits update automatically. You can still edit each one.": "ប្តូរប្រាក់ប្រចាំខែ ឬប្រាក់សន្សំខាងលើ កម្រិតទាំងនេះនឹងកែដោយស្វ័យប្រវត្តិ។ អ្នកនៅតែកែបានម្តងមួយៗ។",
 "Limits total ": "កម្រិតសរុប ",
 " of ": " នៃ ",
 " spending budget.": " ថវិកាចំណាយ។",
 "Limits are higher than your budget.": "កម្រិតខ្ពស់ជាងថវិការបស់អ្នក។",
 "Reset to default split": "កំណត់ការបែងចែកដើមវិញ",
 "Start tracking": "ចាប់ផ្តើមតាមដាន",
 "Save changes": "រក្សាទុកការផ្លាស់ប្តូរ",
 "Appearance": "រូបរាង",
 "Auto": "ស្វ័យប្រវត្តិ",
 "White": "ស",
 "Black": "ខ្មៅ",
 "Color": "ពណ៌",
 "Language": "ភាសា",
 "Background": "ផ្ទៃខាងក្រោយ",
 "Circles": "រង្វង់",
 "Waves": "រលក",
 "Mountains": "ភ្នំ",
 "City": "ទីក្រុង",
 "Stars": "ផ្កាយ",
 "Plain": "ធម្មតា",
 "My photo": "រូបថតរបស់ខ្ញុំ",
 "Shuffle picks a new color every time you open the app. Tip: tap your initial at the top of the Today screen to switch colors.": "ជ្រើសពណ៌ថ្មីរាល់ពេលបើកកម្មវិធី។ គន្លឹះ៖ ចុចអក្សរដំបូងរបស់អ្នកនៅផ្នែកខាងលើអេក្រង់ថ្ងៃនេះ ដើម្បីប្តូរពណ៌។",
 "Your data": "ទិន្នន័យរបស់អ្នក",
 "Everything is saved privately on this device. Export a backup any time.": "អ្វីៗរក្សាទុកជាឯកជននៅលើឧបករណ៍នេះ។ អ្នកអាចនាំចេញបម្រុងទុកបានគ្រប់ពេល។",
 "Export spending as CSV": "នាំចេញការចំណាយជា CSV",
 "Delete all data": "លុបទិន្នន័យទាំងអស់",
 "Welcome to Pocket Budget": "សូមស្វាគមន៍មកកាន់ Pocket Budget",
 "Enter your own monthly money and savings goal. We will work out how much you can safely spend each day.": "បញ្ចូលប្រាក់ប្រចាំខែ និងគោលដៅសន្សំរបស់អ្នក។ យើងនឹងគណនាថាអាចចំណាយបានប៉ុន្មានក្នុងមួយថ្ងៃ។",
 "Add spending": "បន្ថែមការចំណាយ",
 "Edit payment": "កែប្រែការទូទាត់",
 "What was it for? (optional)": "សម្រាប់អ្វី? (ស្រេចចិត្ត)",
 "Date": "កាលបរិច្ឆេទ",
 "Save payment": "រក្សាទុកការទូទាត់",
 "Delete payment": "លុបការទូទាត់",
 "e.g. lunch, petrol, iced coffee": "ឧ. អាហារថ្ងៃត្រង់ សាំង កាហ្វេទឹកកក",
 "Payment saved": "បានរក្សាទុកការទូទាត់",
 "Payment updated": "បានកែប្រែការទូទាត់",
 "Payment deleted": "បានលុបការទូទាត់",
 "Enter an amount greater than 0": "សូមបញ្ចូលចំនួនធំជាង 0",
 "Savings must be less than your monthly money": "ប្រាក់សន្សំត្រូវតិចជាងប្រាក់ប្រចាំខែ",
 "You’re all set": "រួចរាល់ហើយ",
 "Changes saved": "បានរក្សាទុកការផ្លាស់ប្តូរ",
 "No spending to export yet": "មិនទាន់មានការចំណាយដើម្បីនាំចេញ",
 "Limits reset. Tap Save changes to keep them": "បានកំណត់ឡើងវិញ។ ចុចរក្សាទុកការផ្លាស់ប្តូរ ដើម្បីរក្សា",
 "Delete your profile and all spending on this device? This cannot be undone.": "លុបប្រវត្តិរូប និងការចំណាយទាំងអស់នៅលើឧបករណ៍នេះ? មិនអាចត្រឡប់វិញបានទេ។",
 "Got a bank message?": "មានសារពីធនាគារឬ?",
 "Paste your bank SMS or notification and we will ask you if you want to add it.": "បិទភ្ជាប់សារ SMS ឬការជូនដំណឹងពីធនាគារ ហើយយើងនឹងសួរថាតើអ្នកចង់បន្ថែមវាឬអត់។",
 "e.g. You paid USD 5.50 to Brown Coffee": "ឧ. អ្នកបានទូទាត់ USD 5.50 ទៅ Brown Coffee",
 "Check message": "ពិនិត្យសារ",
 "Paste from clipboard": "បិទភ្ជាប់ពីក្ដារតម្បៀតខ្ទាស់",
 "Payment detected": "រកឃើញការទូទាត់",
 "Do you want to add this to your budget?": "តើអ្នកចង់បន្ថែមវាទៅក្នុងថវិកាទេ?",
 "Paid to": "បានទូទាត់ទៅ",
 "Accept and add": "ទទួលយក និងបន្ថែម",
 "Decline": "បដិសេធ",
 "Message currency differs from yours. Please check the amount.": "រូបិយប័ណ្ណក្នុងសារខុសពីរបស់អ្នក។ សូមពិនិត្យចំនួនទឹកប្រាក់។",
 "No payment found in this message": "រកមិនឃើញការទូទាត់ក្នុងសារនេះទេ",
 "This looks like money received, not a payment": "នេះដូចជាប្រាក់ទទួលបាន មិនមែនការទូទាត់ទេ",
 "Clipboard not allowed. Paste the message into the box instead": "មិនអនុញ្ញាតឱ្យប្រើក្ដារតម្បៀតខ្ទាស់ទេ។ សូមបិទភ្ជាប់សារក្នុងប្រអប់វិញ",
 "Connect your phone": "ភ្ជាប់ទូរស័ព្ទរបស់អ្នក",
 "A website cannot read your bank app by itself. Use one of these ways and the app will always ask you to Accept or Decline:": "គេហទំព័រមិនអាចអានកម្មវិធីធនាគារដោយខ្លួនឯងបានទេ។ សូមប្រើវិធីមួយក្នុងចំណោមវិធីទាំងនេះ ហើយកម្មវិធីនឹងសួរអ្នកឱ្យទទួលយក ឬបដិសេធជានិច្ច៖",
 "1. Paste:": "១. បិទភ្ជាប់៖",
 "copy the bank SMS or notification, then paste it on the Today screen.": "ចម្លងសារ SMS ឬការជូនដំណឹងពីធនាគារ ហើយបិទភ្ជាប់នៅអេក្រង់ថ្ងៃនេះ។",
 "2. Automatic link:": "២. តំណស្វ័យប្រវត្តិ៖",
 "in iPhone Shortcuts or Android MacroDroid/Tasker, make an automation that opens this link when a bank notification arrives (replace 5.50 and Coffee with the real amount and shop):": "នៅក្នុង iPhone Shortcuts ឬ Android MacroDroid/Tasker សូមបង្កើតស្វ័យប្រវត្តិកម្មដែលបើកតំណនេះនៅពេលមានការជូនដំណឹងពីធនាគារ (ជំនួស 5.50 និង Coffee ដោយចំនួន និងហាងពិត)៖",
 "Copy link": "ចម្លងតំណ",
 "Link copied": "បានចម្លងតំណ",
 "Background changed": "បានប្តូរផ្ទៃខាងក្រោយ",
 "Review waiting payments": "ពិនិត្យការទូទាត់ដែលកំពុងរង់ចាំ",
 "A website cannot read your bank app by itself, but your phone can send each payment here. They arrive one by one and you tap Accept or Decline.": "គេហទំព័រមិនអាចអានកម្មវិធីធនាគារដោយខ្លួនឯងបានទេ ប៉ុន្តែទូរស័ព្ទរបស់អ្នកអាចផ្ញើការទូទាត់នីមួយៗមកទីនេះ។ វាមកម្តងមួយៗ ហើយអ្នកចុចទទួលយក ឬបដិសេធ។"
};
const KMS = Object.entries(KM).sort((a, b) => b[0].length - a[0].length);
const loc = () => (P.lang === "km" ? "km-KH" : undefined);
function T(s) { return P.lang === "km" && KM[s] ? KM[s] : s; }
// Replace English text on screen with the chosen language
function tr(root) {
  if (P.lang !== "km") return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    let v = n.nodeValue;
    if (!v.trim()) continue;
    for (const [k, x] of KMS) if (v.includes(k)) v = v.split(k).join(x);
    n.nodeValue = v;
  }
  root.querySelectorAll("[placeholder]").forEach((el) => { el.placeholder = T(el.placeholder); });
}
function langBtns() {
  return [["en", "English"], ["km", "ខ្មែរ"]]
    .map((l) => `<button data-lang="${l[0]}" class="${P.lang === l[0] ? "on" : ""}">${l[1]}</button>`).join("");
}

// ============================================================
// 11. BACKGROUND PICTURE (header style or your own photo)
// ============================================================

function photoSvg(d) {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 200' preserveAspectRatio='xMidYMid slice'><image href='${d}' width='400' height='200' preserveAspectRatio='xMidYMid slice'/><rect width='400' height='200' fill='#000' fill-opacity='.35'/></svg>`;
}
document.addEventListener("change", (e) => {
  if (e.target.id !== "bgfile" || !e.target.files[0]) return;
  const img = new Image(), url = URL.createObjectURL(e.target.files[0]);
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 450;
    const k = Math.max(900 / img.width, 450 / img.height), w = img.width * k, h = img.height * k;
    c.getContext("2d").drawImage(img, (900 - w) / 2, (450 - h) / 2, w, h);
    P.photo = c.toDataURL("image/jpeg", 0.7); P.bg = "photo";
    savePrefs(); applyPrefs(); URL.revokeObjectURL(url); render(); toast("Background changed");
  };
  img.src = url;
});

// ============================================================
// 12. PHONE PAYMENT ALERTS (read a bank message, then ask Accept / Decline)
// ============================================================

const PAY_WORDS = /paid|payment|purchase|debit|spent|sent|transfer|withdraw|charged|bought|\bpay\b/i;
const IN_WORDS = /received|credited|deposit|refund|salary|cash.?in/i;
const CUR_RE = "USD|US\\$|KHR|THB|EUR|GBP|VND|JPY|[$៛฿€£₫¥]";
const CUR_MAP = { "$": "USD", "US$": "USD", "៛": "KHR", "฿": "THB", "€": "EUR", "£": "GBP", "₫": "VND", "¥": "JPY" };
// Words that help guess the category
const GUESS = [
  ["transport", /grab|pass.?app|taxi|tuk|\bbus\b|fuel|petrol|gas\b|ride|parking|toll/i],
  ["drinks", /coffee|caf[eé]|\btea\b|boba|juice|drink|brown|starbucks|smoothie|bakery|snack/i],
  ["food", /restaurant|kfc|pizza|noodle|rice|food|lunch|dinner|breakfast|market|mart|lyly|aeon|burger|bbq|kitchen/i],
];
// Find the amount, shop and category inside a bank message
function parsePay(text) {
  const re = new RegExp(`(?:${CUR_RE})\\s?(\\d[\\d,]*(?:\\.\\d{1,2})?)|(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s?(?:${CUR_RE})`, "i");
  const m = text.match(re);
  if (!m) return null;
  const a = parseFloat((m[1] || m[2]).replace(/,/g, ""));
  if (!(a > 0)) return null;
  if (IN_WORDS.test(text) && !PAY_WORDS.test(text)) return { received: true };
  const cm = m[0].match(new RegExp(CUR_RE, "i"))[0].toUpperCase();
  const mm = text.match(/\b(?:to|at)\s+([^\n.,]{2,40}?)(?=\s+(?:on|via|ref|from|with|using|for|\d)|[.\n,]|$)/i);
  const n = mm ? mm[1].trim() : "";
  const c = (GUESS.find((g) => g[1].test(text + " " + n)) || ["other"])[0];
  return { a, n, c, cur: CUR_MAP[cm] || cm };
}
function handlePay(text) {
  const p = parsePay(text || "");
  if (!p) toast("No payment found in this message");
  else if (p.received) toast("This looks like money received, not a payment");
  else queuePay(p);
}
// The question popup: Accept adds the payment, Decline closes it
function showPay(p) {
  payShown = true; editId = null; pickCat = p.c;
  const warn = p.cur && p.cur !== S.p.cur ? `<p class="note" style="color:var(--bad);text-align:center">Message currency differs from yours. Please check the amount.</p>` : "";
  $("#sheet").innerHTML = `<div class="grab"></div><h2 style="text-align:center;font-size:16px">Payment detected</h2><p class="note" style="text-align:center">Do you want to add this to your budget?</p>${inbox.length > 1 ? `<p class="note" style="text-align:center"><b>1 of ${inbox.length}</b></p>` : ""}<div class="amt"><span>${esc(sym())}</span><input id="sa" inputmode="decimal" type="number" step="any" min="0" value="${p.a}" aria-label="Amount"></div>${warn}<div class="cats">${CATS.map((c) => `<button type="button" data-pc="${c.id}" class="${c.id === pickCat ? "on" : ""}"><i>${c.e}</i>${c.n.split(" ")[0]}</button>`).join("")}</div><div class="f"><label for="sn">Paid to</label><input id="sn" maxlength="60" value="${esc(p.n)}"></div><input id="sd" type="hidden" value="${iso(new Date())}"><button class="btn" id="ss">Accept and add</button><button class="btn ghost" id="sclose">Decline</button>`;
  tr($("#sheet"));
  $("#back").classList.add("show");
  $("#sheet").classList.add("show");
}
// Extra cards shown in Settings: language, background, phone connection
function settingsExtra() {
  const bgs = [["circles", "Circles"], ["waves", "Waves"], ["mountains", "Mountains"], ["city", "City"], ["stars", "Stars"], ["plain", "Plain"]];
  const base = location.href.split("?")[0].split("#")[0];
  return `<div class="card"><b style="font-size:14px">Language</b><div class="seg" style="margin-top:10px">${langBtns()}</div></div>
<div class="card"><b style="font-size:14px">Background</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${bgs.map((b) => `<button class="pill ${P.bg === b[0] ? "on" : ""}" data-bg="${b[0]}">${b[1]}</button>`).join("")}<label class="pill ${P.bg === "photo" ? "on" : ""}">📷 My photo<input id="bgfile" type="file" accept="image/*" hidden></label></div></div>
<div class="card"><b style="font-size:14px">Connect your phone</b><p class="note" style="margin-top:8px">A website cannot read your bank app by itself, but your phone can send each payment here. They arrive one by one and you tap Accept or Decline.</p><p class="note"><b>Android (MacroDroid):</b> trigger = Notification Received from your bank app. Action = Open URL, using the link below followed by the notification text.</p><div class="f"><input readonly id="plink" value="${esc(base + "?msg=")}"></div><p class="note"><b>iPhone (Shortcuts):</b> Automation, Transaction. Action = Open URL, using this link with the Amount and Merchant.</p><div class="f"><input readonly value="${esc(base + "?pay=AMOUNT&note=SHOP")}"></div><button class="btn ghost" id="pcopy">Copy link</button></div>`;
}

// ============================================================
// 13. PAYMENT QUEUE (payments arrive and are shown one by one)
// ============================================================

let inbox = [], payShown = false;
try { inbox = JSON.parse(localStorage.getItem("pbInbox")) || []; } catch (e) {}
const saveInbox = () => { try { localStorage.setItem("pbInbox", JSON.stringify(inbox)); } catch (e) {} };
// Add a payment to the waiting list, and ask about it if nothing else is open
function queuePay(p) { inbox.push(p); saveInbox(); if (!payShown) nextPay(); }
// Ask about the first waiting payment
function nextPay() { if (S && S.p && inbox.length) showPay(inbox[0]); }
// After Accept or Decline: remove it from the list and ask about the next one
function decidePay() { if (!payShown) return; payShown = false; inbox.shift(); saveInbox(); setTimeout(nextPay, 450); }

// Start the app. A phone automation can open this page with ?msg=BANK TEXT or ?pay=5.50&note=SHOP
render();
{
  const q = new URLSearchParams(location.search), msg = q.get("msg") || q.get("text"), a = parseFloat(q.get("pay"));
  let p = null;
  if (msg) p = parsePay(msg);
  else if (a > 0) p = { a, n: q.get("note") || "", c: CATS.some((c) => c.id === q.get("cat")) ? q.get("cat") : "other", cur: q.get("cur") || (S && S.p ? S.p.cur : "USD") };
  if (p && !p.received) { inbox.push(p); saveInbox(); }
  if (msg || a > 0) { try { history.replaceState(null, "", location.pathname); } catch (e) {} }
}
nextPay();