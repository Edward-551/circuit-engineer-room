'use strict';

const $ = (id) => document.getElementById(id);
const ids = [
  'vout','pout','eff','rectType','vbusMin','vbusNom','vbusMax','vf','mAtFr','nsTurns','turnRoundMode','nManual',
  'fr','k','qDesign','lrActual','crActual','lmActual','fMin','fMax','qList','qStart','qEnd','qStep','gMin','gMax','fzvs','cossTotal','deadTime'
];

function num(id, fallback = 0) {
  const el = $(id);
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}

function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(1);
  if (abs >= 100) return v.toFixed(2);
  if (abs >= 10) return v.toFixed(3);
  return v.toFixed(digits);
}

function llcGain(x, q, k) {
  // FHA normalized LLC gain approximation.
  // x = f / fr, k = Lm / Lr, q = sqrt(Lr/Cr) / Racp
  if (x <= 0 || q <= 0 || k <= 0) return NaN;
  const a = 1 - 1 / (x * x);
  const b = x / k - 1 / (k * x);
  const den = Math.sqrt(Math.pow(1 + a / k, 2) + Math.pow(q * (x - 1 / x), 2));
  const m = 1 / den;
  if (!Number.isFinite(m)) return NaN;
  return m;
}


function parseQSeries(qActual) {
  const listText = ($('qList')?.value || '').trim();
  let values = [];
  if (listText) {
    values = listText
      .split(/[,、\s]+/)
      .map(v => parseFloat(v))
      .filter(v => Number.isFinite(v) && v > 0);
  } else {
    const start = Math.max(0.01, num('qStart', 0.2));
    const end = Math.max(start, num('qEnd', 1.0));
    const step = Math.max(0.01, num('qStep', 0.2));
    for (let q = start; q <= end + step / 2; q += step) values.push(Number(q.toFixed(4)));
  }

  // 実Qは必ず太線で表示。重複が近いQは省く。
  values = values.filter((v, i, arr) => arr.findIndex(x => Math.abs(x - v) < 0.0005) === i);
  values = values.filter(v => Math.abs(v - qActual) > 0.0005);
  return values.slice(0, 12);
}

function qSeriesText(c) {
  const values = parseQSeries(c.qActual);
  const label = values.length ? values.map(v => fmt(v, 3)).join(' / ') : 'なし';
  return `実Q ${fmt(c.qActual, 3)}、比較Q ${label}`;
}

