'use strict';

const $ = (id) => document.getElementById(id);
const inputIds = [
  'vinMin','vinNom','vinMax','voutMin','voutNom','voutMax','pout','pmax','eff','vf','nsTurns','turnRoundMode','nManual',
  'fSwMax','fSwMin','frRatio','frH','plotFMin','plotFMax','qMin','qMax','qStep','qManual','powerList','gainYMax',
  'lrActual','crActual','lmActual','fChk','cSw','deadTime'
];

function num(id, fallback = 0) {
  const el = $(id);
  if (!el) return fallback;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}

function maybeNum(id) {
  const el = $(id);
  if (!el || String(el.value).trim() === '') return NaN;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : NaN;
}

function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(1);
  if (abs >= 100) return v.toFixed(2);
  if (abs >= 10) return v.toFixed(3);
  return v.toFixed(digits);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function uniqueSorted(values) {
  return values
    .filter(v => Number.isFinite(v) && v > 0)
    .filter((v, i, arr) => arr.findIndex(x => Math.abs(x - v) < 0.001) === i)
    .sort((a, b) => a - b);
}

function llcGain(x, q, k) {
  // FHA normalized LLC gain approximation.
  // x = f / frH, k = Lm / Lr, q = sqrt(Lr/Cr) / Racp
  if (x <= 0 || q <= 0 || k <= 0) return NaN;
  const den = Math.sqrt(
    Math.pow(1 + (1 - 1 / (x * x)) / k, 2) +
    Math.pow(q * (x - 1 / x), 2)
  );
  const m = 1 / den;
  return Number.isFinite(m) ? m : NaN;
}

function parsePowerSeries(pout, pmax) {
  const text = ($('powerList')?.value || '').trim();
  let values = [];
  if (text) {
    values = text.split(/[,、\s]+/).map(v => parseFloat(v));
  }
  if (!values.length) values = [50, 100, 200, 300, 400, 500, pout, pmax];
  return uniqueSorted(values).slice(0, 14);
}

function qForPower(c, p) {
  if (!Number.isFinite(p) || p <= 0 || c.inputs.pout <= 0) return NaN;
  return c.qUse * (p / c.inputs.pout);
}

function gainFor(c, fKHz, pW) {
  const q = qForPower(c, pW);
  const x = (fKHz * 1000) / c.frHActual;
  return llcGain(x, q, c.kActual);
}

function voutFor(c, vin, fKHz, pW) {
  const g = gainFor(c, fKHz, pW);
  if (!Number.isFinite(g)) return NaN;
  return (vin * g) / (2 * c.n) - c.inputs.vf;
}

function maxGainInRange(k, q, frH, fMinK, fMaxK) {
  let max = -Infinity;
  let fAt = NaN;
  for (let i = 0; i <= 500; i++) {
    const f = fMinK + (fMaxK - fMinK) * i / 500;
    const g = llcGain((f * 1000) / frH, q, k);
    if (Number.isFinite(g) && g > max) {
      max = g;
      fAt = f;
    }
  }
  return { max, fAt };
}

