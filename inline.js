
    const MU0 = 4 * Math.PI * 1e-7;
    let latestCsvRows = [];

    function getNumber(id){
      const value = parseFloat(document.getElementById(id).value);
      return Number.isFinite(value) ? value : NaN;
    }

    function getOptionalNumber(id, fallback = 0){
      const el = document.getElementById(id);
      if(!el || String(el.value).trim() === "") return fallback;
      const value = parseFloat(el.value);
      return Number.isFinite(value) ? value : NaN;
    }

    function hasNumberInput(id){
      const el = document.getElementById(id);
      return !!el && String(el.value).trim() !== "" && Number.isFinite(parseFloat(el.value));
    }

    function getInputText(id){
      const el = document.getElementById(id);
      return el ? el.value : "";
    }

    function wireArea(dia){
      return Math.PI * dia * dia / 4;
    }

    function fmt(value, digits, unit){
      if(!Number.isFinite(value)) return "—";
      return `${value.toFixed(digits)}${unit ? " " + unit : ""}`;
    }

    function csvEscape(value){
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    }

    function getRecommendedWire(requiredArea, fsHz){
      const standardDias = [0.10, 0.12, 0.16, 0.18, 0.20, 0.25, 0.32, 0.40, 0.45, 0.50, 0.60, 0.70, 0.80, 1.00, 1.20, 1.60, 2.00];
      const skinDepth = 66 / Math.sqrt(fsHz);
      const targetMaxDia = Math.max(0.10, Math.min(0.80, 2 * skinDepth));

      let dia = standardDias[0];
      for(const d of standardDias){
        if(d <= targetMaxDia){
          dia = d;
        }
      }

      const parallel = Math.max(1, Math.ceil(requiredArea / wireArea(dia)));
      const actualArea = wireArea(dia) * parallel;

      return { dia, parallel, actualArea, skinDepth };
    }

    function addRow(rows, category, item, result){
      rows.push({ category, item, result });
    }

    function addInputRows(csvRows){
      const inputs = [
        ["入力", "入力電圧 Vin [V]", getInputText("vin")],
        ["入力", "出力電圧 Vo [V]", getInputText("vo")],
        ["入力", "出力電力 Po [W]", getInputText("po")],
        ["入力", "効率 η [%]", getInputText("eff")],
        ["入力", "スイッチング周波数 fs [kHz]", getInputText("fs")],
        ["入力", "最大磁束密度 Bmax [T]", getInputText("bmax")],
        ["入力", "コア断面積 Ae [mm²]", getInputText("ae")],
        ["入力", "巻数比 Np/Ns", getInputText("ratio")],
        ["入力", "一次巻数 Np（0で自動）", getInputText("np_manual")],
        ["入力", "許容電流密度 J [A/mm²]", getInputText("j")],
        ["入力", "窓面積 Aw [mm²]", getInputText("aw")],
        ["入力", "占積率 Ku", getInputText("ku")],
        ["入力", "一次側 線径 [mm]", getInputText("pri_wire_dia")],
        ["入力", "一次側 パラ数", getInputText("pri_parallel")],
        ["入力", "二次側 線径 [mm]", getInputText("sec_wire_dia")],
        ["入力", "二次側 パラ数", getInputText("sec_parallel")],
        ["入力", "目標L Ltarget [µH]", getInputText("ind_l")],
        ["入力", "Lm計算に使う一次巻数 Np_gap [turn]（0ならNp自動）", getInputText("ind_n")],
        ["入力", "ピーク電流 Ipk [A]", getInputText("ind_ipk")],
        ["入力", "飽和磁束密度 Bsat [T]", getInputText("bsat")],
        ["入力", "磁路長 le [mm]", getInputText("le")],
        ["入力", "無ギャップAL値 [nH/N²]", getInputText("al_no_gap")],
        ["入力", "ギャップ計算モード", document.getElementById("gap_mode").value],
        ["入力", "ギャップ長 g [mm]", getInputText("gap_g")]
      ];
      for(const row of inputs){
        csvRows.push(row);
      }
    }

    function calcTransformer(){
      const vin = getNumber("vin");
      const vo = getNumber("vo");
      const po = getNumber("po");
      const eff = getNumber("eff") / 100;
      const fs = getNumber("fs") * 1000;
      const bmax = getNumber("bmax");
      const ae_mm2 = getNumber("ae");
      const ratio = getNumber("ratio");
      const np_manual = getNumber("np_manual");
      const j = getNumber("j");
      const aw = getNumber("aw");
      const ku = getNumber("ku");
      const priWireDiaInput = getNumber("pri_wire_dia");
      const priParallelInput = getNumber("pri_parallel");
      const secWireDiaInput = getNumber("sec_wire_dia");
      const secParallelInput = getNumber("sec_parallel");
      const indL_uH = getNumber("ind_l");
      const indN = getNumber("ind_n");
      const indIpk = getOptionalNumber("ind_ipk", 0);
      const hasIndIpk = hasNumberInput("ind_ipk") && indIpk > 0;
      const bsat = getNumber("bsat");
      const le_mm = getNumber("le");
      const alNoGap_nH = getNumber("al_no_gap");
      const gapMode = document.getElementById("gap_mode").value;
      const gapG_mm = getNumber("gap_g");

      const resultMessage = document.getElementById("resultMessage");
      const resultTable = document.getElementById("resultTable");

      const values = [vin, vo, po, eff, fs, bmax, ae_mm2, ratio, np_manual, j, aw, ku, priWireDiaInput, priParallelInput, secWireDiaInput, secParallelInput, indL_uH, indN, indIpk, bsat, le_mm, alNoGap_nH, gapG_mm];
      if(values.some(v => !Number.isFinite(v)) || vin <= 0 || vo <= 0 || po <= 0 || eff <= 0 || fs <= 0 || bmax <= 0 || ae_mm2 <= 0 || ratio <= 0 || j <= 0 || aw <= 0 || ku <= 0 || np_manual < 0 || priWireDiaInput < 0 || priParallelInput < 0 || secWireDiaInput < 0 || secParallelInput < 0 || indL_uH < 0 || indN < 0 || indIpk < 0 || bsat <= 0 || le_mm < 0 || alNoGap_nH < 0 || gapG_mm < 0){
        resultMessage.innerHTML = "⚠ 入力値を確認してください。0未満、空欄、または主要条件が0以下だと計算できません。";
        resultTable.innerHTML = "";
        latestCsvRows = [];
        return;
      }

      const ae = ae_mm2 * 1e-6;
      const pin = po / eff;
      const iin = pin / vin;
      const io = po / vo;

      const np_min = vin / (4 * fs * bmax * ae);
      const np = np_manual > 0 ? np_manual : Math.ceil(np_min);
      const npForGap = indN > 0 ? Math.ceil(indN) : np;
      const npForGapNote = indN > 0 ? "入力されたNp_gapを使用" : "Np_gap=0のため、上の一次巻数Npを自動使用";
      const nsIdeal = np / ratio;
      const ns = Math.ceil(nsIdeal);
      const actualRatio = np / ns;
      const voRatioOnly = vin / actualRatio;
      const deltaB = vin / (4 * fs * np * ae);

      const priAreaRequired = iin / j;
      const secAreaRequired = io / j;
      const priDiaEquivalent = Math.sqrt((4 * priAreaRequired) / Math.PI);
      const secDiaEquivalent = Math.sqrt((4 * secAreaRequired) / Math.PI);

      const priRecommend = getRecommendedWire(priAreaRequired, fs);
      const secRecommend = getRecommendedWire(secAreaRequired, fs);

      const priWireDia = priWireDiaInput > 0 ? priWireDiaInput : priRecommend.dia;
      const secWireDia = secWireDiaInput > 0 ? secWireDiaInput : secRecommend.dia;
      const priParallel = priParallelInput > 0 ? Math.ceil(priParallelInput) : Math.max(1, Math.ceil(priAreaRequired / wireArea(priWireDia)));
      const secParallel = secParallelInput > 0 ? Math.ceil(secParallelInput) : Math.max(1, Math.ceil(secAreaRequired / wireArea(secWireDia)));

      const priActualArea = wireArea(priWireDia) * priParallel;
      const secActualArea = wireArea(secWireDia) * secParallel;
      const priActualJ = iin / priActualArea;
      const secActualJ = io / secActualArea;

      const copperAreaRequired = (priAreaRequired * np) + (secAreaRequired * ns);
      const copperAreaActual = (priActualArea * np) + (secActualArea * ns);
      const usableWindow = aw * ku;
      const windowUsageRequired = (copperAreaRequired / usableWindow) * 100;
      const windowUsageActual = (copperAreaActual / usableWindow) * 100;

      const messages = [];
      if(ns !== nsIdeal){
        messages.push(`✓ 二次巻数：理論値 ${nsIdeal.toFixed(2)} turn → ${ns} turn に切り上げ`);
      }

      if(deltaB > bmax){
        messages.push("⚠ トランス：磁気飽和の可能性あり");
      }else if(deltaB > bmax * 0.9){
        messages.push("▲ トランス：磁束密度高め");
      }else{
        messages.push("✓ トランス：磁束密度 OK");
      }

      if(priActualJ > j || secActualJ > j){
        messages.push("⚠ 導線：指定線径/パラ数では電流密度が高すぎます");
      }else if(priActualJ > j * 0.9 || secActualJ > j * 0.9){
        messages.push("▲ 導線：電流密度が上限に近いです");
      }else{
        messages.push("✓ 導線：電流密度 OK");
      }

      if(windowUsageActual > 100){
        messages.push("⚠ 窓面積：巻線が窓に収まりません");
      }else if(windowUsageActual > 85){
        messages.push("▲ 窓面積：巻線密度高め");
      }else{
        messages.push("✓ 窓面積：OK");
      }

      const rows = [];
      addRow(rows, "巻数", "一次最小巻数 Np(min)", fmt(np_min, 2, "turn"));
      addRow(rows, "巻数", "一次巻数 Np", fmt(np, 0, "turn"));
      addRow(rows, "巻数", "二次巻数 Ns 理論値", fmt(nsIdeal, 2, "turn"));
      addRow(rows, "巻数", "二次巻数 Ns 採用値", `${fmt(ns, 0, "turn")}（切り上げ）`);
      addRow(rows, "巻数", "実際の巻数比 Np/Ns", fmt(actualRatio, 2, ""));
      addRow(rows, "巻数", "巻数比だけで見た二次電圧目安", fmt(voRatioOnly, 2, "V"));
      addRow(rows, "磁束", "実際の ΔB", fmt(deltaB, 3, "T"));
      addRow(rows, "電流", "一次側電流", fmt(iin, 2, "A"));
      addRow(rows, "電流", "二次側電流", fmt(io, 2, "A"));
      addRow(rows, "導線", "一次側 必要導体断面積", fmt(priAreaRequired, 2, "mm²"));
      addRow(rows, "導線", "二次側 必要導体断面積", fmt(secAreaRequired, 2, "mm²"));
      addRow(rows, "導線", "一次側 単線換算径", fmt(priDiaEquivalent, 2, "mm"));
      addRow(rows, "導線", "二次側 単線換算径", fmt(secDiaEquivalent, 2, "mm"));
      addRow(rows, "推奨", "一次側 推奨線径×パラ数", `φ${priRecommend.dia.toFixed(2)} mm × ${priRecommend.parallel}本`);
      addRow(rows, "推奨", "二次側 推奨線径×パラ数", `φ${secRecommend.dia.toFixed(2)} mm × ${secRecommend.parallel}本`);
      addRow(rows, "指定", "一次側 使用線径×パラ数", `φ${priWireDia.toFixed(2)} mm × ${priParallel}本`);
      addRow(rows, "指定", "二次側 使用線径×パラ数", `φ${secWireDia.toFixed(2)} mm × ${secParallel}本`);
      addRow(rows, "指定", "一次側 実効導体断面積 / 電流密度", `${fmt(priActualArea, 2, "mm²")} / ${fmt(priActualJ, 2, "A/mm²")}`);
      addRow(rows, "指定", "二次側 実効導体断面積 / 電流密度", `${fmt(secActualArea, 2, "mm²")} / ${fmt(secActualJ, 2, "A/mm²")}`);
      addRow(rows, "表皮効果", "銅の表皮深さ目安", fmt(priRecommend.skinDepth, 3, "mm"));
      addRow(rows, "窓面積", "必要断面積ベース使用率", fmt(windowUsageRequired, 1, "%"));
      addRow(rows, "窓面積", "指定線径ベース使用率", fmt(windowUsageActual, 1, "%"));
      addRow(rows, "窓面積", "使用可能窓面積", fmt(usableWindow, 1, "mm²"));

      const lmNoGap_uH = alNoGap_nH > 0 ? alNoGap_nH * np * np / 1000 : NaN;
      const imNoGap_pk = Number.isFinite(lmNoGap_uH) ? vin / (4 * fs * (lmNoGap_uH * 1e-6)) : NaN;
      addRow(rows, "ギャップなし", "無ギャップ想定Lm = AL×Np²", fmt(lmNoGap_uH, 2, "µH"));
      addRow(rows, "ギャップなし", "励磁電流目安 Vin/(4fsLm)", fmt(imNoGap_pk, 2, "A pk"));

      let indRows = {
        mode: "ギャップなし / トランス想定", indL: "—", indN: "—", indIpk: "—", bInd: "—", bsatUsage: "—", iSat: "—", iSafe: "—", energy: "—", alGapped: "—", gap: "—", gapHalf: "—", hApprox: "—", gapFromAl: "—", note: "ギャップ計算なし"
      };

      if(gapMode === "target_l"){
        indRows.mode = "目標Lから必要gを計算";
        if(indL_uH > 0 && npForGap > 0){
          const indL = indL_uH * 1e-6;
          const gap_m_simple = MU0 * npForGap * npForGap * ae / indL;
          const gap_mm_simple = gap_m_simple * 1000;
          const bInd = hasIndIpk ? indL * indIpk / (npForGap * ae) : NaN;
          const energy = hasIndIpk ? 0.5 * indL * indIpk * indIpk : NaN;
          const alGapped_nH = indL / (npForGap * npForGap) * 1e9;
          const iSat = bsat * npForGap * ae / indL;
          const iSafe = bsat * 0.8 * npForGap * ae / indL;
          const hApprox = (hasIndIpk && le_mm > 0) ? npForGap * indIpk / (le_mm * 1e-3) : NaN;
          let gapFromAl_mm = NaN;

          if(alNoGap_nH > 0){
            const alNoGap_H = alNoGap_nH * 1e-9;
            const alGap_H = alGapped_nH * 1e-9;
            gapFromAl_mm = MU0 * ae * (1 / alGap_H - 1 / alNoGap_H) * 1000;
          }

          if(hasIndIpk){
            if(bInd > bsat){
              messages.push("⚠ ギャップあり：BpkがBsatを超えています");
            }else if(bInd > bsat * 0.8){
              messages.push("▲ ギャップあり：BpkがBsatの80%を超えています");
            }else{
              messages.push("✓ ギャップあり：飽和判定 OK");
            }
          }else{
            messages.push("ℹ ギャップあり：Ipk未入力のためBpk・蓄積エネルギー・飽和判定は未計算");
          }

          indRows = {
            mode: "目標Lから必要gを計算",
            indL: fmt(indL_uH, 2, "µH"),
            indN: `${fmt(npForGap, 0, "turn")}（${npForGapNote}）`,
            indIpk: hasIndIpk ? fmt(indIpk, 2, "A") : "—（未入力）",
            bInd: fmt(bInd, 3, "T"),
            bsatUsage: fmt(bInd / bsat * 100, 1, "%"),
            iSat: fmt(iSat, 2, "A"),
            iSafe: fmt(iSafe, 2, "A"),
            energy: fmt(energy * 1000, 3, "mJ"),
            alGapped: fmt(alGapped_nH, 1, "nH/N²"),
            gap: fmt(gap_mm_simple, 3, "mm"),
            gapHalf: `${fmt(gap_mm_simple / 2, 3, "mm")} × 2面`,
            hApprox: fmt(hApprox, 0, "A/m"),
            gapFromAl: fmt(gapFromAl_mm, 3, "mm"),
            note: alNoGap_nH > 0 ? `無ギャップAL補正込みgも併記 / ${npForGapNote}` : `コア透磁率を無限大とした簡易g / ${npForGapNote}`
          };
        }else{
          messages.push("▲ 目標Lモード：Ltargetを入力すると必要ギャップgを計算します。Ipk未入力時はIpk関連のみ未計算です。Np_gapは0なら一次巻数Npを自動使用します");
        }
      }else if(gapMode === "given_g"){
        indRows.mode = "ギャップ長gからLを計算";
        if(gapG_mm > 0 && npForGap > 0){
          const gap_m = gapG_mm * 1e-3;
          const alSimple_H = MU0 * ae / gap_m;
          let alEff_H = alSimple_H;
          let note = "コア透磁率を無限大とした簡易L";

          if(alNoGap_nH > 0){
            const alNoGap_H = alNoGap_nH * 1e-9;
            alEff_H = 1 / ((1 / alNoGap_H) + (gap_m / (MU0 * ae)));
            note = "無ギャップAL補正込みL";
          }

          const indL = alEff_H * npForGap * npForGap;
          const indL_calc_uH = indL * 1e6;
          const bInd = hasIndIpk ? indL * indIpk / (npForGap * ae) : NaN;
          const energy = hasIndIpk ? 0.5 * indL * indIpk * indIpk : NaN;
          const alGapped_nH = alEff_H * 1e9;
          const iSat = bsat * npForGap * ae / indL;
          const iSafe = bsat * 0.8 * npForGap * ae / indL;
          const hApprox = (hasIndIpk && le_mm > 0) ? npForGap * indIpk / (le_mm * 1e-3) : NaN;

          if(hasIndIpk){
            if(bInd > bsat){
              messages.push("⚠ g指定：BpkがBsatを超えています");
            }else if(bInd > bsat * 0.8){
              messages.push("▲ g指定：BpkがBsatの80%を超えています");
            }else{
              messages.push("✓ g指定：飽和判定 OK");
            }
          }else{
            messages.push("ℹ g指定：Ipk未入力のためBpk・蓄積エネルギー・飽和判定は未計算");
          }

          indRows = {
            mode: "ギャップ長gからLを計算",
            indL: fmt(indL_calc_uH, 2, "µH"),
            indN: `${fmt(npForGap, 0, "turn")}（${npForGapNote}）`,
            indIpk: hasIndIpk ? fmt(indIpk, 2, "A") : "—（未入力）",
            bInd: fmt(bInd, 3, "T"),
            bsatUsage: fmt(bInd / bsat * 100, 1, "%"),
            iSat: fmt(iSat, 2, "A"),
            iSafe: fmt(iSafe, 2, "A"),
            energy: fmt(energy * 1000, 3, "mJ"),
            alGapped: fmt(alGapped_nH, 1, "nH/N²"),
            gap: fmt(gapG_mm, 3, "mm"),
            gapHalf: `${fmt(gapG_mm / 2, 3, "mm")} × 2面`,
            hApprox: fmt(hApprox, 0, "A/m"),
            gapFromAl: "—",
            note: `${note} / ${npForGapNote}`
          };
        }else{
          messages.push("▲ g指定モード：gを入力すると、そのギャップでのLを計算します。Ipk未入力時はIpk関連のみ未計算です。Np_gapは0なら一次巻数Npを自動使用します");
        }
      }else{
        messages.push("ℹ ギャップなし：通常トランス想定です。AL値を入れるとLm目安のみ表示します");
      }

      addRow(rows, "ギャップ", "計算モード", indRows.mode);
      addRow(rows, "ギャップ", "計算メモ", indRows.note);
      addRow(rows, "ギャップ/インダクタ", "目標/計算インダクタンス L", indRows.indL);
      addRow(rows, "ギャップ/インダクタ", "Lm計算に使用した巻数 N", indRows.indN);
      addRow(rows, "ギャップ/インダクタ", "ピーク電流 Ipk", indRows.indIpk);
      addRow(rows, "ギャップ/インダクタ", "Bpk = L×Ipk/(N×Ae)", indRows.bInd);
      addRow(rows, "ギャップ/インダクタ", "Bsatに対する使用率", indRows.bsatUsage);
      addRow(rows, "ギャップ/インダクタ", "飽和電流目安 Isat", indRows.iSat);
      addRow(rows, "ギャップ/インダクタ", "安全側ピーク電流目安 Bsat×80%", indRows.iSafe);
      addRow(rows, "ギャップ/インダクタ", "蓄積エネルギー", indRows.energy);
      addRow(rows, "ギャップ/インダクタ", "ギャップ後AL値", indRows.alGapped);
      addRow(rows, "ギャップ", "概算ギャップ長 lgap", indRows.gap);
      addRow(rows, "ギャップ", "中央脚片側ギャップ目安", indRows.gapHalf);
      addRow(rows, "インダクタ", "H目安 = N×Ipk/le", indRows.hApprox);
      addRow(rows, "ギャップ", "無ギャップAL補正込み lgap", indRows.gapFromAl);

      resultMessage.innerHTML = messages.join("<br>");
      resultTable.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>カテゴリ</th>
              <th>項目</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr><td>${row.category}</td><td>${row.item}</td><td>${row.result}</td></tr>`).join("")}
          </tbody>
        </table>
      `;

      const now = new Date().toLocaleString("ja-JP");
      latestCsvRows = [];
      addInputRows(latestCsvRows);
      latestCsvRows.push(["判定", "メッセージ", messages.join(" / ")]);
      for(const row of rows){
        latestCsvRows.push([row.category, row.item, row.result]);
      }
      latestCsvRows = latestCsvRows.map(row => [now, ...row]);
    }

    function exportTransformerCsv(){
      if(latestCsvRows.length === 0){
        calcTransformer();
      }
      if(latestCsvRows.length === 0){
        alert("CSV出力できる計算結果がありません。入力値を確認してください。");
        return;
      }

      const header = ["日時", "カテゴリ", "項目", "値"];
      const csv = [header, ...latestCsvRows]
        .map(row => row.map(csvEscape).join(","))
        .join("\r\n");

      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `transformer-result-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  