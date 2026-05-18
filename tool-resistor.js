const blocks = [];

const sourceModeEl = document.getElementById("sourceMode");
const sourceValueEl = document.getElementById("sourceValue");
const sourceUnitEl = document.getElementById("sourceUnit");
const newTypeEl = document.getElementById("newType");
const newNameEl = document.getElementById("newName");
const newValuesEl = document.getElementById("newValues");
const networkListEl = document.getElementById("networkList");
const resultSummaryEl = document.getElementById("resultSummary");
const resultMessageEl = document.getElementById("resultMessage");
const resultTableEl = document.getElementById("resultTable");
const jsonFileInputEl = document.getElementById("jsonFileInput");

const EPSILON = 1e-12;

function normalizeZero(value) {
  if (!Number.isFinite(value)) return value;
  return Math.abs(value) < EPSILON ? 0 : value;
}

function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return "-";

  const normalized = normalizeZero(value);
  if (normalized === 0) return "0";

  const abs = Math.abs(normalized);

  if (abs >= 1e4 || abs < 1e-3) {
    return normalized.toExponential(3);
  }

  return Number(normalized.toFixed(digits)).toString();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type = "ok") {
  const safe = escapeHtml(message);
  resultMessageEl.innerHTML = `<div class="${type}">${safe}</div>`;
}

function getNextBlockName() {
  return `Block ${blocks.length + 1}`;
}

function setDefaultBlockName() {
  newNameEl.value = getNextBlockName();
}

function syncUnitLabel() {
  sourceUnitEl.value = sourceModeEl.value === "voltage" ? "V" : "A";
  calculateAndRender();
}

function parseResistorValues(text) {
  const parts = String(text)
    .split(/[，,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("抵抗値を1つ以上入力してください。");
  }

  const values = parts.map((part, index) => {
    const num = Number(part);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error(`抵抗値 ${index + 1} が不正です: ${part}`);
    }
    return num;
  });

  return values;
}

function calcEquivalent(block) {
  if (block.type === "series") {
    return block.resistors.reduce((sum, r) => sum + r.value, 0);
  }

  const inv = block.resistors.reduce((sum, r) => sum + 1 / r.value, 0);
  return 1 / inv;
}

function createResistors(blockName, values) {
  return values.map((value, idx) => ({
    id: crypto.randomUUID(),
    name: `${blockName}-R${idx + 1}`,
    value
  }));
}

function addBlock(name, type, values) {
  const safeName = String(name || "").trim() || getNextBlockName();

  blocks.push({
    id: crypto.randomUUID(),
    name: safeName,
    type,
    resistors: createResistors(safeName, values)
  });

  renderBlocks();
  calculateAndRender();
  setDefaultBlockName();
}

function removeBlock(blockId) {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return;

  blocks.splice(index, 1);
  renderBlocks();
  calculateAndRender();
  setDefaultBlockName();
}

function moveBlockUp(blockId) {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index <= 0) return;

  [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
  renderBlocks();
  calculateAndRender();
}

function moveBlockDown(blockId) {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0 || index >= blocks.length - 1) return;

  [blocks[index], blocks[index + 1]] = [blocks[index + 1], blocks[index]];
  renderBlocks();
  calculateAndRender();
}

function editBlock(blockId) {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return;

  const newName = prompt("ブロック名を入力してください", block.name);
  if (newName === null) return;

  const currentValues = block.resistors.map((r) => r.value).join(", ");
  const newValuesText = prompt("抵抗値 [Ω] をカンマ区切りで入力してください", currentValues);
  if (newValuesText === null) return;

  try {
    const values = parseResistorValues(newValuesText);
    const safeName = newName.trim() || block.name;

    block.name = safeName;
    block.resistors = createResistors(safeName, values);

    renderBlocks();
    calculateAndRender();
    showMessage(`「${safeName}」を更新しました。`, "ok");
  } catch (error) {
    renderError(error.message || "編集に失敗しました。");
  }
}