function calculate() {
  const vinMin = num('vinMin', 360);
  const vinNom = num('vinNom', 400);
  const vinMax = num('vinMax', 420);
  const voutMin = num('voutMin', 18);
  const voutNom = num('voutNom', 19);
  const voutMax = num('voutMax', 20);
  const pout = num('pout', 480);
  const pmax = num('pmax', 560);
  const eff = num('eff', 95) / 100;
  const vf = num('vf', 0.40);
  const nsTurns = Math.max(1, Math.round(num('nsTurns', 5)));
  const turnRoundMode = $('turnRoundMode')?.value || 'round';
  const nManual = maybeNum('nManual');

  const fSwMaxK = num('fSwMax', 300);
  const fSwMinK = num('fSwMin', 115);
  const ratio = Math.max(1.01, num('frRatio', 2.3));
  const frHDesignK = num('frH', 230);
  const frHDesign = frHDesignK * 1000;
  const frLDesignK = frHDesignK / ratio;
  const kDesign = ratio * ratio - 1;

  // Vinmax / Voutmin basis. This prevents excessive output voltage at high bus and low output setting.
  const nCalc = vinMax / (2 * (voutMin + vf));
  const npCalc = nCalc * nsTurns;
  let npUse = npCalc;
  if (turnRoundMode === 'ceil') npUse = Math.max(1, Math.ceil(npCalc));
  if (turnRoundMode === 'floor') npUse = Math.max(1, Math.floor(npCalc));
  if (turnRoundMode === 'round') npUse = Math.max(1, Math.round(npCalc));
  let n = turnRoundMode === 'none' ? nCalc : npUse / nsTurns;
  if (turnRoundMode === 'manual' && Number.isFinite(nManual) && nManual > 0) {
    n = nManual;
    npUse = n * nsTurns;
  }

  const ioutNom = pout / voutNom;
  const ioutMax = pmax / voutMin;
  const pin = pout / eff;
  const routNom = (voutNom * voutNom) / pout;
  const routMaxLoad = (voutMax * voutMax) / pout;
  const racSec = 8 * routNom / (Math.PI * Math.PI);
  const racPri = n * n * racSec;

  const gReqLow = 2 * n * (voutMax + vf) / vinMin;
  const gReqNom = 2 * n * (voutNom + vf) / vinNom;
  const gReqHigh = 2 * n * (voutMin + vf) / vinMax;
  const gReqMax = Math.max(gReqLow, gReqNom, gReqHigh);
  const gReqMin = Math.min(gReqLow, gReqNom, gReqHigh);

  const qMin = Math.max(0.01, num('qMin', 0.15));
  const qMax = Math.max(qMin, num('qMax', 1.2));
  const qStep = Math.max(0.001, num('qStep', 0.01));
  const candidates = [];
  for (let q = qMin; q <= qMax + qStep / 2; q += qStep) {
    const qFixed = Number(q.toFixed(5));
    const peak = maxGainInRange(kDesign, qFixed, frHDesign, fSwMinK, frHDesignK);
    const gainAtFmin = llcGain((fSwMinK * 1000) / frHDesign, qFixed, kDesign);
    candidates.push({ q: qFixed, peakGain: peak.max, peakFreqK: peak.fAt, gainAtFmin, ok: peak.max >= gReqMax });
  }
  const okCandidates = candidates.filter(c => c.ok);
  const qRecommended = okCandidates.length ? okCandidates[okCandidates.length - 1].q : qMin;
  const qManual = maybeNum('qManual');
  const qDesign = Number.isFinite(qManual) && qManual > 0 ? qManual : qRecommended;
  const qSelectedInfo = candidates.reduce((best, cur) => Math.abs(cur.q - qDesign) < Math.abs(best.q - qDesign) ? cur : best, candidates[0] || { q: qDesign, peakGain: NaN, peakFreqK: NaN, gainAtFmin: NaN, ok: false });

  const z0Design = qDesign * racPri;
  const lrDesign = z0Design / (2 * Math.PI * frHDesign);
  const crDesign = 1 / (Math.pow(2 * Math.PI * frHDesign, 2) * lrDesign);
  const lmDesign = kDesign * lrDesign;

  const lrActualInput = maybeNum('lrActual');
  const crActualInput = maybeNum('crActual');
  const lmActualInput = maybeNum('lmActual');
  const lrUse = (Number.isFinite(lrActualInput) ? lrActualInput : lrDesign * 1e6) * 1e-6;
  const crUse = (Number.isFinite(crActualInput) ? crActualInput : crDesign * 1e9) * 1e-9;
  const lmUse = (Number.isFinite(lmActualInput) ? lmActualInput : lmDesign * 1e6) * 1e-6;

  const frHActual = 1 / (2 * Math.PI * Math.sqrt(lrUse * crUse));
  const frHActualK = frHActual / 1000;
  const frLActual = 1 / (2 * Math.PI * Math.sqrt((lrUse + lmUse) * crUse));
  const frLActualK = frLActual / 1000;
  const kActual = lmUse / lrUse;
  const ratioActual = frHActual / frLActual;
  const z0Actual = Math.sqrt(lrUse / crUse);
  const qUse = z0Actual / racPri;

  const fChkK = num('fChk', frHActualK);
  const fChk = fChkK * 1000;
  const cSw = num('cSw', 350) * 1e-12;
  const deadTime = num('deadTime', 150) * 1e-9;
  const imPk = vinMax / (8 * lmUse * fChk);
  const imRmsTri = imPk / Math.sqrt(3);
  const vpriFundRms = Math.SQRT2 * vinNom / Math.PI;
  const iLoadPriRms = pin / vpriFundRms;
  const iResRms = Math.sqrt(iLoadPriRms * iLoadPriRms + imRmsTri * imRmsTri);
  const eLm = 0.5 * lmUse * imPk * imPk;
  const eCsw = 0.5 * cSw * vinMax * vinMax;
  const tDeadMin = (cSw * vinMax) / imPk;
  const zvsEnergyMargin = eLm / eCsw;
  const deadTimeMargin = deadTime / tDeadMin;

  const powers = parsePowerSeries(pout, pmax);

  return {
    inputs: { vinMin, vinNom, vinMax, voutMin, voutNom, voutMax, pout, pmax, eff, vf, nsTurns, turnRoundMode, nManual, fSwMaxK, fSwMinK, ratio, frHDesignK, qMin, qMax, qStep, qManual, fChkK, cSwPf: cSw * 1e12, deadTimeNs: deadTime * 1e9 },
    nCalc, npCalc, npUse, n, ioutNom, ioutMax, pin, routNom, routMaxLoad, racSec, racPri,
    frLDesignK, kDesign, gReqLow, gReqNom, gReqHigh, gReqMax, gReqMin,
    candidates, okCandidates, qRecommended, qDesign, qSelectedInfo,
    z0Design, lrDesign, crDesign, lmDesign,
    lrUse, crUse, lmUse, frHActual, frHActualK, frLActual, frLActualK, kActual, ratioActual, z0Actual, qUse,
    powers, imPk, imRmsTri, iLoadPriRms, iResRms, eLm, eCsw, tDeadMin, zvsEnergyMargin, deadTimeMargin
  };
}

