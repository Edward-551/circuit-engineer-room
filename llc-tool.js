function getNumber(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

function formatNumber(value, digits = 3) {
  if (!isFinite(value)) return "-";
  return Number(value).toFixed(digits);
}

function calcLLC(e) {
  e.preventDefault();

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
  const wz = 2 * Math.PI * fr;

  let rectDrop = 0;

  if (rectifierType === "center") rectDrop = diodeVf;
  if (rectifierType === "bridge") rectDrop = diodeVf * 2;
  if (rectifierType === "sync") rectDrop = 0;

  const VoutEq = Vout + rectDrop;

  const bridgeDiv = bridgeType === "full" ? 1 : 2;

  // STEP1
  const Pin = Pout / efficiency;
  const Iout = Pout / Vout;

  document.getElementById("step1Result").innerHTML = `
    <div class="result-grid">
      <div><span>入力電力 Pin</span><strong>${formatNumber(Pin, 2)} W</strong></div>
      <div><span>出力電流 Iout</span><strong>${formatNumber(Iout, 2)} A</strong></div>
    </div>
  `;

  // STEP2
  const Rac = (8 / (Math.PI * Math.PI)) * Math.pow((bridgeDiv * VoutEq), 2) / Pout;

  document.getElementById("step2Result").innerHTML = `
    <div class="result-grid">
      <div><span>等価負荷 Rac</span><strong>${formatNumber(Rac, 3)} Ω</strong></div>
    </div>
  `;

  // STEP3
  const nIdeal = VbusMax / (bridgeDiv * VoutEq);

  const gainAtMax = bridgeDiv * nIdeal * VoutEq / VbusMax;
  const gainAtNom = bridgeDiv * nIdeal * VoutEq / VbusNom;
  const gainAtMin = bridgeDiv * nIdeal * VoutEq / VbusMin;

  document.getElementById("step3Result").innerHTML = `
    <div class="result-grid">
      <div><span>理想巻数比 n = Np/Ns</span><strong>${formatNumber(nIdeal, 3)} : 1</strong></div>
      <div><span>基準条件</span><strong>Vbus,max</strong></div>
      <div><span>Vbus,max時 必要ゲイン</span><strong>${formatNumber(gainAtMax, 3)}</strong></div>
      <div><span>Vbus,nom時 必要ゲイン</span><strong>${formatNumber(gainAtNom, 3)}</strong></div>
      <div><span>Vbus,min時 必要ゲイン</span><strong>${formatNumber(gainAtMin, 3)}</strong></div>
    </div>
    <p class="note">
      初期設計では Ns=1 として巻数比のみを扱います。
    </p>
  `;

  // STEP4
  const Cr = 1 / (wz * zr);
  const Lr = zr / wz;

  document.getElementById("step4Result").innerHTML = `
    <div class="result-grid">
      <div><span>共振コンデンサ Cr</span><strong>${formatNumber(Cr * 1e9, 2)} nF</strong></div>
      <div><span>共振インダクタ Lr</span><strong>${formatNumber(Lr * 1e6, 2)} µH</strong></div>
    </div>
  `;

  // STEP5
  const Lm = Lr * mRatio;

  document.getElementById("step5Result").innerHTML = `
    <div class="result-grid">
      <div><span>励磁インダクタンス Lm</span><strong>${formatNumber(Lm * 1e6, 2)} µH</strong></div>
      <div><span>Lm/Lr</span><strong>${formatNumber(mRatio, 2)}</strong></div>
    </div>
  `;

  // STEP6
  const zvsFreq = zvsFreqKhz * 1000;
  const wZvs = 2 * Math.PI * zvsFreq;

  const Imag = VbusNom / (4 * wZvs * Lm);

  const Esw = 0.5 * (cswPf * 1e-12) * Math.pow(VbusNom, 2);
  const LmEnergy = 0.5 * Lm * Math.pow(Imag, 2);

  const zvsMargin = LmEnergy / Esw;

  const requiredDeadtime =
    (cswPf * 1e-12 * VbusNom) / Imag;

  document.getElementById("step6Result").innerHTML = `
    <div class="result-grid">
      <div><span>励磁電流</span><strong>${formatNumber(Imag, 3)} A</strong></div>
      <div><span>Coss充放電エネルギー</span><strong>${formatNumber(Esw * 1e6, 3)} µJ</strong></div>
      <div><span>励磁エネルギー</span><strong>${formatNumber(LmEnergy * 1e6, 3)} µJ</strong></div>
      <div><span>ZVSマージン</span><strong>${formatNumber(zvsMargin, 2)} x</strong></div>
      <div><span>必要デッドタイム</span><strong>${formatNumber(requiredDeadtime * 1e9, 1)} ns</strong></div>
      <div><span>設定デッドタイム</span><strong>${formatNumber(deadtimeNs, 1)} ns</strong></div>
    </div>
  `;

  // SUMMARY
  document.getElementById("summary").innerHTML = `
    <div class="summary-grid">
      <div><span>巻数比</span><strong>${formatNumber(nIdeal, 3)} : 1</strong></div>
      <div><span>Lr</span><strong>${formatNumber(Lr * 1e6, 2)} µH</strong></div>
      <div><span>Cr</span><strong>${formatNumber(Cr * 1e9, 2)} nF</strong></div>
      <div><span>Lm</span><strong>${formatNumber(Lm * 1e6, 2)} µH</strong></div>
      <div><span>ZVS</span><strong>${formatNumber(zvsMargin, 2)} x</strong></div>
    </div>
  `;
}

function exportCSV() {
  const rows = [];

  document.querySelectorAll(".result-grid div").forEach((item) => {
    const label = item.querySelector("span")?.innerText || "";
    const value = item.querySelector("strong")?.innerText || "";

    rows.push([label, value]);
  });

  let csv = "項目,値\n";

  rows.forEach((r) => {
    csv += `"${r[0]}","${r[1]}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = "llc_design_result.csv";

  a.click();

  URL.revokeObjectURL(url);
}

document.getElementById("llcForm").addEventListener("submit", calcLLC);

document.getElementById("csvBtn").addEventListener("click", exportCSV);

document.getElementById("resetBtn").addEventListener("click", () => {
  location.reload();
});