function calculate() {
  const vout = num('vout', 24);
  const pout = num('pout', 480);
  const eff = num('eff', 94) / 100;
  const vbusMin = num('vbusMin', 360);
  const vbusNom = num('vbusNom', 390);
  const vbusMax = num('vbusMax', 420);
  const vf = num('vf', 0.35);
  const mAtFr = num('mAtFr', 1);
  const nsTurns = Math.max(1, Math.round(num('nsTurns', 4)));
  const turnRoundMode = $('turnRoundMode').value;
  const nManual = num('nManual', NaN);
  const frK = num('fr', 135);
  const fr = frK * 1000;
  const k = num('k', 5.5);
  const qDesign = num('qDesign', 0.55);

  const iout = pout / vout;
  const pin = pout / eff;
  const rout = (vout * vout) / pout;
  const nCalc = vbusNom / (2 * mAtFr * (vout + vf));
  const npCalc = nCalc * nsTurns;
  let npUse = npCalc;
  if (turnRoundMode === 'ceil') npUse = Math.ceil(npCalc);
  if (turnRoundMode === 'floor') npUse = Math.max(1, Math.floor(npCalc));
  if (turnRoundMode === 'round') npUse = Math.max(1, Math.round(npCalc));
  let n = npUse / nsTurns;
  if (turnRoundMode === 'none') n = nCalc;
  if (turnRoundMode === 'manual' && Number.isFinite(nManual) && nManual > 0) {
    n = nManual;
    npUse = n * nsTurns;
  }
  const racSec = 8 * rout / (Math.PI * Math.PI);
  const racPri = n * n * racSec;
  const zr = qDesign * racPri;
  const lr = zr / (2 * Math.PI * fr);
  const cr = 1 / (Math.pow(2 * Math.PI * fr, 2) * lr);
  const lm = k * lr;

  const lrUse = num('lrActual', lr * 1e6) * 1e-6;
  const crUse = num('crActual', cr * 1e9) * 1e-9;
  const lmUse = num('lmActual', lm * 1e6) * 1e-6;
  const frActual = 1 / (2 * Math.PI * Math.sqrt(lrUse * crUse));
  const kActual = lmUse / lrUse;
  const qActual = Math.sqrt(lrUse / crUse) / racPri;

  const mReqMinBus = vbusNom / vbusMin;
  const mReqMaxBus = vbusNom / vbusMax;

  const fzvsK = num('fzvs', 250);
  const fzvs = fzvsK * 1000;
  const cossTotalPf = num('cossTotal', 400);
  const cossTotal = cossTotalPf * 1e-12;
  const deadTimeNs = num('deadTime', 120);
  const deadTimeSet = deadTimeNs * 1e-9;
  const imPkZvs = vbusMax / (8 * lmUse * fzvs);
  const eMagZvs = 0.5 * lmUse * imPkZvs * imPkZvs;
  const eCswZvs = 0.5 * cossTotal * vbusMax * vbusMax;
  const deadTimeMin = (cossTotal * vbusMax) / imPkZvs;
  const deadTimeMargin = deadTimeSet / deadTimeMin;
  const zvsEnergyMargin = eMagZvs / eCswZvs;
  const qSwRequired = cossTotal * vbusMax;

  return {
    inputs: { vout, pout, eff, vbusMin, vbusNom, vbusMax, vf, mAtFr, nsTurns, turnRoundMode, nManual, frK, k, qDesign, fzvsK, cossTotalPf, deadTimeNs },
    iout, pin, rout, nCalc, npCalc, npUse, n, racSec, racPri, zr, lr, cr, lm,
    lrUse, crUse, lmUse, frActual, kActual, qActual, mReqMinBus, mReqMaxBus,
    imPkZvs, eMagZvs, eCswZvs, deadTimeMin, deadTimeMargin, zvsEnergyMargin, qSwRequired
  };
}

function renderSummary(c) {
  const cards = [
    ['使用巻数比 n', `${fmt(c.n, 3)} : 1`],
    ['一次巻数 Np', `${fmt(c.npUse, 2)} turn`],
    ['Lr', `${fmt(c.lrUse * 1e6, 3)} µH`],
    ['Cr', `${fmt(c.crUse * 1e9, 3)} nF`],
    ['Lm', `${fmt(c.lmUse * 1e6, 3)} µH`],
    ['実共振周波数', `${fmt(c.frActual / 1000, 3)} kHz`],
    ['実Q', `${fmt(c.qActual, 3)}`],
    ['ZVS確認周波数', `${fmt(c.inputs.fzvsK, 3)} kHz`],
    ['励磁電流 Im_pk', `${fmt(c.imPkZvs, 3)} A`],
    ['Lmエネルギー', `${fmt(c.eMagZvs * 1e6, 3)} µJ`],
    ['Csw必要エネルギー', `${fmt(c.eCswZvs * 1e6, 3)} µJ`],
    ['SWノード電荷量', `${fmt(c.qSwRequired * 1e9, 3)} nC`],
    ['最小dead time', `${fmt(c.deadTimeMin * 1e9, 3)} ns`],
    ['設定/最小dead time', `${fmt(c.deadTimeMargin, 3)} 倍`],
    ['エネルギー余裕', `${fmt(c.zvsEnergyMargin, 3)} 倍`]
  ];
  $('summaryCards').innerHTML = cards.map(([label, value]) => `
    <div class="summary-card"><div class="label">${label}</div><div class="value">${value}</div></div>
  `).join('');
}

