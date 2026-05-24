function getNumber(id) {
  const el = document.getElementById(id);
  return el ? Number(el.value) || 0 : 0;
}

function fmt(v, d = 3) {
  return Number.isFinite(v) ? Number(v).toFixed(d) : "-";
}

let latestCsvRows = [];

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function llcGain(fn, q, m) {
  if (fn <= 0 || q <= 0 || m <= 1) return 0;

  const x = fn;
  const termReal = 1 + (1 / m) * (1 - 1 / (x * x));
  const termImag = q * (x - 1 / x);

  return Math.abs(1 / Math.sqrt(termReal * termReal + termImag * termImag));
}

function calcLLC(e) {
  if (e) e.preventDefault();

  const bridgeType = document.getElementById("bridgeType").value;
  const rectifierType = document.getElementById("rectifierType").value;

  const VbusMin = getNumber("vbusMin");
  const VbusNom = getNumber("vbusNom");
  const VbusMax = getNumber("vbusMax");
  const Vout = getNumber("vout");
  const Pout = getNumber("pout");
  const eff = getNumber("efficiency") / 100;
  const frKhz = getNumber("frKhz");
  const Zr = getNumber("zr");
  const m = getNumber("mRatio");
  const Vf = getNumber("diodeVf");
  const zvsFreqKhz = getNumber("zvsFreqKhz");
  const CswPf = getNumber("cswPf");
  const deadtimeNs = getNumber("deadtimeNs");

  const bridgeDiv = bridgeType === "full" ? 1 : 2;

  let rectDrop = 0;
  if (rectifierType === "center") rectDrop = Vf;
  if (rectifierType === "bridge") rectDrop = 2 * Vf;

  const VoutEq = Vout + rectDrop;

  const Pin = Pout / eff;
  const Iout = Pout / Vout;

  const n = VbusMax / (bridgeDiv * VoutEq);

  const gainMax = bridgeDiv * n * VoutEq / VbusMax;
  const gainNom = bridgeDiv * n * VoutEq / VbusNom;
  const gainMin = bridgeDiv * n * VoutEq / VbusMin;

  const fr = frKhz * 1000;
  const w0 = 2 * Math.PI * fr;

  const Lr = Zr / w0;
  const Cr = 1 / (w0 * Zr);
  const Lm = Lr * m;

  const Rac = (8 / (Math.PI * Math.PI)) * n * n * VoutEq * VoutEq / Pout;
  const Q = Zr / Rac;

  const wzvs = 2 * Math.PI * zvsFreqKhz * 1000;
  const Imag = VbusNom / (4 * wzvs * Lm);
  const Esw = 0.5 * CswPf * 1e-12 * VbusNom * VbusNom;
  const Emag = 0.5 * Lm * Imag * Imag;
  const zvsMargin = Esw > 0 ? Emag / Esw : 0;
  const requiredDeadtime = Imag > 0 ? CswPf * 1e-12 * VbusNom / Imag : 0;

  setText("summaryN", `${fmt(n, 3)} : 1`);
  setText("summaryLr", `${fmt(Lr * 1e6, 2)} µH`);
  setText("summaryCr", `${fmt(Cr * 1e9, 2)} nF`);
  setText("summaryLm", `${fmt(Lm * 1e6, 2)} µH`);

  setHtml("step1Result", `
    <div class="results-list">
      <div class="result-row"><strong>入力電力 Pin</strong><code>${fmt(Pin, 2)} W</code></div>
      <div class="result-row"><strong>出力電流 Iout</strong><code>${fmt(Iout, 2)} A</code></div>
    </div>
  `);

  setHtml("step2Result", `
    <div class="results-list">
      <div class="result-row"><strong>等価負荷 Rac</strong><code>${fmt(Rac, 3)} Ω</code></div>
      <div class="result-row"><strong>Q</strong><code>${fmt(Q, 3)}</code></div>
    </div>
  `);

  setHtml("step3Result", `
    <div class="results-list">
      <div class="result-row"><strong>理想巻数比 n = Np/Ns</strong><code>${fmt(n, 3)} : 1</code></div>
      <div class="result-row"><strong>基準条件</strong><code>Vbus,max 基準</code></div>
      <div class="result-row"><strong>Vbus,max時 必要ゲイン</strong><code>${fmt(gainMax, 3)}</code></div>
      <div class="result-row"><strong>Vbus,nom時 必要ゲイン</strong><code>${fmt(gainNom, 3)}</code></div>
      <div class="result-row"><strong>Vbus,min時 必要ゲイン</strong><code>${fmt(gainMin, 3)}</code></div>
    </div>
  `);

  setHtml("step4Result", `
    <div class="results-list">
      <div class="result-row"><strong>Lr</strong><code>${fmt(Lr * 1e6, 2)} µH</code></div>
      <div class="result-row"><strong>Cr</strong><code>${fmt(Cr * 1e9, 2)} nF</code></div>
    </div>
  `);

  setHtml("step5Result", `
    <div class="results-list">
      <div class="result-row"><strong>Lm</strong><code>${fmt(Lm * 1e6, 2)} µH</code></div>
      <div class="result-row"><strong>Lm/Lr</strong><code>${fmt(m, 2)}</code></div>
    </div>
  `);

  setHtml("step6Result", `
    <div class="results-list">
      <div class="result-row"><strong>励磁電流</strong><code>${fmt(Imag, 3)} A</code></div>
      <div class="result-row"><strong>Csw充放電エネルギー</strong><code>${fmt(Esw * 1e6, 3)} µJ</code></div>
      <div class="result-row"><strong>励磁エネルギー</strong><code>${fmt(Emag * 1e6, 3)} µJ</code></div>
      <div class="result-row"><strong>ZVSマージン</strong><code>${fmt(zvsMargin, 2)} x</code></div>
      <div class="result-row"><strong>必要デッドタイム</strong><code>${fmt(requiredDeadtime * 1e9, 1)} ns</code></div>
      <div class="result-row"><strong>設定デッドタイム</strong><code>${fmt(deadtimeNs, 1)} ns</code></div>
    </div>
  `);

  latestCsvRows = [
    ["項目", "値"],
    ["n", `${fmt(n, 3)} : 1`],
    ["Rac", `${fmt(Rac, 3)} Ω`],
    ["Q", fmt(Q, 3)],
    ["Lr", `${fmt(Lr * 1e6, 2)} µH`],
    ["Cr", `${fmt(Cr * 1e9, 2)} nF`],
    ["Lm", `${fmt(Lm * 1e6, 2)} µH`],
    ["ZVSマージン", `${fmt(zvsMargin, 2)} x`]
  ];

  drawGainChart(Q, m, gainMax, gainNom, gainMin);
}