function duplicateBlock(blockId) {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return;

  const copiedName = `${block.name} copy`;
  const values = block.resistors.map((r) => r.value);

  addBlock(copiedName, block.type, values);
  showMessage(`「${block.name}」を複製しました。`, "ok");
}

function getBlockSummaries() {
  if (blocks.length === 0) return [];

  const sourceValue = Number(sourceValueEl.value);
  if (!Number.isFinite(sourceValue) || sourceValue <= 0) return [];

  const blockResults = blocks.map((block) => {
    const equivalentResistance = calcEquivalent(block);
    return {
      ...block,
      equivalentResistance
    };
  });

  const totalResistance = blockResults.reduce(
    (sum, block) => sum + block.equivalentResistance,
    0
  );

  let totalVoltage;
  let totalCurrent;

  if (sourceModeEl.value === "voltage") {
    totalVoltage = sourceValue;
    totalCurrent = totalVoltage / totalResistance;
  } else {
    totalCurrent = sourceValue;
    totalVoltage = totalCurrent * totalResistance;
  }

  return blockResults.map((block) => {
    const blockVoltage = totalCurrent * block.equivalentResistance;
    const blockCurrent = totalCurrent;
    const blockPower = blockVoltage * blockCurrent;

    return {
      id: block.id,
      equivalentResistance: normalizeZero(block.equivalentResistance),
      blockVoltage: normalizeZero(blockVoltage),
      blockCurrent: normalizeZero(blockCurrent),
      blockPower: normalizeZero(blockPower)
    };
  });
}

function renderBlocks() {
  if (blocks.length === 0) {
    networkListEl.innerHTML = '<div class="sub">まだブロックがありません。</div>';
    return;
  }

  const summaries = getBlockSummaries();

  networkListEl.innerHTML = blocks
    .map((block, blockIndex) => {
      const values = block.resistors.map((r) => `${formatNumber(r.value)}Ω`).join(", ");
      const summary = summaries.find((item) => item.id === block.id);

      return `
        <div class="item">
          <div class="item-head">
            <div>
              <div><strong>${blockIndex + 1}. ${escapeHtml(block.name)}</strong></div>
              <div class="sub">${escapeHtml(values)}</div>
            </div>
            <div class="inline-buttons">
              <span class="badge">${block.type === "series" ? "直列" : "並列"}</span>
              <button class="small-btn" onclick="moveBlockUp('${block.id}')">↑</button>
              <button class="small-btn" onclick="moveBlockDown('${block.id}')">↓</button>
              <button class="small-btn secondary" onclick="editBlock('${block.id}')">編集</button>
              <button class="small-btn" onclick="duplicateBlock('${block.id}')">複製</button>
              <button class="small-btn danger" onclick="removeBlockWithConfirm('${block.id}')">削除</button>
            </div>
          </div>
          <div class="sub">合成抵抗: ${summary ? formatNumber(summary.equivalentResistance) : "-"} Ω</div>
          <div class="sub">ブロック電圧: ${summary ? formatNumber(summary.blockVoltage) : "-"} V</div>
          <div class="sub">ブロック電流: ${summary ? formatNumber(summary.blockCurrent) : "-"} A</div>
          <div class="sub">ブロック電力: ${summary ? formatNumber(summary.blockPower) : "-"} W</div>
        </div>
      `;
    })
    .join("");
}