function renderSummary(c) {
  const cards = [
    ['使用巻数比 n', `${fmt(c.n, 3)} : 1`],
    ['一次巻数 Np', `${fmt(c.npUse, 2)} turn`],
    ['frH / frL', `${fmt(c.frHActualK, 2)} / ${fmt(c.frLActualK, 2)} kHz`],
    ['K = Lm/Lr', `${fmt(c.kActual, 3)}`],
    ['必要最大ゲイン', `${fmt(c.gReqMax, 3)}`],
    ['推奨Q', `${fmt(c.qRecommended, 3)}`],
    ['使用Q', `${fmt(c.qUse, 3)}`],
    ['Z0', `${fmt(c.z0Actual, 3)} Ω`],
    ['Lr', `${fmt(c.lrUse * 1e6, 3)} µH`],
    ['Cr', `${fmt(c.crUse * 1e9, 3)} nF`],
    ['Lm', `${fmt(c.lmUse * 1e6, 3)} µH`],
    ['ゲイン余裕', `${fmt((c.qSelectedInfo?.peakGain || NaN) / c.gReqMax, 3)} 倍`],
    ['励磁電流 Im_pk', `${fmt(c.imPk, 3)} A`],
    ['一次換算負荷電流', `${fmt(c.iLoadPriRms, 3)} Arms`],
    ['共振電流 目安', `${fmt(c.iResRms, 3)} Arms`],
    ['ZVSエネルギー余裕', `${fmt(c.zvsEnergyMargin, 3)} 倍`]
  ];
  $('summaryCards').innerHTML = cards.map(([label, value]) => `
    <div class="summary-card"><div class="label">${label}</div><div class="value">${value}</div></div>
  `).join('');
}

