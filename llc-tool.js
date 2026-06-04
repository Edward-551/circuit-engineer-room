'use strict';

const $ = (id) => document.getElementById(id);
const inputIds = [
  'vinMin','vinNom','vinMax','voutMin','voutNom','voutMax','pout','pmax','eff','vf','windingMode','alValue','nsTurns','npManual','nManual',
  'fSwMax','fSwMin','frRatio','frH','plotFMin','plotFMax','qMin','qMax','qStep','qManual','powerList','gainYMax','voutYMin','voutYMax',
  'lrActual','crActual','lmManualEnable','lmActual','measuredMode','measuredLr','measuredLm','measuredCr','measuredN','measuredVpfc','measuredVo','measuredPo','measuredLoadList','measuredRectifier','measuredVf','measuredFswMin','measuredFswMax','fChk','cSw','deadTime','jPri','jSec','strandPri','strandSec'
];

function num(id, fallback = 0) {
  const el = $(id);
  if (!el) return fallback;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}

function isChecked(id) {
  const el = $(id);
  return !!(el && el.checked);
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


function parseMeasuredLoadRatios() {
  const text = ($('measuredLoadList')?.value || '').trim();
  let values = [];
  if (text) values = text.split(/[,、\s]+/).map(v => parseFloat(v));
  if (!values.length) values = [10, 25, 50, 100];
  return uniqueSorted(values)
    .filter(v => v > 0 && v <= 300)
    .slice(0, 12);
}

function qForPower(c, p) {
  const baseP = c.inputs.measuredMode ? c.inputs.measuredPo : c.inputs.pout;
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(baseP) || baseP <= 0) return NaN;
  return c.qUse * (p / baseP);
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

function measuredVoutFor(c, fKHz, pW) {
  const g = gainFor(c, fKHz, pW);
  if (!Number.isFinite(g)) return NaN;
  return (c.inputs.measuredVpfc * g) / (2 * c.n) - (c.inputs.measuredVoEff - c.inputs.measuredVo);
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


function findPeakFrequency(k, q, frH, fMinK, fMaxK) {
  let max = -Infinity;
  let fAt = NaN;
  const start = Math.max(0.1, Math.min(fMinK, fMaxK));
  const end = Math.max(start + 0.1, Math.max(fMinK, fMaxK));
  for (let i = 0; i <= 1600; i++) {
    const f = start + (end - start) * i / 1600;
    const g = llcGain((f * 1000) / frH, q, k);
    if (Number.isFinite(g) && g > max) {
      max = g;
      fAt = f;
    }
  }
  return { max, fAt };
}

function peakJudgeText(c) {
  if (!Number.isFinite(c.fPeakRatedK)) return 'fpeakを算出できません。';
  const fmin = c.inputs.measuredMode ? c.inputs.measuredFswMinK : c.inputs.fSwMinK;
  if (!Number.isFinite(fmin) || fmin <= 0) return '実測モードではfminは未計算です。実測fsw(min)を入力すると判定できます。';
  const ratio = fmin / c.fPeakRatedK;
  if (fmin > c.fPeakRatedK * 1.05) return `OK：fminがfpeakより右側です。余裕率 fmin/fpeak=${fmt(ratio, 3)}`;
  if (fmin >= c.fPeakRatedK) return `注意：fminはfpeak以上ですが余裕が小さいです。余裕率 fmin/fpeak=${fmt(ratio, 3)}`;
  return `NG：fminがfpeakより左側です。Lmを下げる、fminを上げる、frL/frH比や巻数比を見直してください。余裕率 fmin/fpeak=${fmt(ratio, 3)}`;
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
  const windingMode = $('windingMode')?.value || 'autoAl';
  const alValue = Math.max(0.001, num('alValue', 250)); // nH/turn^2
  const nsInput = Math.max(1, Math.round(num('nsTurns', 5)));
  const npManualInput = maybeNum('npManual');
  const nManual = maybeNum('nManual');

  const fSwMaxK = num('fSwMax', 300);
  const fSwMinK = num('fSwMin', 130);
  const ratio = Math.max(1.01, num('frRatio', 2.3));
  const frHDesignK = num('frH', 230);
  const frHDesign = frHDesignK * 1000;
  const frLDesignK = frHDesignK / ratio;
  const kDesign = ratio * ratio - 1;

  // Vinmax / Voutmin basis. This prevents excessive output voltage at high bus and low output setting.
  const nCalc = vinMax / (2 * (voutMin + vf));
  const nTarget = (windingMode === 'manualN' && Number.isFinite(nManual) && nManual > 0) ? nManual : nCalc;
  const ioutNom = pout / voutNom;
  const ioutMax = pmax / voutMin;
  const pin = pout / eff;
  const routNom = (voutNom * voutNom) / pout;
  const routMaxLoad = (voutMax * voutMax) / pout;
  const racSec = 8 * routNom / (Math.PI * Math.PI);

  const qMin = Math.max(0.01, num('qMin', 0.15));
  const qMax = Math.max(qMin, num('qMax', 1.2));
  const qStep = Math.max(0.001, num('qStep', 0.01));
  const qManual = maybeNum('qManual');

  function designForN(nValue) {
    const racPriValue = nValue * nValue * racSec;
    const gReqLowValue = 2 * nValue * (voutMax + vf) / vinMin;
    const gReqNomValue = 2 * nValue * (voutNom + vf) / vinNom;
    const gReqHighValue = 2 * nValue * (voutMin + vf) / vinMax;
    const gReqMaxValue = Math.max(gReqLowValue, gReqNomValue, gReqHighValue);
    const gReqMinValue = Math.min(gReqLowValue, gReqNomValue, gReqHighValue);

    const candidatesValue = [];
    for (let q = qMin; q <= qMax + qStep / 2; q += qStep) {
      const qFixed = Number(q.toFixed(5));
      const peak = maxGainInRange(kDesign, qFixed, frHDesign, fSwMinK, frHDesignK);
      const gainAtFmin = llcGain((fSwMinK * 1000) / frHDesign, qFixed, kDesign);
      candidatesValue.push({ q: qFixed, peakGain: peak.max, peakFreqK: peak.fAt, gainAtFmin, ok: peak.max >= gReqMaxValue });
    }
    const okCandidatesValue = candidatesValue.filter(c => c.ok);
    const qRecommendedValue = okCandidatesValue.length ? okCandidatesValue[okCandidatesValue.length - 1].q : qMin;
    const qDesignValue = Number.isFinite(qManual) && qManual > 0 ? qManual : qRecommendedValue;
    const qSelectedInfoValue = candidatesValue.reduce((best, cur) => Math.abs(cur.q - qDesignValue) < Math.abs(best.q - qDesignValue) ? cur : best, candidatesValue[0] || { q: qDesignValue, peakGain: NaN, peakFreqK: NaN, gainAtFmin: NaN, ok: false });

    const z0DesignValue = qDesignValue * racPriValue;
    const lrDesignValue = z0DesignValue / (2 * Math.PI * frHDesign);
    const crDesignValue = 1 / (Math.pow(2 * Math.PI * frHDesign, 2) * lrDesignValue);
    const lmDesignValue = kDesign * lrDesignValue;

    return {
      racPri: racPriValue,
      gReqLow: gReqLowValue,
      gReqNom: gReqNomValue,
      gReqHigh: gReqHighValue,
      gReqMax: gReqMaxValue,
      gReqMin: gReqMinValue,
      candidates: candidatesValue,
      okCandidates: okCandidatesValue,
      qRecommended: qRecommendedValue,
      qDesign: qDesignValue,
      qSelectedInfo: qSelectedInfoValue,
      z0Design: z0DesignValue,
      lrDesign: lrDesignValue,
      crDesign: crDesignValue,
      lmDesign: lmDesignValue
    };
  }

  let n = nTarget;
  let npUse = NaN;
  let nsTurns = nsInput;
  let npCalc = nTarget * nsInput;
  let npFromAlRaw = NaN;
  let windingNote = '';

  if (windingMode === 'autoAl') {
    // Iterate lightly because Lm changes when the final integer Np/Ns changes the actual n.
    for (let i = 0; i < 3; i++) {
      const d = designForN(n);
      npFromAlRaw = Math.sqrt((d.lmDesign * 1e9) / alValue);
      npUse = Math.max(1, Math.ceil(npFromAlRaw));
      nsTurns = Math.max(1, Math.round(npUse / nTarget));
      n = npUse / nsTurns;
    }
    windingNote = `AL=${fmt(alValue, 1)}nH/T²からNpを算出。Npは切り上げ、Nsは目標nに近い整数。`;
  } else if (windingMode === 'manualTurns') {
    npUse = Math.max(1, Math.round(Number.isFinite(npManualInput) ? npManualInput : nTarget * nsInput));
    nsTurns = nsInput;
    n = npUse / nsTurns;
    windingNote = '一次/二次巻数を任意指定。nはNp/Nsから算出。';
  } else if (windingMode === 'manualNs') {
    nsTurns = nsInput;
    npCalc = nTarget * nsTurns;
    npUse = Math.max(1, Math.round(npCalc));
    n = npUse / nsTurns;
    windingNote = '二次巻数を任意指定。Npは目標n×Nsを四捨五入。';
  } else {
    nsTurns = nsInput;
    npCalc = nTarget * nsTurns;
    npUse = Math.max(1, Math.round(npCalc));
    n = npUse / nsTurns;
    windingNote = '巻数比を手入力。実巻数比は整数Np/Nsから算出。';
  }

  const measuredModePre = isChecked('measuredMode');
  const measuredNPre = maybeNum('measuredN');
  if (measuredModePre && Number.isFinite(measuredNPre) && measuredNPre > 0) {
    n = measuredNPre;
    npCalc = n * nsTurns;
    npUse = npCalc;
    windingNote = '実測モード：巻数比nを実測値で上書き。Np/Nsは参考表示です。';
  }

  const d = designForN(n);
  const racPri = d.racPri;
  const gReqLow = d.gReqLow;
  const gReqNom = d.gReqNom;
  const gReqHigh = d.gReqHigh;
  const gReqMax = d.gReqMax;
  const gReqMin = d.gReqMin;
  const candidates = d.candidates;
  const okCandidates = d.okCandidates;
  const qRecommended = d.qRecommended;
  const qDesign = d.qDesign;
  const qSelectedInfo = d.qSelectedInfo;
  const z0Design = d.z0Design;
  const lrDesign = d.lrDesign;
  const crDesign = d.crDesign;
  const lmDesign = d.lmDesign;

  const lrActualInput = maybeNum('lrActual');
  const crActualInput = maybeNum('crActual');
  const lmManualEnable = isChecked('lmManualEnable');
  const lmActualInput = maybeNum('lmActual');
  const measuredMode = isChecked('measuredMode');
  const measuredLrInput = maybeNum('measuredLr');
  const measuredLmInput = maybeNum('measuredLm');
  const measuredCrInput = maybeNum('measuredCr');
  const measuredNInput = maybeNum('measuredN');
  const measuredVpfcInput = maybeNum('measuredVpfc');
  const measuredVoInput = maybeNum('measuredVo');
  const measuredPoInput = maybeNum('measuredPo');
  const measuredRectifier = $('measuredRectifier')?.value || 'ct';
  const measuredVfInput = maybeNum('measuredVf');
  const measuredFswMinInput = maybeNum('measuredFswMin');
  const measuredFswMaxInput = maybeNum('measuredFswMax');
  const lrSourceUH = (measuredMode && Number.isFinite(measuredLrInput)) ? measuredLrInput : (Number.isFinite(lrActualInput) ? lrActualInput : lrDesign * 1e6);
  const crSourceNF = (measuredMode && Number.isFinite(measuredCrInput)) ? measuredCrInput : (Number.isFinite(crActualInput) ? crActualInput : crDesign * 1e9);
  const lmSourceUH = (measuredMode && Number.isFinite(measuredLmInput)) ? measuredLmInput : (lmManualEnable && Number.isFinite(lmActualInput) ? lmActualInput : lmDesign * 1e6);
  const lrUse = lrSourceUH * 1e-6;
  const crUse = crSourceNF * 1e-9;
  const lmUse = lmSourceUH * 1e-6;

  const frHActual = 1 / (2 * Math.PI * Math.sqrt(lrUse * crUse));
  const frHActualK = frHActual / 1000;
  const frLActual = 1 / (2 * Math.PI * Math.sqrt((lrUse + lmUse) * crUse));
  const frLActualK = frLActual / 1000;
  const kActual = lmUse / lrUse;
  const ratioActual = frHActual / frLActual;
  const z0Actual = Math.sqrt(lrUse / crUse);
  const measuredVpfc = (measuredMode && Number.isFinite(measuredVpfcInput) && measuredVpfcInput > 0) ? measuredVpfcInput : vinNom;
  const measuredVo = (measuredMode && Number.isFinite(measuredVoInput) && measuredVoInput > 0) ? measuredVoInput : voutNom;
  const measuredPo = (measuredMode && Number.isFinite(measuredPoInput) && measuredPoInput > 0) ? measuredPoInput : pout;
  const measuredVf = (measuredMode && Number.isFinite(measuredVfInput)) ? measuredVfInput : vf;
  const rectifierDropFactor = measuredRectifier === 'bridge' ? 2 : (measuredRectifier === 'sr' ? 0 : 1);
  const measuredVoEff = measuredVo + rectifierDropFactor * measuredVf;
  const measuredRout = (measuredVo * measuredVo) / measuredPo;
  const measuredRacSec = 8 * measuredRout / (Math.PI * Math.PI);
  const measuredRacPri = n * n * measuredRacSec;
  const qUse = measuredMode ? (z0Actual / measuredRacPri) : (z0Actual / racPri);
  const measuredMreq = (2 * n * measuredVoEff) / measuredVpfc;
  const peakRated = findPeakFrequency(kActual, qUse, frHActual, Math.max(1, frLActualK * 0.7), frHActualK);
  const fPeakRatedK = peakRated.fAt;
  const peakGainRated = peakRated.max;
  const measuredGainMargin = Number.isFinite(measuredMreq) && measuredMreq > 0 ? peakGainRated / measuredMreq : NaN;
  const judgeFminK = (measuredMode && Number.isFinite(measuredFswMinInput)) ? measuredFswMinInput : fSwMinK;
  const fminPeakRatio = judgeFminK / fPeakRatedK;
  const gainAtFminRated = llcGain((fSwMinK * 1000) / frHActual, qUse, kActual);

  const fChkK = num('fChk', frHActualK);
  const fChk = fChkK * 1000;
  const cSw = num('cSw', 350) * 1e-12;
  const deadTime = num('deadTime', 150) * 1e-9;
  const jPri = Math.max(0.1, num('jPri', 5.0));
  const jSec = Math.max(0.1, num('jSec', 6.0));
  const strandPri = Math.max(0.001, num('strandPri', 0.10));
  const strandSec = Math.max(0.001, num('strandSec', 0.10));
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

  const lpUse = lmUse + lrUse;
  const kCoupling = Math.sqrt(lmUse / lpUse);
  const nEq = kCoupling * n;
  const iResoWindingRms = Math.PI * ioutNom / (nEq * 2 * Math.SQRT2);
  const iResoWindingMaxRms = Math.PI * ioutMax / (nEq * 2 * Math.SQRT2);
  const iLmWindingRms = imRmsTri;
  const iPriWindingRms = Math.sqrt(iLmWindingRms * iLmWindingRms + iResoWindingRms * iResoWindingRms);
  const iPriWindingMaxRms = Math.sqrt(iLmWindingRms * iLmWindingRms + iResoWindingMaxRms * iResoWindingMaxRms);
  const iSecWindingRms = Math.PI * ioutNom / 4;
  const iSecWindingMaxRms = Math.PI * ioutMax / 4;
  const priCuAreaReq = iPriWindingMaxRms / jPri;
  const secCuAreaReq = iSecWindingMaxRms / jSec;
  const strandPriArea = Math.PI * strandPri * strandPri / 4;
  const strandSecArea = Math.PI * strandSec * strandSec / 4;
  const strandPriCount = Math.ceil(priCuAreaReq / strandPriArea);
  const strandSecCount = Math.ceil(secCuAreaReq / strandSecArea);

  const powers = parsePowerSeries(pout, pmax);

  return {
    inputs: { vinMin, vinNom, vinMax, voutMin, voutNom, voutMax, pout, pmax, eff, vf, windingMode, alValue, nsTurns, npManual: Number.isFinite(npManualInput) ? npManualInput : null, nManual, fSwMaxK, fSwMinK, ratio, frHDesignK, qMin, qMax, qStep, qManual, lmManualEnable, measuredMode, measuredLr: Number.isFinite(measuredLrInput) ? measuredLrInput : null, measuredLm: Number.isFinite(measuredLmInput) ? measuredLmInput : null, measuredCr: Number.isFinite(measuredCrInput) ? measuredCrInput : null, measuredN: Number.isFinite(measuredNInput) ? measuredNInput : null, measuredVpfc, measuredVo, measuredPo, measuredLoadRatios: parseMeasuredLoadRatios(), measuredRectifier, measuredVf, measuredVoEff, measuredFswMinK: Number.isFinite(measuredFswMinInput) ? measuredFswMinInput : null, measuredFswMaxK: Number.isFinite(measuredFswMaxInput) ? measuredFswMaxInput : null, fChkK, cSwPf: cSw * 1e12, deadTimeNs: deadTime * 1e9, jPri, jSec, strandPri, strandSec },
    nCalc, nTarget, npCalc, npFromAlRaw, npUse, nsTurns, n, windingNote,
    ioutNom, ioutMax, pin, routNom, routMaxLoad, racSec, racPri, measuredRout, measuredRacSec, measuredRacPri, measuredMreq, measuredGainMargin,
    frLDesignK, kDesign, gReqLow, gReqNom, gReqHigh, gReqMax, gReqMin,
    candidates, okCandidates, qRecommended, qDesign, qSelectedInfo,
    z0Design, lrDesign, crDesign, lmDesign,
    lrUse, crUse, lmUse, frHActual, frHActualK, frLActual, frLActualK, kActual, ratioActual, z0Actual, qUse,
    fPeakRatedK, peakGainRated, fminPeakRatio, gainAtFminRated,
    powers, imPk, imRmsTri, iLoadPriRms, iResRms, eLm, eCsw, tDeadMin, zvsEnergyMargin, deadTimeMargin,
    lpUse, kCoupling, nEq, iResoWindingRms, iResoWindingMaxRms, iLmWindingRms, iPriWindingRms, iPriWindingMaxRms,
    iSecWindingRms, iSecWindingMaxRms, priCuAreaReq, secCuAreaReq, strandPriArea, strandSecArea, strandPriCount, strandSecCount
  };
}

function renderSummary(c) {
  const cards = [
    ['実巻数比 n', `${fmt(c.n, 3)} : 1`],
    ['一次巻数 Np', `${Math.round(c.npUse)} turn`],
    ['二次巻数 Ns', `${Math.round(c.nsTurns)} turn`],
    ['frH / frL', `${fmt(c.frHActualK, 2)} / ${fmt(c.frLActualK, 2)} kHz`],
    ['fpeak / fmin', c.inputs.measuredMode ? `${fmt(c.fPeakRatedK, 2)} / ${Number.isFinite(c.inputs.measuredFswMinK) ? fmt(c.inputs.measuredFswMinK, 2) : '-'} kHz` : `${fmt(c.fPeakRatedK, 2)} / ${fmt(c.inputs.fSwMinK, 2)} kHz`],
    ['K = Lm/Lr', `${fmt(c.kActual, 3)}`],
    ['必要最大ゲイン', `${fmt(c.gReqMax, 3)}`],
    ['推奨Q', `${fmt(c.qRecommended, 3)}`],
    ['使用Q', `${fmt(c.qUse, 3)}`],
    ['実測必要Gain', `${c.inputs.measuredMode ? fmt(c.measuredMreq, 3) : '-'}`],
    ['実測Gain余裕', `${c.inputs.measuredMode ? fmt(c.measuredGainMargin, 3) + ' 倍' : '-'}`],
    ['Z0', `${fmt(c.z0Actual, 3)} Ω`],
    ['Lr', `${fmt(c.lrUse * 1e6, 3)} µH`],
    ['Cr', `${fmt(c.crUse * 1e9, 3)} nF`],
    ['Lm', `${fmt(c.lmUse * 1e6, 3)} µH${c.inputs.measuredMode ? ' 実測' : (c.inputs.lmManualEnable ? ' 手動' : '')}`],
    ['評価モード', `${c.inputs.measuredMode ? '実測値逆算' : '設計/実部品検証'}`],
    ['ゲイン余裕', `${fmt(c.peakGainRated / c.gReqMax, 3)} 倍`],
    ['fmin/fpeak', `${fmt(c.fminPeakRatio, 3)} 倍`],
    ['励磁電流 Im_pk', `${fmt(c.imPk, 3)} A`],
    ['一次換算負荷電流', `${fmt(c.iLoadPriRms, 3)} Arms`],
    ['共振電流 目安', `${fmt(c.iResRms, 3)} Arms`],
    ['等価巻数比 neq', `${fmt(c.nEq, 3)} : 1`],
    ['一次巻線電流', `${fmt(c.iPriWindingMaxRms, 3)} Arms(max)`],
    ['二次巻線電流', `${fmt(c.iSecWindingMaxRms, 3)} Arms(max)`],
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

function getStepRows(c) {
  return [
    ['STEP1 仕様入力', `Vin=${fmt(c.inputs.vinMin, 1)}/${fmt(c.inputs.vinNom, 1)}/${fmt(c.inputs.vinMax, 1)}V、Vout=${fmt(c.inputs.voutMin, 2)}/${fmt(c.inputs.voutNom, 2)}/${fmt(c.inputs.voutMax, 2)}V、Pout=${fmt(c.inputs.pout, 1)}W、Pmax=${fmt(c.inputs.pmax, 1)}W`],
    ['STEP2 巻線決定', `${c.windingNote} 目標n=${fmt(c.nTarget, 4)}、Np=${Math.round(c.npUse)}turn、Ns=${Math.round(c.nsTurns)}turn、実n=${fmt(c.n, 4)}${Number.isFinite(c.npFromAlRaw) ? `、Np(AL計算値)=${fmt(c.npFromAlRaw, 3)}turn` : ''}`],
    ['STEP3 周波数条件', `fmin=${fmt(c.inputs.fSwMinK, 1)}kHz、fmax=${fmt(c.inputs.fSwMaxK, 1)}kHz、frH=${fmt(c.inputs.frHDesignK, 1)}kHz、frL=${fmt(c.frLDesignK, 1)}kHz、K=${fmt(c.kDesign, 3)}`],
    ['STEP4 必要ゲイン', `Vinmin/Voutmax: ${fmt(c.gReqLow, 3)}、Vinnom/Voutnom: ${fmt(c.gReqNom, 3)}、Vinmax/Voutmin: ${fmt(c.gReqHigh, 3)}、必要最大=${fmt(c.gReqMax, 3)}`],
    ['STEP5 Q選定', `${qJudgement(c)} 使用Q=${fmt(c.qDesign, 3)}、選択Qのピーク=${fmt(c.qSelectedInfo.peakGain, 3)} @ ${fmt(c.qSelectedInfo.peakFreqK, 1)}kHz`],
    ['STEP6 反射負荷', c.inputs.measuredMode ? `Ro(実測)=${fmt(c.measuredRout, 3)}Ω、Rac(sec)=8Ro/π²=${fmt(c.measuredRacSec, 3)}Ω、Rac(primary)=n²Rac=${fmt(c.measuredRacPri, 3)}Ω` : `Rout(nom)=${fmt(c.routNom, 3)}Ω、Rac(sec)=8Rout/π²=${fmt(c.racSec, 3)}Ω、Rac(primary)=n²Rac=${fmt(c.racPri, 3)}Ω`],
    ['STEP7 共振部品 推奨値', `Z0=${fmt(c.z0Design, 3)}Ω、Lr=${fmt(c.lrDesign * 1e6, 3)}µH、Cr=${fmt(c.crDesign * 1e9, 3)}nF、Lm=${fmt(c.lmDesign * 1e6, 3)}µH`],
    ['STEP8 実部品値/実測値', `モード=${c.inputs.measuredMode ? '実測モード' : '設計検証モード'}、Lr=${fmt(c.lrUse*1e6, 3)}µH、Lm=${fmt(c.lmUse*1e6, 3)}µH、Cr=${fmt(c.crUse*1e9, 3)}nF、frH=${fmt(c.frHActualK, 3)}kHz、frL=${fmt(c.frLActualK, 3)}kHz、fpeak=${fmt(c.fPeakRatedK, 3)}kHz、frH/frL=${fmt(c.ratioActual, 3)}、K=${fmt(c.kActual, 3)}、Q=${fmt(c.qUse, 3)}${c.inputs.measuredMode ? `、Vpfc=${fmt(c.inputs.measuredVpfc,1)}V、Vo=${fmt(c.inputs.measuredVo,2)}V、Po=${fmt(c.inputs.measuredPo,1)}W、Mreq=${fmt(c.measuredMreq,3)}、Peak/Mreq=${fmt(c.measuredGainMargin,3)}` : ''}`],
    ['STEP8-2 fpeak判定', peakJudgeText(c)],
    ['STEP9 電流目安', `fchk=${fmt(c.inputs.fChkK, 1)}kHz、Im_pk=${fmt(c.imPk, 3)}A、Im_rms≈${fmt(c.imRmsTri, 3)}A、Iload_pri≈${fmt(c.iLoadPriRms, 3)}Arms、Ir≈${fmt(c.iResRms, 3)}Arms`],
    ['STEP10 巻線電流・リッツ線目安', `kc=√(Lm/(Lm+Lr))=${fmt(c.kCoupling, 4)}、neq=kc×n=${fmt(c.nEq, 4)}、Ireso=${fmt(c.iResoWindingRms, 3)}Arms(${fmt(c.iResoWindingMaxRms, 3)}Arms max)、Ipri=${fmt(c.iPriWindingRms, 3)}Arms(${fmt(c.iPriWindingMaxRms, 3)}Arms max)、Isec=${fmt(c.iSecWindingRms, 3)}Arms(${fmt(c.iSecWindingMaxRms, 3)}Arms max)、一次必要Cu=${fmt(c.priCuAreaReq, 3)}mm² ≒ φ${fmt(c.inputs.strandPri, 3)}×${c.strandPriCount}本、二次必要Cu=${fmt(c.secCuAreaReq, 3)}mm² ≒ φ${fmt(c.inputs.strandSec, 3)}×${c.strandSecCount}本`],
    ['STEP11 ZVS目安', `ELm=${fmt(c.eLm * 1e6, 3)}µJ、ECsw=${fmt(c.eCsw * 1e6, 3)}µJ、tdead_min≈${fmt(c.tDeadMin * 1e9, 3)}ns、設定/最小=${fmt(c.deadTimeMargin, 3)}倍`]
  ];
}

function renderSteps(c) {
  const rows = getStepRows(c);
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
  if (label) ctx.fillText(label, x + 5, pad.t + 16);
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
  drawVerticalLine(ctx, scale, c.fPeakRatedK, 'fpeak', '#9333ea', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frHActualK, 'frH', '#475569', xMin, xMax);
  drawVerticalLine(ctx, scale, c.inputs.fSwMaxK, '', '#2563eb', xMin, xMax);

  drawPlotFrame(ctx, scale);

  renderLegend('gainLegend', getGainLegendItems(c));
}

function drawVoChart(c) {
  const canvas = $('voChart');
  const ctx = canvas.getContext('2d');
  const xMin = num('plotFMin', 0);
  const xMax = Math.max(xMin + 10, num('plotFMax', c.inputs.fSwMaxK));
  const autoYMin = Math.max(0, c.inputs.voutMin * 0.65);
  const autoYMax = Math.max(c.inputs.voutMax * 1.35, c.inputs.voutMax + 5);
  const yMinInput = maybeNum('voutYMin');
  const yMaxInput = maybeNum('voutYMax');
  const yMin = Number.isFinite(yMinInput) ? yMinInput : autoYMin;
  const yMax = Math.max(yMin + 1, Number.isFinite(yMaxInput) ? yMaxInput : autoYMax);
  const scale = chartScales(canvas, xMin, xMax, yMin, yMax);
  drawBase(ctx, scale, xMin, xMax, yMin, yMax, 'Vout [V]', 'fsw [kHz]');

  const cases = getVoCases(c);

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
  drawVerticalLine(ctx, scale, c.fPeakRatedK, 'fpeak', '#9333ea', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frHActualK, 'frH', '#475569', xMin, xMax);
  drawVerticalLine(ctx, scale, c.inputs.fSwMaxK, '', '#2563eb', xMin, xMax);

  drawPlotFrame(ctx, scale);

  renderLegend('voLegend', getVoLegendItems(c));
}


function getGainLegendItems(c) {
  const items = c.powers.map((p, i) => ({
    color: palette[i % palette.length],
    text: `${fmt(p, 0)}W / Q=${fmt(qForPower(c, p), 3)}${Math.abs(p - c.inputs.pout) < 0.001 ? '（定格）' : ''}`
  }));
  items.push({ color: '#b45309', text: `必要Gain: Vinmin/Voutmax = ${fmt(c.gReqLow, 3)}` });
  items.push({ color: '#64748b', text: `必要Gain: Vinmax/Voutmin = ${fmt(c.gReqHigh, 3)}` });
  items.push({ color: '#9333ea', text: `fpeak=${fmt(c.fPeakRatedK, 2)}kHz / ${peakJudgeText(c)}` });
  return items;
}

function getVoCases(c) {
  return [
    { vin: c.inputs.vinMax, p: Math.min(...c.powers), label: `Vin=${fmt(c.inputs.vinMax, 0)}V / P=${fmt(Math.min(...c.powers), 0)}W`, color: '#2563eb', width: 2 },
    { vin: c.inputs.vinMax, p: c.inputs.pout, label: `Vin=${fmt(c.inputs.vinMax, 0)}V / P=${fmt(c.inputs.pout, 0)}W`, color: '#0f766e', width: 2.5 },
    { vin: c.inputs.vinNom, p: c.inputs.pout, label: `Vin=${fmt(c.inputs.vinNom, 0)}V / P=${fmt(c.inputs.pout, 0)}W`, color: '#7c3aed', width: 2.5 },
    { vin: c.inputs.vinMin, p: c.inputs.pout, label: `Vin=${fmt(c.inputs.vinMin, 0)}V / P=${fmt(c.inputs.pout, 0)}W`, color: '#ea580c', width: 2.5 },
    { vin: c.inputs.vinMin, p: c.inputs.pmax, label: `Vin=${fmt(c.inputs.vinMin, 0)}V / P=${fmt(c.inputs.pmax, 0)}W`, color: '#dc2626', width: 3 }
  ];
}

function getVoLegendItems(c) {
  const items = getVoCases(c).map(s => ({ color: s.color, text: s.label }));
  items.push({ color: '#64748b', text: `Vout min = ${fmt(c.inputs.voutMin, 2)}V` });
  items.push({ color: '#b45309', text: `Vout nom = ${fmt(c.inputs.voutNom, 2)}V` });
  items.push({ color: '#dc2626', text: `Vout max = ${fmt(c.inputs.voutMax, 2)}V` });
  items.push({ color: '#9333ea', text: `fpeak=${fmt(c.fPeakRatedK, 2)}kHz / ${peakJudgeText(c)}` });
  return items;
}

function renderLegend(id, items) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items.map(item => `<span class="line" style="background:${item.color}"></span>${item.text}`).join(' ');
}

function measuredMapPoints(c) {
  const pts = [
    { key: 'frL', label: 'frL', f: c.frLActualK, color: '#0f766e' },
    { key: 'fpeak', label: 'fpeak', f: c.fPeakRatedK, color: '#9333ea' },
    { key: 'frH', label: 'frH', f: c.frHActualK, color: '#475569' }
  ];
  if (Number.isFinite(c.inputs.measuredFswMinK) && c.inputs.measuredFswMinK > 0) pts.push({ key: 'fswMin', label: '実測fsw(min)', f: c.inputs.measuredFswMinK, color: '#dc2626' });
  if (Number.isFinite(c.inputs.measuredFswMaxK) && c.inputs.measuredFswMaxK > 0) pts.push({ key: 'fswMax', label: '実測fsw(max)', f: c.inputs.measuredFswMaxK, color: '#2563eb' });
  return pts.filter(p => Number.isFinite(p.f) && p.f > 0).sort((a, b) => a.f - b.f);
}

function drawMeasuredMap(c) {
  const canvas = $('measuredMapChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pts = measuredMapPoints(c);
  if (!pts.length) return;
  const minF = Math.min(...pts.map(p => p.f));
  const maxF = Math.max(...pts.map(p => p.f));
  const xMin = Math.max(0, minF * 0.75);
  const xMax = Math.max(xMin + 10, maxF * 1.2);
  const yMin = 0;
  const yMax = 1;
  const scale = chartScales(canvas, xMin, xMax, yMin, yMax);
  drawBase(ctx, scale, xMin, xMax, yMin, yMax, '', 'frequency [kHz]');

  const axisY = scale.yToPx(0.5);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(scale.xToPx(xMin), axisY);
  ctx.lineTo(scale.xToPx(xMax), axisY);
  ctx.stroke();

  const fmin = c.inputs.measuredFswMinK;
  const fmax = c.inputs.measuredFswMaxK;
  if (Number.isFinite(fmin) && Number.isFinite(fmax) && fmin > 0 && fmax > fmin) {
    const x1 = scale.xToPx(fmin);
    const x2 = scale.xToPx(fmax);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.10)';
    ctx.fillRect(x1, scale.yToPx(0.78), x2 - x1, scale.yToPx(0.22) - scale.yToPx(0.78));
    ctx.strokeStyle = '#2563eb';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x1, scale.yToPx(0.78), x2 - x1, scale.yToPx(0.22) - scale.yToPx(0.78));
    ctx.setLineDash([]);
    ctx.fillStyle = '#2563eb';
    ctx.font = '14px sans-serif';
    ctx.fillText('実測動作範囲', x1 + 6, scale.yToPx(0.82));
  }

  pts.forEach((p, i) => {
    const x = scale.xToPx(p.f);
    const yTop = scale.yToPx(0.82);
    const yBot = scale.yToPx(0.18);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, axisY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    const labelY = i % 2 === 0 ? yTop - 10 : yBot + 22;
    ctx.fillText(`${p.label}`, x, labelY);
    ctx.fillText(`${fmt(p.f, 2)}kHz`, x, labelY + 15);
  });
  ctx.textAlign = 'left';
  drawPlotFrame(ctx, scale);
  renderLegend('measuredMapLegend', getMeasuredMapLegendItems(c));
}

function getMeasuredMapLegendItems(c) {
  const items = [
    { color: '#0f766e', text: `frL=${fmt(c.frLActualK, 2)}kHz` },
    { color: '#9333ea', text: `fpeak=${fmt(c.fPeakRatedK, 2)}kHz` },
    { color: '#475569', text: `frH=${fmt(c.frHActualK, 2)}kHz` },
    { color: '#64748b', text: `K=Lm/Lr=${fmt(c.kActual, 3)} / frH/frL=${fmt(c.ratioActual, 3)}` }
  ];
  if (Number.isFinite(c.inputs.measuredFswMinK)) items.push({ color: '#dc2626', text: `実測fsw(min)=${fmt(c.inputs.measuredFswMinK, 2)}kHz / ${peakJudgeText(c)}` });
  if (Number.isFinite(c.inputs.measuredFswMaxK)) items.push({ color: '#2563eb', text: `実測fsw(max)=${fmt(c.inputs.measuredFswMaxK, 2)}kHz` });
  if (!Number.isFinite(c.inputs.measuredFswMinK)) items.push({ color: '#dc2626', text: 'fmin判定：実測fsw(min)未入力' });
  return items;
}

function drawMeasuredGainChart(c) {
  const canvas = $('measuredGainChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const points = measuredMapPoints(c);
  const validFreqs = points.map(p => p.f).filter(v => Number.isFinite(v) && v > 0);
  const xMinDefault = validFreqs.length ? Math.max(0, Math.min(...validFreqs) * 0.75) : Math.max(0, c.frLActualK * 0.7);
  const xMaxDefault = validFreqs.length ? Math.max(...validFreqs) * 1.2 : c.frHActualK * 1.8;
  const xMin = Math.max(0, Number.isFinite(num('plotFMin', NaN)) ? num('plotFMin', xMinDefault) : xMinDefault);
  const xMax = Math.max(xMin + 10, Number.isFinite(num('plotFMax', NaN)) ? num('plotFMax', xMaxDefault) : xMaxDefault);
  const yMin = 0;
  const yMax = Math.max(num('gainYMax', 2.0), c.peakGainRated * 1.15, c.measuredMreq * 1.25, 0.5);
  const scale = chartScales(canvas, xMin, xMax, yMin, yMax);
  drawBase(ctx, scale, xMin, xMax, yMin, yMax, 'Gain', 'fsw [kHz]');

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 900; i++) {
    const f = xMin + (xMax - xMin) * i / 900;
    const xNorm = (f * 1000) / c.frHActual;
    const g = llcGain(xNorm, c.qUse, c.kActual);
    if (!Number.isFinite(g)) continue;
    const x = scale.xToPx(f);
    const y = scale.yToPx(clamp(g, yMin, yMax));
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  drawHorizontalLine(ctx, scale, c.measuredMreq, `Mreq ${fmt(c.measuredMreq, 3)}`, '#b45309', yMin, yMax);
  drawVerticalLine(ctx, scale, c.frLActualK, 'frL', '#0f766e', xMin, xMax);
  drawVerticalLine(ctx, scale, c.fPeakRatedK, 'fpeak', '#9333ea', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frHActualK, 'frH', '#475569', xMin, xMax);
  if (Number.isFinite(c.inputs.measuredFswMinK)) drawVerticalLine(ctx, scale, c.inputs.measuredFswMinK, 'fsw(min)', '#dc2626', xMin, xMax);
  if (Number.isFinite(c.inputs.measuredFswMaxK)) drawVerticalLine(ctx, scale, c.inputs.measuredFswMaxK, 'fsw(max)', '#2563eb', xMin, xMax);

  const fmin = c.inputs.measuredFswMinK;
  const fmax = c.inputs.measuredFswMaxK;
  if (Number.isFinite(fmin) && Number.isFinite(fmax) && fmax > fmin) {
    const x1 = scale.xToPx(Math.max(xMin, fmin));
    const x2 = scale.xToPx(Math.min(xMax, fmax));
    if (x2 > x1) {
      ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      ctx.fillRect(x1, scale.yToPx(yMax), x2 - x1, scale.yToPx(yMin) - scale.yToPx(yMax));
    }
  }

  drawPlotFrame(ctx, scale);
  renderLegend('measuredGainLegend', getMeasuredGainLegendItems(c));
}

function getMeasuredGainLegendItems(c) {
  const rect = c.inputs.measuredRectifier === 'bridge' ? 'ブリッジ' : (c.inputs.measuredRectifier === 'sr' ? '同期整流' : 'センタータップ');
  const items = [
    { color: '#2563eb', text: `Gain曲線：Po=${fmt(c.inputs.measuredPo, 1)}W / Q=${fmt(c.qUse, 3)}` },
    { color: '#b45309', text: `必要Gain Mreq=${fmt(c.measuredMreq, 3)}（Vpfc=${fmt(c.inputs.measuredVpfc, 1)}V、Vo=${fmt(c.inputs.measuredVo, 2)}V、${rect}）` },
    { color: '#9333ea', text: `Peak=${fmt(c.peakGainRated, 3)} @ ${fmt(c.fPeakRatedK, 2)}kHz / Peak/Mreq=${fmt(c.measuredGainMargin, 3)}倍` },
    { color: '#64748b', text: `Rac(primary)=${fmt(c.measuredRacPri, 3)}Ω / Z0=${fmt(c.z0Actual, 3)}Ω` }
  ];
  if (Number.isFinite(c.inputs.measuredFswMinK)) items.push({ color: '#dc2626', text: `実測fsw(min)=${fmt(c.inputs.measuredFswMinK, 2)}kHz` });
  if (Number.isFinite(c.inputs.measuredFswMaxK)) items.push({ color: '#2563eb', text: `実測fsw(max)=${fmt(c.inputs.measuredFswMaxK, 2)}kHz` });
  return items;
}


function getMeasuredVoCases(c) {
  const base = c.inputs.measuredPo;
  const ratios = c.inputs.measuredLoadRatios && c.inputs.measuredLoadRatios.length ? c.inputs.measuredLoadRatios : parseMeasuredLoadRatios();
  const colors = ['#2563eb', '#0f766e', '#7c3aed', '#dc2626', '#0891b2', '#ea580c', '#16a34a', '#9333ea', '#475569', '#be123c', '#0d9488', '#a16207'];
  return ratios.map((pct, i) => {
    const ratio = pct / 100;
    const p = base * ratio;
    const isRated = Math.abs(pct - 100) < 0.001;
    return {
      ratio,
      pct,
      p,
      label: `${fmt(pct, pct >= 10 ? 0 : 1)}%負荷 / P=${fmt(p, 1)}W`,
      color: colors[i % colors.length],
      width: isRated ? 3 : (i === 0 ? 2 : 2.3)
    };
  }).filter(s => Number.isFinite(s.p) && s.p > 0);
}

function drawMeasuredVoChart(c) {
  const canvas = $('measuredVoChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const points = measuredMapPoints(c);
  const validFreqs = points.map(p => p.f).filter(v => Number.isFinite(v) && v > 0);
  const xMinDefault = validFreqs.length ? Math.max(0, Math.min(...validFreqs) * 0.75) : Math.max(0, c.frLActualK * 0.7);
  const xMaxDefault = validFreqs.length ? Math.max(...validFreqs) * 1.2 : c.frHActualK * 1.8;
  const xMin = Math.max(0, Number.isFinite(num('plotFMin', NaN)) ? num('plotFMin', xMinDefault) : xMinDefault);
  const xMax = Math.max(xMin + 10, Number.isFinite(num('plotFMax', NaN)) ? num('plotFMax', xMaxDefault) : xMaxDefault);
  const cases = getMeasuredVoCases(c);
  const samples = [];
  cases.forEach(s => {
    for (let i = 0; i <= 120; i++) {
      const f = xMin + (xMax - xMin) * i / 120;
      const vo = measuredVoutFor(c, f, s.p);
      if (Number.isFinite(vo)) samples.push(vo);
    }
  });
  samples.push(c.inputs.measuredVo);
  const autoYMin = Math.max(0, Math.min(...samples) * 0.85);
  const autoYMax = Math.max(...samples) * 1.15;
  const yMinInput = maybeNum('voutYMin');
  const yMaxInput = maybeNum('voutYMax');
  const yMin = Number.isFinite(yMinInput) ? yMinInput : autoYMin;
  const yMax = Math.max(yMin + 1, Number.isFinite(yMaxInput) ? yMaxInput : autoYMax);
  const scale = chartScales(canvas, xMin, xMax, yMin, yMax);
  drawBase(ctx, scale, xMin, xMax, yMin, yMax, 'Vout [V]', 'fsw [kHz]');

  cases.forEach(s => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 800; i++) {
      const f = xMin + (xMax - xMin) * i / 800;
      const vo = measuredVoutFor(c, f, s.p);
      if (!Number.isFinite(vo)) continue;
      const x = scale.xToPx(f);
      const y = scale.yToPx(clamp(vo, yMin, yMax));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  drawHorizontalLine(ctx, scale, c.inputs.measuredVo, `Vo ${fmt(c.inputs.measuredVo, 2)}V`, '#b45309', yMin, yMax);
  drawVerticalLine(ctx, scale, c.frLActualK, 'frL', '#0f766e', xMin, xMax);
  drawVerticalLine(ctx, scale, c.fPeakRatedK, 'fpeak', '#9333ea', xMin, xMax);
  drawVerticalLine(ctx, scale, c.frHActualK, 'frH', '#475569', xMin, xMax);
  if (Number.isFinite(c.inputs.measuredFswMinK)) drawVerticalLine(ctx, scale, c.inputs.measuredFswMinK, 'fsw(min)', '#dc2626', xMin, xMax);
  if (Number.isFinite(c.inputs.measuredFswMaxK)) drawVerticalLine(ctx, scale, c.inputs.measuredFswMaxK, 'fsw(max)', '#2563eb', xMin, xMax);
  drawPlotFrame(ctx, scale);
  renderLegend('measuredVoLegend', getMeasuredVoLegendItems(c));
}

function getMeasuredVoLegendItems(c) {
  const items = getMeasuredVoCases(c).map(s => ({ color: s.color, text: `${s.label} / Q=${fmt(qForPower(c, s.p), 3)}` }));
  items.push({ color: '#b45309', text: `目標Vo=${fmt(c.inputs.measuredVo, 2)}V` });
  items.push({ color: '#64748b', text: `負荷率：${(c.inputs.measuredLoadRatios || parseMeasuredLoadRatios()).map(v => fmt(v, v >= 10 ? 0 : 1) + '%').join(' / ')}` });
  items.push({ color: '#64748b', text: `縦軸：${Number.isFinite(maybeNum('voutYMin')) ? fmt(maybeNum('voutYMin'), 2) : 'Auto'} ～ ${Number.isFinite(maybeNum('voutYMax')) ? fmt(maybeNum('voutYMax'), 2) : 'Auto'} V` });
  return items;
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
    ['winding_mode', c.inputs.windingMode, '-'],
    ['AL_value', c.inputs.alValue, 'nH/turn^2'],
    ['n_target', c.nTarget, '-'],
    ['Ns', c.nsTurns, 'turn'],
    ['Np_calc_or_target', c.npCalc, 'turn'],
    ['Np_from_AL_raw', Number.isFinite(c.npFromAlRaw) ? c.npFromAlRaw : '', 'turn'],
    ['Np_use', c.npUse, 'turn'],
    ['n_actual_Np_over_Ns', c.n, '-'],
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
    ['Lm_manual_enabled', c.inputs.lmManualEnable, '-'],
    ['Measured_mode', c.inputs.measuredMode, '-'],
    ['Measured_Lr_input', c.inputs.measuredLr ?? '', 'uH'],
    ['Measured_Lm_input', c.inputs.measuredLm ?? '', 'uH'],
    ['Measured_Cr_input', c.inputs.measuredCr ?? '', 'nF'],
    ['Measured_n_input', c.inputs.measuredN ?? '', '-'],
    ['Measured_Vpfc', c.inputs.measuredVpfc, 'V'],
    ['Measured_Vo', c.inputs.measuredVo, 'V'],
    ['Measured_Po', c.inputs.measuredPo, 'W'],
    ['Measured_load_rates', (c.inputs.measuredLoadRatios || []).join('/'), '%'],
    ['Measured_rectifier', c.inputs.measuredRectifier, '-'],
    ['Measured_Vf', c.inputs.measuredVf, 'V'],
    ['Measured_Mreq', c.measuredMreq, '-'],
    ['Measured_peak_over_Mreq', c.measuredGainMargin, '-'],
    ['Measured_Ro', c.measuredRout, 'ohm'],
    ['Measured_Rac_secondary', c.measuredRacSec, 'ohm'],
    ['Measured_Rac_primary', c.measuredRacPri, 'ohm'],
    ['Measured_fsw_min_input', c.inputs.measuredFswMinK ?? '', 'kHz'],
    ['Measured_fsw_max_input', c.inputs.measuredFswMaxK ?? '', 'kHz'],
    ['fpeak_rated', c.fPeakRatedK, 'kHz'],
    ['peak_gain_rated', c.peakGainRated, '-'],
    ['gain_at_fmin_rated', c.gainAtFminRated, '-'],
    ['fmin_over_fpeak', c.fminPeakRatio, '-'],
    ['frH_actual', c.frHActualK, 'kHz'],
    ['frL_actual', c.frLActualK, 'kHz'],
    ['frH_frL_ratio_actual', c.ratioActual, '-'],
    ['K_actual', c.kActual, '-'],
    ['Q_actual', c.qUse, '-'],
    ['Im_peak', c.imPk, 'A'],
    ['Im_rms_triangular', c.imRmsTri, 'A'],
    ['Iload_primary_rms', c.iLoadPriRms, 'A'],
    ['Iresonant_rms_est', c.iResRms, 'A'],
    ['k_coupling_sqrt_Lm_over_Lp', c.kCoupling, '-'],
    ['n_eq', c.nEq, '-'],
    ['Ireso_winding_rms_nom', c.iResoWindingRms, 'A'],
    ['Ireso_winding_rms_max', c.iResoWindingMaxRms, 'A'],
    ['Ipri_winding_rms_nom', c.iPriWindingRms, 'A'],
    ['Ipri_winding_rms_max', c.iPriWindingMaxRms, 'A'],
    ['Isec_winding_rms_nom', c.iSecWindingRms, 'A'],
    ['Isec_winding_rms_max', c.iSecWindingMaxRms, 'A'],
    ['J_primary', c.inputs.jPri, 'A/mm2'],
    ['J_secondary', c.inputs.jSec, 'A/mm2'],
    ['Primary_required_copper_area', c.priCuAreaReq, 'mm2'],
    ['Secondary_required_copper_area', c.secCuAreaReq, 'mm2'],
    ['Primary_strand_diameter', c.inputs.strandPri, 'mm'],
    ['Secondary_strand_diameter', c.inputs.strandSec, 'mm'],
    ['Primary_strand_count_est', c.strandPriCount, 'pcs'],
    ['Secondary_strand_count_est', c.strandSecCount, 'pcs'],
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
    'frequency_kHz', 'f_over_frH', ...gainHeaders, ...voCases.map(s => s.name), 'Gain_req_lowVin_highVout', 'Gain_req_highVin_lowVout', 'frL_kHz', 'fpeak_kHz', 'fmin_kHz', 'frH_kHz'
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
      c.gReqHigh.toFixed(8),
      c.frLActualK.toFixed(8),
      c.fPeakRatedK.toFixed(8),
      c.inputs.fSwMinK.toFixed(8),
      c.frHActualK.toFixed(8)
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

function splitCanvasLines(ctx, text, maxWidth) {
  const src = String(text ?? '');
  const lines = [];
  let line = '';
  for (const ch of src) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawCanvasLines(ctx, lines, x, y, lineHeight) {
  let yy = y;
  lines.forEach(line => {
    ctx.fillText(line, x, yy);
    yy += lineHeight;
  });
  return yy;
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  return drawCanvasLines(ctx, splitCanvasLines(ctx, text, maxWidth), x, y, lineHeight);
}

function drawStepRowsOnCanvas(ctx, rows, x, y, width) {
  const gap = 10;
  rows.forEach(([title, body]) => {
    ctx.font = 'bold 15px system-ui';
    const titleLines = splitCanvasLines(ctx, title, width - 28);
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const bodyLines = splitCanvasLines(ctx, body, width - 28);
    const cardH = 18 + titleLines.length * 20 + bodyLines.length * 18 + 14;

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#d9e0ea';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, cardH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2563eb';
    ctx.fillRect(x, y, 4, cardH);

    let yy = y + 22;
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 15px system-ui';
    yy = drawCanvasLines(ctx, titleLines, x + 14, yy, 20);
    ctx.fillStyle = '#334155';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    yy = drawCanvasLines(ctx, bodyLines, x + 14, yy + 2, 18);
    y += cardH + gap;
  });
  return y;
}

function estimateStepRowsHeight(ctx, rows, width) {
  let total = 0;
  rows.forEach(([title, body]) => {
    ctx.font = 'bold 15px system-ui';
    const titleLines = splitCanvasLines(ctx, title, width - 28);
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const bodyLines = splitCanvasLines(ctx, body, width - 28);
    total += 18 + titleLines.length * 20 + bodyLines.length * 18 + 14 + 10;
  });
  return total;
}


function estimateLegendBlockHeight(items) {
  const rows = Math.ceil(items.length / 2);
  return 54 + rows * 28 + 40;
}

function drawLegendBlockOnCanvas(ctx, title, items, x, y, width) {
  const height = estimateLegendBlockHeight(items);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#d9e0ea';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 16px system-ui';
  ctx.fillText(title, x + 18, y + 26);

  const colW = (width - 36) / 2;
  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const xx = x + 18 + col * colW;
    const yy = y + 56 + row * 28;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xx, yy - 5);
    ctx.lineTo(xx + 32, yy - 5);
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.font = '14px system-ui';
    ctx.fillText(item.text, xx + 42, yy);
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '13px system-ui';
  ctx.fillText('縦破線：fmin / frL / fpeak / frH / fmax、横破線：必要GainまたはVout上下限', x + 18, y + height - 18);
  return y + height;
}

function downloadChartPng() {
  update();
  const c = window.latestLlcResult || calculate();
  const measuredMode = !!c.inputs.measuredMode;
  const gain = measuredMode ? $('measuredGainChart') : $('gainChart');
  const vo = measuredMode ? $('measuredVoChart') : $('voChart');
  if (!gain || !vo) {
    alert('グラフ用canvasが見つかりません。');
    return;
  }
  const gainLegendItems = measuredMode ? getMeasuredGainLegendItems(c) : getGainLegendItems(c);
  const voLegendItems = measuredMode ? getMeasuredVoLegendItems(c) : getVoLegendItems(c);
  const gainTitle = measuredMode ? '実測モード：Gain - 周波数特性' : 'Gain - 周波数特性';
  const voTitle = measuredMode ? '実測モード：出力電圧 - 周波数特性' : '出力電圧 - 周波数特性';
  const width = 1200;
  const pad = 42;
  const summaryRows = [
    ['実巻数比 n', fmt(c.n, 4)],
    ['Np / Ns', `${Math.round(c.npUse)} / ${Math.round(c.nsTurns)} turn`],
    ['評価モード', c.inputs.measuredMode ? '実測値逆算' : '設計/実部品検証'],
    ['Lr / Cr / Lm', `${fmt(c.lrUse * 1e6, 3)} µH / ${fmt(c.crUse * 1e9, 3)} nF / ${fmt(c.lmUse * 1e6, 3)} µH`],
    ['frH / frL', `${fmt(c.frHActualK, 2)} / ${fmt(c.frLActualK, 2)} kHz`],
    ['fpeak / fmin', c.inputs.measuredMode ? `${fmt(c.fPeakRatedK, 2)} / ${Number.isFinite(c.inputs.measuredFswMinK) ? fmt(c.inputs.measuredFswMinK, 2) : '-'} kHz` : `${fmt(c.fPeakRatedK, 2)} / ${fmt(c.inputs.fSwMinK, 2)} kHz`],
    ['K / Q', `${fmt(c.kActual, 3)} / ${fmt(c.qUse, 3)}`],
    ['fmin/fpeak', `${fmt(c.fminPeakRatio, 3)} 倍`],
    ['必要最大ゲイン', fmt(c.gReqMax, 3)],
    ['Im_pk / Ir目安', `${fmt(c.imPk, 3)} A / ${fmt(c.iResRms, 3)} Arms`],
    ['neq / Ipri巻線', `${fmt(c.nEq, 3)} / ${fmt(c.iPriWindingMaxRms, 3)} Arms`],
    ['二次巻線 / 素線目安', `${fmt(c.iSecWindingMaxRms, 3)} Arms / φ${fmt(c.inputs.strandSec, 2)}×${c.strandSecCount}本`],
    ['ZVS余裕', `${fmt(c.zvsEnergyMargin, 3)} 倍`]
  ];
  const stepRows = getStepRows(c);

  // 実測モード時は画面表示と同じ専用グラフ・専用凡例をPNGに合成する。
  // 通常モード用の gainChart / voChart は実測モードでは非表示かつクリア済みのため、
  // 参照するとPNGにグラフが入らない。
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  const stepHeight = estimateStepRowsHeight(measureCtx, stepRows, width - pad * 2);
  const gainLegendHeight = estimateLegendBlockHeight(gainLegendItems);
  const voLegendHeight = estimateLegendBlockHeight(voLegendItems);
  const summaryHeight = 110 + Math.ceil(summaryRows.length / 2) * 56 + 58;
  const height = summaryHeight + 48 + stepHeight + 62 + gain.height + gainLegendHeight + 82 + vo.height + voLegendHeight + 64;

  const merged = document.createElement('canvas');
  merged.width = width;
  merged.height = height;
  const ctx = merged.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, merged.width, merged.height);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 28px system-ui';
  ctx.fillText(measuredMode ? 'LLC実測モード結果' : 'LLC設計結果', pad, 48);
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#475569';
  ctx.fillText(new Date().toLocaleString('ja-JP'), pad, 76);

  let y = 110;
  const cardW = (width - pad * 2 - 18) / 2;
  summaryRows.forEach(([label, value], i) => {
    const x = pad + (i % 2) * (cardW + 18);
    const yy = y + Math.floor(i / 2) * 56;
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#d9e0ea';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, yy, cardW, 44, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#667085';
    ctx.font = '12px system-ui';
    ctx.fillText(label, x + 14, yy + 17);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 18px system-ui';
    ctx.fillText(String(value), x + 14, yy + 36);
  });

  y += Math.ceil(summaryRows.length / 2) * 56 + 18;
  ctx.fillStyle = '#334155';
  ctx.font = '14px system-ui';
  y = wrapCanvasText(ctx, c.windingNote, pad, y, width - pad * 2, 20) + 18;

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px system-ui';
  ctx.fillText('STEP別の導出結果', pad, y + 24);
  y += 42;
  y = drawStepRowsOnCanvas(ctx, stepRows, pad, y, width - pad * 2) + 26;

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px system-ui';
  ctx.fillText(gainTitle, pad, y + 26);
  y += 42;
  ctx.drawImage(gain, pad, y, gain.width, gain.height);
  y += gain.height + 14;
  y = drawLegendBlockOnCanvas(ctx, measuredMode ? '線の情報（実測Gainグラフ）' : '線の情報（Gainグラフ）', gainLegendItems, pad, y, width - pad * 2) + 34;

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px system-ui';
  ctx.fillText(voTitle, pad, y + 26);
  y += 42;
  ctx.drawImage(vo, pad, y, vo.width, vo.height);
  y += vo.height + 14;
  drawLegendBlockOnCanvas(ctx, measuredMode ? '線の情報（実測出力電圧グラフ）' : '線の情報（出力電圧グラフ）', voLegendItems, pad, y, width - pad * 2);

  const url = merged.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `llc_result_${new Date().toISOString().slice(0,10)}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function collectDesignJson() {
  const c = window.latestLlcResult || calculate();
  const input = {};
  inputIds.forEach(id => {
    const el = $(id);
    if (!el) return;
    input[id] = (el.type === 'checkbox') ? el.checked : el.value;
  });
  return {
    version: 'llc-tool-v8-measured-load-rate-list',
    savedAt: new Date().toISOString(),
    input,
    result: {
      measured_mode: c.inputs.measuredMode,
      measured_fsw_min_kHz: c.inputs.measuredFswMinK,
      measured_fsw_max_kHz: c.inputs.measuredFswMaxK,
      measured_vpfc_V: c.inputs.measuredVpfc,
      measured_vo_V: c.inputs.measuredVo,
      measured_po_W: c.inputs.measuredPo,
      measured_load_rates_percent: c.inputs.measuredLoadRatios,
      measured_rectifier: c.inputs.measuredRectifier,
      measured_mreq: c.measuredMreq,
      measured_peak_over_mreq: c.measuredGainMargin,
      measured_ro_ohm: c.measuredRout,
      measured_rac_secondary_ohm: c.measuredRacSec,
      measured_rac_primary_ohm: c.measuredRacPri,
      n: c.n,
      npUse: c.npUse,
      nsTurns: c.nsTurns,
      lr_uH: c.lrUse * 1e6,
      cr_nF: c.crUse * 1e9,
      lm_uH: c.lmUse * 1e6,
      frH_kHz: c.frHActualK,
      frL_kHz: c.frLActualK,
      q: c.qUse,
      k: c.kActual,
      fpeak_kHz: c.fPeakRatedK,
      fmin_over_fpeak: c.fminPeakRatio,
      peak_judgement: peakJudgeText(c),
      n_eq: c.nEq,
      i_pri_winding_rms_max: c.iPriWindingMaxRms,
      i_sec_winding_rms_max: c.iSecWindingMaxRms,
      primary_strand_count_est: c.strandPriCount,
      secondary_strand_count_est: c.strandSecCount
    }
  };
}

function saveDesignJson() {
  downloadBlob(
    `llc_design_${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify(collectDesignJson(), null, 2),
    'application/json;charset=utf-8;'
  );
}

function loadDesignJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.input) throw new Error('inputがありません');
      Object.entries(data.input).forEach(([id, value]) => {
        const el = $(id);
        if (el) {
          if (el.type === 'checkbox') el.checked = !!value;
          else el.value = value;
        }
      });
      update();
      alert('設計JSONを読み込みました。');
    } catch (e) {
      console.error(e);
      alert('設計JSONの読み込みに失敗しました。');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

async function copyResult() {
  const c = calculate();
  await navigator.clipboard.writeText(resultText(c));
  $('copyBtn').textContent = 'コピー済み';
  setTimeout(() => $('copyBtn').textContent = '結果をコピー', 1200);
}

function clearCanvas(id) {
  const canvas = $(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function setChartModeView(c) {
  const designSection = $('designChartsSection');
  const measuredSection = $('measuredAnalysisSection');
  if (c.inputs.measuredMode) {
    if (designSection) {
      designSection.hidden = true;
      designSection.style.display = 'none';
    }
    if (measuredSection) {
      measuredSection.hidden = false;
      measuredSection.style.display = 'block';
    }
    clearCanvas('gainChart');
    clearCanvas('voChart');
    drawMeasuredGainChart(c);
    drawMeasuredVoChart(c);
  } else {
    if (designSection) {
      designSection.hidden = false;
      designSection.style.display = 'block';
    }
    if (measuredSection) {
      measuredSection.hidden = true;
      measuredSection.style.display = 'none';
    }
    clearCanvas('measuredGainChart');
    clearCanvas('measuredVoChart');
    drawGainChart(c);
    drawVoChart(c);
  }
}

function update() {
  const c = calculate();
  window.latestLlcResult = c;
  renderSummary(c);
  renderSteps(c);
  setChartModeView(c);
}

inputIds.forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  }
});
$('recalcBtn')?.addEventListener('click', update);
$('csvBtn')?.addEventListener('click', downloadCsv);
$('graphCsvBtn')?.addEventListener('click', downloadGraphCsv);
$('pngBtn')?.addEventListener('click', downloadChartPng);
$('jsonSaveBtn')?.addEventListener('click', saveDesignJson);
$('jsonLoadInput')?.addEventListener('change', loadDesignJson);
$('copyBtn')?.addEventListener('click', copyResult);
update();