function calculateNetwork() {
  if (blocks.length === 0) {
    throw new Error("ブロックを1つ以上追加してください。");
  }

  const sourceValue = Number(sourceValueEl.value);
  if (!Number.isFinite(sourceValue) || sourceValue <= 0) {
    throw new Error("電源条件の値は0より大きい数値にしてください。");
  }

  const blockResults = blocks.map((block) => {
    const eq = calcEquivalent(block);
    return {
      ...block,
      equivalentResistance: eq
    };
  });

  const totalResistance = blockResults.reduce(
    (sum, block) => sum + block.equivalentResistance,
    0
  );

  let totalVoltage;
  let totalCurrent;

  if (sourceModeEl.value === "voltage") {
    totalVoltage = sourceValue;
    totalCurrent = totalVoltage / totalResistance;
  } else {
    totalCurrent = sourceValue;
    totalVoltage = totalCurrent * totalResistance;
  }

  let runningVoltage = 0;
  const rows = [];

  blockResults.forEach((block, blockIndex) => {
    const blockCurrent = totalCurrent;
    const blockVoltage = totalCurrent * block.equivalentResistance;
    const blockPower = blockVoltage * blockCurrent;

    if (block.type === "series") {
      block.resistors.forEach((resistor) => {
        const current = blockCurrent;
        const voltage = current * resistor.value;
        const power = voltage * current;

        rows.push({
          blockNo: blockIndex + 1,
          blockName: block.name,
          blockType: "直列",
          resistorName: resistor.name,
          resistance: normalizeZero(resistor.value),
          voltage: normalizeZero(voltage),
          current: normalizeZero(current),
          power: normalizeZero(power),
          blockVoltage: normalizeZero(blockVoltage),
          blockCurrent: normalizeZero(blockCurrent),
          blockPower: normalizeZero(blockPower),
          positionVoltageStart: normalizeZero(runningVoltage),
          positionVoltageEnd: normalizeZero(runningVoltage + voltage)
        });

        runningVoltage += voltage;
      });
    } else {
      const startV = runningVoltage;
      const endV = runningVoltage + blockVoltage;

      block.resistors.forEach((resistor) => {
        const voltage = blockVoltage;
        const current = voltage / resistor.value;
        const power = voltage * current;

        rows.push({
          blockNo: blockIndex + 1,
          blockName: block.name,
          blockType: "並列",
          resistorName: resistor.name,
          resistance: normalizeZero(resistor.value),
          voltage: normalizeZero(voltage),
          current: normalizeZero(current),
          power: normalizeZero(power),
          blockVoltage: normalizeZero(blockVoltage),
          blockCurrent: normalizeZero(blockCurrent),
          blockPower: normalizeZero(blockPower),
          positionVoltageStart: normalizeZero(startV),
          positionVoltageEnd: normalizeZero(endV)
        });
      });

      runningVoltage += blockVoltage;
    }
  });

  const totalPower = totalVoltage * totalCurrent;

  return {
    totalResistance: normalizeZero(totalResistance),
    totalVoltage: normalizeZero(totalVoltage),
    totalCurrent: normalizeZero(totalCurrent),
    totalPower: normalizeZero(totalPower),
    rows
  };
}