function renderSteps(c) {
  const rows = [
    ['STEP1 出力仕様', `Iout = ${fmt(c.iout, 3)} A / Rout = ${fmt(c.rout, 3)} &#937; / Pin目安 = ${fmt(c.pin, 2)} W`],
    ['STEP2 入力バス', `Vbus = ${fmt(c.inputs.vbusMin, 1)}〜${fmt(c.inputs.vbusMax, 1)} V、nom = ${fmt(c.inputs.vbusNom, 1)} V`],
    ['STEP3 巻数比', `n_calc = ${fmt(c.nCalc, 4)}、Np_calc = ${fmt(c.npCalc, 3)} turn、Np_use = ${fmt(c.npUse, 3)} turn、n_use = ${fmt(c.n, 4)}`],
    ['STEP4 共振条件', `fr = ${fmt(c.inputs.frK, 2)} kHz、k = Lm/Lr = ${fmt(c.inputs.k, 3)}、Qe = ${fmt(c.inputs.qDesign, 3)}`],
    ['STEP5 反射負荷', `Rac(sec) = ${fmt(c.racSec, 3)} &#937;、Rac(primary) = n² × Rac = ${fmt(c.racPri, 3)} &#937;`],
    ['STEP6 Lr / Cr', `Lr = ${fmt(c.lr * 1e6, 3)} µH、Cr = ${fmt(c.cr * 1e9, 3)} nF`],
    ['STEP7 Lm', `Lm = k × Lr = ${fmt(c.lm * 1e6, 3)} µH`],
    ['STEP8 実部品再計算', `fr(actual) = ${fmt(c.frActual / 1000, 3)} kHz、Q(actual) = ${fmt(c.qActual, 3)}、k(actual) = ${fmt(c.kActual, 3)}`],
    ['STEP9 ゲイングラフ', `${qSeriesText(c)} をプロット`],
    ['STEP10 必要ゲイン', `低入力時 Mreq ≈ ${fmt(c.mReqMinBus, 3)}、高入力時 Mreq ≈ ${fmt(c.mReqMaxBus, 3)}`],
    ['STEP11 励磁電流/ZVSエネルギー', `fchk = ${fmt(c.inputs.fzvsK, 2)} kHz、Im_pk ≈ ${fmt(c.imPkZvs, 3)} A、ELm = ${fmt(c.eMagZvs * 1e6, 3)} µJ、ECsw = ${fmt(c.eCswZvs * 1e6, 3)} µJ、tdead_min ≈ ${fmt(c.deadTimeMin * 1e9, 3)} ns、設定/最小 = ${fmt(c.deadTimeMargin, 3)}`],
    ['STEP12 保存', `CSV出力で設計条件と導出定数を保存できます。`]
  ];
  $('stepResults').innerHTML = rows.map(([title, body]) => `
    <div class="result-row"><strong>${title}</strong><code>${body}</code></div>
  `).join('');
}

