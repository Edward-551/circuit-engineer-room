function getNumber(id) {
  const el = document.getElementById(id);
  return el ? parseFloat(el.value) || 0 : 0;
}

function formatNumber(value, digits = 3) {
  if (!isFinite(value)) return "-";
  return Number(value).toFixed(digits);
}

let latestCsvRows = [];

function calcLLC(e) {
  if (e) e.preventDefault();

  const bridgeType = document.getElementById("bridgeType").value;
  const rectifierType = document.getElementById("rectifierType").value;

  const VbusMin = getNumber("vbusMin");
  const VbusNom = getNumber("vbusNom");
  const VbusMax = getNumber("vbusMax");
  const Vout = getNumber("vout");
  const Pout = getNumber("pout");
  const efficiency = getNumber("efficiency") / 100;
  const frKhz = getNumber("frKhz");
  const zr = getNumber("zr");
  const mRatio = getNumber("mRatio");
  const diodeVf = getNumber("diodeVf");
  const zvsFreqKhz = getNumber("zvsFreqKhz");
  const cswPf = getNumber("cswPf");
  const deadtimeNs = getNumber("deadtimeNs");

  const fr = frKhz * 1000;
  const w0 = 2 * Math.PI * fr;

  let rectDrop = 0;
  if (rectifierType === "center") rectDrop = diodeVf;
  if (rectifierType === "bridge") rectDrop = diodeVf * 2;
  if (rectifierType === "sync") rectDrop = 0;

  const VoutEq = Vout + rectDrop;
  const bridgeDiv = bridgeType === "full" ? 1 : 2;

  const Pin = Pout / efficiency;
  const Iout = Pout / Vout;

  const nIdeal = VbusMax / (bridgeDiv * VoutEq);

  const gainAtMax = bridgeDiv * nIdeal * VoutEq / VbusMax;
  const gainAtNom = bridgeDiv * nIdeal * VoutEq / VbusNom;
  const gainAtMin = bridgeDiv * nIdeal * VoutEq / VbusMin;

  const Rac = (8 / (Math.PI * Math.PI)) * Math.pow(nIdeal, 2) * Math.pow(VoutEq, 2) / Pout;

  const Cr = 1 / (w0 * zr);
  const Lr = zr / w0;
  const Lm = Lr * mRatio;

  const zvsFreq = zvsFreqKhz * 1000;
  const wZvs = 2 * Math.PI * zvsFreq;
  const Imag = VbusNom / (4 * wZvs * Lm);
  const Esw = 0.5 * (cswPf * 1e-12) * Math.pow(VbusNom, 2);
  const LmEnergy = 0.5 * Lm * Math.pow(Imag, 2);
  const zvsMargin = Esw > 0 ? LmEnergy / Esw : 0;
  const requiredDeadtime = Imag > 0 ? (cswPf * 1e-12 * VbusNom) / Imag : 0;

  setHtml("step1Result", `
    <div class="results-list">
      <div class="result-row"><strong>入力電力 Pin</strong><code>${formatNumber(Pin, 2)} W</code></div>
      <div class="result-row"><strong>出力電流 Iout</strong><code>${formatNumber(Iout, 2)} A</code></div>
    </div>
  `);

  setHtml("step2Result", `
    <div class="results-list">
      <div class="result-row"><strong>等価負荷 Rac</strong><code>${formatNumber(Rac, 3)} Ω</code></div>
    </div>
  `);

  setHtml("step3Result", `
    <div class="results-list">
      <div class="result-row"><strong>理想巻数比 n = Np/Ns</strong><code>${formatNumber(nIdeal, 3)} : 1</code></div>
      <div class="result-row"><strong>基準条件</strong><code>Vbus,max 基準</code></div>
      <div class="result-row"><strong>Vbus,max時 必要ゲイン</strong><code>${formatNumber(gainAtMax, 3)}</code></div>
      <div class="result-row"><strong>Vbus,nom時 必要ゲイン</strong><code>${formatNumber(gainAtNom, 3)}</code></div>
      <div class="result-row"><strong>Vbus,min時 必要ゲイン</strong><code>${formatNumber(gainAtMin, 3)}</code></div>
    </div>
    <p class="hint">初期設計では Ns=1 として巻数比のみを扱います。</p>
  `);

  setHtml("step4Result", `
    <div class="results-list">
      <div class="result-row"><strong>共振インダクタ Lr</strong><code>${formatNumber(Lr * 1e6, 2)} µH</code></div>
      <div class="result-row"><strong>共振コンデンサ Cr</strong><code>${formatNumber(Cr * 1e9, 2)} nF</code></div>
    </div>
  `);

  setHtml("step5Result", `
    <div class="results-list">
      <div class="result-row"><strong>励磁インダクタンス Lm</strong><code>${formatNumber(Lm * 1e6, 2)} µH</code></div>
      <div class="result-row"><strong>Lm/Lr</strong><code>${formatNumber(mRatio, 2)}</code></div>
    </div>
  `);

  setHtml("step6Result", `
    <div class="results-list">
      <div class="result-row"><strong>励磁電流</strong><code>${formatNumber(Imag, 3)} A</code></div>
      <div class="result-row"><strong>Csw充放電エネルギー</strong><code>${formatNumber(Esw * 1e6, 3)} µJ</code></div>
      <div class="result-row"><strong>励磁エネルギー</strong><code>${formatNumber(LmEnergy * 1e6, 3)} µJ</code></div>
      <div class="result-row"><strong>ZVSマージン</strong><code>${formatNumber(zvsMargin, 2)} x</code></div>
      <div class="result-row"><strong>必要デッドタイム</strong><code>${formatNumber(requiredDeadtime * 1e9, 1)} ns</code></div>
      <div class="result-row"><strong>設定デッドタイム</strong><code>${formatNumber(deadtimeNs, 1)} ns</code></div>
    </div>
  `);

  setText("summaryN", `${formatNumber(nIdeal, 3)} : 1`);
  setText("summaryLr", `${formatNumber(Lr * 1e6, 2)} µH`);
  setText("summaryCr", `${formatNumber(Cr * 1e9, 2)} nF`);
  setText("summaryLm", `${formatNumber(Lm * 1e6, 2)} µH`);

  latestCsvRows = [
    ["項目", "値"],
    ["入力電力 Pin", `${formatNumber(Pin, 2)} W`],
    ["出力電流 Iout", `${formatNumber(Iout, 2)} A`],
    ["等価負荷 Rac", `${formatNumber(Rac, 3)} Ω`],
    ["理想巻数比 n", `${formatNumber(nIdeal, 3)} : 1`],
    ["Vbus,max時 必要ゲイン", formatNumber(gainAtMax, 3)],
    ["Vbus,nom時 必要ゲイン", formatNumber(gainAtNom, 3)],
    ["Vbus,min時 必要ゲイン", formatNumber(gainAtMin, 3)],
    ["Lr", `${formatNumber(Lr * 1e6, 2)} µH`],
    ["Cr", `${formatNumber(Cr * 1e9, 2)} nF`],
    ["Lm", `${formatNumber(Lm * 1e6, 2)} µH`],
    ["ZVSマージン", `${formatNumber(zvsMargin, 2)} x`]
  ];

  drawGainChart({
    frKhz,
    mRatio,
    gainAtMax,
    gainAtNom,
    gainAtMin
  });
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function llcGain(fn, q, m) {
  const x = fn;
  const a = 1 + (1 / m) * (1 - 1 / (x * x));
  const b = q * (x - 1 / x);
  return 1 / Math.sqrt(a * a + b * b);
}

function drawGainChart({ frKhz, mRatio, gainAtMax, gainAtNom, gainAtMin }) {
  const canvas = document.getElementById("gainChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const padL = 58;
  const padR = 22;
  const padT = 24;
  const padB = 48;

  const xMin = 0.45;
  const xMax = 2.2;
  const yMin = 0;
  const yMax = 2.2;

  function px(x) {
    return padL + ((x - xMin) / (xMax - xMin)) * (w - padL - padR);
  }

  function py(y) {
    return h - padB - ((y - yMin) / (yMax - yMin)) * (h - padT - padB);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d9e0ea";
  ctx.fillStyle = "#667085";
  ctx.font = "12px system-ui";

  for (let gx = 0.5; gx <= 2.2; gx += 0.25) {
    ctx.beginPath();
    ctx.moveTo(px(gx), padT);
    ctx.lineTo(px(gx), h - padB);
    ctx.stroke();
  }

  for (let gy = 0; gy <= 2.2; gy += 0.25) {
    ctx.beginPath();
    ctx.moveTo(padL, py(gy));
    ctx.lineTo(w - padR, py(gy));
    ctx.stroke();
  }

  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padL, h - padB);
  ctx.lineTo(w - padR, h - padB);
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, h - padB);
  ctx.stroke();

  ctx.fillStyle = "#1f2937";
  ctx.fillText("fn = fs / fr", w / 2 - 30, h - 12);
  ctx.save();
  ctx.translate(18, h / 2 + 30);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Gain", 0, 0);
  ctx.restore();

  const curves = [
    { q: 0.25, color: "#94a3b8" },
    { q: 0.45, color: "#2563eb" },
    { q: 0.75, color: "#0f766e" }
  ];

  curves.forEach((curve) => {
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= 220; i++) {
      const x = xMin + ((xMax - xMin) * i) / 220;
      const y = Math.min(llcGain(x, curve.q, mRatio), yMax);
      if (i === 0) ctx.moveTo(px(x), py(y));
      else ctx.lineTo(px(x), py(y));
    }

    ctx.stroke();
  });

  const reqs = [
    { y: gainAtMax, label: "max" },
    { y: gainAtNom, label: "nom" },
    { y: gainAtMin, label: "min" }
  ];

  ctx.strokeStyle = "#b45309";
  ctx.fillStyle = "#b45309";
  ctx.lineWidth = 1.5;

  reqs.forEach((r) => {
    if (!isFinite(r.y)) return;
    const y = Math.min(r.y, yMax);

    ctx.beginPath();
    ctx.moveTo(padL, py(y));
    ctx.lineTo(w - padR, py(y));
    ctx.stroke();

    ctx.fillText(`G ${r.label}=${formatNumber(r.y, 2)}`, padL + 8, py(y) - 4);
  });

  ctx.fillStyle = "#667085";
  ctx.fillText(`fr = ${formatNumber(frKhz, 1)} kHz`, w - 145, padT + 18);
}

function exportCSV() {
  if (latestCsvRows.length <= 1) calcLLC();

  const csv = latestCsvRows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
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