function renderResults(result) {
  resultSummaryEl.innerHTML = `
    <div class="metric">
      <div class="label">全合成抵抗</div>
      <div class="value">${formatNumber(result.totalResistance)} Ω</div>
    </div>
    <div class="metric">
      <div class="label">全体電圧</div>
      <div class="value">${formatNumber(result.totalVoltage)} V</div>
    </div>
    <div class="metric">
      <div class="label">全体電流</div>
      <div class="value">${formatNumber(result.totalCurrent)} A</div>
    </div>
    <div class="metric">
      <div class="label">全消費電力</div>
      <div class="value">${formatNumber(result.totalPower)} W</div>
    </div>
  `;

  showMessage("計算できました。", "ok");

  resultTableEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ブロック</th>
          <th>抵抗名</th>
          <th>種類</th>
          <th>抵抗値 [Ω]</th>
          <th>電圧 [V]</th>
          <th>電流 [A]</th>
          <th>電力 [W]</th>
          <th>始点電位 [V]</th>
          <th>終点電位 [V]</th>
        </tr>
      </thead>
      <tbody>
        ${result.rows
          .map(
            (row) => `
          <tr>
            <td>${row.blockNo}. ${escapeHtml(row.blockName)}</td>
            <td>${escapeHtml(row.resistorName)}</td>
            <td>${row.blockType}</td>
            <td>${formatNumber(row.resistance)}</td>
            <td>${formatNumber(row.voltage)}</td>
            <td>${formatNumber(row.current)}</td>
            <td>${formatNumber(row.power)}</td>
            <td>${formatNumber(row.positionVoltageStart)}</td>
            <td>${formatNumber(row.positionVoltageEnd)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderError(message) {
  resultSummaryEl.innerHTML = "";
  resultMessageEl.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
  resultTableEl.innerHTML = "";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportCsv() {
  try {
    const result = calculateNetwork();

    const header = [
      "ブロック番号",
      "ブロック名",
      "抵抗名",
      "種類",
      "抵抗値[Ω]",
      "電圧[V]",
      "電流[A]",
      "電力[W]",
      "ブロック電圧[V]",
      "ブロック電流[A]",
      "ブロック電力[W]",
      "始点電位[V]",
      "終点電位[V]"
    ];

    const rows = result.rows.map((row) => [
      row.blockNo,
      row.blockName,
      row.resistorName,
      row.blockType,
      formatNumber(row.resistance),
      formatNumber(row.voltage),
      formatNumber(row.current),
      formatNumber(row.power),
      formatNumber(row.blockVoltage),
      formatNumber(row.blockCurrent),
      formatNumber(row.blockPower),
      formatNumber(row.positionVoltageStart),
      formatNumber(row.positionVoltageEnd)
    ]);

    const summaryRows = [
      [],
      ["全合成抵抗[Ω]", formatNumber(result.totalResistance)],
      ["全体電圧[V]", formatNumber(result.totalVoltage)],
      ["全体電流[A]", formatNumber(result.totalCurrent)],
      ["全消費電力[W]", formatNumber(result.totalPower)],
      []
    ];

    const csvLines = [
      ...summaryRows.map((row) => row.map(csvEscape).join(",")),
      header.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(","))
    ];

    const csvContent = "\uFEFF" + csvLines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename =
      `resistor-network-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    showMessage("CSVを出力しました。", "ok");
  } catch (error) {
    renderError(error.message || "CSV出力に失敗しました。");
  }
}

function buildSaveData() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sourceMode: sourceModeEl.value,
    sourceValue: Number(sourceValueEl.value),
    blocks: blocks.map((block) => ({
      name: block.name,
      type: block.type,
      resistors: block.resistors.map((r) => ({
        name: r.name,
        value: r.value
      }))
    }))
  };
}

