/* ============================================================
   Cockpit v2 — app.js
   Semua angka sudah dihitung di metrics layer (Python) dan datang
   lewat window.COCKPIT_V2. Browser hanya memformat & menggambar.
   ============================================================ */
(() => {
  "use strict";

  const P = window.COCKPIT_V2;
  if (!P) { document.body.innerHTML = "<p style='padding:2rem'>data.js tidak termuat.</p>"; return; }

  const RM = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const R1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const R2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rp = (v) => {
    if (Math.abs(v) >= 1e9) return `Rp${R2.format(v / 1e9)} M`;
    if (Math.abs(v) >= 1e6) return `Rp${R1.format(v / 1e6)} jt`;
    return `Rp${RM.format(v / 1e3)} rb`;
  };
  const rpk = (v) => `Rp${RM.format(v / 1e3)} rb`;
  const pct = (v, d = 0) => `${d ? R1.format(v * 100) : RM.format(v * 100)}%`;
  const num = (v) => RM.format(v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  const state = { lens: "value", shift: 15 };

  /* ---------------- svg & dom helpers ---------------- */
  const NS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs = {}, text) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function box(host) {
    const r = host.getBoundingClientRect();
    return { w: Math.max(140, r.width), h: Math.max(90, r.height) };
  }
  function axes(g, x, y, w, h, ticks, fmt = num, horizontal = true) {
    ticks.forEach((t) => {
      const ty = horizontal ? y(t.v) : null;
      if (horizontal) {
        g.appendChild(sv("line", { x1: 0, x2: w, y1: ty, y2: ty, class: "gridline" }));
        g.appendChild(sv("text", { x: -5, y: ty + 3, "text-anchor": "end", class: "axis-label" }, fmt(t.t)));
      }
    });
  }

  /* ---------------- tooltip ---------------- */
  const tip = document.getElementById("tip");
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 12;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  function hideTip() { tip.hidden = true; }

  /* ---------------- number binding ---------------- */
  const BASE = { value: P.value, journey: P.journey, spend: P.spend };
  let V = BASE.value, J = BASE.journey, S = BASE.spend;
  const sel = { period: "all", grain: "quarter", ch: "all", ind: "all", tier: "all" };
  let nums = {};

  const prevDelta = () => {
    const ms = V.monthly.filter((m) => m.gmv > 0 || m.contracts > 0);
    if (ms.length < 2) return null;
    const cur = ms[ms.length - 1], prev = ms[ms.length - 2];
    return { cur, prev, gmv: prev.gmv ? cur.gmv / prev.gmv - 1 : null };
  };

  const computeNums = () => ({
    gmv: rp(V.gmv),
    growth22: (() => {
      if (sel.period === "all") {
        const y = Object.fromEntries(V.yearly.map((r) => [r.yr, r.gmv]));
        return y["2022"] && y["2021"] ? `+${pct(y["2022"] / y["2021"] - 1)}` : "—";
      }
      const d = prevDelta();
      return d && d.gmv !== null ? `${d.gmv >= 0 ? "+" : "−"}${pct(Math.abs(d.gmv))}` : "—";
    })(),
    contracts: num(V.contracts),
    accounts: num(V.accounts || 0),
    arpa: rp(V.arpa),
    win: V.win_rate === null ? "—" : pct(V.win_rate, 1),
    avgDeal: rp(V.avg_deal),
    seats: num(V.seats),
    leads: num(V.leads),
    won: num(V.accounts || 0),
    open: num(J.stale.open),
    s90: num(J.stale.s90),
    staleShare: J.stale.open ? pct(J.stale.s30 / J.stale.open) : "—",
    dtd: J.days_to_deal ? R1.format(J.days_to_deal.p50) : "—",
    cac: S.blended && S.blended.cac ? rp(S.blended.cac) : "—",
    nps: R1.format(P.headline.nps),
  });

  function bindNums() {
    nums = computeNums();
    const lbl = document.getElementById("growthLbl");
    if (lbl) lbl.textContent = sel.period === "all" ? "dari kontrak 2021→2022" : "vs periode sebelumnya";
    const l23 = document.getElementById("legend2023");
    if (l23) l23.style.display = sel.period === "all" ? "" : "none";
    const gh = document.getElementById("gmvHead");
    if (gh) gh.innerHTML = `GMV ${sel.grain === "quarter" ? "kuartalan" : "bulanan"} ` +
      `<span class="thin">· baru vs perpanjangan</span>`;
    document.querySelectorAll("[data-num]").forEach((n) => {
      const k = n.dataset.num;
      if (nums[k] !== undefined && nums[k] !== null) n.textContent = nums[k];
    });
  }

  /* ---------------- findings ---------------- */
  function renderFindings() {
    ["value", "journey", "spend"].forEach((lens) => {
      const host = document.getElementById(`find-${lens}`);
      const items = P.findings.filter((f) => f.lens === lens);
      host.innerHTML = items.map((f) => `
        <div class="finding" data-tone="${f.tone}">
          <span class="bar"></span>
          <div>
            <span class="m">${f.metric}</span>
            <h3>${f.title}</h3>
            <p>${f.body}</p>
          </div>
        </div>`).join("");
    });
  }

  /* ---------------- rqi ---------------- */
  const arc = document.getElementById("rqiArc");
  const circ = 2 * Math.PI * 23;
  arc.style.strokeDasharray = circ;
  function renderRqi() {
    const R = V.rqi || P.rqi;
    arc.style.strokeDashoffset = circ * (1 - R.score / 100);
    document.getElementById("rqiValue").textContent = Math.round(R.score);
    document.getElementById("rqiBadge").textContent = `skor ${Math.round(R.score)}/100`;
    document.getElementById("rqiParts").innerHTML = R.parts.map((p) => `
    <div class="rqi-part ${p.value < 0.7 ? "drag" : ""}">
      <span class="nm">${p.name}</span>
      <span class="vl">${Math.round(p.value * 100)}</span>
      <span class="track"><span class="fill" style="width:${p.value * 100}%"></span></span>
      <span class="wt">bobot ${Math.round(p.weight * 100)}% · ${p.label}</span>
    </div>`).join("");
    document.getElementById("rqiRead").innerHTML =
      `Skor <b>${Math.round(R.score)}</b>/100 · ${P.rqi.reading}` +
      (sel.period === "all" && sel.ch === "all" && sel.ind === "all" && sel.tier === "all"
        ? "" : " · sebaran nilai tetap all-time (Gini tidak aditif).");
  }

  /* ---------------- drawer ---------------- */
  const drawer = document.getElementById("drawer");
  function openProv(key) {
    const t = P.trust[key];
    const f = P.formulas[key];
    document.getElementById("drawerTitle").textContent = key.replace(/-/g, " ");
    document.getElementById("drawerBody").innerHTML = `
      <span class="lvl">${t ? t.level : "definisi"}</span>
      ${t ? `<span class="k">Catatan</span><p>${t.note}</p>` : ""}
      ${f ? `<span class="k">Rumus</span><p><code>${f}</code></p>` : ""}
      ${key === "rqi" ? `<span class="k">Bacaan</span><p>${P.rqi.reading}. Bobot: retensi 30%, disiplin harga 25%, sebaran nilai 25%, kemandirian diskon 20%.</p>` : ""}
      <span class="k">Sumber</span>
      <p>Dihitung dari warehouse_v2 (DuckDB) oleh metrics layer; payload ${new Date().getFullYear()} · cutoff 30 Des 2022.</p>`;
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("open"));
  }
  function closeProv() { drawer.classList.remove("open"); setTimeout(() => { drawer.hidden = true; }, 260); }
  document.querySelectorAll("[data-prov]").forEach((b) => {
    b.addEventListener("click", () => openProv(b.dataset.prov));
  });
  document.getElementById("drawerClose").addEventListener("click", closeProv);
  document.getElementById("rqi").addEventListener("click", () => openProv("rqi"));

  /* ---------------- palet ---------------- */
  const themeBtns = [...document.querySelectorAll(".theme-switch button")];
  function setTheme(key) {
    document.documentElement.dataset.theme = key;
    themeBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === key)));
    setTimeout(() => drawLens(), 60);
  }
  themeBtns.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));

  /* ---------------- lens switching ---------------- */
  const tabs = [...document.querySelectorAll(".lens-tabs button")];
  const lensEls = [...document.querySelectorAll(".lens")];
  function setLens(key) {
    state.lens = key;
    let dirty = false;
    if (key === "spend" && (sel.ind !== "all" || sel.tier !== "all")) {
      sel.ind = "all"; sel.tier = "all";
      document.getElementById("fIndustry").value = "all";
      document.getElementById("fTier").value = "all";
      dirty = true;
    }
    if (key === "journey" && sel.tier !== "all") {
      sel.tier = "all";
      document.getElementById("fTier").value = "all";
      dirty = true;
    }
    if (location.hash.slice(1) !== key) history.replaceState(null, "", `#${key}`);
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.lens === key)));
    lensEls.forEach((s) => { s.hidden = s.dataset.lens !== key; });
    hideTip();
    if (dirty && typeof rebuildAll === "function") rebuildAll();
    if (typeof syncFilterUI === "function") syncFilterUI();
    requestAnimationFrame(() => drawLens(key));
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => setLens(t.dataset.lens));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        next.focus(); setLens(next.dataset.lens);
      }
    });
  });
  addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "Escape") closeProv();
    if (e.key === "1" || e.key === "2" || e.key === "3") setLens(["value", "journey", "spend"][+e.key - 1]);
  });

  /* ---------------- chart registry ---------------- */
  const jobs = {};
  function chart(id, fn) { jobs[id] = fn; }
  function drawLens(key = state.lens) {
    document.querySelectorAll(`#lens-${key} .chart`).forEach((host) => {
      const fn = jobs[host.id];
      if (fn && host.clientWidth > 40 && host.clientHeight > 40) fn(host);
    });
  }
  let rz;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => drawLens(), 90);
  });
  document.querySelectorAll(".lens").forEach((l) => l.addEventListener("transitionend", () => drawLens()));

  /* ============================================================
     LENSA 1 · NILAI
     ============================================================ */
  chart("chValue", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const m = { l: 42, r: 8, t: 10, b: 18 };
    const iw = w - m.l - m.r;
    const ih = h - m.t - m.b;
    const data = V.monthly;
    if (!data.length || !data.some((d) => d.gmv > 0)) {
      host.innerHTML = '<p class="empty">Tidak ada kontrak pada irisan ini.</p>';
      return;
    }
    const max = Math.max(...data.map((d) => d.new_gmv + d.renewal_gmv));
    const step = Math.max(niceStep(max / 4), 1);
    const ymax = step * 4;
    const bw = iw / data.length;
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const g = sv("g", { transform: `translate(${m.l},${m.t})` });
    svg.appendChild(g);

    // grid + label sumbu y
    const inJt = ymax >= 1e6;
    for (let i = 0; i <= 4; i++) {
      const v = step * i;
      const y = ih - (v / ymax) * ih;
      g.appendChild(sv("line", { x1: 0, x2: iw, y1: y, y2: y, class: "gridline" }));
      g.appendChild(sv("text", { x: -6, y: y + 3, "text-anchor": "end", class: "axis-label" },
        v === 0 ? "0" : RM.format(v / (inJt ? 1e6 : 1e3))));
    }
    g.appendChild(sv("text", { x: iw, y: -1, "text-anchor": "end", class: "axis-label" }, inJt ? "Rp jt" : "Rp rb"));

    // penanda 2023 renewal-only
    const i2023 = sel.period === "all" ? data.findIndex((d) => d.ym.startsWith("2023")) : -1;
    if (i2023 > 0) {
      const x = i2023 * bw;
      g.appendChild(sv("rect", { x, y: 0, width: iw - x, height: ih, fill: "var(--band)" }));
      g.appendChild(sv("text", { x: x + 4, y: 10, class: "annot" }, "2023 · renewal only"));
    }

    data.forEach((d, i) => {
      const x = i * bw + bw * 0.16;
      const bwid = bw * 0.68;
      const hNew = (d.new_gmv / ymax) * ih;
      const hRen = (d.renewal_gmv / ymax) * ih;
      const yRen = ih - hNew - hRen;
      if (hNew > 0) {
        g.appendChild(sv("rect", { x, y: ih - hNew, width: bwid, height: Math.max(hNew, 0.5), fill: "var(--ink)" }));
      }
      if (hRen > 0) {
        g.appendChild(sv("rect", { x, y: yRen, width: bwid, height: Math.max(hRen, 0.5), fill: "var(--accent)" }));
      }
      const hit = sv("rect", { x: i * bw, y: 0, width: bw, height: ih, class: "hit" });
      hit.addEventListener("mousemove", (e) => showTip(
        `<b>${d.ym}</b><br>baru ${rp(d.new_gmv)}<br>renewal ${rp(d.renewal_gmv)}` +
        `<br><span class="t-sub">${num(d.contracts)} kontrak</span>`, e));
      hit.addEventListener("mouseleave", hideTip);
      g.appendChild(hit);
    });

    // sumbu waktu: kuartal → Q1..Q4; bulan (periode terfilter) → Jan..Des; semua → tahun
    const moName = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    let lastYear = "";
    data.forEach((d, i) => {
      const yr = d.ym.slice(0, 4);
      if (d.ym.includes("-Q")) {
        const q = d.ym.slice(5);
        g.appendChild(sv("text", { x: i * bw + bw / 2, y: ih + 13, "text-anchor": "middle", class: "axis-label" },
          q === "Q1" ? `${yr.slice(2)} ${q}` : q));
        return;
      }
      if (sel.period !== "all") {
        const mo = +d.ym.slice(5, 7);
        g.appendChild(sv("text", { x: i * bw + bw / 2, y: ih + 13, "text-anchor": "middle", class: "axis-label" },
          mo === 1 ? `${moName[mo - 1]} ${yr.slice(2)}` : moName[mo - 1]));
        return;
      }
      if (yr !== lastYear) {
        g.appendChild(sv("text", { x: i * bw + 1, y: ih + 13, class: "axis-label" }, yr));
        lastYear = yr;
      }
    });
    host.appendChild(svg);
  });

  chart("chTier", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const total = sum(V.tier, (t) => t.gmv);
    const max = Math.max(...V.tier.map((t) => t.gmv));
    const rowH = h / V.tier.length;
    V.tier.forEach((t, i) => {
      const y = i * rowH;
      const bh = Math.min(20, rowH * 0.42);
      const bw = (t.gmv / max) * (w - 6);
      const g = sv("g", { transform: `translate(0,${y})` });
      g.appendChild(sv("text", { x: 0, y: 10, class: "lbl" }, t.tier));
      g.appendChild(sv("text", { x: w, y: 10, "text-anchor": "end", class: "mono" },
        `${pct(t.gmv / total)} GMV`));
      g.appendChild(sv("rect", { x: 0, y: 15, width: w, height: bh, fill: "var(--track)", rx: 2 }));
      g.appendChild(sv("rect", { x: 0, y: 15, width: bw, height: bh, fill: i === 0 ? "var(--ink)" : i === 1 ? "var(--teal)" : "var(--accent)", rx: 2 }));
      g.appendChild(sv("text", { x: 0, y: 15 + bh + 11, class: "axis-label" },
        `${rp(t.avg_deal)} · ${num(t.seats)} seat · realisasi ${pct(t.realization, 1)}`));
      host.appendChild(svg);
      svg.appendChild(g);
    });
  });

  chart("chLorenz", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const m = { l: 26, r: 6, t: 6, b: 16 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const g = sv("g", { transform: `translate(${m.l},${m.t})` });
    svg.appendChild(g);
    g.appendChild(sv("line", { x1: 0, y1: ih, x2: iw, y2: 0, class: "lorenz-diag" }));
    const pts = V.concentration.curve.map(([x, y]) => `${x * iw},${ih - y * ih}`).join(" ");
    g.appendChild(sv("polyline", { points: `${0},${ih} ${pts}`, fill: "var(--accent-soft)", stroke: "none" }));
    g.appendChild(sv("polyline", { points: pts, fill: "none", stroke: "var(--accent)", "stroke-width": 1.8 }));
    // marker top 10%
    const x10 = 0.1 * iw;
    const y10 = ih - V.concentration.top10 * ih;
    g.appendChild(sv("line", { x1: x10, y1: ih, x2: x10, y2: y10, stroke: "var(--ink)", "stroke-width": 1, "stroke-dasharray": "2 2" }));
    g.appendChild(sv("circle", { cx: x10, cy: y10, r: 3, fill: "var(--ink)" }));
    g.appendChild(sv("text", { x: x10 + 5, y: y10 + 3, class: "val" }, `${pct(V.concentration.top10)} GMV`));
    g.appendChild(sv("text", { x: 0, y: ih + 12, class: "axis-label" }, "akun (terbesar →)"));
    g.appendChild(sv("text", { x: iw, y: ih + 12, "text-anchor": "end", class: "axis-label" }, "100%"));
    g.appendChild(sv("text", { x: 2, y: 9, class: "axis-label" }, "kumulatif GMV"));
    host.appendChild(svg);
    document.getElementById("concFoot").innerHTML =
      `<b>${pct(V.concentration.top10, 1)}</b> GMV dari 10% akun teratas · Gini ` +
      `<b>${R2.format(V.concentration.gini)}</b> · HHI kanal <b>${R2.format(V.concentration.hhi)}</b>`;
  });

  chart("chDiscount", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const rows = V.programs;
    const rowH = (h - 12) / rows.length;
    svg.appendChild(sv("text", { x: 0, y: 6, class: "axis-label" }, "realisasi harga 80%"));
    svg.appendChild(sv("text", { x: w, y: 6, "text-anchor": "end", class: "axis-label" }, "100%"));
    svg.appendChild(sv("line", { x1: 0, x2: w, y1: 9, y2: 9, class: "axis" }));
    rows.forEach((p, i) => {
      const y = i * rowH;
      const g = sv("g", { transform: `translate(0,${y + 12})` });
      g.appendChild(sv("text", { x: 0, y: 10, class: "lbl" }, p.program));
      // skala realisasi 80-100%
      const x0 = 0, x1 = w;
      const frac = clamp((p.realization - 0.8) / 0.2, 0, 1);
      g.appendChild(sv("rect", { x: x0, y: 16, width: x1, height: 4, rx: 2, fill: "var(--track)" }));
      g.appendChild(sv("rect", { x: x0, y: 16, width: frac * x1, height: 4, rx: 2, fill: i === 2 ? "var(--teal)" : "var(--accent)" }));
      g.appendChild(sv("text", { x: 0, y: 34, class: "axis-label" },
        `realisasi ${pct(p.realization, 1)} · deal ${rp(p.avg_deal)}`));
      g.appendChild(sv("text", { x: w, y: 34, "text-anchor": "end", class: "mono" },
        p.give_up > 0 ? `−${rp(p.give_up)}` : "tanpa diskon"));
      g.appendChild(sv("text", { x: w, y: 11, "text-anchor": "end", class: "axis-label" },
        `${num(p.contracts)} kontrak · ${num(p.seats)} seat`));
      svg.appendChild(g);
    });
    host.appendChild(svg);
    document.getElementById("discFoot").innerHTML =
      `Give-up total <b>${rp(BASE.value.give_up)}</b> (${pct(BASE.value.give_up_pct, 1)} GMV). ` +
      `Diskon dua kali lipat di 2022 tidak menaikkan ukuran deal.`;
  });

  /* ============================================================
     LENSA 2 · JOURNEY
     ============================================================ */
  chart("chFunnel", (host) => {
    host.innerHTML = "";
    if (!J.decay.length || !(J.decay[0].reach_n > 0)) {
      host.innerHTML = '<p class="empty">Tidak ada aktivitas lead pada periode ini — funnel berhenti 30 Des 2022.</p>';
      return;
    }
    const { w, h } = box(host);
    const rows = J.decay.map((d) => ({ ...d }));
    const wonN = J.wonReach || P.headline.accounts;
    rows.push({
      stage_id: 108, stage_short: "Won", reach_n: wonN,
      step_conv: rows[rows.length - 1].reach_n ? wonN / rows[rows.length - 1].reach_n : null,
      dwell_med: null, stop_rate: 0,
    });
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const left = 74, right = 96, top = 16;
    const iw = w - left - right;
    const rowH = (h - top) / rows.length;
    const max = rows[0].reach_n;

    rows.forEach((d, i) => {
      const y = top + i * rowH;
      const bh = Math.min(15, rowH * 0.34);
      const bw = Math.max(3, (d.reach_n / max) * iw);
      const g = sv("g", { transform: `translate(0,${y})` });
      g.appendChild(sv("text", { x: left - 8, y: rowH / 2 + 3, "text-anchor": "end", class: "lbl" }, d.stage_short));
      g.appendChild(sv("rect", { x: left, y: rowH / 2 - bh / 2 - 5, width: iw, height: bh, rx: 2, fill: "var(--track)" }));
      g.appendChild(sv("rect", { x: left, y: rowH / 2 - bh / 2 - 5, width: bw, height: bh, rx: 2, fill: i === rows.length - 1 ? "var(--accent)" : "var(--ink)", opacity: i === rows.length - 1 ? 1 : 0.86 }));
      g.appendChild(sv("text", { x: left + bw + 5, y: rowH / 2 + 3.5, class: "val" }, num(d.reach_n)));
      if (i > 0 && d.step_conv) {
        g.appendChild(sv("text", { x: w - right + 6, y: rowH / 2 + 4, class: "val" }, pct(d.step_conv, 1)));
      }
      if (d.dwell_med != null) {
        g.appendChild(sv("text", { x: w, y: rowH / 2 + 3, "text-anchor": "end", class: "mono" },
          `${R1.format(d.dwell_med)}h`));
        g.appendChild(sv("circle", { cx: w - 34, cy: rowH / 2 - 8, r: 2.4, class: "dwell-dot" }));
      } else {
        g.appendChild(sv("text", { x: w, y: rowH / 2 + 3, "text-anchor": "end", class: "mono" }, "—"));
      }
      const hit = sv("rect", { x: 0, y, width: w, height: rowH, class: "hit" });
      hit.addEventListener("mousemove", (e) => showTip(
        `<b>${d.stage_short}</b><br>${num(d.reach_n)} lead · step ${pct(d.step_conv || 1, 1)}` +
        (d.dwell_med != null ? `<br><span class="t-sub">median ${R1.format(d.dwell_med)} hari ke tahap berikutnya</span>` : ""), e));
      hit.addEventListener("mouseleave", hideTip);
      g.appendChild(hit);
      svg.appendChild(g);
    });
    svg.appendChild(sv("text", { x: left, y: 8, class: "axis-label" }, "reach (lead unik)"));
    svg.appendChild(sv("text", { x: w - right + 6, y: 8, class: "axis-label" }, "step"));
    svg.appendChild(sv("text", { x: w, y: 8, "text-anchor": "end", class: "axis-label" }, "median hari"));
    host.appendChild(svg);
  });

  chart("chCohort", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const data = J.cohort;
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const left = 46, top = 4, bottom = 12;
    const rows = [["q", "Qualified"], ["d", "Discovery"], ["o", "Offer"], ["w", "Won"]];
    const cw = (w - left) / data.length;
    const ch = (h - top - bottom) / rows.length;
    const color = (v) => {
      const t = clamp((v - 0.1) / 0.8, 0, 1);
      const c1 = [242, 238, 229], c2 = [24, 92, 81];
      return `rgb(${c1.map((c, i) => Math.round(c + (c2[i] - c) * (0.38 + 0.62 * t))).join(",")})`;
    };
    rows.forEach(([key, label], ri) => {
      svg.appendChild(sv("text", { x: left - 6, y: top + ri * ch + ch / 2 + 3, "text-anchor": "end", class: "axis-label" }, label));
      data.forEach((d, ci) => {
        const v = d[key];
        const cell = sv("rect", {
          x: left + ci * cw + 0.6, y: top + ri * ch + 0.6,
          width: Math.max(1, cw - 1.2), height: Math.max(1, ch - 1.2),
          fill: color(v), class: "heat-cell", rx: 1,
        });
        cell.addEventListener("mousemove", (e) => showTip(
          `<b>${d.reg_month}</b> · ${num(d.leads)} lead<br>${label}: <b>${pct(v, 1)}</b>`, e));
        cell.addEventListener("mouseleave", hideTip);
        svg.appendChild(cell);
      });
      // label tahun di tengah rentangnya
      const spans = {};
      data.forEach((d, ci) => {
        const yr = d.reg_month.slice(0, 4);
        if (!spans[yr]) spans[yr] = [ci, ci];
        else spans[yr][1] = ci;
      });
      Object.entries(spans).forEach(([yr, [a, b]]) => {
        svg.appendChild(sv("text", {
          x: left + ((a + b) / 2) * cw + cw / 2, y: h - 2, "text-anchor": "middle", class: "axis-label",
        }, yr));
      });
      svg.appendChild(sv("text", { x: left - 6, y: h - 2, "text-anchor": "end", class: "axis-label" }, "bulan"));
    });
    // garis pemisah tahun
    data.forEach((d, ci) => {
      if (ci > 0 && d.reg_month.slice(5) === "01") {
        svg.appendChild(sv("line", { x1: left + ci * cw, x2: left + ci * cw, y1: top, y2: top + rows.length * ch, stroke: "var(--paper)", "stroke-width": 1.4 }));
      }
    });
    host.appendChild(svg);
  });

  chart("chLoss", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const data = J.loss.filter((d) => d.reason !== "tanpa alasan");
    if (!data.some((d) => d.leads > 0)) {
      host.innerHTML = '<p class="empty">Tidak ada lead gugur pada irisan ini.</p>';
      return;
    }
    const fore = Object.fromEntries(J.foregone.map((f) => [f.reason, f.foregone]));
    const rbig = (v) => `Rp${R2.format(v / 1e9)} M`;
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const top = 6, rowH = (h - top) / data.length;
    const max = Math.max(...data.map((d) => d.leads));
    const bwMax = w * 0.52;
    data.forEach((d, i) => {
      const y = top + i * rowH;
      const g = sv("g", { transform: `translate(0,${y})` });
      const bw = (d.leads / max) * bwMax;
      g.appendChild(sv("text", { x: 0, y: rowH / 2 - 2, class: "lbl" }, d.reason));
      g.appendChild(sv("rect", { x: 0, y: rowH / 2 + 3, width: bw, height: 7, rx: 1.5, fill: i === 0 ? "var(--accent)" : "var(--ink)", opacity: i === 0 ? 1 : 0.8 }));
      g.appendChild(sv("text", { x: bw + 6, y: rowH / 2 + 10, class: "val" }, num(d.leads)));
      g.appendChild(sv("text", { x: w, y: rowH / 2 - 2, "text-anchor": "end", class: "mono" },
        `${R1.format(d.days)} hari`));
      g.appendChild(sv("text", { x: w, y: rowH / 2 + 10, "text-anchor": "end", class: "axis-label" },
        `≈ ${rbig(fore[d.reason] || 0)}`));
      const hit = sv("rect", { x: 0, y, width: w, height: rowH, class: "hit" });
      hit.addEventListener("mousemove", (e) => showTip(
        `<b>${d.reason}</b><br>${num(d.leads)} lead gugur · ${R1.format(d.days)} hari di pipeline` +
        `<br><span class="t-sub">foregone ≈ ${rbig(fore[d.reason] || 0)} (proxy)</span>`, e));
      hit.addEventListener("mouseleave", hideTip);
      g.appendChild(hit);
      svg.appendChild(g);
    });
    host.appendChild(svg);
  });

  chart("chFirstTouch", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const data = [...J.first_touch].sort((a, b) => b.wr - a.wr);
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const left = 8, right = 40, top = 4;
    const iw = w - left - right;
    const rowH = (h - top) / data.length;
    const maxWr = 0.42;
    const x = (v) => left + (v / maxWr) * iw;
    const base = x(J.baseline_win);
    svg.appendChild(sv("line", { x1: base, x2: base, y1: top, y2: h - 2, stroke: "var(--ink-2)", "stroke-width": 1, "stroke-dasharray": "2 2", opacity: 0.5 }));
    svg.appendChild(sv("text", { x: base + 3, y: top + 1, class: "annot" }, `rata-rata ${pct(J.baseline_win, 1)}`));
    data.forEach((d, i) => {
      const y = top + i * rowH;
      const g = sv("g", { transform: `translate(0,${y})` });
      const bw = x(d.wr) - left;
      const label = d.page.replace("/form/", "").replace("/", "");
      g.appendChild(sv("text", { x: left, y: rowH / 2 - 2, class: "lbl" }, label));
      g.appendChild(sv("rect", { x: left, y: rowH / 2 + 2, width: Math.max(1, bw), height: 5, rx: 1.5, fill: d.page === "/form/set-a-meeting" ? "var(--accent)" : "var(--ink)", opacity: 0.85 }));
      const wy = rowH / 2 + 4.5;
      g.appendChild(sv("line", { x1: x(d.lo), x2: x(d.hi), y1: wy, y2: wy, class: "whisker" }));
      [d.lo, d.hi].forEach((v) => g.appendChild(sv("line", { x1: x(v), x2: x(v), y1: wy - 2.5, y2: wy + 2.5, class: "whisker" })));
      g.appendChild(sv("text", { x: w, y: rowH / 2 + 6, "text-anchor": "end", class: "val" }, pct(d.wr, 1)));
      g.appendChild(sv("text", { x: w - 30, y: rowH / 2 - 2, "text-anchor": "end", class: "axis-label" }, `n=${d.leads}`));
      const hit = sv("rect", { x: 0, y, width: w, height: rowH, class: "hit" });
      hit.addEventListener("mousemove", (e) => showTip(
        `<b>${d.page}</b><br>${num(d.won)} won / ${num(d.leads)} lead = ${pct(d.wr, 1)}` +
        `<br><span class="t-sub">CI 95%: ${pct(d.lo, 1)} – ${pct(d.hi, 1)}</span>`, e));
      hit.addEventListener("mouseleave", hideTip);
      g.appendChild(hit);
      svg.appendChild(g);
    });
    host.appendChild(svg);
  });

  /* ============================================================
     LENSA 3 · BELANJA
     ============================================================ */
  const niceStep = (v) => {
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  };
  const fmtJt = (v) => RM.format(v / 1e6);

  chart("chBubble", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const data = S.channels;
    const m = { l: 30, r: 16, t: 14, b: 24 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const xMax = Math.max(...data.map((d) => d.spend)) * 1.25;
    const rois = data.map((d) => d.roi);
    const yMin = Math.min(...rois) - 0.6, yMax = Math.max(...rois) + 0.7;
    const X = (v) => (v / xMax) * iw;
    const Y = (v) => ih - ((v - yMin) / (yMax - yMin)) * ih;
    const gmvMax = Math.max(...data.map((d) => d.gmv));
    const R = (v) => 7 + Math.sqrt(v / gmvMax) * (Math.min(iw, ih) * 0.13);

    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const g = sv("g", { transform: `translate(${m.l},${m.t})` });
    svg.appendChild(g);

    for (let v = Math.ceil(yMin); v <= yMax; v += 1) {
      const y = Y(v);
      g.appendChild(sv("line", { x1: 0, x2: iw, y1: y, y2: y, class: "gridline" }));
      g.appendChild(sv("text", { x: -5, y: y + 3, "text-anchor": "end", class: "axis-label" }, `${v}×`));
    }
    const xs = niceStep(xMax / 6);
    for (let v = 0; v <= xMax; v += xs) {
      const x = X(v);
      g.appendChild(sv("text", { x, y: ih + 12, "text-anchor": v === 0 ? "start" : "middle", class: "axis-label" },
        v === 0 ? "0" : fmtJt(v)));
    }
    g.appendChild(sv("text", { x: iw, y: ih + 23, "text-anchor": "end", class: "axis-label" }, "belanja (Rp jt) →"));
    g.appendChild(sv("text", { x: 0, y: -4, "text-anchor": "start", class: "axis-label" }, "GMV ÷ belanja ↑"));

    g.appendChild(sv("text", { x: 1, y: 9, class: "annot" }, "efisien"));
    g.appendChild(sv("text", { x: iw - 1, y: 9, "text-anchor": "end", class: "annot" }, "boros"));

    const labelBox = (txt, x, y, anchor) => {
      const t = sv("text", {
        x, y, "text-anchor": anchor, class: "val",
        stroke: "var(--card)", "stroke-width": 3, "paint-order": "stroke",
      }, txt);
      return t;
    };

    data.forEach((d) => {
      const cx = X(d.spend), cy = Y(d.roi), r = R(d.gmv);
      const best = d.channel === S.scenario.to, worst = d.channel === S.scenario.from;
      const c = sv("circle", {
        cx, cy, r, class: "bubble",
        fill: best ? "var(--accent)" : worst ? "rgba(156,35,80,.42)" : "rgba(25,22,52,.34)",
        stroke: best ? "var(--accent)" : worst ? "var(--crit)" : "var(--ink)", "stroke-width": best ? 1.4 : 0.8,
      });
      c.addEventListener("mousemove", (e) => showTip(
        `<b>${d.channel}</b><br>belanja ${rp(d.spend)} · GMV ${rp(d.gmv)}` +
        `<br>ROI <b>${R2.format(d.roi)}×</b> · CAC ${rp(d.cac)}` +
        `<br><span class="t-sub">${num(d.leads)} lead · ${num(d.won)} won</span>`, e));
      c.addEventListener("mouseleave", hideTip);
      g.appendChild(c);
    });
    // label dengan penghindar tabrakan: urut atas→bawah, jarak minimum 13px
    let lastLabelY = -Infinity;
    [...data].sort((a, b) => Y(a.roi) - Y(b.roi)).forEach((d, i) => {
      const cx = X(d.spend), cy = Y(d.roi), r = R(d.gmv);
      const anchor = cx < 74 ? "start" : cx > iw - 74 ? "end" : "middle";
      const x = anchor === "start" ? cx - r - 5 : anchor === "end" ? cx + r + 5 : cx;
      let y = i % 2 === 0 ? cy - r - 8 : cy + r + 16;
      if (y < lastLabelY + 13) y = lastLabelY + 13;
      lastLabelY = y;
      g.appendChild(labelBox(d.channel, x, y, anchor));
    });
    host.appendChild(svg);
  });

  chart("chCac", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const data = [...S.channels].sort((a, b) => a.cac - b.cac);
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const top = 10, rowH = (h - top) / data.length;
    const max = Math.max(...data.map((d) => d.cac));
    const bwMax = w - 92;
    svg.appendChild(sv("text", { x: 0, y: 7, class: "axis-label" }, "CAC per deal (bar) · CPL (teks)"));
    svg.appendChild(sv("text", { x: w, y: 7, "text-anchor": "end", class: "axis-label" }, `maks ${rp(max)}`));
    data.forEach((d, i) => {
      const y = top + i * rowH;
      const g = sv("g", { transform: `translate(0,${y})` });
      const bw = (d.cac / max) * bwMax;
      g.appendChild(sv("text", { x: 0, y: rowH / 2 - 1, class: "lbl" }, d.channel));
      g.appendChild(sv("rect", { x: 0, y: rowH / 2 + 4, width: bwMax, height: 6, rx: 1.5, fill: "var(--track)" }));
      g.appendChild(sv("rect", { x: 0, y: rowH / 2 + 4, width: Math.max(1, bw), height: 6, rx: 1.5, fill: i === 0 ? "var(--teal)" : "var(--ink)", opacity: i === 0 ? 1 : 0.78 }));
      g.appendChild(sv("text", { x: w, y: rowH / 2 - 1, "text-anchor": "end", class: "val" }, rp(d.cac)));
      g.appendChild(sv("text", { x: w, y: rowH / 2 + 10, "text-anchor": "end", class: "axis-label" }, `CPL ${rpk(d.cpl)}`));
      const hit = sv("rect", { x: 0, y, width: w, height: rowH, class: "hit" });
      hit.addEventListener("mousemove", (e) => showTip(
        `<b>${d.channel}</b><br>CAC ${rp(d.cac)} · CPL ${rpk(d.cpl)}` +
        `<br>win ${pct(d.wr, 1)} · ROI ${R2.format(d.roi)}×`, e));
      hit.addEventListener("mouseleave", hideTip);
      g.appendChild(hit);
      svg.appendChild(g);
    });
    host.appendChild(svg);
  });

  chart("chSpendMonth", (host) => {
    host.innerHTML = "";
    const { w, h } = box(host);
    const data = S.monthly;
    const m = { l: 30, r: 34, t: 10, b: 18 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const maxSpend = Math.ceil(Math.max(...data.map((d) => d.spend)) / 1e6 / 4) * 4 * 1e6;
    const cpi = data.map((d, i) => {
      if (i < 2) return null;
      const sp = d.spend + data[i - 1].spend + data[i - 2].spend;
      const wn = d.won + data[i - 1].won + data[i - 2].won;
      return wn ? sp / wn : null;
    });
    const maxCpi = Math.max(...cpi.filter((v) => v)) * 1.15;
    const bw = iw / data.length;
    const Ys = (v) => ih - (v / maxSpend) * ih;
    const Yc = (v) => ih - (v / maxCpi) * ih;
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const g = sv("g", { transform: `translate(${m.l},${m.t})` });
    svg.appendChild(g);
    for (let v = 0; v <= maxSpend; v += maxSpend / 3) {
      const y = Ys(v);
      g.appendChild(sv("line", { x1: 0, x2: iw, y1: y, y2: y, class: "gridline" }));
      g.appendChild(sv("text", { x: -5, y: y + 3, "text-anchor": "end", class: "axis-label" }, `${fmtJt(v)}`));
    }
    g.appendChild(sv("text", { x: 0, y: -3, "text-anchor": "start", class: "axis-label" },
      sel.grain === "quarter" ? "Rp jt / kuartal" : "Rp jt / bulan"));
    data.forEach((d, i) => {
      const hgt = (d.spend / maxSpend) * ih;
      g.appendChild(sv("rect", { x: i * bw + bw * 0.2, y: ih - hgt, width: bw * 0.6, height: Math.max(hgt, 0.6), fill: "var(--bar-soft)" }));
      const hit = sv("rect", { x: i * bw, y: 0, width: bw, height: ih, class: "hit" });
      hit.addEventListener("mousemove", (e) => showTip(
        `<b>${d.ym}</b><br>belanja ${rp(d.spend)}<br>won ${num(d.won)}` +
        (cpi[i] ? `<br><span class="t-sub">biaya/deal 3 bln ${rp(cpi[i])}</span>` : ""), e));
      hit.addEventListener("mouseleave", hideTip);
      g.appendChild(hit);
    });
    const pts = cpi.map((v, i) => (v ? `${i * bw + bw / 2},${Yc(v)}` : null)).filter(Boolean).join(" ");
    g.appendChild(sv("polyline", { points: pts, fill: "none", stroke: "var(--ink)", "stroke-width": 1.6 }));
    g.appendChild(sv("text", { x: iw + 4, y: 9, class: "axis-label" }, "Rp/deal"));

    data.forEach((d, i) => {
      if (d.ym.includes("Q")) {
        if (d.ym.endsWith("Q1") || i === 0) {
          g.appendChild(sv("text", { x: i * bw + 1, y: ih + 12, class: "axis-label" },
            `${d.ym.slice(2, 4)} ${d.ym.slice(5)}`));
        }
        return;
      }
      const mo = +d.ym.slice(5, 7);
      if (mo === 1 || i === 0) {
        g.appendChild(sv("text", { x: i * bw + 1, y: ih + 12, class: "axis-label" },
          `${String(mo).padStart(2, "0")}/${d.ym.slice(2, 4)}`));
      }
    });
    host.appendChild(svg);
  });

  chart("chScen", (host) => {
    host.innerHTML = "";
    if (!S.scenario) { host.innerHTML = '<p class="empty">Skenario tidak tersedia untuk filter ini.</p>'; return; }
    const { w, h } = box(host);
    const grid = S.scenario.grid;
    const m = { l: 4, r: 6, t: 6, b: 4 };
    const iw = w - m.l - m.r, ih = h - m.t - m.b;
    const maxY = Math.max(...grid.map((g) => g.d_gmv)) || 1;
    const X = (i) => (i / (grid.length - 1)) * iw;
    const Y = (v) => ih - (v / maxY) * ih;
    const svg = sv("svg", { viewBox: `0 0 ${w} ${h}` });
    const g = sv("g", { transform: `translate(${m.l},${m.t})` });
    svg.appendChild(g);
    const area = `M0,${ih} ` + grid.map((d, i) => `L${X(i)},${Y(d.d_gmv)}`).join(" ") + ` L${iw},${ih} Z`;
    g.appendChild(sv("path", { d: area, fill: "var(--teal-soft)" }));
    g.appendChild(sv("polyline", {
      points: grid.map((d, i) => `${X(i)},${Y(d.d_gmv)}`).join(" "),
      fill: "none", stroke: "var(--teal)", "stroke-width": 1.6,
    }));
    const idx = grid.findIndex((d) => d.shift === Number(scRange.value));
    const cx = X(Math.max(0, idx)), cy = Y(grid[Math.max(0, idx)].d_gmv);
    g.appendChild(sv("line", { x1: cx, x2: cx, y1: cy, y2: ih, stroke: "var(--teal)", "stroke-dasharray": "2 2", opacity: 0.6 }));
    g.appendChild(sv("circle", { cx, cy, r: 3.2, fill: "var(--teal)" }));
    g.appendChild(sv("text", { x: Math.min(cx + 6, iw - 2), y: Math.max(cy - 6, 20), "text-anchor": cx > iw * 0.7 ? "end" : "start", class: "val" },
      `+${rp(grid[Math.max(0, idx)].d_gmv)}`));
    g.appendChild(sv("text", { x: 0, y: 8, class: "axis-label" }, `maks +${rp(maxY)}`));
    g.appendChild(sv("line", { x1: 0, x2: iw, y1: ih, y2: ih, class: "axis" }));
    g.appendChild(sv("text", { x: 0, y: ih - 3, class: "axis-label" }, "0%"));
    g.appendChild(sv("text", { x: iw, y: ih - 3, "text-anchor": "end", class: "axis-label" }, "25% dialihkan"));
    host.appendChild(svg);
  });

  /* ---------------- scenario ---------------- */
  const scRange = document.getElementById("scRange");

  function renderScenario() {
    if (!S.scenario) {
      document.querySelectorAll("[data-num^='sc']").forEach((n) => { n.textContent = "—"; });
      const el0 = document.getElementById("chScen");
      if (el0) el0.innerHTML = '<p class="empty">Skenario hanya per kanal — filter industri/tier menonaktifkannya.</p>';
      return;
    }
    const sc = S.scenario;
    document.getElementById("scFrom").textContent = sc.from;
    document.getElementById("scTo").textContent = sc.to;
    const g = sc.grid.find((x) => x.shift === Number(scRange.value)) || sc.grid[0];
    document.querySelector('[data-num="scMoved"]').textContent = rp(g.moved);
    document.querySelector('[data-num="scGmv"]').textContent = `+${rp(g.d_gmv)}`;
    document.querySelector('[data-num="scWon"]').textContent = `+${R1.format(g.d_won)} deal`;
    const el = document.getElementById("chScen");
    if (jobs.chScen && el && el.clientHeight > 30) jobs.chScen(el);
  }
  scRange.addEventListener("input", renderScenario);

  /* ---------------- blended ledger ---------------- */
  function renderLedger() {
    const B = S.blended || BASE.spend.blended;
    document.getElementById("blendedLedger").innerHTML = `
    <div><dt>Belanja total</dt><dd>${rp(B.spend)}</dd></div>
    <div><dt>CAC blended</dt><dd>${B.cac ? rp(B.cac) : "—"}</dd></div>
    <div><dt>CPL blended</dt><dd>${B.cpl ? rpk(B.cpl) : "—"}</dd></div>
    <div><dt>GMV / rupiah</dt><dd>${B.roi ? R2.format(B.roi) + "×" : "—"}</dd></div>
    <div class="hint"><dt>ROI = GMV won ÷ belanja, atribusi bulan deal. Bukan LTV/CAC.</dt></div>`;
  }

  /* ---------------- kpi split & tahunan ---------------- */
  function renderKpi() {
    const yNew = sum(V.yearly, (y) => y.new_gmv);
    const yRen = sum(V.yearly, (y) => y.renewal_gmv);
    const tot = yNew + yRen;
    const host = document.getElementById("kpiSplit");
    host.parentElement.querySelector(".split-key")?.remove();
    host.innerHTML = tot
      ? `<i class="s-new" style="width:${(yNew / tot) * 100}%"></i>` +
        `<i class="s-ren" style="width:${(yRen / tot) * 100}%"></i>` : "";
    if (tot) {
      host.insertAdjacentHTML("beforebegin",
        `<div class="split-key"><span style="width:${(yNew / tot) * 100}%">baru ${pct(yNew / tot)}</span>` +
        `<span style="width:${(yRen / tot) * 100}%">${pct(yRen / tot)} perpanjangan</span></div>`);
    }
    document.getElementById("kpiYears").innerHTML = V.yearly.length
      ? `<thead><tr><th>Tahun</th><th>GMV</th><th>Kontrak</th><th>Renewal</th></tr></thead><tbody>` +
        V.yearly.map((y) => `<tr><td>${y.yr}</td><td class="g">${rp(y.gmv)}</td>` +
          `<td>${num(y.contracts)}</td><td>${y.gmv ? pct(y.renewal_gmv / y.gmv) : "—"}</td></tr>`).join("") +
        `</tbody>`
      : `<tbody><tr><td colspan="4" class="empty">Tidak ada kontrak pada irisan ini.</td></tr></tbody>`;
  }
  function renderFresh() {
    const fresh = document.getElementById("freshBar");
    if (!fresh) return;
    const open = J.stale.open, s30 = J.stale.s30, s90 = J.stale.s90;
    if (!open) { fresh.innerHTML = `<p class="empty">Tidak ada pipeline open pada irisan ini.</p>`; return; }
    fresh.innerHTML =
      `<div class="fr-bar"><i style="width:${(s90 / open) * 100}%;background:var(--crit)"></i>` +
      `<i style="width:${((s30 - s90) / open) * 100}%;background:var(--warn)"></i>` +
      `<i style="width:${((open - s30) / open) * 100}%;background:var(--teal)"></i></div>` +
      `<div class="fr-key"><span><b>${s90}</b> beku &gt;90h</span>` +
      `<span><b>${s30 - s90}</b> 30–90h</span><span><b>${open - s30}</b> aktif</span></div>`;
  }

  /* ---------------- filter → kubus ---------------- */
  const isFiltered = () =>
    sel.period !== "all" || sel.ch !== "all" || sel.ind !== "all" || sel.tier !== "all";

  function rebuildAll() {
    const A = window.CockpitCube && window.CockpitCube.aggregate(P, sel);
    if (!A) return;
    const t = A.totals;
    V = Object.assign({}, BASE.value, {
      gmv: t.gmv, contracts: t.contracts, seats: t.seats, leads: t.leads,
      accounts: A.accounts,
      win_rate: t.leads && sel.tier === "all" ? t.won / t.leads : null,
      avg_deal: t.contracts ? t.gmv / t.contracts : 0,
      arpa: A.accounts ? t.gmv / A.accounts : 0,
      realization: t.list ? t.gmv / t.list : 0,
      give_up: t.giveup,
      give_up_pct: t.gmv + t.giveup ? t.giveup / (t.gmv + t.giveup) : 0,
      monthly: A.monthly.map((m) => ({
        ym: m.ym, new_gmv: m.gmv_new, renewal_gmv: m.gmv_renew,
        gmv: m.gmv, contracts: m.contracts,
      })),
      tier: A.tier,
      yearly: A.yearly,
      rqi: A.rqi,
    });
    J = Object.assign({}, BASE.journey, {
      decay: A.decay,
      loss: A.loss,
      foregone: A.loss.map((l) => ({
        reason: l.reason, leads: l.leads,
        foregone: l.leads * (t.contracts ? t.gmv / t.contracts : 0),
      })),
      stale: { open: t.open, s30: t.s30, s90: t.s90 },
      baseline_win: BASE.journey.baseline_win,
      wonReach: A.wonReach,
    });
    S = Object.assign({}, BASE.spend, {
      channels: A.channels,
      monthly: A.monthly.map((m) => ({ ym: m.ym, spend: m.spend, won: m.won })),
      blended: A.blended,
      scenario: A.scenario,
    });

    markAllTime();
    bindNums();
    renderKpi();
    renderLedger();
    renderFresh();
    renderRqi();
    renderScenario();
    renderFilterNote();
    drawLens();
  }

  function markAllTime() {
    const on = isFiltered();
    ["chLorenz", "chCohort", "chFirstTouch", "chDiscount"].forEach((id) => {
      document.getElementById(id)?.closest(".card")?.classList.toggle("alltime", on);
    });
    document.querySelector(".card.findings")?.classList.toggle("alltime", on);
    const dtd = document.querySelector('#lens-journey .card.kpi');
    if (dtd) {
      dtd.classList.toggle("alltime", on);
      const sub = dtd.querySelector(".kpi-sub");
      if (sub) sub.title = on ? "median hari ke deal dihitung all-time" : "";
    }
    document.querySelectorAll(".legend-dwell-note").forEach((n) => n.remove());
    if (on) {
      document.getElementById("chFunnel")?.closest(".card")
        ?.querySelector(".legend")?.insertAdjacentHTML("beforeend",
          '<span class="legend-note legend-dwell-note">median hari: all-time</span>');
    }
  }

  function renderFilterNote() {
    const note = document.getElementById("fNote");
    if (!note) return;
    const parts = [];
    if (sel.period !== "all") parts.push(sel.period);
    parts.push(sel.grain === "quarter" ? "kuartal" : "bulan");
    if (sel.ch !== "all") parts.push(sel.ch);
    if (sel.ind !== "all") parts.push(sel.ind);
    if (sel.tier !== "all") parts.push(`tier ${sel.tier}`);
    const d = prevDelta();
    const delta = d && d.gmv !== null
      ? ` · GMV ${d.gmv >= 0 ? "+" : "−"}${pct(Math.abs(d.gmv))} vs ${d.prev.ym}`
      : "";
    const nAll = document.querySelectorAll(`#lens-${state.lens} .card.alltime`).length;
    note.innerHTML = `<b>${parts.join(" · ")}</b>${delta}` +
      (nAll ? ` · ${nAll} panel all-time` : " · semua data");
  }

  function syncFilterUI() {
    document.querySelectorAll("#fPeriod button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.v === sel.period)));
    document.querySelectorAll("#fGrain button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.v === sel.grain)));
    const lens = state.lens;
    const indEl = document.getElementById("fIndustry");
    const tierEl = document.getElementById("fTier");
    indEl.disabled = lens === "spend";
    tierEl.disabled = lens !== "value";
    indEl.title = indEl.disabled ? "Belanja hanya tercatat per kanal" : "";
    tierEl.title = tierEl.disabled ? "Tier adalah atribut kontrak — relevan di lensa Nilai" : "";
  }

  function wireFilters() {
    const chEl = document.getElementById("fChannel");
    const indEl = document.getElementById("fIndustry");
    const tierEl = document.getElementById("fTier");
    const opts = (dims) => `<option value="all">Semua</option>` +
      dims.map((d) => `<option>${d}</option>`).join("");
    chEl.innerHTML = opts(P.slices.ch);
    indEl.innerHTML = opts(P.slices.ind);
    tierEl.innerHTML = opts(P.slices.tier);
    chEl.value = sel.ch; indEl.value = sel.ind; tierEl.value = sel.tier;

    document.querySelectorAll("#fPeriod button").forEach((b) =>
      b.addEventListener("click", () => { sel.period = b.dataset.v; rebuildAll(); syncFilterUI(); }));
    document.querySelectorAll("#fGrain button").forEach((b) =>
      b.addEventListener("click", () => { sel.grain = b.dataset.v; rebuildAll(); syncFilterUI(); }));
    const onSel = (k, el) => el.addEventListener("change", () => {
      sel[k] = el.value; rebuildAll(); syncFilterUI();
    });
    onSel("ch", chEl); onSel("ind", indEl); onSel("tier", tierEl);
    document.getElementById("fReset").addEventListener("click", () => {
      Object.assign(sel, { period: "all", grain: "quarter", ch: "all", ind: "all", tier: "all" });
      chEl.value = "all"; indEl.value = "all"; tierEl.value = "all";
      rebuildAll(); syncFilterUI();
    });
  }

  /* ---------------- init ---------------- */
  renderFindings();
  wireFilters();
  (() => {
    const q = new URLSearchParams(location.search);
    ["period", "grain", "ch", "ind", "tier"].forEach((k) => {
      if (q.get(k)) sel[k] = q.get(k);
    });
    const map = { ch: "fChannel", ind: "fIndustry", tier: "fTier" };
    Object.entries(map).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (sel[k] !== "all" && ![...el.options].some((o) => o.value === sel[k])) sel[k] = "all";
      el.value = sel[k];
    });
    if (!["month", "quarter"].includes(sel.grain)) sel.grain = "quarter";
    if (!["all", "2021", "2022", "2023"].includes(sel.period)) sel.period = "all";
  })();
  rebuildAll();
  syncFilterUI();
  renderScenario();
  const initial = ["value", "journey", "spend"].includes(location.hash.slice(1))
    ? location.hash.slice(1) : "value";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setLens(initial);
    drawLens(initial);
    const th = new URLSearchParams(location.search).get("theme");
    if (th === "violet" || th === "paper") setTheme(th);
  }));
})();