function qJudgement(c) {
  if (!c.okCandidates.length) return '指定範囲内に必要最大ゲインを満たすQ候補がありません。K比、fmin、巻数比、またはQ探索範囲を見直してください。';
  const qMinOk = c.okCandidates[0].q;
  const qMaxOk = c.okCandidates[c.okCandidates.length - 1].q;
  return `必要最大ゲインを満たすQ候補：${fmt(qMinOk, 3)}〜${fmt(qMaxOk, 3)}。推奨は電流を抑えやすい上限側 ${fmt(c.qRecommended, 3)}。`;
}

function renderSteps(c) {
  const rows = [
    ['STEP1 仕様入力', `Vin=${fmt(c.inputs.vinMin, 1)}/${fmt(c.inputs.vinNom, 1)}/${fmt(c.inputs.vinMax, 1)}V、Vout=${fmt(c.inputs.voutMin, 2)}/${fmt(c.inputs.voutNom, 2)}/${fmt(c.inputs.voutMax, 2)}V、Pout=${fmt(c.inputs.pout, 1)}W、Pmax=${fmt(c.inputs.pmax, 1)}W`],
    ['STEP2 巻数比', `Vinmax・Voutmin基準。n_calc=${fmt(c.nCalc, 4)}、Np_calc=${fmt(c.npCalc, 3)}turn、Np_use=${fmt(c.npUse, 3)}turn、n_use=${fmt(c.n, 4)}`],
    ['STEP3 周波数条件', `fmin=${fmt(c.inputs.fSwMinK, 1)}kHz、fmax=${fmt(c.inputs.fSwMaxK, 1)}kHz、frH=${fmt(c.inputs.frHDesignK, 1)}kHz、frL=${fmt(c.frLDesignK, 1)}kHz、K=${fmt(c.kDesign, 3)}`],
    ['STEP4 必要ゲイン', `Vinmin/Voutmax: ${fmt(c.gReqLow, 3)}、Vinnom/Voutnom: ${fmt(c.gReqNom, 3)}、Vinmax/Voutmin: ${fmt(c.gReqHigh, 3)}、必要最大=${fmt(c.gReqMax, 3)}`],
    ['STEP5 Q選定', `${qJudgement(c)} 使用Q=${fmt(c.qDesign, 3)}、選択Qのピーク=${fmt(c.qSelectedInfo.peakGain, 3)} @ ${fmt(c.qSelectedInfo.peakFreqK, 1)}kHz`],
    ['STEP6 反射負荷', `Rout(nom)=${fmt(c.routNom, 3)}Ω、Rac(sec)=8Rout/π²=${fmt(c.racSec, 3)}Ω、Rac(primary)=n²Rac=${fmt(c.racPri, 3)}Ω`],
    ['STEP7 共振部品 推奨値', `Z0=${fmt(c.z0Design, 3)}Ω、Lr=${fmt(c.lrDesign * 1e6, 3)}µH、Cr=${fmt(c.crDesign * 1e9, 3)}nF、Lm=${fmt(c.lmDesign * 1e6, 3)}µH`],
    ['STEP8 実部品値', `frH=${fmt(c.frHActualK, 3)}kHz、frL=${fmt(c.frLActualK, 3)}kHz、frH/frL=${fmt(c.ratioActual, 3)}、K=${fmt(c.kActual, 3)}、Q=${fmt(c.qUse, 3)}`],
    ['STEP9 電流目安', `fchk=${fmt(c.inputs.fChkK, 1)}kHz、Im_pk=${fmt(c.imPk, 3)}A、Im_rms≈${fmt(c.imRmsTri, 3)}A、Iload_pri≈${fmt(c.iLoadPriRms, 3)}Arms、Ir≈${fmt(c.iResRms, 3)}Arms`],
    ['STEP10 ZVS目安', `ELm=${fmt(c.eLm * 1e6, 3)}µJ、ECsw=${fmt(c.eCsw * 1e6, 3)}µJ、tdead_min≈${fmt(c.tDeadMin * 1e9, 3)}ns、設定/最小=${fmt(c.deadTimeMargin, 3)}倍`]
  ];
  $('stepResults').innerHTML = rows.map(([title, body]) => `
    <div class="result-row"><strong>${title}</strong><code>${body}</code></div>
  `).join('');
}