function drawChart(c) {
  const canvas = $('gainChart');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const pad = { l: 76, r: 26, t: 38, b: 62 };
  const fMin = Math.max(1, num('fMin', 60));
  const fMax = Math.max(fMin + 1, num('fMax', 300));
  const sweepQs = parseQSeries(c.qActual);
  const sweepColors = ['#0f766e', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#9333ea', '#ea580c', '#0284c7', '#16a34a', '#be123c', '#4f46e5', '#a16207'];
  const series = [
    { q: c.qActual, color: '#2563eb', width: 3, label: '実Q' },
    ...sweepQs.map((q, i) => ({ q, color: sweepColors[i % sweepColors.length], width: 1.8, label: `Q=${fmt(q, 3)}` }))
  ];
  if ($('qSeriesLabel')) $('qSeriesLabel').textContent = `（比較Q: ${sweepQs.map(q => fmt(q, 3)).join(', ') || 'なし'}）`;

  const all = [];
  for (const s of series) {
    for (let i = 0; i <= 260; i++) {
      const f = fMin + (fMax - fMin) * i / 260;
      const x = (f * 1000) / c.frActual;
      const m = llcGain(x, s.q, c.kActual);
      if (Number.isFinite(m) && m < 4) all.push(m);
    }
  }
  
  const autoYMax = Math.max(1.6, Math.min(3.5, Math.ceil(Math.max(...all, c.mReqMinBus) * 10) / 10 + 0.2));
  let yMin = num('gMin', 0);
  let yMax = num('gMax', autoYMax);
  if (!Number.isFinite(yMin)) yMin = 0;
  if (!Number.isFinite(yMax)) yMax = autoYMax;
  if (yMax <= yMin) yMax = yMin + 0.5;
  const xToPx = (f) => pad.l + (f - fMin) / (fMax - fMin) * (w - pad.l - pad.r);
  const yToPx = (m) => h - pad.b - ((m - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);

  ctx.strokeStyle = '#d9e0ea';
  ctx.lineWidth = 1;
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#475569';
  for (let i = 0; i <= 6; i++) {
    const yVal = yMin + (yMax - yMin) * i / 6;
    const y = yToPx(yVal);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(yVal.toFixed(2), pad.l - 14, y + 4);
    ctx.textAlign = 'left';
  }
  for (let i = 0; i <= 6; i++) {
    const f = fMin + (fMax - fMin) * i / 6;
    const x = xToPx(f);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(f.toFixed(0), x, h - 28);
    ctx.textAlign = 'left';
  }

  // グラフ外枠：左・下だけでなく、上・右も濃く太めに描画
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.stroke();

  ctx.fillStyle = '#111827';
  ctx.font = '15px system-ui';
  ctx.save();
  ctx.translate(20, pad.t + (h - pad.t - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Gain M', 0, 0);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillText('Frequency [kHz]', pad.l + (w - pad.l - pad.r) / 2, h - 12);
  ctx.textAlign = 'left';

  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 520; i++) {
      const f = fMin + (fMax - fMin) * i / 520;
      const xNorm = (f * 1000) / c.frActual;
      const m = llcGain(xNorm, s.q, c.kActual);
      if (!Number.isFinite(m)) continue;
      const x = xToPx(f);
      const y = yToPx(Math.min(Math.max(m, yMin), yMax));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Required gain guide line at minimum bus.
  ctx.strokeStyle = '#b45309';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  const yReq = yToPx(c.mReqMinBus);
  ctx.beginPath(); ctx.moveTo(pad.l, yReq); ctx.lineTo(w - pad.r, yReq); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#b45309';
  ctx.fillText(`Mreq low line = ${fmt(c.mReqMinBus, 2)}`, pad.l + 10, yReq - 8);

  // fr actual vertical line.
  const frK = c.frActual / 1000;
  if (frK >= fMin && frK <= fMax) {
    const xFr = xToPx(frK);
    ctx.strokeStyle = '#64748b';
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(xFr, pad.t); ctx.lineTo(xFr, h - pad.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#64748b';
    ctx.fillText('fr', xFr + 6, pad.t + 16);
  }
}

function resultText(c) {
  return [
    'LLC設計結果',
    `Vout,${c.inputs.vout},V`,
    `Pout,${c.inputs.pout},W`,
    `Iout,${fmt(c.iout, 6)},A`,
    `Rout,${fmt(c.rout, 6)},ohm`,
    `Vbus_min,${c.inputs.vbusMin},V`,
    `Vbus_nom,${c.inputs.vbusNom},V`,
    `Vbus_max,${c.inputs.vbusMax},V`,
    `turns_ratio_calc_Np_Ns,${fmt(c.nCalc, 6)},-`,
    `secondary_turns_Ns,${fmt(c.inputs.nsTurns, 6)},turn`,
    `primary_turns_calc_Np,${fmt(c.npCalc, 6)},turn`,
    `turn_round_mode,${c.inputs.turnRoundMode},-`,
    `primary_turns_use_Np,${fmt(c.npUse, 6)},turn`,
    `turns_ratio_use_Np_Ns,${fmt(c.n, 6)},-`,
    `Rac_secondary,${fmt(c.racSec, 6)},ohm`,
    `Rac_primary,${fmt(c.racPri, 6)},ohm`,
    `fr_design,${c.inputs.frK},kHz`,
    `Q_design,${c.inputs.qDesign},-`,
    `k_design,${c.inputs.k},-`,
    `Lr_design,${fmt(c.lr * 1e6, 6)},uH`,
    `Cr_design,${fmt(c.cr * 1e9, 6)},nF`,
    `Lm_design,${fmt(c.lm * 1e6, 6)},uH`,
    `Lr_actual,${fmt(c.lrUse * 1e6, 6)},uH`,
    `Cr_actual,${fmt(c.crUse * 1e9, 6)},nF`,
    `Lm_actual,${fmt(c.lmUse * 1e6, 6)},uH`,
    `fr_actual,${fmt(c.frActual / 1000, 6)},kHz`,
    `Q_actual,${fmt(c.qActual, 6)},-`,
    `k_actual,${fmt(c.kActual, 6)},-`,
    `Q_plot_list,${($('qList')?.value || '').replace(/,/g, ' / ')},-`,
    `Q_start,${num('qStart', 0.2)},-`,
    `Q_end,${num('qEnd', 1.0)},-`,
    `Q_step,${num('qStep', 0.1)},-`,
    `Gain_axis_min,${num('gMin', 0)},-`,
    `Gain_axis_max,${num('gMax', 2.0)},-`,
    `ZVS_check_frequency,${c.inputs.fzvsK},kHz`,
    `ZVS_switch_node_capacitance_Csw,${c.inputs.cossTotalPf},pF`,
    `ZVS_dead_time_setting,${c.inputs.deadTimeNs},ns`,
    `ZVS_magnetizing_current_peak,${fmt(c.imPkZvs, 6)},A`,
    `ZVS_switch_node_charge,${fmt(c.qSwRequired * 1e9, 6)},nC`,
    `ZVS_energy_Lm,${fmt(c.eMagZvs * 1e6, 6)},uJ`,
    `ZVS_energy_Csw_required,${fmt(c.eCswZvs * 1e6, 6)},uJ`,
    `ZVS_min_dead_time,${fmt(c.deadTimeMin * 1e9, 6)},ns`,
    `ZVS_dead_time_setting_over_min,${fmt(c.deadTimeMargin, 6)},-`,
    `ZVS_energy_margin_ELm_over_ECsw,${fmt(c.zvsEnergyMargin, 6)},-`,
    `Q_plot_start,${num('qStart', 0.2)},-`,
    `Q_plot_end,${num('qEnd', 1.0)},-`,
    `Q_plot_step,${num('qStep', 0.2)},-`,
    `Mreq_low_bus,${fmt(c.mReqMinBus, 6)},-`,
    `Mreq_high_bus,${fmt(c.mReqMaxBus, 6)},-`
  ].join('\n');
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

function makeGraphCsv(c) {
  const fMin = Math.max(1, num('fMin', 60));
  const fMax = Math.max(fMin + 1, num('fMax', 300));
  const sweepQs = parseQSeries(c.qActual);
  const qs = [c.qActual, ...sweepQs];
  const headers = ['frequency_kHz', 'f_over_fr', ...qs.map((q, i) => i === 0 ? `Gain_Q_actual_${fmt(q, 4)}` : `Gain_Q_${fmt(q, 4)}`), 'Mreq_low_bus'];
  const rows = [headers.map(csvEscape).join(',')];
  for (let i = 0; i <= 520; i++) {
    const f = fMin + (fMax - fMin) * i / 520;
    const x = (f * 1000) / c.frActual;
    const gains = qs.map(q => llcGain(x, q, c.kActual));
    rows.push([
      f.toFixed(6),
      x.toFixed(8),
      ...gains.map(g => Number.isFinite(g) ? g.toFixed(8) : ''),
      c.mReqMinBus.toFixed(8)
    ].map(csvEscape).join(','));
  }
  return '\ufeff' + rows.join('\n');
}

function downloadGraphCsv() {
  const c = calculate();
  const csv = makeGraphCsv(c);
  downloadBlob(`llc_gain_graph_${new Date().toISOString().slice(0,10)}.csv`, csv);
}

function downloadCsv() {
  const c = calculate();
  const csv = '\ufeff' + resultText(c);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `llc_design_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function downloadChartPng() {
  update();
  const canvas = $('gainChart');
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `llc_gain_chart_${new Date().toISOString().slice(0,10)}.png`;
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
  drawChart(c);
}

ids.forEach(id => $(id).addEventListener('input', update));
$('recalcBtn').addEventListener('click', update);
$('csvBtn').addEventListener('click', downloadCsv);
$('graphCsvBtn').addEventListener('click', downloadGraphCsv);
$('pngBtn').addEventListener('click', downloadChartPng);
$('copyBtn').addEventListener('click', copyResult);
update();