function saveJson() {
  try {
    const data = buildSaveData();
    const jsonText = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename =
      `resistor-network-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    showMessage("JSONを保存しました。", "ok");
  } catch (error) {
    renderError(error.message || "JSON保存に失敗しました。");
  }
}

function validateLoadedData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("JSONの内容が不正です。");
  }

  if (!["voltage", "current"].includes(data.sourceMode)) {
    throw new Error("sourceMode が不正です。");
  }

  const sourceValue = Number(data.sourceValue);
  if (!Number.isFinite(sourceValue) || sourceValue <= 0) {
    throw new Error("sourceValue が不正です。");
  }

  if (!Array.isArray(data.blocks)) {
    throw new Error("blocks が不正です。");
  }

  data.blocks.forEach((block, blockIndex) => {
    if (!block || typeof block !== "object") {
      throw new Error(`ブロック ${blockIndex + 1} の形式が不正です。`);
    }

    if (!["series", "parallel"].includes(block.type)) {
      throw new Error(`ブロック ${blockIndex + 1} の type が不正です。`);
    }

    if (!Array.isArray(block.resistors) || block.resistors.length === 0) {
      throw new Error(`ブロック ${blockIndex + 1} の resistors が不正です。`);
    }

    block.resistors.forEach((resistor, resistorIndex) => {
      const value = Number(resistor.value);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`ブロック ${blockIndex + 1} の抵抗 ${resistorIndex + 1} が不正です。`);
      }
    });
  });
}

function loadFromData(data) {
  validateLoadedData(data);

  blocks.length = 0;

  data.blocks.forEach((block, blockIndex) => {
    const safeName =
      String(block.name || `Block ${blockIndex + 1}`).trim() || `Block ${blockIndex + 1}`;

    const resistors = block.resistors.map((resistor, resistorIndex) => ({
      id: crypto.randomUUID(),
      name: resistor.name
        ? String(resistor.name)
        : `${safeName}-R${resistorIndex + 1}`,
      value: Number(resistor.value)
    }));

    blocks.push({
      id: crypto.randomUUID(),
      name: safeName,
      type: block.type,
      resistors
    });
  });

  sourceModeEl.value = data.sourceMode;
  sourceValueEl.value = String(data.sourceValue);
  setDefaultBlockName();
  syncUnitLabel();
  showMessage("JSONを読み込みました。", "ok");
}

function openJsonFile() {
  jsonFileInputEl.value = "";
  jsonFileInputEl.click();
}

function handleJsonFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      const data = JSON.parse(text);
      loadFromData(data);
    } catch (error) {
      renderError(error.message || "JSON読込に失敗しました。");
    }
  };

  reader.onerror = () => {
    renderError("JSONファイルの読み込みに失敗しました。");
  };

  reader.readAsText(file, "utf-8");
}

function calculateAndRender() {
  try {
    renderBlocks();
    const result = calculateNetwork();
    renderResults(result);
  } catch (error) {
    renderBlocks();
    renderError(error.message || "計算に失敗しました。");
  }
}

function removeBlockWithConfirm(blockId) {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return;

  const ok = window.confirm(`「${block.name}」を削除しますか？`);
  if (!ok) return;

  removeBlock(blockId);
  showMessage(`「${block.name}」を削除しました。`, "ok");
}

document.getElementById("addBlockBtn").addEventListener("click", () => {
  try {
    const values = parseResistorValues(newValuesEl.value);
    addBlock(newNameEl.value, newTypeEl.value, values);
    showMessage("ブロックを追加しました。", "ok");
  } catch (error) {
    renderError(error.message || "追加に失敗しました。");
  }
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (blocks.length === 0) return;

  const ok = window.confirm("ブロックをすべて削除しますか？");
  if (!ok) return;

  blocks.length = 0;
  renderBlocks();
  calculateAndRender();
  setDefaultBlockName();
  showMessage("すべてのブロックを削除しました。", "ok");
});

document.getElementById("exportCsvBtn").addEventListener("click", () => {
  exportCsv();
});

document.getElementById("saveJsonBtn").addEventListener("click", () => {
  saveJson();
});

document.getElementById("loadJsonBtn").addEventListener("click", () => {
  openJsonFile();
});

document.getElementById("sampleBtn").addEventListener("click", () => {
  blocks.length = 0;
  addBlock("Input Series", "series", [2, 3]);
  addBlock("Load Parallel", "parallel", [30, 60, 20]);
  addBlock("Output Series", "series", [5, 10]);
  sourceModeEl.value = "voltage";
  sourceValueEl.value = "24";
  syncUnitLabel();
  showMessage("サンプル回路を読み込みました。", "ok");
});

sourceModeEl.addEventListener("change", syncUnitLabel);
sourceValueEl.addEventListener("input", calculateAndRender);
jsonFileInputEl.addEventListener("change", handleJsonFileSelected);

window.moveBlockUp = moveBlockUp;
window.moveBlockDown = moveBlockDown;
window.editBlock = editBlock;
window.duplicateBlock = duplicateBlock;
window.removeBlockWithConfirm = removeBlockWithConfirm;

renderBlocks();
setDefaultBlockName();
syncUnitLabel();