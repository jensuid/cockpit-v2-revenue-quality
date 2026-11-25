/* ============================================================
   cube.js — agregasi sel pra-hitung (filter periode/segmen).
   Aturan: TIDAK ada definisi metrik di sini. Semua ukuran sudah
   dihitung di model/build_v2.py (tabel v2_slice_*); file ini hanya
   menjumlahkan sel dan membentuk rasio yang sama seperti payload.
   ============================================================ */
(function (root) {
  "use strict";

  const R2 = (v) => Math.round(v * 100) / 100;

  function wilson(k, n) {
    if (!n) return [0, 0];
    const z = 1.96, p = k / n, den = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n);
    const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [(c - m) / den, (c + m) / den];
  }

  const sumAt = (rows, i) => rows.reduce((s, r) => s + r[i], 0);

  function monthsFor(sel, all) {
    return all.filter((m) => sel.period === "all" || m.startsWith(sel.period));
  }

  /** sel: {period:'all'|'2021'|'2022'|'2023', grain:'month'|'quarter',
   *        ch:'all'|name, ind:'all'|name, tier:'all'|name} */
  function aggregate(P, sel) {
    const Z = P.slices;
    if (!Z) return null;
    const mIdx = new Map(Z.months.map((m, i) => [m, i]));
    const chIdx = new Map(Z.ch.map((c, i) => [c, i]));
    const indIdx = new Map(Z.ind.map((c, i) => [c, i]));
    const tierIdx = new Map(Z.tier.map((c, i) => [c, i]));

    const inMonths = (mi) => {
      const ym = Z.months[mi];
      return sel.period === "all" || ym.startsWith(sel.period);
    };
    const ok = (r, chCol, indCol) =>
      (sel.ch === "all" || Z.ch[r[chCol]] === sel.ch) &&
      (sel.ind === "all" || Z.ind[r[indCol]] === sel.ind);

    const bucket = (ym) => (sel.grain === "quarter"
      ? `${ym.slice(0, 4)}-Q${Math.floor((+ym.slice(5, 7) - 1) / 3) + 1}`
      : ym);

    const series = new Map();
    const touch = (ym) => {
      const k = bucket(ym);
      if (!series.has(k)) series.set(k, {
        ym: k, label: k, gmv_new: 0, gmv_renew: 0, gmv: 0, contracts: 0,
        leads: 0, won: 0, spend: 0, open: 0, s30: 0, s90: 0, seats: 0,
        list: 0, giveup: 0, disc: 0, renew: 0, preViews: 0,
      });
      return series.get(k);
    };

    for (const r of Z.lead) {
      if (!inMonths(r[2]) || !ok(r, 0, 1)) continue;
      const b = touch(Z.months[r[2]]);
      b.leads += r[3]; b.won += r[4]; b.open += r[5];
      b.s30 += r[6]; b.s90 += r[7]; b.preViews += r[8];
    }
    for (const r of Z.contract) {
      if (!inMonths(r[3]) || !ok(r, 0, 1)) continue;
      if (sel.tier !== "all" && Z.tier[r[2]] !== sel.tier) continue;
      /* kontrak: ch,ind,tier,mi,contracts,gmv,seats,list,giveup,renew,disc,gmv_new,gmv_ren,acc_first */
      const b = touch(Z.months[r[3]]);
      b.contracts += r[4]; b.seats += r[6]; b.list += r[7];
      b.giveup += r[8]; b.renew += r[9]; b.disc += r[10];
      b.gmv += r[5]; b.gmv_new += r[11]; b.gmv_renew += r[12];
      b.accounts += r[13];
    }
    /* spend: hanya dimensi kanal (tidak bisa dipecah per industri/tier) */
    for (const r of Z.spend) {
      const mi = r[1];
      if (!inMonths(mi)) continue;
      if (sel.ch !== "all" && Z.ch[r[0]] !== sel.ch) continue;
      touch(Z.months[mi]).spend += r[2];
    }

    const monthly = [...series.values()].sort((a, b) => a.ym.localeCompare(b.ym));
    const sums = (k) => monthly.reduce((s, m) => s + m[k], 0);
    const totals = {
      leads: sums("leads"), won: sums("won"), open: sums("open"),
      s30: sums("s30"), s90: sums("s90"), gmv: sums("gmv"),
      contracts: sums("contracts"), seats: sums("seats"), list: sums("list"),
      giveup: sums("giveup"), disc: sums("disc"), renew: sums("renew"),
      spend: sums("spend"), preViews: sums("preViews"), accounts: sums("accounts"),
    };
    const accounts = Math.max(1, totals.accounts || totals.contracts - totals.renew);

    /* tier mix */
    const tm = new Map();
    for (const r of Z.contract) {
      if (!inMonths(r[3]) || !ok(r, 0, 1)) continue;
      const t = Z.tier[r[2]];
      if (sel.tier !== "all" && t !== sel.tier) continue;
      if (!tm.has(t)) tm.set(t, { tier: t, contracts: 0, gmv: 0, seats: 0, list: 0 });
      const b = tm.get(t);
      b.contracts += r[4]; b.gmv += r[5]; b.seats += r[6]; b.list += r[7];
    }
    const tier = [...tm.values()].sort((a, b) => b.gmv - a.gmv).map((t) => ({
      ...t,
      avg_deal: t.contracts ? t.gmv / t.contracts : 0,
      realization: t.list ? t.gmv / t.list : 0,
      price_per_seat: t.seats ? t.gmv / t.seats : 0,
    }));

    /* funnel reach */
    const reach = new Map();
    for (const r of Z.reach) {
      if (!inMonths(r[2]) || !ok(r, 0, 1)) continue;
      reach.set(r[3], (reach.get(r[3]) || 0) + r[4]);
    }
    const decay = P.journey.decay.map((d) => ({ ...d, reach_n: reach.get(d.stage_id) || 0 }));
    decay.forEach((d, i) => {
      d.step_conv = i === 0 ? null : decay[i - 1].reach_n ? d.reach_n / decay[i - 1].reach_n : null;
    });

    /* loss */
    const lm = new Map();
    for (const r of Z.loss) {
      if (!inMonths(r[2]) || !ok(r, 0, 1)) continue;
      const reason = Z.reason[r[3]];
      lm.set(reason, (lm.get(reason) || 0) + r[4]);
    }
    const loss = P.journey.loss.map((d) => ({ ...d, leads: lm.get(d.reason) || 0 }));

    /* per kanal */
    const cm = new Map();
    const cget = (c) => {
      if (!cm.has(c)) cm.set(c, {
        channel: c, spend: 0, leads: 0, won: 0, gmv: 0, contracts: 0,
      });
      return cm.get(c);
    };
    for (const r of Z.lead) {
      if (!inMonths(r[2])) continue;
      if (sel.ind !== "all" && Z.ind[r[1]] !== sel.ind) continue;
      const c = cget(Z.ch[r[0]]);
      c.leads += r[3]; c.won += r[4];
    }
    for (const r of Z.contract) {
      if (!inMonths(r[3])) continue;
      if (sel.ind !== "all" && Z.ind[r[1]] !== sel.ind) continue;
      if (sel.tier !== "all" && Z.tier[r[2]] !== sel.tier) continue;
      const c = cget(Z.ch[r[0]]);
      c.gmv += r[5]; c.contracts += r[4];
    }
    for (const r of Z.spend) {
      if (!inMonths(r[1])) continue;
      cget(Z.ch[r[0]]).spend += r[2];
    }
    const channels = [...cm.values()]
      .filter((c) => c.leads || c.contracts || c.spend)
      .map((c) => {
        const [lo, hi] = wilson(c.won, c.leads);
        return {
          ...c,
          cpl: c.leads ? c.spend / c.leads : 0,
          cac: c.won ? c.spend / c.won : 0,
          roi: c.spend ? c.gmv / c.spend : 0,
          wr: c.leads ? c.won / c.leads : 0,
          lo, hi,
        };
      })
      .sort((a, b) => b.gmv - a.gmv);

    /* tahun kontrak (untuk tabel kecil) */
    const ym = new Map();
    for (const r of Z.contract) {
      if (!inMonths(r[3]) || !ok(r, 0, 1)) continue;
      if (sel.tier !== "all" && Z.tier[r[2]] !== sel.tier) continue;
      const y = Z.months[r[3]].slice(0, 4);
      if (!ym.has(y)) ym.set(y, { yr: y, gmv: 0, new_gmv: 0, renewal_gmv: 0, contracts: 0 });
      const b = ym.get(y);
      b.gmv += r[5]; b.contracts += r[4];
      b.new_gmv += r[11]; b.renewal_gmv += r[12];
    }
    const yearly = [...ym.values()].sort((a, b) => a.yr.localeCompare(b.yr));

    /* blended */
    const blended = {
      spend: totals.spend, leads: totals.leads, won: totals.won, gmv: totals.gmv,
      cpl: totals.leads ? totals.spend / totals.leads : 0,
      cac: totals.won ? totals.spend / totals.won : 0,
      roi: totals.spend ? totals.gmv / totals.spend : 0,
    };

    /* skenario realokasi: butuh dua kanal dengan belanja */
    let scenario = null;
    const base = P.spend.scenario;
    if (sel.ind === "all" && sel.tier === "all") {
      const from = channels.find((c) => c.channel === base.from);
      const to = channels.find((c) => c.channel === base.to);
      if (from && to && from.spend > 0 && to.spend > 0) {
        const grid = [];
        for (let s = 0; s <= 25; s += 5) {
          const moved = (from.spend * s) / 100;
          grid.push({
            shift: s, moved,
            d_gmv: moved * (to.roi - from.roi),
            d_won: moved * ((to.won / to.spend) - (from.won / from.spend)),
          });
        }
        scenario = { from: from.channel, to: to.channel, from_roi: from.roi, to_roi: to.roi, grid };
      }
    }

    /* RQI: semua komponen dihitung ulang kecuali Gini (tidak aditif) */
    const giniPart = P.rqi.parts[2];
    const retensi = totals.contracts ? Math.min(1, totals.renew / Math.max(1, totals.contracts - totals.renew)) : 0;
    const disiplin = totals.list ? totals.gmv / totals.list : 0;
    const mandiri = totals.contracts ? 1 - totals.disc / totals.contracts : 0;
    const parts = [
      { name: "Retensi akun", weight: 0.3, value: retensi, label: `${(retensi * 100).toFixed(1)}% akun memperpanjang` },
      { name: "Disiplin harga", weight: 0.25, value: disiplin, label: `realisasi ${(disiplin * 100).toFixed(1)}% dari list` },
      { ...giniPart },
      { name: "Kemandirian diskon", weight: 0.2, value: mandiri, label: `${Math.round(mandiri * 100)}% kontrak tanpa diskon` },
    ];
    const score = 100 * parts.reduce((s, p) => s + p.weight * p.value, 0);

    return {
      monthly, totals, tier, decay, loss, channels, yearly, blended,
      scenario, rqi: { score, parts }, accounts, wonReach: reach.get(108) || 0,
    };
  }

  root.CockpitCube = { aggregate, wilson };
})(typeof window !== "undefined" ? window : globalThis);