function chartScales(canvas, xMin, xMax, yMin, yMax) {
  const w = canvas.width;
  const h = canvas.height;
  const pad = { l: 76, r: 28, t: 38, b: 62 };
  return {
    w, h, pad,
    xToPx: (x) => pad.l + (x - xMin) / (xMax - xMin) * (w - pad.l - pad.r),
    yToPx: (y) => h - pad.b - (y - yMin) / (yMax - yMin) * (h - pad.t - pad.b)
  };
}

function drawBase(ctx, scale, xMin, xMax, yMin, yMax, yLabel, xLabel) {
  const { w, h, pad, xToPx, yToPx } = scale;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#475569';
  for (let i = 0; i <= 6; i++) {
    const yVal = yMin + (yMax - yMin) * i / 6;
    const y = yToPx(yVal);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(yVal.toFixed(2), pad.l - 14, y + 4);
  }
  for (let i = 0; i <= 7; i++) {
    const xVal = xMin + (xMax - xMin) * i / 7;
    const x = xToPx(xVal);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(xVal.toFixed(0), x, h - 28);
  }
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.fillStyle = '#111827';
  ctx.font = '15px system-ui';
  ctx.save();
  ctx.translate(22, pad.t + (h - pad.t - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillText(xLabel, pad.l + (w - pad.l - pad.r) / 2, h - 12);
}



function drawPlotFrame(ctx, scale) {
  const { w, h, pad } = scale;
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.restore();
}

function drawVerticalLine(ctx, scale, f, label, color, xMin, xMax) {
  if (f < xMin || f > xMax) return;
  const { pad, h, xToPx } = scale;
  const x = xToPx(f);
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = '13px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 5, pad.t + 16);
}

function drawHorizontalLine(ctx, scale, y, label, color, yMin, yMax) {
  if (y < yMin || y > yMax) return;
  const { pad, w, yToPx } = scale;
  const py = yToPx(y);
  ctx.strokeStyle = color;
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = '13px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(label, pad.l + 8, py - 7);
}

const palette = ['#2563eb', '#0f766e', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#9333ea', '#ea580c', '#0284c7', '#16a34a', '#be123c', '#4f46e5', '#475569', '#b45309'];

function drawGainChart(c) {
  const canvas = $('gainChart');
  const ctx = canvas.getContext('2d');
  const xMin = num('plotFMin', 0);
  const xMax = Math.max(xMin + 10, num('plotFMax', c.inputs.fSwMaxK));
  const yMin = 0;
  const yMax = Math.max(0.5, num('gainYMax', 2.0));
  const scale = chartScales(canvas, xMin, xMax, yMin, yMax);
  drawBase(ctx, scale, xMin, xMax, yMin, yMax, 'Gp', 'fsw [kHz]');

  c.powers.forEach((p, idx) => {
    ctx.strokeStyle = palette[idx % palette.length];
    ctx.lineWidth = Math.abs(p - c.inputs.pout) < 0.001 ? 3 : 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 700; i++) {
      const f = xMin + (xMax - xMin) * i / 700;
      const g = gainFor(c, f, p);
      if (!Number.isFinite(g)) continue;
      const x = scale.xToPx(f);
      const y = scale.yToPx(clamp(g, yMin, yMax));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  drawHorizontalLine(ctx, scale, c.gReqLow, `Vinmin Voutmax ${fmt(c.gReqLow, 2)}`, '#b45309', yMin, yMax);
  drawHorizontalLine(ctx, scale, c.gReqHigh, `Vinmax Voutmin ${fmt(c.gReqHigh, 2)}`, '#64748b', yMin, yMax);
  drawVerticalLine(ctx, scale, c.inputs.fSwMinK, 'fmin', '#dc2626', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frLActualK, 'frL', '#0f766e', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frHActualK, 'frH', '#475569', xMin, xMax);
  drawVerticalLine(ctx, scale, c.inputs.fSwMaxK, 'fmax', '#2563eb', xMin, xMax);

  drawPlotFrame(ctx, scale);

  renderLegend('gainLegend', c.powers.map((p, i) => ({ color: palette[i % palette.length], text: `${fmt(p, 0)}W / Q=${fmt(qForPower(c, p), 3)}` })));
}

function drawVoChart(c) {
  const canvas = $('voChart');
  const ctx = canvas.getContext('2d');
  const xMin = num('plotFMin', 0);
  const xMax = Math.max(xMin + 10, num('plotFMax', c.inputs.fSwMaxK));
  const yMin = Math.max(0, c.inputs.voutMin * 0.65);
  const yMax = Math.max(c.inputs.voutMax * 1.35, c.inputs.voutMax + 5);
  const scale = chartScales(canvas, xMin, xMax, yMin, yMax);
  drawBase(ctx, scale, xMin, xMax, yMin, yMax, 'Vout [V]', 'fsw [kHz]');

  const cases = [
    { vin: c.inputs.vinMax, p: Math.min(...c.powers), label: `Vin=${fmt(c.inputs.vinMax, 0)}V P=${fmt(Math.min(...c.powers), 0)}W`, color: '#2563eb', width: 2 },
    { vin: c.inputs.vinMax, p: c.inputs.pout, label: `Vin=${fmt(c.inputs.vinMax, 0)}V P=${fmt(c.inputs.pout, 0)}W`, color: '#0f766e', width: 2.5 },
    { vin: c.inputs.vinNom, p: c.inputs.pout, label: `Vin=${fmt(c.inputs.vinNom, 0)}V P=${fmt(c.inputs.pout, 0)}W`, color: '#7c3aed', width: 2.5 },
    { vin: c.inputs.vinMin, p: c.inputs.pout, label: `Vin=${fmt(c.inputs.vinMin, 0)}V P=${fmt(c.inputs.pout, 0)}W`, color: '#ea580c', width: 2.5 },
    { vin: c.inputs.vinMin, p: c.inputs.pmax, label: `Vin=${fmt(c.inputs.vinMin, 0)}V P=${fmt(c.inputs.pmax, 0)}W`, color: '#dc2626', width: 3 }
  ];

  cases.forEach(s => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 700; i++) {
      const f = xMin + (xMax - xMin) * i / 700;
      const vo = voutFor(c, s.vin, f, s.p);
      if (!Number.isFinite(vo)) continue;
      const x = scale.xToPx(f);
      const y = scale.yToPx(clamp(vo, yMin, yMax));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  drawHorizontalLine(ctx, scale, c.inputs.voutMin, `Vout min ${fmt(c.inputs.voutMin, 1)}V`, '#64748b', yMin, yMax);
  drawHorizontalLine(ctx, scale, c.inputs.voutNom, `Vout nom ${fmt(c.inputs.voutNom, 1)}V`, '#b45309', yMin, yMax);
  drawHorizontalLine(ctx, scale, c.inputs.voutMax, `Vout max ${fmt(c.inputs.voutMax, 1)}V`, '#dc2626', yMin, yMax);
  drawVerticalLine(ctx, scale, c.inputs.fSwMinK, 'fmin', '#dc2626', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frLActualK, 'frL', '#0f766e', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frHActualK, 'frH', '#475569', xMin, xMax);
  drawVerticalLine(ctx, scale, c.inputs.fSwMaxK, 'fmax', '#2563eb', xMin, xMax);

  drawPlotFrame(ctx, scale);

  renderLegend('voLegend', cases.map(s => ({ color: s.color, text: s.label })));
}

function renderLegend(id, items) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items.map(item => `<span class="line" style="background:${item.color}"></span>${item.text}`).join(' ');
}

function resultText(c) {
  const rows = [
    ['item','value','unit'],
    ['Vin_min', c.inputs.vinMin, 'V'],
    ['Vin_nom', c.inputs.vinNom, 'V'],
    ['Vin_max', c.inputs.vinMax, 'V'],
    ['Vout_min', c.inputs.voutMin, 'V'],
    ['Vout_nom', c.inputs.voutNom, 'V'],
    ['Vout_max', c.inputs.voutMax, 'V'],
    ['Pout', c.inputs.pout, 'W'],
    ['Pmax', c.inputs.pmax, 'W'],
    ['efficiency', c.inputs.eff * 100, '%'],
    ['Vf', c.inputs.vf, 'V'],
    ['Ns', c.inputs.nsTurns, 'turn'],
    ['Np_calc', c.npCalc, 'turn'],
    ['Np_use', c.npUse, 'turn'],
    ['n_use_Np_over_Ns', c.n, '-'],
    ['fmin', c.inputs.fSwMinK, 'kHz'],
    ['fmax', c.inputs.fSwMaxK, 'kHz'],
    ['frH_design', c.inputs.frHDesignK, 'kHz'],
    ['frL_design', c.frLDesignK, 'kHz'],
    ['frH_frL_ratio_design', c.inputs.ratio, '-'],
    ['K_design', c.kDesign, '-'],
    ['Gain_required_lowVin_highVout', c.gReqLow, '-'],
    ['Gain_required_nom', c.gReqNom, '-'],
    ['Gain_required_highVin_lowVout', c.gReqHigh, '-'],
    ['Gain_required_max', c.gReqMax, '-'],
    ['Q_recommended', c.qRecommended, '-'],
    ['Q_design_selected', c.qDesign, '-'],
    ['Rout_nom', c.routNom, 'ohm'],
    ['Rac_secondary', c.racSec, 'ohm'],
    ['Rac_primary', c.racPri, 'ohm'],
    ['Z0_design', c.z0Design, 'ohm'],
    ['Lr_design', c.lrDesign * 1e6, 'uH'],
    ['Cr_design', c.crDesign * 1e9, 'nF'],
    ['Lm_design', c.lmDesign * 1e6, 'uH'],
    ['Z0_actual', c.z0Actual, 'ohm'],
    ['Lr_actual', c.lrUse * 1e6, 'uH'],
    ['Cr_actual', c.crUse * 1e9, 'nF'],
    ['Lm_actual', c.lmUse * 1e6, 'uH'],
    ['frH_actual', c.frHActualK, 'kHz'],
    ['frL_actual', c.frLActualK, 'kHz'],
    ['frH_frL_ratio_actual', c.ratioActual, '-'],
    ['K_actual', c.kActual, '-'],
    ['Q_actual', c.qUse, '-'],
    ['Im_peak', c.imPk, 'A'],
    ['Im_rms_triangular', c.imRmsTri, 'A'],
    ['Iload_primary_rms', c.iLoadPriRms, 'A'],
    ['Iresonant_rms_est', c.iResRms, 'A'],
    ['ELm', c.eLm * 1e6, 'uJ'],
    ['ECsw_required', c.eCsw * 1e6, 'uJ'],
    ['tdead_min', c.tDeadMin * 1e9, 'ns'],
    ['dead_time_margin', c.deadTimeMargin, '-'],
    ['zvs_energy_margin', c.zvsEnergyMargin, '-']
  ];
  return rows.map(r => r.map(csvEscape).join(',')).join('\n');
}

function makeGraphCsv(c) {
  const xMin = num('plotFMin', 0);
  const xMax = Math.max(xMin + 10, num('plotFMax', c.inputs.fSwMaxK));
  const gainHeaders = c.powers.map(p => `Gain_${fmt(p, 0)}W_Q_${fmt(qForPower(c, p), 4)}`);
  const voCases = [
    { vin: c.inputs.vinMax, p: Math.min(...c.powers), name: `Vo_Vin${fmt(c.inputs.vinMax,0)}_P${fmt(Math.min(...c.powers),0)}` },
    { vin: c.inputs.vinMax, p: c.inputs.pout, name: `Vo_Vin${fmt(c.inputs.vinMax,0)}_P${fmt(c.inputs.pout,0)}` },
    { vin: c.inputs.vinNom, p: c.inputs.pout, name: `Vo_Vin${fmt(c.inputs.vinNom,0)}_P${fmt(c.inputs.pout,0)}` },
    { vin: c.inputs.vinMin, p: c.inputs.pout, name: `Vo_Vin${fmt(c.inputs.vinMin,0)}_P${fmt(c.inputs.pout,0)}` },
    { vin: c.inputs.vinMin, p: c.inputs.pmax, name: `Vo_Vin${fmt(c.inputs.vinMin,0)}_P${fmt(c.inputs.pmax,0)}` }
  ];
  const rows = [[
    'frequency_kHz', 'f_over_frH', ...gainHeaders, ...voCases.map(s => s.name), 'Gain_req_lowVin_highVout', 'Gain_req_highVin_lowVout'
  ].map(csvEscape).join(',')];
  for (let i = 0; i <= 700; i++) {
    const f = xMin + (xMax - xMin) * i / 700;
    const gains = c.powers.map(p => gainFor(c, f, p));
    const vos = voCases.map(s => voutFor(c, s.vin, f, s.p));
    rows.push([
      f.toFixed(6),
      (f / c.frHActualK).toFixed(8),
      ...gains.map(v => Number.isFinite(v) ? v.toFixed(8) : ''),
      ...vos.map(v => Number.isFinite(v) ? v.toFixed(8) : ''),
      c.gReqLow.toFixed(8),
      c.gReqHigh.toFixed(8)
    ].map(csvEscape).join(','));
  }
  return '\ufeff' + rows.join('\n');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadBlob(filename, content, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsv() {
  const c = calculate();
  downloadBlob(`llc_design_${new Date().toISOString().slice(0,10)}.csv`, '\ufeff' + resultText(c));
}

function downloadGraphCsv() {
  const c = calculate();
  downloadBlob(`llc_graph_${new Date().toISOString().slice(0,10)}.csv`, makeGraphCsv(c));
}

function downloadChartPng() {
  update();
  const gain = $('gainChart');
  const vo = $('voChart');
  const merged = document.createElement('canvas');
  merged.width = Math.max(gain.width, vo.width);
  merged.height = gain.height + vo.height + 40;
  const ctx = merged.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, merged.width, merged.height);
  ctx.drawImage(gain, 0, 0);
  ctx.drawImage(vo, 0, gain.height + 40);
  const url = merged.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `llc_charts_${new Date().toISOString().slice(0,10)}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function copyResult() {
  const c = calculate();
  await navigator.clipboard.writeText(resultText(c));
  $('copyBtn').textContent = 'コピー済み';
  setTimeout(() => $('copyBtn').textContent = '結果をコピー', 1200);
}

function update() {
  const c = calculate();
  renderSummary(c);
  renderSteps(c);
  drawGainChart(c);
  drawVoChart(c);
}

inputIds.forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', update);
});
$('recalcBtn')?.addEventListener('click', update);
$('csvBtn')?.addEventListener('click', downloadCsv);
$('graphCsvBtn')?.addEventListener('click', downloadGraphCsv);
$('pngBtn')?.addEventListener('click', downloadChartPng);
$('copyBtn')?.addEventListener('click', copyResult);
update();