function drawGainChart(Q, m, gainMax, gainNom, gainMin) {
  const canvas = document.getElementById("gainChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const left = 58;
  const right = 20;
  const top = 24;
  const bottom = 48;

  const xMin = 0.5;
  const xMax = 2.0;
  const yMin = 0;
  const yMax = 2.0;

  const px = x => left + (x - xMin) / (xMax - xMin) * (W - left - right);
  const py = y => H - bottom - (y - yMin) / (yMax - yMin) * (H - top - bottom);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#d9e0ea";
  ctx.lineWidth = 1;
  ctx.font = "12px system-ui";
  ctx.fillStyle = "#667085";

  for (let x = 0.5; x <= 2.0; x += 0.25) {
    ctx.beginPath();
    ctx.moveTo(px(x), top);
    ctx.lineTo(px(x), H - bottom);
    ctx.stroke();
    ctx.fillText(fmt(x, 2), px(x) - 10, H - 25);
  }

  for (let y = 0; y <= 2.0; y += 0.25) {
    ctx.beginPath();
    ctx.moveTo(left, py(y));
    ctx.lineTo(W - right, py(y));
    ctx.stroke();
    ctx.fillText(fmt(y, 2), 18, py(y) + 4);
  }

  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, H - bottom);
  ctx.lineTo(W - right, H - bottom);
  ctx.stroke();

  const curves = [
    { q: Q * 0.6, color: "#94a3b8" },
    { q: Q, color: "#2563eb" },
    { q: Q * 1.5, color: "#0f766e" }
  ];

  for (const c of curves) {
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= 240; i++) {
      const x = xMin + (xMax - xMin) * i / 240;
      const y = Math.min(llcGain(x, Math.max(c.q, 0.02), m), yMax);
      if (i === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    }

    ctx.stroke();
  }

  ctx.strokeStyle = "#b45309";
  ctx.fillStyle = "#b45309";
  ctx.lineWidth = 1.4;

  [
    ["max", gainMax],
    ["nom", gainNom],
    ["min", gainMin]
  ].forEach(([name, g]) => {
    if (!Number.isFinite(g)) return;
    const y = Math.min(g, yMax);

    ctx.beginPath();
    ctx.moveTo(left, py(y));
    ctx.lineTo(W - right, py(y));
    ctx.stroke();
    ctx.fillText(`G ${name}=${fmt(g, 2)}`, left + 8, py(y) - 5);
  });

  ctx.fillStyle = "#1f2937";
  ctx.fillText("fn = fs / fr", W / 2 - 34, H - 8);
  ctx.save();
  ctx.translate(16, H / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Gain", 0, 0);
  ctx.restore();
}

function exportCSV() {
  if (!latestCsvRows.length) calcLLC();

  const csv = latestCsvRows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "llc_design_result.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportPNG() {
  const canvas = document.getElementById("gainChart");
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "llc_gain_chart.png";
  a.click();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("llcForm")?.addEventListener("submit", calcLLC);
  document.getElementById("csvBtn")?.addEventListener("click", exportCSV);
  document.getElementById("pngBtn")?.addEventListener("click", exportPNG);
  document.getElementById("resetBtn")?.addEventListener("click", () => location.reload());

  calcLLC();
});
