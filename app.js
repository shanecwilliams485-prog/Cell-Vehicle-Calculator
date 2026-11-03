const DEFAULT_INPUTS = {
  nominalVoltage: 3.6,
  maxVoltage: 4.2,
  minVoltage: 3.0,
  capacityAh: 5.0,
  maxDischargeCurrentA: 18.0,
  cellPulseDurationSeconds: 0,
  continuousDischargeCurrentA: 8.0,
  maxChargeCurrentA: 5.0,
  cellWeightG: 70.0,
  seriesCount: 96,
  parallelCount: 24,
  moduleCount1: 0,
  moduleConfiguration: "",
  useSecondModuleConfiguration: false,
  moduleCount2: 0,
  secondModuleConfiguration: "",
  usableEnergyFactor: 0.88,
  designRequirementsEnabled: false,
  requiredPulseDischargeValue: 0,
requiredPulseDischargeUnit: "A",
requiredPulseDurationSeconds: 10,
requiredContinuousDischargeValue: 0,
requiredContinuousDischargeUnit: "A",
requiredMaxChargeValue: 0,
requiredMaxChargeUnit: "A",
  requiredRegenCurrentA: 0,
  requiredUsableEnergyKWh: 0,
  requiredPeakPowerKW: 0,
  requiredContinuousPowerKW: 0,
  advancedCellEnabled: false,
  cellDcirMilliOhm: 0,
  cellOcvTable: "",
  motorLimitsEnabled: false,
  motorPeakPowerKW: 0,
  motorContinuousPowerKW: 0,
  motorPeakDurationSeconds: 0,
  controllerMaxCurrentA: 0,
  motorPeakTorqueNm: 0,
  gearRatio: 0,
  tyreSize: "",
  tyreRadiusMm: 0,
  vehicleTopSpeedMph: 0,
  motorMaxRegenPowerKW: 0,
  variableCurrentSimulationEnabled: false,
  driveCycle: 'wltp3b',
  vehicleMassKg: 1300,
  dragCoefficient: 0.34,
  frontalAreaM2: 2.1,
  rollingResistanceCoefficient: 0.013,
  drivetrainEfficiencyPercent: 90,
  assumedLoadKW: 1.0,
  simulationTimeStepSeconds: 10,
  advancedVehicleRealismEnabled: false,
  regenEnabled: true,
  maxRegenCurrentA: 120,
  regenEfficiencyPercent: 65,
  regenDisableAboveSocPercent: 95,
  airConditioningEnabled: false,
  heatingEnabled: false,
  heaterType: "resistive",
  electricalAccessoriesEnabled: false,
  payloadKg: 0,
 degradationEnabled: false,
 degradationServiceLifeYears: 10,
 degradationTargetMileageMiles: 100000,
 degradationEolCapacityPercent: 70,
degradationEnergyConsumptionSource: "auto",
degradationEnergyConsumptionKWhPerMile: 0.30,
degradationChargingMethod: "acDcRapid",
};

const STORAGE_KEY = 'batteryCellCalculator.inputs.v1';
// Charge level (as shown to the driver) used for the "low charge" figures.
const LOW_CHARGE_DISPLAY_SOC = 15;
const Sim = window.BatterySimulation;
const inputEls = {};
let lastResults = null;
let lastResultsInputsKey = null;
let lastPdfExportOptions = null;
let animationFrame = null;
let mobileGraphExperienceActive = false;
let mobileGraphHasPlayed = false;
let mobileGraphLoopActive = false;
let chartPlaceholder = null;
let driverLivePlaceholder = null;

const fields = [
  ['nominalVoltage', 'number'],
  ['maxVoltage', 'number'],
  ['minVoltage', 'number'],
  ['capacityAh', 'number'],

  ['maxDischargeCurrentA', 'number'],
  ['cellPulseDurationSeconds', 'number'],
  ['continuousDischargeCurrentA', 'number'],
  ['maxChargeCurrentA', 'number'],
  ['cellWeightG', 'number'],

  ['seriesCount', 'int'],
  ['parallelCount', 'int'],
  ['moduleCount1', 'int'],
  ['moduleConfiguration', 'text'],
  ['useSecondModuleConfiguration', 'checkbox'],
  ['moduleCount2', 'int'],
  ['secondModuleConfiguration', 'text'],

  ['usableEnergyFactor', 'number'],

  ['designRequirementsEnabled', 'checkbox'],
  ['requiredPulseDischargeValue', 'number'],
['requiredPulseDischargeUnit', 'text'],
['requiredPulseDurationSeconds', 'number'],
['requiredContinuousDischargeValue', 'number'],
['requiredContinuousDischargeUnit', 'text'],
['requiredMaxChargeValue', 'number'],
['requiredMaxChargeUnit', 'text'],
  ['requiredRegenCurrentA', 'number'],
  ['requiredUsableEnergyKWh', 'number'],
  ['requiredPeakPowerKW', 'number'],
  ['requiredContinuousPowerKW', 'number'],
  
  ['advancedCellEnabled', 'checkbox'],
  ['cellDcirMilliOhm', 'number'],
  ['cellOcvTable', 'text'],
  ['motorLimitsEnabled', 'checkbox'],
  ['motorPeakPowerKW', 'number'],
  ['motorContinuousPowerKW', 'number'],
  ['motorPeakDurationSeconds', 'number'],
  ['controllerMaxCurrentA', 'number'],
  ['motorPeakTorqueNm', 'number'],
  ['gearRatio', 'number'],
  ['tyreSize', 'text'],
  ['tyreRadiusMm', 'number'],
  ['vehicleTopSpeedMph', 'number'],
  ['motorMaxRegenPowerKW', 'number'],

  ['variableCurrentSimulationEnabled', 'checkbox'],
  ['driveCycle', 'text'],
  ['vehicleMassKg', 'number'],
  ['dragCoefficient', 'number'],
  ['frontalAreaM2', 'number'],
  ['rollingResistanceCoefficient', 'number'],
  ['drivetrainEfficiencyPercent', 'number'],
  ['assumedLoadKW', 'number'],
  ['simulationTimeStepSeconds', 'number'],
  ['advancedVehicleRealismEnabled', 'checkbox'],
  ['regenEnabled', 'checkbox'],
  ['maxRegenCurrentA', 'number'],
  ['regenEfficiencyPercent', 'number'],
  ['regenDisableAboveSocPercent', 'number'],

  ['airConditioningEnabled', 'checkbox'],
  ['heatingEnabled', 'checkbox'],
  ['heaterType', 'text'],
  ['electricalAccessoriesEnabled', 'checkbox'],
  ['payloadKg', 'number'],
  ['degradationEnabled', 'checkbox'],
  ['degradationServiceLifeYears', 'number'],
  ['degradationTargetMileageMiles', 'number'],
 ['degradationEolCapacityPercent', 'number'],
['degradationEnergyConsumptionSource', 'text'],
['degradationEnergyConsumptionKWhPerMile', 'number'],
['degradationChargingMethod', 'text'],
  ];

function fmt(value, decimals = 1) {
  if (!Number.isFinite(value)) value = 0;
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function loadInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const merged = { ...DEFAULT_INPUTS, ...(saved || {}) };
    // Older versions used random city/mixed/motorway/performance cycles.
    merged.driveCycle = Sim.normaliseDriveCycle(merged.driveCycle);
    // Tyre radius was briefly entered in metres; convert to mm.
    if (!(Number(merged.tyreRadiusMm) > 0) && Number(saved?.tyreRadiusM) > 0) {
      merged.tyreRadiusMm = Math.round(Number(saved.tyreRadiusM) * 1000);
    }
    return merged;
  } catch { return { ...DEFAULT_INPUTS }; }
}
function saveInputs(inputs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs)); } catch { /* storage unavailable */ }
}
// Plain, locale-independent number for writing into <input type="number">
// (toLocaleString can produce "1,200" or "0,300", which number inputs reject).
function inputNumber(value, decimals = 0) {
  return Number.isFinite(value) ? String(Number(value.toFixed(decimals))) : "";
}
function getInputs() {
  const data = {};

  for (const [name, type] of fields) {
    const el = inputEls[name] || document.getElementById(name);

    if (!el) {
      data[name] = DEFAULT_INPUTS[name];
      continue;
    }

    if (type === 'checkbox') data[name] = el.checked;
    else if (type === 'int') data[name] = Math.max(0, Math.round(clampNumber(el.value, DEFAULT_INPUTS[name])));
    else if (type === 'text') data[name] = el.value;
    else data[name] = clampNumber(el.value, DEFAULT_INPUTS[name]);
  }

  return data;
}
function setInputs(inputs) {
  for (const [name, type] of fields) {
    const el = document.getElementById(name);
    inputEls[name] = el;
    if (!el) continue;
    if (type === 'checkbox') el.checked = !!inputs[name];
    else if (type === 'text') el.value = inputs[name] || "";
    else el.value = inputs[name];
  }
   toggleDesignRequirementsOptions();
  toggleDegradationOptions();
  toggleAdvancedCellOptions();
  toggleMotorOptions();
  toggleAdvancedVehicleRealismOptions();
  updateOcvTableStatus();
  updateTyreSizeStatus(false);
  toggleSimulationOptions();
  updateDegradationEnergyConsumptionInput();
  
}
function parseModuleConfigurationValue(value) {
  const match = String(value || "").match(/^(\d+)S(\d+)P$/);
  if (!match) return null;

  return {
    series: Number(match[1]),
    parallel: Number(match[2])
  };
}

function makeModuleValue(series, parallel) {
  return `${series}S${parallel}P`;
}

function makeModuleLabel(series, parallel) {
  return `${series}S${parallel}P`;
}

function setSelectOptions(select, options, preferredValue = "") {
  if (!select) return "";

  select.innerHTML = options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  if (options.some(option => String(option.value) === String(preferredValue))) {
    select.value = preferredValue;
  } else {
    select.value = options[0]?.value || "";
  }

  return select.value;
}

function getSeriesAndParallel() {
  const series = Math.max(1, Math.round(clampNumber(document.getElementById("seriesCount")?.value, DEFAULT_INPUTS.seriesCount)));
  const parallel = Math.max(1, Math.round(clampNumber(document.getElementById("parallelCount")?.value, DEFAULT_INPUTS.parallelCount)));

  return { series, parallel };
}

function buildSingleModuleConfigurationOptions(series, parallel) {
  const options = [];

  for (let moduleSeries = 1; moduleSeries <= series; moduleSeries++) {
    if (series % moduleSeries === 0) {
      options.push({
        value: makeModuleValue(moduleSeries, parallel),
        label: makeModuleLabel(moduleSeries, parallel)
      });
    }
  }

  return options;
}

function buildMixedModuleConfigurationOptions(series, parallel, excludeSeries = null) {
  const options = [];

  for (let moduleSeries = 1; moduleSeries < series; moduleSeries++) {
    if (moduleSeries === excludeSeries) continue;

    options.push({
      value: makeModuleValue(moduleSeries, parallel),
      label: makeModuleLabel(moduleSeries, parallel)
    });
  }

  return options;
}

function buildValidModuleCountPairs(totalSeries, moduleSeries1, moduleSeries2) {
  const pairs = [];

  for (let count1 = 1; count1 <= totalSeries; count1++) {
    const usedByConfig1 = count1 * moduleSeries1;
    const remainingSeries = totalSeries - usedByConfig1;

    if (remainingSeries <= 0) break;

    if (remainingSeries % moduleSeries2 === 0) {
      const count2 = remainingSeries / moduleSeries2;

      if (count2 > 0) {
        pairs.push({ count1, count2 });
      }
    }
  }

  return pairs;
}

function countOption(count) {
  return {
    value: String(count),
    label: `${count} module${count === 1 ? "" : "s"}`
  };
}

function uniqueCountOptions(values) {
  return [...new Set(values)]
    .sort((a, b) => a - b)
    .map(countOption);
}

function updateModuleConfigurationOptions() {
  const moduleConfig1Select = document.getElementById("moduleConfiguration");
  const moduleCount1Select = document.getElementById("moduleCount1");
  const secondEnabled = document.getElementById("useSecondModuleConfiguration")?.checked || false;

  if (!moduleConfig1Select || !moduleCount1Select) return;

  const { series, parallel } = getSeriesAndParallel();

  const currentConfig1 = moduleConfig1Select.value;
  const currentCount1 = moduleCount1Select.value;

  const config1Options = secondEnabled
    ? buildMixedModuleConfigurationOptions(series, parallel)
    : buildSingleModuleConfigurationOptions(series, parallel);

  const selectedConfig1 = setSelectOptions(moduleConfig1Select, config1Options, currentConfig1);
  const config1 = parseModuleConfigurationValue(selectedConfig1);

  if (!secondEnabled && config1) {
    const automaticCount1 = series / config1.series;

    setSelectOptions(moduleCount1Select, [countOption(automaticCount1)], String(automaticCount1));
  }

  if (secondEnabled) {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
  }

  updateSecondModuleConfigurationOptions();
  saveInputs(getInputs());
}

function updateModuleCount1FromConfiguration() {
  const moduleConfig1Select = document.getElementById("moduleConfiguration");
  const moduleCount1Select = document.getElementById("moduleCount1");
  const secondEnabled = document.getElementById("useSecondModuleConfiguration")?.checked || false;

  if (!moduleConfig1Select || !moduleCount1Select) return;

  const { series } = getSeriesAndParallel();
  const config1 = parseModuleConfigurationValue(moduleConfig1Select.value);

  if (!config1) return;

  if (!secondEnabled) {
    const automaticCount1 = series / config1.series;

    if (Number.isInteger(automaticCount1)) {
      setSelectOptions(moduleCount1Select, [countOption(automaticCount1)], String(automaticCount1));
    }
  } else {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
    updateSecondModuleConfigurationOptions();
  }

  saveInputs(getInputs());
}

function updateSecondModuleConfigurationOptions(changedCount = "") {
  const checkbox = document.getElementById("useSecondModuleConfiguration");
  const wrap = document.getElementById("secondModuleConfigurationWrap");
  const moduleConfig1Select = document.getElementById("moduleConfiguration");
  const moduleCount1Select = document.getElementById("moduleCount1");
  const moduleConfig2Select = document.getElementById("secondModuleConfiguration");
  const moduleCount2Select = document.getElementById("moduleCount2");

  if (!checkbox || !wrap || !moduleConfig1Select || !moduleCount1Select || !moduleConfig2Select || !moduleCount2Select) return;

  const enabled = checkbox.checked;
  wrap.hidden = !enabled;

  if (!enabled) {
    moduleCount2Select.value = "";
    moduleConfig2Select.value = "";
    return;
  }

  const { series, parallel } = getSeriesAndParallel();

  const config1 = parseModuleConfigurationValue(moduleConfig1Select.value);

  if (!config1) {
    setSelectOptions(moduleConfig2Select, [{ value: "", label: "Select config 1 first" }], "");
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
    setSelectOptions(moduleCount2Select, [{ value: "", label: "Select config 2 first" }], "");
    return;
  }

  const currentConfig2 = moduleConfig2Select.value;
  const config2Options = buildMixedModuleConfigurationOptions(series, parallel, config1.series);
  const selectedConfig2 = setSelectOptions(moduleConfig2Select, config2Options, currentConfig2);
  const config2 = parseModuleConfigurationValue(selectedConfig2);

  if (!config2) {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "Select config 2 first" }], "");
    setSelectOptions(moduleCount2Select, [{ value: "", label: "Select config 2 first" }], "");
    return;
  }

  const pairs = buildValidModuleCountPairs(series, config1.series, config2.series);

  if (!pairs.length) {
    setSelectOptions(moduleCount1Select, [{ value: "", label: "No valid count" }], "");
    setSelectOptions(moduleCount2Select, [{ value: "", label: "No valid count" }], "");
    return;
  }

  const currentCount1 = moduleCount1Select.value;
  const currentCount2 = moduleCount2Select.value;

  const validCount1Options = uniqueCountOptions(pairs.map(pair => pair.count1));
  const validCount2Options = uniqueCountOptions(pairs.map(pair => pair.count2));

  if (changedCount === "moduleCount1" && currentCount1) {
    const matchingPairs = pairs.filter(pair => String(pair.count1) === String(currentCount1));

    setSelectOptions(moduleCount1Select, validCount1Options, currentCount1);
    setSelectOptions(moduleCount2Select, uniqueCountOptions(matchingPairs.map(pair => pair.count2)), "");
    return;
  }

  if (changedCount === "moduleCount2" && currentCount2) {
    const matchingPairs = pairs.filter(pair => String(pair.count2) === String(currentCount2));

    setSelectOptions(moduleCount2Select, validCount2Options, currentCount2);
    setSelectOptions(moduleCount1Select, uniqueCountOptions(matchingPairs.map(pair => pair.count1)), "");
    return;
  }

  setSelectOptions(moduleCount1Select, validCount1Options, currentCount1);
  setSelectOptions(moduleCount2Select, validCount2Options, currentCount2);
}
function updateCalculatedMaxRegenCurrentInput() {
  const maxChargeInput = document.getElementById('maxChargeCurrentA');
  const parallelInput = document.getElementById('parallelCount');
  const maxRegenInput = document.getElementById('maxRegenCurrentA');

  if (!maxChargeInput || !parallelInput || !maxRegenInput) return;

  const cellMaxChargeCurrentA = clampNumber(maxChargeInput.value, 0);
  const parallelCount = Math.max(0, Math.round(clampNumber(parallelInput.value, 0)));

  maxRegenInput.value = inputNumber(cellMaxChargeCurrentA * parallelCount * 0.8, 0);
}
function updateDegradationEnergyConsumptionInput() {
  const sourceInput = document.getElementById('degradationEnergyConsumptionSource');
  const energyInput = document.getElementById('degradationEnergyConsumptionKWhPerMile');

  if (!sourceInput || !energyInput) return;

  const input = getInputs();
  const usingAuto = sourceInput.value === "auto";

  energyInput.readOnly = usingAuto;

  if (!usingAuto) return;

  if (!input.variableCurrentSimulationEnabled) {
    energyInput.value = "";
    energyInput.placeholder = "Enable vehicle simulation";
    return;
  }

  // Reuse the latest results when they match the current inputs (the
  // simulation is deterministic) to avoid re-running it on every keystroke.
  const previewResults = lastResults && lastResultsInputsKey === JSON.stringify(input)
    ? lastResults
    : calculate(input);

  if (previewResults.autoDegradationEnergyConsumptionKWhPerMile !== null) {
    energyInput.value = inputNumber(previewResults.autoDegradationEnergyConsumptionKWhPerMile, 3);
    energyInput.placeholder = "";
  } else {
    energyInput.value = "";
    energyInput.placeholder = "Calculate unavailable";
  }
}
// Fill the rolling radius from a tyre size. Only overwrites the radius when
// the size has just been changed, so a measured radius typed afterwards is kept.
function updateTyreSizeStatus(fillRadius = false) {
  const sizeInput = document.getElementById('tyreSize');
  const radiusInput = document.getElementById('tyreRadiusMm');
  const status = document.getElementById('tyreSizeStatus');
  if (!sizeInput || !status) return;

  status.classList.remove('ocv-ok', 'ocv-warning');
  if (!sizeInput.value.trim()) {
    status.textContent = "Optional: enter a tyre size to fill in the rolling radius.";
    return;
  }

  const tyre = Sim.parseTyreSize(sizeInput.value);
  if (!tyre) {
    status.classList.add('ocv-warning');
    status.textContent = 'Size not recognised. Use a format like 205/55 R16 or 31x10.50 R15.';
    return;
  }

  const rolling = Math.round(tyre.rollingRadiusMm);
  if (fillRadius && radiusInput) radiusInput.value = String(rolling);

  const matches = radiusInput && Math.round(Number(radiusInput.value)) === rolling;
  status.classList.add('ocv-ok');
  status.textContent =
    `${tyre.description}: unloaded radius ${fmt(tyre.unloadedRadiusMm, 0)} mm, ` +
    `rolling radius about ${rolling} mm (${fmt(Sim.ROLLING_RADIUS_FACTOR * 100, 0)} % of unloaded)` +
    (matches ? "." : ". The radius field holds your own value.");
}
function updateOcvTableStatus() {
  const textArea = document.getElementById('cellOcvTable');
  const status = document.getElementById('cellOcvTableStatus');
  if (!textArea || !status) return;

  const parsed = Sim.parseOcvTable(textArea.value);
  status.classList.remove('ocv-ok', 'ocv-warning');

  if (!textArea.value.trim()) {
    status.textContent = "No table entered: the cell nominal voltage is used as a constant OCV.";
    return;
  }

  if (!parsed.points.length) {
    status.classList.add('ocv-warning');
    status.textContent = parsed.errors.join(' ') || "Table could not be read.";
    return;
  }

  const first = parsed.points[0];
  const last = parsed.points[parsed.points.length - 1];
  status.classList.add(parsed.errors.length ? 'ocv-warning' : 'ocv-ok');
  status.textContent =
    `${parsed.points.length} points read: ${fmt(first.v, 2)} V at ${fmt(first.soc, 0)} % to ${fmt(last.v, 2)} V at ${fmt(last.soc, 0)} % SOC.` +
    (parsed.errors.length ? ` ${parsed.errors.join(' ')}` : "");
}
function loadOcvTableFile(event) {
  const file = event.target.files?.[0];
  const textArea = document.getElementById('cellOcvTable');
  if (!file || !textArea) return;

  const reader = new FileReader();
  reader.onload = () => {
    textArea.value = String(reader.result || "");
    textArea.dispatchEvent(new Event('change'));
    updateOcvTableStatus();
  };
  reader.readAsText(file);
  event.target.value = "";
}
function getInputValidationErrors(input) {
  const errors = [];
  if (!(input.nominalVoltage > 0)) errors.push("Cell nominal voltage must be greater than zero.");
  if (!(input.maxVoltage > input.minVoltage)) errors.push("Cell max voltage must be higher than min voltage.");
  if (input.nominalVoltage > input.maxVoltage || input.nominalVoltage < input.minVoltage) {
    errors.push("Cell nominal voltage should sit between the min and max voltage.");
  }
  if (!(input.capacityAh > 0)) errors.push("Cell capacity must be greater than zero.");
  if (!(input.seriesCount >= 1) || !(input.parallelCount >= 1)) errors.push("Series and parallel counts must be at least 1.");
  if (!(input.usableEnergyFactor > 0 && input.usableEnergyFactor <= 1)) errors.push("Usable factor must be between 0 and 1 (e.g. 0.88).");
  if (input.continuousDischargeCurrentA > input.maxDischargeCurrentA) {
    errors.push("Cell continuous discharge current should not exceed max discharge current.");
  }
  if (input.motorLimitsEnabled && input.motorPeakDurationSeconds > 0 && !(input.motorContinuousPowerKW > 0)) {
    errors.push("Motor peak power duration needs a motor continuous power to drop to after the peak time.");
  }
  if (input.variableCurrentSimulationEnabled) {
    if (!(input.vehicleMassKg > 0)) errors.push("Vehicle weight must be greater than zero.");
    if (!(input.drivetrainEfficiencyPercent > 30 && input.drivetrainEfficiencyPercent <= 100)) {
      errors.push("Drivetrain efficiency should be between 30 and 100 %.");
    }
  }
  return errors;
}
function calculate(input) {
  const series = Math.max(input.seriesCount, 0);
  const parallel = Math.max(input.parallelCount, 0);

  const packEnergyKWh = (input.nominalVoltage * series * input.capacityAh * parallel) / 1000.0;
  const packCapacityAh = input.capacityAh * parallel;
  const nominalVoltageV = input.nominalVoltage * series;
  const maxVoltageV = input.maxVoltage * series;
  const minVoltageV = input.minVoltage * series;
  const numberOfCells = Math.max(input.seriesCount, 0) * Math.max(input.parallelCount, 0);

  const module1Match = String(input.moduleConfiguration || "").match(/^(\d+)S(\d+)P$/);
  const module1Series = module1Match ? Number(module1Match[1]) : series;
  const module1Parallel = module1Match ? Number(module1Match[2]) : parallel;
  const module1Config = `${module1Series}S${module1Parallel}P`;

  let moduleCount1 = Math.max(0, Math.round(input.moduleCount1 || 0));

  if (!input.useSecondModuleConfiguration && module1Series > 0) {
    moduleCount1 = series / module1Series;
  }

  const moduleNominalVoltageV = input.nominalVoltage * module1Series;
  const moduleCapacityAh = input.capacityAh * module1Parallel;
  const moduleEnergyKWh = moduleNominalVoltageV * moduleCapacityAh / 1000;
  const moduleCellCount = module1Series * module1Parallel;

  const module2Match = String(input.secondModuleConfiguration || "").match(/^(\d+)S(\d+)P$/);
  const hasSecondModule = !!input.useSecondModuleConfiguration && !!module2Match;

  const module2Series = hasSecondModule ? Number(module2Match[1]) : 0;
  const module2Parallel = hasSecondModule ? Number(module2Match[2]) : 0;
  const module2Config = hasSecondModule ? `${module2Series}S${module2Parallel}P` : "";
  const moduleCount2 = hasSecondModule ? Math.max(0, Math.round(input.moduleCount2 || 0)) : 0;

  const module2NominalVoltageV = input.nominalVoltage * module2Series;
  const module2CapacityAh = input.capacityAh * module2Parallel;
  const module2EnergyKWh = module2NominalVoltageV * module2CapacityAh / 1000;
  const module2CellCount = module2Series * module2Parallel;
  const cellEnergyWh = input.nominalVoltage * input.capacityAh;
const cellContinuousDischargeCRating = input.capacityAh > 0
  ? input.continuousDischargeCurrentA / input.capacityAh
  : 0;

const moduleMaxVoltageV = input.maxVoltage * module1Series;
const moduleMinVoltageV = input.minVoltage * module1Series;
const moduleWeightKG = input.cellWeightG * moduleCellCount / 1000;
const moduleMaxDischargeCurrentA = input.maxDischargeCurrentA * module1Parallel;
const moduleContinuousDischargeCurrentA = input.continuousDischargeCurrentA * module1Parallel;
const moduleMaxChargeCurrentA = input.maxChargeCurrentA * module1Parallel;
const moduleMaxDischargePowerKW = moduleNominalVoltageV * moduleMaxDischargeCurrentA / 1000;
const moduleContinuousDischargePowerKW = moduleNominalVoltageV * moduleContinuousDischargeCurrentA / 1000;
const moduleMaxChargePowerKW = moduleNominalVoltageV * moduleMaxChargeCurrentA / 1000;

const module2MaxVoltageV = input.maxVoltage * module2Series;
const module2MinVoltageV = input.minVoltage * module2Series;
const module2WeightKG = input.cellWeightG * module2CellCount / 1000;
const module2MaxDischargeCurrentA = input.maxDischargeCurrentA * module2Parallel;
const module2ContinuousDischargeCurrentA = input.continuousDischargeCurrentA * module2Parallel;
const module2MaxChargeCurrentA = input.maxChargeCurrentA * module2Parallel;
const module2MaxDischargePowerKW = module2NominalVoltageV * module2MaxDischargeCurrentA / 1000;
const module2ContinuousDischargePowerKW = module2NominalVoltageV * module2ContinuousDischargeCurrentA / 1000;
const module2MaxChargePowerKW = module2NominalVoltageV * module2MaxChargeCurrentA / 1000;

  const totalModuleSeries =
    moduleCount1 * module1Series +
    moduleCount2 * module2Series;

  const totalCellWeightKG = (input.cellWeightG * series * parallel) / 1000.0;
  const maxDischargeCurrentA = input.maxDischargeCurrentA * parallel;
  const continuousDischargeCurrentA = input.continuousDischargeCurrentA * parallel;
  const maxChargeCurrentA = input.maxChargeCurrentA * parallel;
const designRequirementsActive = !!input.designRequirementsEnabled;

const requiredPulseDischargeValue = designRequirementsActive
  ? Math.max(0, clampNumber(input.requiredPulseDischargeValue, 0))
  : 0;

const requiredContinuousDischargeValue = designRequirementsActive
  ? Math.max(0, clampNumber(input.requiredContinuousDischargeValue, 0))
  : 0;

const requiredPulseDischargeUnit = input.requiredPulseDischargeUnit || "A";
const requiredContinuousDischargeUnit = input.requiredContinuousDischargeUnit || "A";

const requiredPulseCurrentA =
  requiredPulseDischargeUnit === "kW" && nominalVoltageV > 0
    ? (requiredPulseDischargeValue * 1000) / nominalVoltageV
    : requiredPulseDischargeValue;

const requiredPeakPowerKW =
  requiredPulseDischargeUnit === "kW"
    ? requiredPulseDischargeValue
    : nominalVoltageV > 0
      ? (requiredPulseDischargeValue * nominalVoltageV) / 1000
      : 0;

const requiredContinuousCurrentA =
  requiredContinuousDischargeUnit === "kW" && nominalVoltageV > 0
    ? (requiredContinuousDischargeValue * 1000) / nominalVoltageV
    : requiredContinuousDischargeValue;

const requiredContinuousPowerKW =
  requiredContinuousDischargeUnit === "kW"
    ? requiredContinuousDischargeValue
    : nominalVoltageV > 0
      ? (requiredContinuousDischargeValue * nominalVoltageV) / 1000
      : 0;

const requiredPeakPowerCurrentA =
  requiredPeakPowerKW > 0 && nominalVoltageV > 0
    ? (requiredPeakPowerKW * 1000) / nominalVoltageV
    : 0;

const requiredContinuousPowerCurrentA =
  requiredContinuousPowerKW > 0 && nominalVoltageV > 0
    ? (requiredContinuousPowerKW * 1000) / nominalVoltageV
    : 0;

// Design requirements are pass/fail checks only. They no longer cap the
// simulation (previously a lower "required" current made the pack look better).
const calculatedMaxRegenCurrentA = maxChargeCurrentA * 0.8;

const requiredMaxChargeValue = designRequirementsActive
  ? Math.max(0, clampNumber(input.requiredMaxChargeValue, 0))
  : 0;

const requiredMaxChargeUnit = input.requiredMaxChargeUnit || "A";

const requiredMaxChargeCurrentA =
  requiredMaxChargeUnit === "kW" && nominalVoltageV > 0
    ? (requiredMaxChargeValue * 1000) / nominalVoltageV
    : requiredMaxChargeValue;

const requiredMaxChargePowerKW =
  requiredMaxChargeUnit === "kW"
    ? requiredMaxChargeValue
    : nominalVoltageV > 0
      ? (requiredMaxChargeValue * nominalVoltageV) / 1000
      : 0;
const requiredRegenCurrentA = designRequirementsActive
  ? Math.max(0, clampNumber(input.requiredRegenCurrentA, 0))
  : 0;

const calculatedAuxiliaryLoadKW = Sim.getAuxiliaryLoadKW(input);
  const maxDischargePowerKW = (input.nominalVoltage * series * input.maxDischargeCurrentA * parallel) / 1000.0;
  const continuousDischargePowerKW = (input.nominalVoltage * series * input.continuousDischargeCurrentA * parallel) / 1000.0;
  const maxChargePowerKW = (input.nominalVoltage * series * input.maxChargeCurrentA * parallel) / 1000.0;

  const maxDischargeCRating = input.capacityAh === 0 ? 0 : input.maxDischargeCurrentA / input.capacityAh;
  const maxChargeCRating = input.capacityAh === 0 ? 0 : input.maxChargeCurrentA / input.capacityAh;

 const usableEnergyKWh = packEnergyKWh * input.usableEnergyFactor;

const linearDischargeCurrentA =
  designRequirementsActive && requiredContinuousCurrentA > 0
    ? requiredContinuousCurrentA
    : continuousDischargeCurrentA;

const linearDischargePowerKW =
  nominalVoltageV > 0
    ? (nominalVoltageV * linearDischargeCurrentA) / 1000
    : 0;

const runtimeAtContinuousDischargeMinutes =
  linearDischargePowerKW > 0
    ? (usableEnergyKWh / linearDischargePowerKW) * 60
    : null;

const runtimeAtAssumedLoadMinutes = input.assumedLoadKW > 0 ? usableEnergyKWh / input.assumedLoadKW * 60.0 : null;

// Pack electrical model (used for the simulation and the "at the limits" figures).
const packModel = Sim.buildPackModel(input);
const packAtTop = Sim.dischargeCapability(packModel, packModel.socTop);
// "Low charge" reference point: 15 % as shown to the driver (15 % of the
// usable window above empty), used for the at-the-limits figures.
const lowChargeActualSoc = packModel.socBottom + (packModel.socTop - packModel.socBottom) * LOW_CHARGE_DISPLAY_SOC / 100;
const packAtBottom = Sim.dischargeCapability(packModel, lowChargeActualSoc);

const simulation = input.variableCurrentSimulationEnabled
  ? Sim.simulateDriveCycle(input)
  : null;
const variableSimulation = simulation && simulation.ok ? simulation : null;

const fullPowerTop = input.variableCurrentSimulationEnabled ? Sim.fullPowerTest(input, packModel.socTop) : null;
const fullPowerBottom = input.variableCurrentSimulationEnabled ? Sim.fullPowerTest(input, lowChargeActualSoc) : null;
const sustainedSpeedTopMph = input.variableCurrentSimulationEnabled ? Sim.maxSustainedSpeedMph(input, packModel.socTop) : null;
const sustainedSpeedBottomMph = input.variableCurrentSimulationEnabled ? Sim.maxSustainedSpeedMph(input, lowChargeActualSoc) : null;

const calculatedVehicleRangeMiles =
  variableSimulation && variableSimulation.distanceMiles > 0
    ? variableSimulation.distanceMiles
    : null;

 const sohRows = [100, 95, 90, 85, 80, 70].map(percentage => ({
    percentage,
    usableEnergyKWh: usableEnergyKWh * percentage / 100.0
  }));
const degradationEnabled = !!input.degradationEnabled;

const degradationServiceLifeYears =
  Math.max(0, clampNumber(input.degradationServiceLifeYears, 0));

const degradationTargetMileageMiles =
  Math.max(0, clampNumber(input.degradationTargetMileageMiles, 0));

const degradationAnnualMileageMiles =
  degradationServiceLifeYears > 0
    ? degradationTargetMileageMiles / degradationServiceLifeYears
    : 0;

const degradationBolUsableEnergyKWh = usableEnergyKWh;

const degradationEnergyConsumptionSource =
  input.degradationEnergyConsumptionSource || "auto";

const manualDegradationEnergyConsumptionKWhPerMile =
  Math.max(0, clampNumber(input.degradationEnergyConsumptionKWhPerMile, 0));

const autoDegradationEnergyConsumptionKWhPerMile =
  variableSimulation &&
  variableSimulation.consumptionKWhPerMile > 0
    ? variableSimulation.consumptionKWhPerMile
    : null;

const degradationEnergyConsumptionKWhPerMile =
  degradationEnergyConsumptionSource === "auto" &&
  autoDegradationEnergyConsumptionKWhPerMile !== null
    ? autoDegradationEnergyConsumptionKWhPerMile
    : manualDegradationEnergyConsumptionKWhPerMile;

const degradationEolCapacityPercent = clamp(
  clampNumber(input.degradationEolCapacityPercent, 70),
  0,
  100
);

const degradationEolUsableEnergyKWh =
  degradationBolUsableEnergyKWh * degradationEolCapacityPercent / 100;

const degradationEnergyLostKWh =
  degradationBolUsableEnergyKWh - degradationEolUsableEnergyKWh;

const degradationLifetimeEnergyThroughputKWh =
  degradationTargetMileageMiles * degradationEnergyConsumptionKWhPerMile;

const degradationEnergyThroughputPerYearKWh =
  degradationServiceLifeYears > 0
    ? degradationLifetimeEnergyThroughputKWh / degradationServiceLifeYears
    : null;

const degradationAverageDailyEnergyUseKWh =
  degradationEnergyThroughputPerYearKWh !== null
    ? degradationEnergyThroughputPerYearKWh / 365
    : null;

const degradationEquivalentFullCycles =
  degradationBolUsableEnergyKWh > 0
    ? degradationLifetimeEnergyThroughputKWh / degradationBolUsableEnergyKWh
    : null;

const degradationBolRangeMiles =
  calculatedVehicleRangeMiles !== null && calculatedVehicleRangeMiles > 0
    ? calculatedVehicleRangeMiles
    : degradationEnergyConsumptionKWhPerMile > 0
      ? degradationBolUsableEnergyKWh / degradationEnergyConsumptionKWhPerMile
      : null;

const degradationEolRangeMiles =
  degradationEnergyConsumptionKWhPerMile > 0
    ? degradationEolUsableEnergyKWh / degradationEnergyConsumptionKWhPerMile
    : null;

const degradationSocWindowPercent =
  clamp(input.usableEnergyFactor * 100, 0, 100);

const degradationSocWindowMinPercent =
  (100 - degradationSocWindowPercent) / 2;

const degradationSocWindowMaxPercent =
  100 - degradationSocWindowMinPercent;
  return {
    cellNominalVoltage: input.nominalVoltage,
cellMaxVoltage: input.maxVoltage,
cellMinVoltage: input.minVoltage,
cellCapacityAh: input.capacityAh,
cellEnergyWh,
cellMaxDischargeCurrentA: input.maxDischargeCurrentA,
cellPulseDurationSeconds: Math.max(0, clampNumber(input.cellPulseDurationSeconds, 0)),
cellContinuousDischargeCurrentA: input.continuousDischargeCurrentA,
cellMaxChargeCurrentA: input.maxChargeCurrentA,
cellWeightG: input.cellWeightG,
cellMaxDischargeCRating: maxDischargeCRating,
cellContinuousDischargeCRating,
cellMaxChargeCRating: maxChargeCRating,
   seriesCount: series,
parallelCount: parallel,
packEnergyKWh,
packCapacityAh,
maxDischargeCurrentA,
    maxDischargePowerKW,
    continuousDischargeCurrentA,
    continuousDischargePowerKW,
    maxChargeCurrentA,
    maxChargePowerKW,
    simulationDischargeCurrentLimitA: packModel.dischargeLimitA,
    simulationDischargeLimitSource: packModel.controllerLimitA < packModel.cellDischargeLimitA ? "controller" : "cell",
    maxVoltageV,
    minVoltageV,
    nominalVoltageV,
    numberOfCells,
    totalCellWeightKG,
    maxDischargeCRating,
    maxChargeCRating,
    usableEnergyKWh,
usableEnergyFactor: input.usableEnergyFactor,

designRequirementsEnabled: input.designRequirementsEnabled,
requiredPulseDischargeValue,
requiredPulseDischargeUnit,
requiredPulseCurrentA,
requiredPulseDurationSeconds: input.requiredPulseDurationSeconds,
requiredContinuousDischargeValue,
requiredContinuousDischargeUnit,
requiredContinuousCurrentA,
requiredMaxChargeValue,
requiredMaxChargeUnit,
requiredMaxChargeCurrentA,
requiredMaxChargePowerKW,
requiredRegenCurrentA,
requiredUsableEnergyKWh: input.requiredUsableEnergyKWh,
requiredPeakPowerKW,
requiredContinuousPowerKW,
requiredContinuousPowerCurrentA,

runtimeAtContinuousDischargeMinutes,
linearDischargeCurrentA,
linearDischargePowerKW,
runtimeAtAssumedLoadMinutes,
   moduleConfig: module1Config,
moduleCount1,
moduleNominalVoltageV,
moduleMaxVoltageV,
moduleMinVoltageV,
moduleCapacityAh,
moduleEnergyKWh,
moduleCellCount,
moduleWeightKG,
moduleMaxDischargeCurrentA,
moduleContinuousDischargeCurrentA,
moduleMaxChargeCurrentA,
moduleMaxDischargePowerKW,
moduleContinuousDischargePowerKW,
moduleMaxChargePowerKW,
    hasSecondModule,
module2Config,
moduleCount2,
module2NominalVoltageV,
module2MaxVoltageV,
module2MinVoltageV,
module2CapacityAh,
module2EnergyKWh,
module2CellCount,
module2WeightKG,
module2MaxDischargeCurrentA,
module2ContinuousDischargeCurrentA,
module2MaxChargeCurrentA,
module2MaxDischargePowerKW,
module2ContinuousDischargePowerKW,
module2MaxChargePowerKW,
    totalModuleSeries,

   variableSimulationEnabled: input.variableCurrentSimulationEnabled,
advancedVehicleRealismEnabled: input.advancedVehicleRealismEnabled,

driveCycle: input.driveCycle,
vehicleMassKg: input.vehicleMassKg,
dragCoefficient: input.dragCoefficient,
frontalAreaM2: input.frontalAreaM2,
rollingResistanceCoefficient: input.rollingResistanceCoefficient,
drivetrainEfficiencyPercent: input.drivetrainEfficiencyPercent,
assumedLoadKW: input.assumedLoadKW,
auxiliaryLoadKW: calculatedAuxiliaryLoadKW,
regenEnabled: input.regenEnabled,
maxRegenCurrentA: calculatedMaxRegenCurrentA,
simulationMaxRegenCurrentA: calculatedMaxRegenCurrentA,
regenEfficiencyPercent: input.regenEfficiencyPercent,
regenDisableAboveSocPercent: input.regenDisableAboveSocPercent,
airConditioningEnabled: input.airConditioningEnabled,
heatingEnabled: input.heatingEnabled,
heaterType: input.heaterType,
electricalAccessoriesEnabled: input.electricalAccessoriesEnabled,
payloadKg: input.payloadKg,

advancedCellEnabled: !!input.advancedCellEnabled,
cellDcirMilliOhm: input.advancedCellEnabled ? input.cellDcirMilliOhm : 0,
packResistanceMilliOhm: packModel.resistanceOhm * 1000,
hasOcvTable: packModel.hasOcvTable,
ocvPointCount: packModel.ocvPoints.length,
ocvTableErrors: packModel.ocvErrors,
usableEnergyAtOcvKWh: packModel.usableEnergyAtOcvKWh,
socWindowTopPercent: packModel.socTop,
socWindowBottomPercent: packModel.socBottom,
packPeakPowerTopKW: packAtTop.powerW / 1000,
packPeakPowerBottomKW: packAtBottom.powerW / 1000,
packPeakCurrentTopA: packAtTop.amps,
packPeakCurrentBottomA: packAtBottom.amps,
packPeakLimitTop: packAtTop.limit,
packPeakLimitBottom: packAtBottom.limit,
packLoadedVoltageTopV: packAtTop.terminalV,
packLoadedVoltageBottomV: packAtBottom.terminalV,
packOcvTopV: packAtTop.ocv,
packOcvBottomV: packAtBottom.ocv,

motorLimitsEnabled: !!input.motorLimitsEnabled,
motorPeakPowerKW: input.motorPeakPowerKW,
motorContinuousPowerKW: input.motorContinuousPowerKW,
motorPeakDurationSeconds: Math.max(0, clampNumber(input.motorPeakDurationSeconds, 0)),
controllerMaxCurrentA: input.controllerMaxCurrentA,
motorPeakTorqueNm: input.motorPeakTorqueNm,
gearRatio: input.gearRatio,
tyreRadiusMm: input.tyreRadiusMm,
tyreSize: input.tyreSize,
vehicleTopSpeedMph: input.vehicleTopSpeedMph,
motorMaxRegenPowerKW: input.motorMaxRegenPowerKW,

simulationError: simulation && !simulation.ok ? simulation.reason : null,
simulationReachedEmpty: variableSimulation?.reachedEmpty ?? null,
simulationCyclesCompleted: variableSimulation?.cyclesCompleted ?? null,
simulationIsStandardTrace: variableSimulation?.isStandardTrace ?? null,
simulationDischargeEnergyKWh: variableSimulation?.dischargeEnergyKWh ?? null,
simulationNetEnergyKWh: variableSimulation?.netEnergyKWh ?? null,
simulationPackLossKWh: variableSimulation?.packLossKWh ?? null,
simulationPeakDischargeCurrentA: variableSimulation?.peakDischargeCurrentA ?? null,
simulationPeakChargeCurrentA: variableSimulation?.peakChargeCurrentA ?? null,
simulationPeakPowerKW: variableSimulation?.peakPowerKW ?? null,
simulationMinTerminalVoltageV: variableSimulation?.minTerminalVoltageV ?? null,
simulationMaxTerminalVoltageV: variableSimulation?.maxTerminalVoltageV ?? null,
simulationSecondsAboveContinuous: variableSimulation?.secondsAboveContinuous ?? null,
simulationLongestSecondsAboveContinuous: variableSimulation?.longestSecondsAboveContinuous ?? null,
simulationSecondsTraceMissed: variableSimulation?.secondsTraceMissed ?? null,
simulationMaxSpeedShortfallMph: variableSimulation?.maxSpeedShortfallMph ?? null,
simulationLimitSeconds: variableSimulation?.limitSeconds ?? null,
simulationRegenLimitedSeconds: variableSimulation?.regenLimitedSeconds ?? null,
firstCycleConsumptionKWhPerMile: variableSimulation?.firstCycleConsumptionKWhPerMile ?? null,
fullPowerTop,
fullPowerBottom,
sustainedSpeedTopMph,
sustainedSpeedBottomMph,

variableAverageCurrentA: variableSimulation?.averageDischargeCurrentA ?? null,
variableAveragePowerKW: variableSimulation?.averagePowerKW ?? null,
variableAverageSpeedMph: variableSimulation?.averageSpeedMph ?? null,
variableRuntimeMinutes: variableSimulation?.runtimeMinutes ?? null,
variableZeroSOCMinute: variableSimulation?.runtimeMinutes ?? null,
variableRegenRecoveredKWh: variableSimulation?.regenRecoveredKWh ?? null,
vehicleConsumptionKWhPer100Miles: variableSimulation && variableSimulation.consumptionKWhPerMile > 0
  ? variableSimulation.consumptionKWhPerMile * 100
  : null,

vehicleConsumptionMilesPerKWh: variableSimulation && variableSimulation.consumptionKWhPerMile > 0
  ? 1 / variableSimulation.consumptionKWhPerMile
  : null,

vehicleRangeMiles: calculatedVehicleRangeMiles,
variableSimulationRows: variableSimulation?.rows ?? [],
simulationTrace: variableSimulation?.trace ?? null,
simulationCycleSeconds: variableSimulation?.cycleSeconds ?? null,
sohRows,

degradationEnabled,
degradationServiceLifeYears,
degradationTargetMileageMiles,
degradationAnnualMileageMiles,
degradationBolUsableEnergyKWh,
degradationEolCapacityPercent,
degradationEolUsableEnergyKWh,
degradationEnergyLostKWh,
degradationEnergyConsumptionSource,
manualDegradationEnergyConsumptionKWhPerMile,
autoDegradationEnergyConsumptionKWhPerMile,
degradationEnergyConsumptionKWhPerMile,
degradationBolRangeMiles,
degradationEolRangeMiles,
degradationSocWindowMinPercent,
degradationSocWindowMaxPercent,
degradationSocWindowPercent,
degradationLifetimeEnergyThroughputKWh,
degradationEnergyThroughputPerYearKWh,
degradationAverageDailyEnergyUseKWh,
degradationEquivalentFullCycles,
degradationChargingMethod: input.degradationChargingMethod
  };
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function yesNo(value) {
  return value ? "Enabled" : "Disabled";
}

function driveCycleLabel(value) {
  const cycle = Sim.DRIVE_CYCLES[Sim.normaliseDriveCycle(value)];
  return cycle.label;
}

function heaterTypeLabel(value) {
  const labels = {
    resistive: "Resistive heater",
    heatPump: "Heat pump"
  };

  return labels[value] || "Resistive heater";
}

function limitLabel(key) {
  const labels = {
    cell: "Cell max discharge current",
    cellContinuous: "Cell continuous current (pulse time used)",
    motorContinuous: "Motor continuous power (peak time used)",
    controller: "Controller current limit",
    voltage: "Pack min voltage (voltage sag)",
    maxPower: "Pack maximum power point",
    motorPower: "Motor peak power",
    torque: "Motor torque",
    topSpeed: "Vehicle top speed"
  };
  return labels[key] || key || "—";
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 120) return `${fmt(seconds, 0)} s`;
  return `${fmt(seconds / 60, 1)} min`;
}

// Rows are [label, value] pairs shared by the on-screen results and the PDF.
function getVehicleResultRows(results) {
  if (!results.variableSimulationEnabled) return [];
  if (results.simulationError) return [["Simulation", results.simulationError]];

  const rows = [
    ["Drive cycle", driveCycleLabel(results.driveCycle)],
    ["Estimated range", results.vehicleRangeMiles !== null ? `${fmt(results.vehicleRangeMiles, 1)} miles (${fmt(results.vehicleRangeMiles * 1.609344, 0)} km)` : "—"],
    ["Consumption (battery terminals)", results.vehicleConsumptionKWhPer100Miles !== null
      ? `${fmt(results.vehicleConsumptionKWhPer100Miles * 10, 0)} Wh/mile (${fmt(results.vehicleConsumptionKWhPer100Miles * 10 / 1.609344, 0)} Wh/km)`
      : "—"],
    ["Efficiency", results.vehicleConsumptionMilesPerKWh !== null ? `${fmt(results.vehicleConsumptionMilesPerKWh, 2)} miles/kWh` : "—"],
    ["Driving time to empty", results.variableRuntimeMinutes !== null ? `${fmt(results.variableRuntimeMinutes, 0)} min (${fmt(results.simulationCyclesCompleted, 1)} cycles)` : "—"],
    ["Average speed", `${fmt(results.variableAverageSpeedMph, 1)} mph`],
    ["Average power / current", `${fmt(results.variableAveragePowerKW, 2)} kW / ${fmt(results.variableAverageCurrentA, 1)} A`],
    ["Energy from pack (net)", `${fmt(results.simulationNetEnergyKWh, 2)} kWh`],
    ["Regen returned to pack", `${fmt(results.variableRegenRecoveredKWh, 2)} kWh`]
  ];

  if (results.advancedCellEnabled && results.cellDcirMilliOhm > 0) {
    rows.push(["Pack internal (I²R) losses", `${fmt(results.simulationPackLossKWh, 2)} kWh`]);
  }

  rows.push(
    ["Peak discharge current", `${fmt(results.simulationPeakDischargeCurrentA, 0)} A (pack limit ${fmt(results.maxDischargeCurrentA, 0)} A)`],
    ["Peak regen current", `${fmt(results.simulationPeakChargeCurrentA, 0)} A`],
    ["Peak pack power", `${fmt(results.simulationPeakPowerKW, 1)} kW`],
    ["Pack voltage range in use", results.simulationMinTerminalVoltageV !== null
      ? `${fmt(results.simulationMinTerminalVoltageV, 1)}–${fmt(results.simulationMaxTerminalVoltageV, 1)} V`
      : "—"],
    ["Time above continuous current rating", results.simulationSecondsAboveContinuous > 0
      ? `${formatSeconds(results.simulationSecondsAboveContinuous)} (longest ${formatSeconds(results.simulationLongestSecondsAboveContinuous)})`
      : "None"]
  );

  const limited = Object.entries(results.simulationLimitSeconds || {}).filter(([, seconds]) => seconds > 0);
  rows.push(["Power-limited time", limited.length
    ? limited.map(([key, seconds]) => `${limitLabel(key)} ${formatSeconds(seconds)}`).join("; ")
    : "None: vehicle and pack meet every demand"]);

  rows.push(["Speed trace missed (> 2 km/h below)", results.simulationSecondsTraceMissed > 0
    ? `${formatSeconds(results.simulationSecondsTraceMissed)} (max ${fmt(results.simulationMaxSpeedShortfallMph, 1)} mph below)`
    : "None"]);

  if (!results.simulationReachedEmpty) {
    rows.push(["Note", "Simulation stopped before the usable window was used (cycle limit reached)."]);
  }

  return rows;
}

function getPerformanceAtLimitsRows(results) {
  // Labels use the driver-displayed charge (100 % = full, 0 % = empty).
  const top = "full charge (100 %)";
  const bottom = `low charge (${LOW_CHARGE_DISPLAY_SOC} %)`;
  const peakFor = results.cellPulseDurationSeconds > 0 ? `, for up to ${fmt(results.cellPulseDurationSeconds, 0)} s` : "";
  const rows = [
    [`Pack peak power at ${top}`, `${fmt(results.packPeakPowerTopKW, 1)} kW @ ${fmt(results.packPeakCurrentTopA, 0)} A, ${fmt(results.packLoadedVoltageTopV, 1)} V (${limitLabel(results.packPeakLimitTop)})${peakFor}`],
    [`Pack peak power at ${bottom}`, `${fmt(results.packPeakPowerBottomKW, 1)} kW @ ${fmt(results.packPeakCurrentBottomA, 0)} A, ${fmt(results.packLoadedVoltageBottomV, 1)} V (${limitLabel(results.packPeakLimitBottom)})${peakFor}`]
  ];

  if (results.variableSimulationEnabled) {
    const describe = (test) => {
      if (!test) return "—";
      if (!test.ok) return test.reason;
      const parts = [
        test.zeroToSixtySeconds !== null ? `0–60 mph ${fmt(test.zeroToSixtySeconds, 1)} s` : "0–60 mph not reached",
        test.fiftyToSeventySeconds !== null ? `50–70 mph ${fmt(test.fiftyToSeventySeconds, 1)} s` : null,
        `peak ${fmt(test.peakCurrentA, 0)} A`,
        test.minTerminalVoltageV !== null ? `min ${fmt(test.minTerminalVoltageV, 0)} V` : null,
        `limit: ${limitLabel(test.limitingFactor)}`
      ].filter(Boolean);
      const events = (test.peakEvents || []).map(e => `${e.what.replace(' ended', '')} ended at ${fmt(e.seconds, 1)} s / ${fmt(e.mph, 0)} mph`);
      if (events.length) parts.push(`(${events.join('; ')})`);
      return parts.join(", ");
    };
    rows.push([`Full-power acceleration at ${top}`, describe(results.fullPowerTop)]);
    rows.push([`Full-power acceleration at ${bottom}`, describe(results.fullPowerBottom)]);
    rows.push(["Max sustained speed (continuous ratings)", `${fmt(results.sustainedSpeedTopMph, 0)} mph at 100 %, ${fmt(results.sustainedSpeedBottomMph, 0)} mph at ${LOW_CHARGE_DISPLAY_SOC} %`]);
  }

  return rows;
}

function getSimulationSettingRows(results) {
  const rows = [
    ["Drive cycle", driveCycleLabel(results.driveCycle)],
    ["Vehicle mass + payload", `${fmt(results.vehicleMassKg, 0)} kg + ${fmt(results.payloadKg, 0)} kg`],
    ["Drag coefficient", fmt(results.dragCoefficient, 2)],
    ["Frontal area", `${fmt(results.frontalAreaM2, 2)} m²`],
    ["Rolling resistance (Crr)", fmt(results.rollingResistanceCoefficient, 4)],
    ["Drivetrain efficiency (battery to wheel)", `${fmt(results.drivetrainEfficiencyPercent, 0)} %`],
    ["Auxiliary load (total)", `${fmt(results.auxiliaryLoadKW, 2)} kW`],
    ["Regenerative braking", results.regenEnabled
      ? `${fmt(results.regenEfficiencyPercent, 0)} % of braking energy, off above ${fmt(results.regenDisableAboveSocPercent, 0)} % SOC, max ${fmt(results.maxRegenCurrentA, 0)} A`
      : "Disabled"],
    ["Cell pulse rating", results.cellPulseDurationSeconds > 0
      ? `${fmt(results.cellMaxDischargeCurrentA, 1)} A for ${fmt(results.cellPulseDurationSeconds, 0)} s, then ${fmt(results.cellContinuousDischargeCurrentA, 1)} A continuous`
      : `${fmt(results.cellMaxDischargeCurrentA, 1)} A, no time limit entered`],
    ["Usable window (100–0 % shown to driver)", `${fmt(results.socWindowTopPercent, 0)}–${fmt(results.socWindowBottomPercent, 0)} % actual cell SOC`],
    ["Cell model", results.advancedCellEnabled
      ? `${results.hasOcvTable ? `OCV table (${results.ocvPointCount} points)` : "Constant nominal voltage"}, DCIR ${fmt(results.cellDcirMilliOhm, 2)} mΩ (pack ${fmt(results.packResistanceMilliOhm, 1)} mΩ)`
      : "Constant nominal voltage, no internal resistance"]
  ];

  if (results.motorLimitsEnabled) {
    const v = (value, unit, decimals = 0) => (Number(value) > 0 ? `${fmt(Number(value), decimals)} ${unit}` : "not set");
    rows.push(
      ["Motor peak / continuous power (datasheet)", `${v(results.motorPeakPowerKW, "kW")}${results.motorPeakDurationSeconds > 0 ? ` for ${fmt(results.motorPeakDurationSeconds, 0)} s` : ""} / ${v(results.motorContinuousPowerKW, "kW")}`],
      ["Controller current limit", v(results.controllerMaxCurrentA, "A")],
      ["Motor peak torque / gear ratio / tyre radius", `${v(results.motorPeakTorqueNm, "Nm")} / ${v(results.gearRatio, ":1", 2)} / ${v(results.tyreRadiusMm, "mm")}${results.tyreSize ? ` (${String(results.tyreSize).trim().toUpperCase()})` : ""}`],
      ["Top speed / regen power limit", `${v(results.vehicleTopSpeedMph, "mph")} / ${v(results.motorMaxRegenPowerKW, "kW")}`]
    );
  } else {
    rows.push(["Motor / drivetrain limits", "Not entered: only pack limits apply"]);
  }

  return rows;
}

function getSimulationAssumptions(results) {
  const items = [
    "Indicative engineering estimate from the inputs shown. It is not a type-approval (WLTP) result and must be validated by test.",
    results.driveCycle === "motorway70"
      ? "Drive cycle: constant 70 mph on a flat road in still air, repeated until the usable SOC window is used."
      : "Drive cycle: official WLTC Class 3b speed trace (UN GTR 15), 1 Hz, flat road, still air, repeated until the usable SOC window is used. WLTP downscaling for low-power vehicles is not applied; any time the vehicle cannot follow the trace is reported instead.",
    "Road load: F = m·a + m·g·Crr + ½·ρ·Cd·A·v², with ρ = 1.225 kg/m³ and g = 9.81 m/s². Rotating inertia, tyre slip, wind and gradient are not modelled.",
    "Drivetrain: constant battery-to-wheel efficiency at all loads and speeds (no motor efficiency map). Range figures are at the battery terminals and exclude charging losses.",
    results.regenEnabled
      ? `Regen: ${fmt(results.regenEfficiencyPercent, 0)} % of braking energy at the wheels is returned to the pack, limited by the pack charge limit (cell max charge × P × 80 %)${results.motorLimitsEnabled && results.motorMaxRegenPowerKW > 0 ? " and the motor regen power limit" : ""}; friction brakes take the rest.`
      : "Regen: disabled; all braking energy is lost to friction brakes.",
    results.advancedCellEnabled
      ? `Pack: equivalent circuit, terminal voltage = OCV − I·R with ${results.hasOcvTable ? "the entered OCV–SOC table" : "constant nominal voltage as OCV"} and a constant DCIR of ${fmt(results.cellDcirMilliOhm, 2)} mΩ per cell. DCIR should be the datasheet value at the temperature being simulated. Thermal behaviour and resistance change with SOC, temperature and age are not modelled.`
      : "Pack: constant nominal voltage with no internal resistance, so voltage sag and pack losses are not included. Enter datasheet values in Advanced Cell Data for a more realistic result.",
    `Usable energy: symmetric SOC window ${fmt(results.socWindowBottomPercent, 0)}–${fmt(results.socWindowTopPercent, 0)} % from the usable factor. Discharge is limited by cell max current × P${results.motorLimitsEnabled && results.controllerMaxCurrentA > 0 ? ", the controller limit" : ""}${results.advancedCellEnabled && results.cellDcirMilliOhm > 0 ? " and the cell minimum voltage under load" : ""}.`,
    `Charge levels are shown as the driver sees them: 100 % = full, 0 % = usable energy used (actual cell SOC ${fmt(results.socWindowTopPercent, 0)}–${fmt(results.socWindowBottomPercent, 0)} %). "Low charge" figures are at ${LOW_CHARGE_DISPLAY_SOC} % displayed charge (${fmt(results.socWindowBottomPercent + (results.socWindowTopPercent - results.socWindowBottomPercent) * LOW_CHARGE_DISPLAY_SOC / 100, 1)} % actual cell SOC).`,
    `Auxiliary load of ${fmt(results.auxiliaryLoadKW, 2)} kW applied continuously (HVAC/lighting toggles use fixed values: A/C 1.5 kW, resistive heater 2.5 kW, heat pump 0.75 kW, lights/wipers/radio 0.5 kW).`
  ];
  if (results.motorLimitsEnabled && results.motorPeakTorqueNm > 0 && results.gearRatio > 0 && results.tyreRadiusMm > 0) {
    items.push("Full-power test: maximum tractive force = motor torque × gear ratio ÷ tyre radius, up to the power limit; traction (tyre grip) limits are not modelled. SOC is held constant during the test.");
  }
  if (results.cellPulseDurationSeconds > 0 || (results.motorLimitsEnabled && results.motorPeakDurationSeconds > 0)) {
    items.push(`Peak ratings are time-limited: ${[
      results.cellPulseDurationSeconds > 0 ? `cell max discharge current for ${fmt(results.cellPulseDurationSeconds, 0)} s` : null,
      results.motorLimitsEnabled && results.motorPeakDurationSeconds > 0 ? `motor peak power for ${fmt(results.motorPeakDurationSeconds, 0)} s` : null
    ].filter(Boolean).join(" and ")}, then the continuous rating applies. In the drive cycle, peak time is used up while above the continuous rating and recovers at the same rate while at or below it (a simple rule, not a thermal model). Each acceleration test (0–60 from rest, 50–70 rolling) starts with the full peak time available.`);
  } else {
    items.push("Peak ratings: no pulse duration entered, so cell max current and motor peak power are assumed available for as long as needed. Enter datasheet durations for a more realistic acceleration result.");
  }
  if (results.motorLimitsEnabled && (results.motorPeakPowerKW > 0 || results.motorContinuousPowerKW > 0)) {
    items.push("Motor power: the datasheet motor output power is applied as the limit on power delivered to the wheels. Gearbox losses between the motor shaft and the wheels are not separated from the overall drivetrain efficiency, so power-limited results are slightly optimistic (typically a few per cent).");
  }
  return items;
}
function degradationChargingMethodLabel(value) {
  const labels = {
    acOnly: "AC charging only",
    dcRapid: "DC rapid charging",
    acDcRapid: "AC and DC rapid charging"
  };

  return labels[value] || value || "AC and DC rapid charging";
}

function valueRow(label, value) { return `<div class="value-row"><span>${label}</span><strong>${value}</strong></div>`; }
function getRequirementStatus(required, available) {
  const requiredValue = Math.max(0, clampNumber(required, 0));
  const availableValue = Math.max(0, clampNumber(available, 0));

  if (requiredValue <= 0) return null;

  if (availableValue <= 0) {
    return {
      label: "FAIL",
      className: "fail",
      marginPercent: -100
    };
  }

  const marginPercent = ((availableValue - requiredValue) / requiredValue) * 100;

  if (availableValue < requiredValue) {
    return {
      label: "FAIL",
      className: "fail",
      marginPercent
    };
  }

  if (marginPercent < 10) {
    return {
      label: "WARNING",
      className: "warning",
      marginPercent
    };
  }

  return {
    label: "PASS",
    className: "pass",
    marginPercent
  };
}
function requirementCheckRow(label, required, available, unit, decimals = 0) {
  const status = getRequirementStatus(required, available);

  if (!status) return "";

  return `
    <div class="value-row">
      <span>
        ${label}
       <small>Required: ${fmt(required, decimals)} ${unit} | Pack available: ${fmt(available, decimals)} ${unit}</small>
      </span>
     <strong>
  ${status.marginPercent < 0
    ? `${fmt(Math.abs(status.marginPercent), 1)}% shortfall`
    : `${fmt(status.marginPercent, 1)}% margin`
  }
  <span class="requirement-status ${status.className}">${status.label}</span>
</strong>
    </div>
  `;
}
function pdfRequirementCheckRow(label, required, available, unit, decimals = 0) {
  const status = getRequirementStatus(required, available);

  if (!status) return null;

  const requiredText = Number.isFinite(Number(required))
    ? `${fmt(Number(required), decimals)} ${unit}`
    : "N/A";

  const availableText = Number.isFinite(Number(available))
    ? `${fmt(Number(available), decimals)} ${unit}`
    : "N/A";

  const marginText = status.marginPercent < 0
    ? `${fmt(Math.abs(status.marginPercent), 1)}% shortfall`
    : `${fmt(status.marginPercent, 1)}% margin`;

  return [
    label,
    `Required: ${requiredText} | Pack available: ${availableText} | ${marginText} | ${status.label}`
  ];
}
function renderResults(results) {
  document.getElementById('results').hidden = false;

 updateDegradationEnergyConsumptionInput();
  updateCalculatedMaxRegenCurrentInput();
  function setOptionalResultVisible(sectionId, visible) {
    const section = document.querySelector(`[data-result-section="${sectionId}"]`);
    const menuButton = document.querySelector(`[data-open-result="${sectionId}"]`);

    if (section) section.hidden = !visible;
    if (menuButton) menuButton.hidden = !visible;
  }

  setOptionalResultVisible('requirementCheck', !!results.designRequirementsEnabled);
  setOptionalResultVisible('degradationResults', !!results.degradationEnabled);
  setOptionalResultVisible('vehicleResults', !!results.variableSimulationEnabled);
  setOptionalResultVisible('simulationGraph', !!results.variableSimulationEnabled);
  setOptionalResultVisible('simulationSettings', !!results.variableSimulationEnabled);
document.getElementById('resultCards').innerHTML = `
  <article class="result-card"><span>⚡</span><small>Pack energy</small><strong>${fmt(results.packEnergyKWh, 2)} kWh</strong></article>
  <article class="result-card"><span>🔋</span><small>Usable energy</small><strong>${fmt(results.usableEnergyKWh, 2)} kWh</strong></article>
  <article class="result-card"><span>🔌</span><small>Nominal voltage</small><strong>${fmt(results.nominalVoltageV, 1)} V</strong></article>
  <article class="result-card"><span>▦</span><small>Cell count</small><strong>${results.numberOfCells}</strong></article>
  <article class="result-card"><span>⚖️</span><small>Cell mass</small><strong>${fmt(results.totalCellWeightKG, 2)} kg</strong></article>
  <article class="result-card"><span>🚗</span><small>Estimated range</small><strong>${results.vehicleRangeMiles !== null ? `${fmt(results.vehicleRangeMiles, 1)} miles` : 'Simulation off'}</strong></article>`;
 document.getElementById('detailedResults').innerHTML = [
  valueRow('Pack configuration', `${fmt(results.seriesCount, 0)}S${fmt(results.parallelCount, 0)}P`),
  valueRow('Pack cell count', `${fmt(results.numberOfCells, 0)} cells`),
  valueRow('Nominal voltage', `${fmt(results.nominalVoltageV, 1)} V`),
  valueRow('Voltage range', `${fmt(results.minVoltageV, 1)}–${fmt(results.maxVoltageV, 1)} V`),
  valueRow('Pack capacity', `${fmt(results.packCapacityAh, 1)} Ah`),
  valueRow('Pack energy', `${fmt(results.packEnergyKWh, 2)} kWh`),
  valueRow('Usable energy', `${fmt(results.usableEnergyKWh, 2)} kWh`),
  valueRow('Usable factor', `${fmt(results.usableEnergyFactor * 100, 0)} %`),
  valueRow('Estimated cell mass', `${fmt(results.totalCellWeightKG, 2)} kg`),
  valueRow('Max discharge', `${fmt(results.maxDischargeCurrentA, 1)} A / ${fmt(results.maxDischargePowerKW, 2)} kW`),
  valueRow('Continuous discharge', `${fmt(results.continuousDischargeCurrentA, 1)} A / ${fmt(results.continuousDischargePowerKW, 2)} kW`),
  valueRow('Max charge', `${fmt(results.maxChargeCurrentA, 1)} A / ${fmt(results.maxChargePowerKW, 2)} kW`),
  valueRow('Max discharge C-rate', `${fmt(results.maxDischargeCRating, 1)} C`),
  valueRow('Max charge C-rate', `${fmt(results.maxChargeCRating, 1)} C`),
  ...(results.advancedCellEnabled
    ? [
        valueRow('Pack internal resistance', `${fmt(results.packResistanceMilliOhm, 1)} mΩ`),
        ...(results.hasOcvTable ? [valueRow('Usable energy (from OCV curve)', `${fmt(results.usableEnergyAtOcvKWh, 2)} kWh`)] : []),
        ...getPerformanceAtLimitsRows({ ...results, variableSimulationEnabled: false }).map(([label, value]) => valueRow(label, value))
      ]
    : [])
].join('');
  const requirementCheckCard = document.getElementById('requirementCheck');
const requirementCheckRows = document.getElementById('requirementCheckRows');

if (requirementCheckCard && requirementCheckRows) {
  if (!results.designRequirementsEnabled) {
    requirementCheckCard.hidden = true;
    requirementCheckRows.innerHTML = "";
  } else {
    const rows = [
  requirementCheckRow(
    "Pulse discharge current",
    results.requiredPulseCurrentA,
    results.maxDischargeCurrentA,
    "A",
    0
  ),

  results.advancedCellEnabled
    ? requirementCheckRow(
        `Pulse power at low charge (${LOW_CHARGE_DISPLAY_SOC} %, with voltage sag)`,
        results.requiredPeakPowerKW,
        results.packPeakPowerBottomKW,
        "kW",
        0
      )
    : "",

  results.requiredPulseDurationSeconds > 0
    ? (results.cellPulseDurationSeconds > 0
        ? requirementCheckRow(
            "Pulse duration (cell pulse rating)",
            results.requiredPulseDurationSeconds,
            results.cellPulseDurationSeconds,
            "s",
            0
          )
        : valueRow(
            "Pulse duration requirement",
            `${fmt(results.requiredPulseDurationSeconds, 0)} s requested — enter the cell's max discharge duration to check it`
          ))
    : "",

  requirementCheckRow(
    "Continuous discharge current",
    results.requiredContinuousCurrentA,
    results.continuousDischargeCurrentA,
    "A",
    0
  ),
      requirementCheckRow(
        "Max charge current",
        results.requiredMaxChargeCurrentA,
        results.maxChargeCurrentA,
        "A",
        0
      ),

      requirementCheckRow(
        "Regen current",
        results.requiredRegenCurrentA,
        results.maxRegenCurrentA,
        "A",
        0
      ),

      requirementCheckRow(
        "Usable energy",
        results.requiredUsableEnergyKWh,
        results.usableEnergyKWh,
        "kWh",
        1
      )
    ].filter(Boolean);

   requirementCheckCard.hidden = !results.designRequirementsEnabled || rows.length === 0;

    requirementCheckRows.innerHTML = rows.length
      ? rows.join("")
      : `<p class="muted">Design Requirements is enabled, but no requirement values have been entered.</p>`;
  }
}
const degradationResultsSection = document.getElementById('degradationResults');
const degradationRows = document.getElementById('degradationRows');

if (degradationResultsSection && degradationRows) {
  if (!results.degradationEnabled) {
    degradationResultsSection.hidden = true;
    degradationRows.innerHTML = "";
  } else {
    degradationResultsSection.hidden = false;

degradationRows.innerHTML = `
  <div class="degradation-result-groups">
    <div class="degradation-result-group">
      <h4>Application profile</h4>
      ${[
                valueRow('Service life target', `${fmt(results.degradationServiceLifeYears, 0)} years`),
        valueRow('Target mileage', `${fmt(results.degradationTargetMileageMiles, 0)} miles`),
        valueRow('Calculated annual mileage', `${fmt(results.degradationAnnualMileageMiles, 0)} miles/year`),
        valueRow(
          'Energy consumption',
          `${fmt(results.degradationEnergyConsumptionKWhPerMile, 3)} kWh/mile ${
            results.degradationEnergyConsumptionSource === "auto" &&
            results.autoDegradationEnergyConsumptionKWhPerMile !== null
              ? "(auto)"
              : "(manual)"
          }`
        ),
        valueRow('Charging method', degradationChargingMethodLabel(results.degradationChargingMethod)),
        valueRow('EOL capacity target', `${fmt(results.degradationEolCapacityPercent, 0)} %`)
      ].join('')}
    </div>

    <div class="degradation-result-group">
      <h4>Pack / SOC basis</h4>
      ${[
        valueRow('BOL usable energy', `${fmt(results.degradationBolUsableEnergyKWh, 2)} kWh`),
        valueRow('EOL usable energy target', `${fmt(results.degradationEolUsableEnergyKWh, 2)} kWh`),
        valueRow('Energy reduction allowance', `${fmt(results.degradationEnergyLostKWh, 2)} kWh`),
        valueRow('Usable factor', `${fmt(results.usableEnergyFactor * 100, 0)} %`),
        valueRow('Calculated SOC window', `${fmt(results.degradationSocWindowMinPercent, 0)}–${fmt(results.degradationSocWindowMaxPercent, 0)} %`),
        valueRow('SOC window size', `${fmt(results.degradationSocWindowPercent, 0)} %`)
      ].join('')}
    </div>

    <div class="degradation-result-group">
      <h4>Lifetime duty</h4>
      ${[
        valueRow('Lifetime energy throughput', `${fmt(results.degradationLifetimeEnergyThroughputKWh, 0)} kWh`),
        valueRow('Energy throughput per year', results.degradationEnergyThroughputPerYearKWh !== null ? `${fmt(results.degradationEnergyThroughputPerYearKWh, 0)} kWh/year` : '—'),
        valueRow('Average daily energy use', results.degradationAverageDailyEnergyUseKWh !== null ? `${fmt(results.degradationAverageDailyEnergyUseKWh, 2)} kWh/day` : '—'),
        valueRow('Equivalent full cycles', results.degradationEquivalentFullCycles !== null ? `${fmt(results.degradationEquivalentFullCycles, 0)} cycles` : '—'),
        valueRow('Estimated BOL range', results.degradationBolRangeMiles !== null ? `${fmt(results.degradationBolRangeMiles, 1)} miles` : '—'),
        valueRow('Estimated EOL range target', results.degradationEolRangeMiles !== null ? `${fmt(results.degradationEolRangeMiles, 1)} miles` : '—')
      ].join('')}
    </div>
  </div>
`;
  }
}  
const cellSpecRows = document.getElementById('cellSpecRows');

if (cellSpecRows) {
 cellSpecRows.innerHTML = [
  valueRow('Nominal voltage', `${fmt(results.cellNominalVoltage, 1)} V`),
  valueRow('Max voltage', `${fmt(results.cellMaxVoltage, 1)} V`),
  valueRow('Min voltage', `${fmt(results.cellMinVoltage, 1)} V`),
  valueRow('Capacity', `${fmt(results.cellCapacityAh, 2)} Ah`),
  valueRow('Cell energy', `${fmt(results.cellEnergyWh, 2)} Wh`),
  valueRow('Max discharge', `${fmt(results.cellMaxDischargeCurrentA, 1)} A`),
  valueRow('Continuous discharge', `${fmt(results.cellContinuousDischargeCurrentA, 1)} A`),
  valueRow('Max charge', `${fmt(results.cellMaxChargeCurrentA, 1)} A`),
  valueRow('Max discharge C-rate', `${fmt(results.cellMaxDischargeCRating, 1)} C`),
  valueRow('Continuous discharge C-rate', `${fmt(results.cellContinuousDischargeCRating, 1)} C`),
  valueRow('Max charge C-rate', `${fmt(results.cellMaxChargeCRating, 1)} C`),
  valueRow('Cell weight', `${fmt(results.cellWeightG, 1)} g`)
].join('');
}  
const moduleRows = document.getElementById("moduleRows");

if (moduleRows) {
  moduleRows.innerHTML = [
    valueRow('Module configuration', results.moduleCount1
      ? `${fmt(results.moduleCount1, 0)} module${results.moduleCount1 === 1 ? "" : "s"} of ${results.moduleConfig}`
      : results.moduleConfig),
    valueRow('Nominal voltage', `${fmt(results.moduleNominalVoltageV, 1)} V`),
    valueRow('Voltage range', `${fmt(results.moduleMinVoltageV, 1)}–${fmt(results.moduleMaxVoltageV, 1)} V`),
    valueRow('Capacity', `${fmt(results.moduleCapacityAh, 1)} Ah`),
    valueRow('Energy', `${fmt(results.moduleEnergyKWh, 2)} kWh`),
    valueRow('Cells per module', `${fmt(results.moduleCellCount, 0)} cells`),
    valueRow('Estimated cell mass', `${fmt(results.moduleWeightKG, 2)} kg`),
    valueRow('Max discharge', `${fmt(results.moduleMaxDischargeCurrentA, 1)} A / ${fmt(results.moduleMaxDischargePowerKW, 2)} kW`),
    valueRow('Continuous discharge', `${fmt(results.moduleContinuousDischargeCurrentA, 1)} A / ${fmt(results.moduleContinuousDischargePowerKW, 2)} kW`),
    valueRow('Max charge', `${fmt(results.moduleMaxChargeCurrentA, 1)} A / ${fmt(results.moduleMaxChargePowerKW, 2)} kW`)
  ].join('');
}

const secondModuleResultsEl = document.getElementById("secondModuleResults");
const secondModuleRows = document.getElementById("secondModuleRows");

if (secondModuleResultsEl) {
  secondModuleResultsEl.hidden = !results.hasSecondModule;
}

if (results.hasSecondModule && secondModuleRows) {
  secondModuleRows.innerHTML = [
    valueRow('Module configuration', results.moduleCount2
      ? `${fmt(results.moduleCount2, 0)} module${results.moduleCount2 === 1 ? "" : "s"} of ${results.module2Config}`
      : results.module2Config),
    valueRow('Nominal voltage', `${fmt(results.module2NominalVoltageV, 1)} V`),
    valueRow('Voltage range', `${fmt(results.module2MinVoltageV, 1)}–${fmt(results.module2MaxVoltageV, 1)} V`),
    valueRow('Capacity', `${fmt(results.module2CapacityAh, 1)} Ah`),
    valueRow('Energy', `${fmt(results.module2EnergyKWh, 2)} kWh`),
    valueRow('Cells per module', `${fmt(results.module2CellCount, 0)} cells`),
    valueRow('Estimated cell mass', `${fmt(results.module2WeightKG, 2)} kg`),
    valueRow('Max discharge', `${fmt(results.module2MaxDischargeCurrentA, 1)} A / ${fmt(results.module2MaxDischargePowerKW, 2)} kW`),
    valueRow('Continuous discharge', `${fmt(results.module2ContinuousDischargeCurrentA, 1)} A / ${fmt(results.module2ContinuousDischargePowerKW, 2)} kW`),
    valueRow('Max charge', `${fmt(results.module2MaxChargeCurrentA, 1)} A / ${fmt(results.module2MaxChargePowerKW, 2)} kW`)
  ].join('');
} else if (secondModuleRows) {
  secondModuleRows.innerHTML = "";
}
  
document.getElementById('sohRows').innerHTML = results.sohRows.map(row => `<div class="soh-row"><div><span>${row.percentage}% SOH</span><strong>${fmt(row.usableEnergyKWh, 2)} kWh</strong></div><progress value="${row.percentage}" max="100"></progress></div>`).join('');

let runtime = "";

const runtimeRows =
  document.getElementById('runtimeRows') ||
  document.getElementById('runtimeEstimates');

const vehicleResultsSection = runtimeRows?.closest('.mobile-result-section') || runtimeRows?.closest('.card');

if (runtimeRows && vehicleResultsSection) {
  if (results.variableSimulationEnabled) {
    vehicleResultsSection.hidden = false;

    const vehicleRows = getVehicleResultRows(results);
    const limitRows = getPerformanceAtLimitsRows(results);
    const assumptions = getSimulationAssumptions(results);

    runtime = vehicleRows.map(([label, value]) => valueRow(label, value)).join('')
      + '<h4 class="result-subheading">Performance at the limits</h4>'
      + limitRows.map(([label, value]) => valueRow(label, value)).join('')
      + '<details class="assumptions-block"><summary>Method and assumptions</summary><ul>'
      + assumptions.map(item => `<li>${item}</li>`).join('')
      + '</ul></details>';

    runtimeRows.innerHTML = runtime;
  } else {
    vehicleResultsSection.hidden = true;
    runtimeRows.innerHTML = "";
  }
}
 const vehicleRangeSection = document.getElementById('vehicleRangeSection');
const vehicleRangeRows = document.getElementById('vehicleRangeRows');

if (vehicleRangeSection && vehicleRangeRows) {
  vehicleRangeSection.hidden = true;
  vehicleRangeRows.innerHTML = "";
}
 const simulationSettingsSection = document.getElementById('simulationSettingsSection');
const simulationSettingsRows = document.getElementById('simulationSettingsRows');

if (simulationSettingsSection && simulationSettingsRows) {
  if (results.variableSimulationEnabled) {
    simulationSettingsSection.hidden = false;

    const settings = getSimulationSettingRows(results).map(([label, value]) => valueRow(label, value)).join('');

    simulationSettingsRows.innerHTML = settings;
  } else {
    simulationSettingsSection.hidden = true;
    simulationSettingsRows.innerHTML = "";
  }
} 
const simSection = document.getElementById('simulationSection');

if (results.variableSimulationEnabled && results.variableSimulationRows.length) {
  simSection.hidden = false;

  resetChartForNewResults();
  // Draw after the section is visible so the canvas has its final size.
  window.requestAnimationFrame(() => drawChart());
} else {
  simSection.hidden = true;
}
}

// ---------------------------------------------------------------------------
// Simulation graph: full run from 100 % to 0 % (driver-displayed SOC),
// replayed at an accelerated speed with play / pause / scrub controls.
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  background: '#050505',
  grid: 'rgba(255,255,255,.08)',
  axis: 'rgba(255,255,255,.28)',
  label: 'rgba(255,255,255,.72)',
  discharge: '#3fe875',
  regen: '#8df0ff',
  speed: 'rgba(255,255,255,.55)',
  soc: '#ffc65c',
  voltage: '#c9a7ff',
  limited: 'rgba(255, 99, 99, .85)',
  cycleLine: 'rgba(255,255,255,.14)',
  playhead: 'rgba(255,255,255,.85)'
};

const chartState = {
  view: 'full',          // 'full' | 'first' | 'last'
  playbackSeconds: 30,
  progress: 1,           // 0..1 through the current view
  playing: false,
  loop: false,
  lastTimestamp: null,
  seriesKey: null,
  series: null
};

function getDisplaySoc(results, actualSoc) {
  const span = results.socWindowTopPercent - results.socWindowBottomPercent;
  if (!(span > 0)) return 0;
  return clamp((actualSoc - results.socWindowBottomPercent) / span * 100, 0, 100);
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function formatDuration(totalSeconds) {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

// Index range of the trace shown by the current view.
function getChartViewRange(results, view) {
  const trace = results.simulationTrace;
  const length = trace.seconds.length;
  const cycleSeconds = results.simulationCycleSeconds || length;
  if (view === 'first') return { start: 0, end: Math.min(length, cycleSeconds) };
  if (view === 'last') {
    const lastCycle = trace.cycle[length - 1];
    const start = trace.cycle.indexOf(lastCycle);
    // A short final part-cycle is less useful on its own, so show the last full cycle length.
    return { start: Math.max(0, Math.min(start, length - cycleSeconds)), end: length };
  }
  return { start: 0, end: length };
}

// Down-sample to roughly one bucket per pixel, keeping the min/max of current
// and voltage so peaks are not averaged away.
function buildChartSeries(results, view, bucketCount) {
  const trace = results.simulationTrace;
  const range = getChartViewRange(results, view);
  const span = range.end - range.start;
  const buckets = Math.max(1, Math.min(bucketCount, span));
  const series = {
    range,
    buckets: [],
    hasVoltage: !!results.advancedCellEnabled,
    cycleStarts: []
  };

  for (let b = 0; b < buckets; b++) {
    const i0 = range.start + Math.floor(b * span / buckets);
    const i1 = Math.max(i0 + 1, range.start + Math.floor((b + 1) * span / buckets));
    let maxDischarge = 0;
    let maxRegen = 0;
    let speedSum = 0;
    let minV = Infinity;
    let maxV = -Infinity;
    let limited = 0;
    for (let i = i0; i < i1; i++) {
      const current = trace.current[i];
      if (current > maxDischarge) maxDischarge = current;
      if (-current > maxRegen) maxRegen = -current;
      speedSum += trace.speedMps[i];
      if (trace.terminalV[i] < minV) minV = trace.terminalV[i];
      if (trace.terminalV[i] > maxV) maxV = trace.terminalV[i];
      limited += trace.limited[i];
    }
    series.buckets.push({
      endIndex: i1 - 1,
      seconds: trace.seconds[i1 - 1],
      maxDischarge,
      maxRegen,
      speedMph: speedSum / (i1 - i0) / 0.44704,
      displaySoc: getDisplaySoc(results, trace.soc[i1 - 1]),
      minV,
      maxV,
      limited: limited > 0
    });
  }

  for (let i = range.start + 1; i < range.end; i++) {
    if (trace.cycle[i] !== trace.cycle[i - 1]) series.cycleStarts.push({ index: i, cycle: trace.cycle[i] });
  }

  series.maxCurrent = Math.max(1, ...series.buckets.map(b => Math.max(b.maxDischarge, b.maxRegen)));
  series.maxSpeed = Math.max(1, ...series.buckets.map(b => b.speedMph));
  series.minV = Math.min(...series.buckets.map(b => b.minV));
  series.maxV = Math.max(...series.buckets.map(b => b.maxV));
  series.startSeconds = range.start > 0 ? trace.seconds[range.start - 1] : 0;
  series.endSeconds = trace.seconds[range.end - 1];
  return series;
}

function niceCeil(value, steps = [1, 2, 2.5, 5, 10]) {
  if (!(value > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of steps) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

function getChartSeries(results, width) {
  const bucketCount = Math.max(200, Math.round(width - 120));
  const key = `${lastResultsInputsKey}|${chartState.view}|${bucketCount}`;
  if (chartState.seriesKey !== key) {
    chartState.series = buildChartSeries(results, chartState.view, bucketCount);
    chartState.seriesKey = key;
  }
  return chartState.series;
}

function drawChart() {
  const results = lastResults;
  const canvas = document.getElementById('currentChart');
  if (!canvas || !results?.simulationTrace?.seconds?.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(300, rect.width);
  const h = Math.max(300, rect.height);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const series = getChartSeries(results, w);
  const buckets = series.buckets;
  const n = buckets.length;
  const visibleCount = Math.max(1, Math.round(chartState.progress * n));
  const visible = buckets.slice(0, visibleCount);

  const compact = w < 560;
  const pad = { left: compact ? 44 : 58, right: compact ? 44 : 58, top: 30, bottom: 26 };
  const gap = 26;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom - gap;
  const topH = plotH * 0.6;
  const bottomH = plotH - topH;
  const topY = pad.top;
  const bottomY = pad.top + topH + gap;

  const x = (index) => pad.left + (index + 0.5) / n * plotW;
  const currentMax = niceCeil(series.maxCurrent * 1.05);
  const speedMax = niceCeil(series.maxSpeed * 1.05, [1, 2, 5, 10]);
  const zeroY = topY + topH * (currentMax / (currentMax * 2));
  const yCurrent = (amps) => zeroY - amps / currentMax * (topH / 2);
  const ySpeed = (mph) => topY + topH - mph / speedMax * topH;
  const ySoc = (pct) => bottomY + bottomH - pct / 100 * bottomH;
  const vPad = Math.max(2, (series.maxV - series.minV) * 0.08);
  const vLo = series.minV - vPad;
  const vHi = series.maxV + vPad;
  const yVolt = (volts) => bottomY + bottomH - (volts - vLo) / Math.max(1e-6, vHi - vLo) * bottomH;

  ctx.fillStyle = CHART_COLORS.background;
  ctx.fillRect(0, 0, w, h);
  ctx.font = `${compact ? 10 : 11}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  // Grid and panel frames
  ctx.strokeStyle = CHART_COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = topY + i / 4 * topH;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left + plotW, yy); ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const yy = bottomY + i / 4 * bottomH;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left + plotW, yy); ctx.stroke();
  }

  // Cycle boundaries
  if (series.cycleStarts.length) {
    ctx.strokeStyle = CHART_COLORS.cycleLine;
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.textAlign = 'left';
    const labelEvery = Math.max(1, Math.ceil(series.cycleStarts.length / (compact ? 6 : 14)));
    series.cycleStarts.forEach((start, k) => {
      const frac = (start.index - series.range.start) / (series.range.end - series.range.start);
      const xx = pad.left + frac * plotW;
      ctx.beginPath(); ctx.moveTo(xx, topY); ctx.lineTo(xx, bottomY + bottomH); ctx.stroke();
      if (k % labelEvery === 0) ctx.fillText(`C${start.cycle}`, xx + 3, topY + 8);
    });
  }

  // Zero-current line
  ctx.strokeStyle = CHART_COLORS.axis;
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + plotW, zeroY); ctx.stroke();

  // Current envelope (bars from zero to peak in each bucket)
  const barW = Math.max(1, plotW / n);
  visible.forEach((b, i) => {
    const xx = x(i) - barW / 2;
    if (b.maxDischarge > 0) {
      ctx.fillStyle = b.limited ? CHART_COLORS.limited : CHART_COLORS.discharge;
      ctx.fillRect(xx, yCurrent(b.maxDischarge), barW, zeroY - yCurrent(b.maxDischarge));
    }
    if (b.maxRegen > 0) {
      ctx.fillStyle = CHART_COLORS.regen;
      ctx.fillRect(xx, zeroY, barW, yCurrent(-b.maxRegen) - zeroY);
    }
  });

  // Speed line
  ctx.strokeStyle = CHART_COLORS.speed;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  visible.forEach((b, i) => (i ? ctx.lineTo(x(i), ySpeed(b.speedMph)) : ctx.moveTo(x(i), ySpeed(b.speedMph))));
  ctx.stroke();

  // Voltage band (min/max) and SOC line in the lower panel
  if (series.hasVoltage) {
    ctx.fillStyle = 'rgba(201,167,255,.28)';
    visible.forEach((b, i) => {
      ctx.fillRect(x(i) - barW / 2, yVolt(b.maxV), barW, Math.max(1, yVolt(b.minV) - yVolt(b.maxV)));
    });
    ctx.strokeStyle = CHART_COLORS.voltage;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    visible.forEach((b, i) => (i ? ctx.lineTo(x(i), yVolt(b.minV)) : ctx.moveTo(x(i), yVolt(b.minV))));
    ctx.stroke();
  }
  ctx.strokeStyle = CHART_COLORS.soc;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  visible.forEach((b, i) => (i ? ctx.lineTo(x(i), ySoc(b.displaySoc)) : ctx.moveTo(x(i), ySoc(b.displaySoc))));
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = CHART_COLORS.label;
  ctx.textAlign = 'right';
  ctx.fillText(`+${fmt(currentMax, 0)} A`, pad.left - 6, topY);
  ctx.fillText('0 A', pad.left - 6, zeroY);
  ctx.fillText(`−${fmt(currentMax, 0)} A`, pad.left - 6, topY + topH);
  ctx.fillText('100 %', pad.left - 6, bottomY);
  ctx.fillText('0 %', pad.left - 6, bottomY + bottomH);
  ctx.textAlign = 'left';
  ctx.fillText(`${fmt(speedMax, 0)} mph`, pad.left + plotW + 6, topY);
  ctx.fillText('0 mph', pad.left + plotW + 6, topY + topH);
  if (series.hasVoltage) {
    ctx.fillStyle = CHART_COLORS.voltage;
    ctx.fillText(`${fmt(vHi, 0)} V`, pad.left + plotW + 6, bottomY);
    ctx.fillText(`${fmt(vLo, 0)} V`, pad.left + plotW + 6, bottomY + bottomH);
  }

  // Time axis
  ctx.fillStyle = CHART_COLORS.label;
  ctx.textAlign = 'left';
  ctx.fillText(formatClock(series.startSeconds), pad.left, h - 10);
  ctx.textAlign = 'right';
  ctx.fillText(formatClock(series.endSeconds), pad.left + plotW, h - 10);
  ctx.textAlign = 'center';
  ctx.fillText(chartState.view === 'full' ? 'Driving time (h:mm:ss)' : 'Driving time since full charge', pad.left + plotW / 2, h - 10);

  // Legends
  const legend = (items, y) => {
    let lx = pad.left;
    ctx.textAlign = 'left';
    ctx.font = `bold ${compact ? 10 : 12}px system-ui, sans-serif`;
    items.forEach(([label, color]) => {
      ctx.fillStyle = color;
      ctx.fillRect(lx, y - 4, 10, 8);
      ctx.fillText(label, lx + 14, y);
      lx += ctx.measureText(label).width + 30;
    });
    ctx.font = `${compact ? 10 : 11}px system-ui, sans-serif`;
  };
  legend([
    ['Discharge (peak)', CHART_COLORS.discharge],
    ['Regen (peak)', CHART_COLORS.regen],
    ['Speed', CHART_COLORS.speed],
    ...(buckets.some(b => b.limited) ? [['Power-limited', CHART_COLORS.limited]] : [])
  ], topY - 14);
  legend([
    ['State of charge (as shown to driver)', CHART_COLORS.soc],
    ...(series.hasVoltage ? [['Pack voltage under load', CHART_COLORS.voltage]] : [])
  ], bottomY - 13);

  // Playhead
  const last = visible[visible.length - 1];
  const headX = x(visibleCount - 1);
  if (chartState.progress < 1) {
    ctx.strokeStyle = CHART_COLORS.playhead;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(headX, topY); ctx.lineTo(headX, bottomY + bottomH); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = CHART_COLORS.soc;
  ctx.beginPath(); ctx.arc(headX, ySoc(last.displaySoc), 4.5, 0, Math.PI * 2); ctx.fill();

  updateDriverLiveData(results, last.endIndex);
  updateChartControls(series);
}

function updateDriverLiveData(results, index) {
  const trace = results?.simulationTrace;
  if (!trace || index === undefined || index < 0) return;

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const current = trace.current[index];
  const cyclesTotal = results.simulationCyclesCompleted;

  set('liveTimeValue', formatClock(trace.seconds[index]));
  set('liveCurrentValue', `${fmt(Math.max(0, current), 0)} A`);
  set('liveRegenCurrentValue', `${fmt(current < 0 ? current : 0, 0)} A`);
  set('liveSpeedValue', `${fmt(trace.speedMps[index] / 0.44704, 0)} mph`);
  set('liveSocValue', `${fmt(getDisplaySoc(results, trace.soc[index]), 0)} %`);
  set('liveEnergyUsedValue', `${fmt(trace.netEnergyJ[index] / 3.6e6, 2)} kWh`);
  set('liveRegenRecoveredValue', `${fmt(trace.regenEnergyJ[index] / 3.6e6, 2)} kWh`);
  set('liveDistanceValue', `${fmt(trace.distanceM[index] / 1609.344, 1)} mi`);
  set('liveVoltageValue', `${fmt(trace.terminalV[index], 0)} V`);
  set('liveDriveStyleValue',
    results.driveCycle === 'motorway70'
      ? `70 mph cruise${trace.limited[index] ? ' (limited)' : ''}`
      : `Cycle ${trace.cycle[index]} of ${Math.ceil(cyclesTotal - 1e-9)} · ${String(trace.phase[index]).replace('WLTP ', '')}${trace.limited[index] ? ' (limited)' : ''}`);
}

function updateChartControls(series) {
  const scrubber = document.getElementById('chartScrubber');
  if (scrubber && document.activeElement !== scrubber) scrubber.value = String(Math.round(chartState.progress * 1000));

  const playBtn = document.getElementById('animateBtn');
  if (playBtn) {
    playBtn.textContent = chartState.playing ? 'Pause' : chartState.progress >= 1 ? 'Replay' : 'Play';
  }

  const stats = document.getElementById('chartStats');
  if (stats && series && lastResults) {
    const simSeconds = series.endSeconds - series.startSeconds;
    const factor = simSeconds / Math.max(1, chartState.playbackSeconds);
    const viewText = {
      full: `Full run, 100 % to 0 %: ${formatDuration(simSeconds)} of driving${lastResults.driveCycle === 'motorway70' ? '' : ` (${fmt(lastResults.simulationCyclesCompleted, 1)} WLTP cycles)`}`,
      first: 'First cycle (full battery)',
      last: 'Final cycle (battery near empty)'
    }[chartState.view];
    stats.textContent = `${viewText} · replayed in ${chartState.playbackSeconds} s (×${fmt(factor, 0)} speed)`;
  }
}

function chartAnimationStep(timestamp) {
  if (!chartState.playing) return;
  if (chartState.lastTimestamp === null) chartState.lastTimestamp = timestamp;
  const elapsed = (timestamp - chartState.lastTimestamp) / 1000;
  chartState.lastTimestamp = timestamp;

  chartState.progress = Math.min(1, chartState.progress + elapsed / chartState.playbackSeconds);
  drawChart();

  if (chartState.progress >= 1) {
    if (chartState.loop) {
      chartState.playing = false;
      window.setTimeout(() => {
        if (!chartState.loop) return;
        chartState.progress = 0;
        playChart();
      }, 1200);
    } else {
      chartState.playing = false;
      updateChartControls(chartState.series);
    }
    return;
  }
  animationFrame = requestAnimationFrame(chartAnimationStep);
}

function playChart() {
  if (!lastResults?.simulationTrace?.seconds?.length) return;
  if (chartState.progress >= 1) chartState.progress = 0;
  chartState.playing = true;
  chartState.lastTimestamp = null;
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(chartAnimationStep);
}

function pauseChart() {
  chartState.playing = false;
  cancelAnimationFrame(animationFrame);
  updateChartControls(chartState.series);
}

// Play / pause toggle (button keeps its original id "animateBtn").
function animateChart() {
  if (chartState.playing) pauseChart();
  else playChart();
}

function resetChartForNewResults() {
  pauseChart();
  chartState.seriesKey = null;
  chartState.progress = 1; // show the complete run until Play is pressed
}

function initChartControls() {
  document.getElementById('chartView')?.addEventListener('change', (event) => {
    chartState.view = event.target.value;
    chartState.seriesKey = null;
    chartState.progress = chartState.playing ? 0 : 1;
    drawChart();
  });
  document.getElementById('chartPlaybackSeconds')?.addEventListener('change', (event) => {
    chartState.playbackSeconds = Math.max(5, Number(event.target.value) || 30);
    updateChartControls(chartState.series);
  });
  const scrubber = document.getElementById('chartScrubber');
  scrubber?.addEventListener('input', () => {
    pauseChart();
    chartState.progress = Math.max(0.001, Number(scrubber.value) / 1000);
    drawChart();
  });
  window.addEventListener('resize', () => {
    if (lastResults?.simulationTrace && !document.getElementById('simulationSection')?.hidden) drawChart();
  });
}

function toggleAdvancedVehicleRealismOptions() {
  const advancedToggle = document.getElementById('advancedVehicleRealismEnabled');
  const advancedInputs = document.getElementById('advancedVehicleRealismInputs');

  if (!advancedToggle || !advancedInputs) return;

  advancedInputs.hidden = !advancedToggle.checked;
}
function toggleDegradationOptions() {
  const enabled = document.getElementById('degradationEnabled')?.checked || false;
  const degradationInputs = document.getElementById('degradationInputs');

  if (degradationInputs) {
    degradationInputs.hidden = !enabled;
  }
}
function toggleDesignRequirementsOptions() {
  const enabled = document.getElementById('designRequirementsEnabled')?.checked || false;
  const designRequirementInputs = document.getElementById('designRequirementInputs');

  if (designRequirementInputs) {
    designRequirementInputs.hidden = !enabled;
  }
}

function toggleSimulationOptions() {
  const enabled = document.getElementById('variableCurrentSimulationEnabled')?.checked || false;

  const simulationOptions = document.getElementById('simulationOptions');
  const vehicleSimulationInputs = document.getElementById('vehicleSimulationInputs');

  if (simulationOptions) simulationOptions.hidden = !enabled;
  if (vehicleSimulationInputs) vehicleSimulationInputs.hidden = !enabled;

  toggleAdvancedVehicleRealismOptions();
}
function showLoading() {
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.hidden = false;
}
function hideLoading() {
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.hidden = true;
}
function showCalculatorPage() {
  cancelAnimationFrame(animationFrame);

  document.getElementById('calculatorPage').hidden = false;
  document.getElementById('resultsPage').hidden = true;

  document.body.classList.remove('mobile-results-menu-open', 'mobile-results-section-open');

  if (window.showMobileInputMenu) {
    window.showMobileInputMenu();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function animateToResultsPage() {
  const calculatorPage = document.getElementById('calculatorPage');
  const resultsPage = document.getElementById('resultsPage');

  if (!calculatorPage || !resultsPage) {
    showResultsPage();
    return;
  }

  cancelAnimationFrame(animationFrame);

  calculatorPage.classList.remove('page-spin-in', 'page-spin-out');
  resultsPage.classList.remove('page-spin-in', 'page-spin-out');

  resultsPage.hidden = true;
  calculatorPage.hidden = false;

  void calculatorPage.offsetWidth;

  calculatorPage.classList.add('page-spin-out');

  window.setTimeout(() => {
    calculatorPage.hidden = true;
    calculatorPage.classList.remove('page-spin-out');

    resultsPage.hidden = false;
    resultsPage.classList.add('page-spin-in');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    window.setTimeout(() => {
      resultsPage.classList.remove('page-spin-in');
    }, 900);
  }, 850);
}function setPdfOptionVisible(optionId, visible) {
  const option = document.getElementById(optionId);
  if (option) option.hidden = !visible;
}

function setPdfCheckboxValue(inputId, checked) {
  const input = document.getElementById(inputId);
  if (input) input.checked = !!checked;
}

function openPdfOptionsModal() {
  if (!lastResults) {
    alert("Please calculate the battery pack first.");
    return;
  }

  const modal = document.getElementById("pdfOptionsModal");
  if (!modal) return;

  const hasModule2 = !!lastResults.hasSecondModule;
  const hasDesignRequirements = !!lastResults.designRequirementsEnabled;
  const hasVehicleSimulation = !!lastResults.variableSimulationEnabled;
  const hasCellTestProfile = !!lastResults.degradationEnabled;

  setPdfOptionVisible("pdfModule2Option", hasModule2);
  setPdfOptionVisible("pdfDesignRequirementsOption", hasDesignRequirements);
  setPdfOptionVisible("pdfVehicleResultsOption", hasVehicleSimulation);
  setPdfOptionVisible("pdfSimulationSettingsOption", hasVehicleSimulation);
  setPdfOptionVisible("pdfCellTestProfileOption", hasCellTestProfile);

  setPdfCheckboxValue("pdfPackOverview", true);
  setPdfCheckboxValue("pdfCellSpecification", true);
  setPdfCheckboxValue("pdfModule1", true);
  togglePdfCellDetailsInput();

const cellManufacturerInput = document.getElementById("pdfCellManufacturer");
const cellModelInput = document.getElementById("pdfCellModel");

if (cellManufacturerInput) cellManufacturerInput.value = "";
if (cellModelInput) cellModelInput.value = "";
  setPdfCheckboxValue("pdfModule2", hasModule2);
  setPdfCheckboxValue("pdfPackResults", true);
  setPdfCheckboxValue("pdfDesignRequirements", hasDesignRequirements);
  setPdfCheckboxValue("pdfSoh", true);
  setPdfCheckboxValue("pdfVehicleResults", hasVehicleSimulation);
  setPdfCheckboxValue("pdfSimulationSettings", hasVehicleSimulation);
  setPdfCheckboxValue("pdfCellTestProfile", hasCellTestProfile)
  setPdfCheckboxValue("pdfNotesEnabled", false);

  const notesWrap = document.getElementById("pdfNotesWrap");
  const notesText = document.getElementById("pdfNotesText");

  if (notesWrap) notesWrap.hidden = true;
  if (notesText) notesText.value = "";

  modal.hidden = false;
}

function closePdfOptionsModal() {
  const modal = document.getElementById("pdfOptionsModal");
  if (modal) modal.hidden = true;
}

function getPdfCheckboxValue(inputId) {
  return !!document.getElementById(inputId)?.checked;
}

function getPdfExportOptions() {
  const cellSpecificationEnabled = getPdfCheckboxValue("pdfCellSpecification");

  return {
    packOverview: getPdfCheckboxValue("pdfPackOverview"),
    cellSpecification: cellSpecificationEnabled,
    cellManufacturer: cellSpecificationEnabled
      ? document.getElementById("pdfCellManufacturer")?.value?.trim() || ""
      : "",
    cellModel: cellSpecificationEnabled
      ? document.getElementById("pdfCellModel")?.value?.trim() || ""
      : "",
    module1: getPdfCheckboxValue("pdfModule1"),
    module2: getPdfCheckboxValue("pdfModule2") && !!lastResults?.hasSecondModule,
    packResults: getPdfCheckboxValue("pdfPackResults"),
    designRequirements: getPdfCheckboxValue("pdfDesignRequirements") && !!lastResults?.designRequirementsEnabled,
    soh: getPdfCheckboxValue("pdfSoh"),
    vehicleResults: getPdfCheckboxValue("pdfVehicleResults") && !!lastResults?.variableSimulationEnabled,
    simulationSettings: getPdfCheckboxValue("pdfSimulationSettings") && !!lastResults?.variableSimulationEnabled,
    cellTestProfile: getPdfCheckboxValue("pdfCellTestProfile") && !!lastResults?.degradationEnabled,
    notesEnabled: getPdfCheckboxValue("pdfNotesEnabled"),
    notesText: document.getElementById("pdfNotesText")?.value?.trim() || ""
  };
}

function togglePdfNotesInput() {
  const notesEnabled = getPdfCheckboxValue("pdfNotesEnabled");
  const notesWrap = document.getElementById("pdfNotesWrap");

  if (notesWrap) {
    notesWrap.hidden = !notesEnabled;
  }
}
function togglePdfCellDetailsInput() {
  const cellSpecificationEnabled = getPdfCheckboxValue("pdfCellSpecification");
  const cellDetailsWrap = document.getElementById("pdfCellDetailsWrap");

  if (cellDetailsWrap) {
    cellDetailsWrap.hidden = !cellSpecificationEnabled;
  }
}

function confirmPdfOptionsAndDownload() {
  lastPdfExportOptions = getPdfExportOptions();
  closePdfOptionsModal();
  downloadSpecSheetPdf();
}

// Standard PDF fonts only cover Windows-1252; replace symbols outside it.
function pdfText(value) {
  return String(value)
    .replace(/Ω/g, "Ohm")
    .replace(/ρ/g, "rho")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/→/g, "->")
    .replace(/−/g, "-");
}

async function downloadSpecSheetPdf() {
  if (!lastResults) {
    alert("Please calculate the battery pack first.");
    return;
  }

  const pdfOptions = lastPdfExportOptions || getPdfExportOptions();

const cellManufacturer = pdfOptions.cellSpecification
  ? pdfOptions.cellManufacturer
  : "";

const cellModel = pdfOptions.cellSpecification
  ? pdfOptions.cellModel
  : "";
  
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library has not loaded yet. Please refresh and try again.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const columnGap = 8;
  const columnWidth = (contentWidth - columnGap) / 2;

  const black = [20, 20, 20];
  const darkGrey = [80, 80, 80];
  const lightGrey = [245, 245, 245];
  const borderGrey = [205, 205, 205];

  let y = 62;

  function fmtSafe(value, suffix = "", decimals = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "N/A";
    }

    return `${fmt(number, decimals)}${suffix}`;
  }

  function textSafe(value) {
    return value === undefined || value === null || value === "" ? "N/A" : String(value);
  }

  async function getImageDataUrl(src) {
    try {
      const response = await fetch(src);
      const blob = await response.blob();

      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

 function addHeader(showTitle = true) {
  const today = new Date().toLocaleDateString("en-GB");
  const dividerY = showTitle ? 54 : 22;

  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(today, pageWidth - margin, 12, { align: "right" });

  if (showTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Calculated Battery Specification", pageWidth / 2, 40, { align: "center" });
  }

  doc.setDrawColor(...black);
  doc.setLineWidth(0.3);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);
}
  
function addFooter() {
  const pageNumber = doc.internal.getNumberOfPages();

  doc.setDrawColor(...black);
  doc.setLineWidth(0.25);
  doc.line(margin + 20, pageHeight - 10, pageWidth - margin - 20, pageHeight - 10);

  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  doc.text("www.voltenergysystems.co.uk", pageWidth / 2, pageHeight - 5, { align: "center" });
  doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 5, { align: "right" });
  doc.setFontSize(5.5);
  doc.setTextColor(...darkGrey);
  doc.text("Calculated estimate for engineering discussion. Not a specification commitment.", pageWidth / 2, pageHeight - 1.8, { align: "center" });
  doc.setTextColor(...black);
}

  async function addLogo() {
    const logo = await getImageDataUrl("assets/pdf-logo.png");

    if (logo) {
      doc.addImage(logo, "PNG", pageWidth / 2 - 38, 6, 76, 17);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("VOLT ENERGY SYSTEMS", pageWidth / 2, 20, { align: "center" });
    }
  }

  function addSectionBox(title, rows, x, boxY, width) {
    const rowHeight = 5.2;
    const headerHeight = 7.5;
    const boxHeight = headerHeight + rows.length * rowHeight + 4;

    doc.setDrawColor(...borderGrey);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, boxY, width, boxHeight, 2, 2, "FD");

    doc.setFillColor(...lightGrey);
    doc.rect(x, boxY, width, headerHeight, "F");

    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title, x + 3, boxY + 6);

    let rowY = boxY + headerHeight + 5;

    rows.forEach(([label, value]) => {
      doc.setDrawColor(230, 230, 230);
      doc.line(x + 3, rowY + 2, x + width - 3, rowY + 2);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkGrey);
      doc.setFontSize(7.2);
      doc.text(pdfText(label), x + 3, rowY);
      const labelWidth = doc.getTextWidth(pdfText(label));

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...black);
      doc.text(fitPdfValue(pdfText(value), width - 10 - labelWidth), x + width - 3, rowY, { align: "right" });

      rowY += rowHeight;
    });

    return boxHeight;
  }

  // Shrink long values so they do not overlap the label.
  function fitPdfValue(text, maxWidth) {
    let size = 7.2;
    doc.setFontSize(size);
    while (doc.getTextWidth(text) > maxWidth && size > 5) {
      size -= 0.2;
      doc.setFontSize(size);
    }
    return text;
  }

  function getSectionHeight(rows) {
    const rowHeight = 5.2;
    const headerHeight = 7.5;

    return headerHeight + rows.length * rowHeight + 4;
  }

function addNewPdfPage() {
  addFooter();
  doc.addPage();
  addHeader(false);
  flowY = 30;
}

  function addFullWidthSection(title, rows) {
    if (!rows || !rows.length) return;

    const sectionHeight = getSectionHeight(rows);

    if (flowY + sectionHeight > pageHeight - 18) {
      flowY = 62;
      addNewPdfPage();
    }

    addSectionBox(title, rows, margin, flowY, contentWidth);

    flowY += sectionHeight + 8;
  }

  function addTwoColumnRow(leftTitle, leftRows, showLeft, rightTitle, rightRows, showRight) {
    if (!showLeft && !showRight) return;

    const leftHeight = showLeft ? getSectionHeight(leftRows) : 0;
    const rightHeight = showRight ? getSectionHeight(rightRows) : 0;
    const rowHeight = Math.max(leftHeight, rightHeight);

    if (flowY + rowHeight > pageHeight - 18) {
      flowY = 62;
      addNewPdfPage();
    }

    if (showLeft) {
      addSectionBox(leftTitle, leftRows, leftX, flowY, columnWidth);
    }

    if (showRight) {
      addSectionBox(rightTitle, rightRows, rightX, flowY, columnWidth);
    }

    flowY += rowHeight + 8;
  }

  function addTextSection(title, text) {
    if (!text) return;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    const lines = doc.splitTextToSize(pdfText(text), contentWidth - 8);
    const lineHeight = 3.6;
    const headerHeight = 7.5;
    let index = 0;

    while (index < lines.length) {
      const available = Math.floor((pageHeight - 18 - flowY - headerHeight - 8) / lineHeight);
      if (available < 3) {
        addNewPdfPage();
        continue;
      }
      const chunk = lines.slice(index, index + available);
      const boxHeight = headerHeight + chunk.length * lineHeight + 6;

      doc.setDrawColor(...borderGrey);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, flowY, contentWidth, boxHeight, 2, 2, "FD");
      doc.setFillColor(...lightGrey);
      doc.rect(margin, flowY, contentWidth, headerHeight, "F");
      doc.setTextColor(...black);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(index === 0 ? title : `${title} (continued)`, margin + 3, flowY + 6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkGrey);
      doc.setFontSize(6.8);

      let lineY = flowY + headerHeight + 5;
      chunk.forEach(line => {
        doc.text(line, margin + 4, lineY);
        lineY += lineHeight;
      });

      flowY += boxHeight + 8;
      index += chunk.length;
    }
  }

  function addNotesSection(notesText) {
    if (!notesText) return;

    const lines = doc.splitTextToSize(notesText, contentWidth - 8);
    const rowHeight = 4.5;
    const headerHeight = 7.5;
    const boxHeight = headerHeight + lines.length * rowHeight + 8;

    if (flowY + boxHeight > pageHeight - 18) {
      flowY = 62;
      addNewPdfPage();
    }

    doc.setDrawColor(...borderGrey);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, flowY, contentWidth, boxHeight, 2, 2, "FD");

    doc.setFillColor(...lightGrey);
    doc.rect(margin, flowY, contentWidth, headerHeight, "F");

    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Notes / Assumptions", margin + 3, flowY + 6);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...darkGrey);
    doc.setFontSize(7.2);

    let noteY = flowY + headerHeight + 6;

    lines.forEach(line => {
      doc.text(line, margin + 4, noteY);
      noteY += rowHeight;
    });

    flowY += boxHeight + 8;
  }
  
  await addLogo();
  addHeader();

  const packOverviewRows = [
    ["Pack configuration", `${lastResults.seriesCount}S${lastResults.parallelCount}P`],
    ["Total cell count", fmtSafe(lastResults.numberOfCells, "", 0)],
    ["Nominal voltage", fmtSafe(lastResults.nominalVoltageV, " V", 1)],
    ["Maximum voltage", fmtSafe(lastResults.maxVoltageV, " V", 1)],
    ["Minimum voltage", fmtSafe(lastResults.minVoltageV, " V", 1)],
    ["Pack capacity", fmtSafe(lastResults.packCapacityAh, " Ah", 1)],
    ["Pack energy", fmtSafe(lastResults.packEnergyKWh, " kWh", 2)],
    ["Usable energy", fmtSafe(lastResults.usableEnergyKWh, " kWh", 2)],
    ["Estimated cell mass", fmtSafe(lastResults.totalCellWeightKG, " kg", 1)]
  ];

  const powerLimitRows = [
    ["Maximum discharge current", fmtSafe(lastResults.maxDischargeCurrentA, " A", 0)],
    ["Continuous discharge current", fmtSafe(lastResults.continuousDischargeCurrentA, " A", 0)],
    ["Maximum charge current", fmtSafe(lastResults.maxChargeCurrentA, " A", 0)],
    ["Maximum discharge power", fmtSafe(lastResults.maxDischargePowerKW, " kW", 1)],
    ["Continuous discharge power", fmtSafe(lastResults.continuousDischargePowerKW, " kW", 1)],
    ["Maximum charge power", fmtSafe(lastResults.maxChargePowerKW, " kW", 1)]
  ];

  const cellSpecRows = [
    ...(cellManufacturer ? [["Cell manufacturer", cellManufacturer]] : []),
    ...(cellModel ? [["Cell model number", cellModel]] : []),
    ["Nominal cell voltage", fmtSafe(lastResults.cellNominalVoltage, " V", 2)],
    ["Maximum cell voltage", fmtSafe(lastResults.cellMaxVoltage, " V", 2)],
    ["Minimum cell voltage", fmtSafe(lastResults.cellMinVoltage, " V", 2)],
    ["Cell capacity", fmtSafe(lastResults.cellCapacityAh, " Ah", 2)],
    ["Cell energy", fmtSafe(lastResults.cellEnergyWh, " Wh", 2)],
    ["Maximum discharge current", fmtSafe(lastResults.cellMaxDischargeCurrentA, " A", 1)],
    ["Continuous discharge current", fmtSafe(lastResults.cellContinuousDischargeCurrentA, " A", 1)],
    ["Maximum charge current", fmtSafe(lastResults.cellMaxChargeCurrentA, " A", 1)],
    ["Cell weight", fmtSafe(lastResults.cellWeightG, " g", 1)]
  ];

  const module1Rows = [
    ["Module configuration", textSafe(lastResults.moduleConfig)],
    ["Module count", fmtSafe(lastResults.moduleCount1, "", 0)],
    ["Module cell count", fmtSafe(lastResults.moduleCellCount, "", 0)],
    ["Module nominal voltage", fmtSafe(lastResults.moduleNominalVoltageV, " V", 1)],
    ["Module voltage range", `${fmtSafe(lastResults.moduleMinVoltageV, " V", 1)} to ${fmtSafe(lastResults.moduleMaxVoltageV, " V", 1)}`],
    ["Module capacity", fmtSafe(lastResults.moduleCapacityAh, " Ah", 1)],
    ["Module energy", fmtSafe(lastResults.moduleEnergyKWh, " kWh", 2)],
    ["Module mass", fmtSafe(lastResults.moduleWeightKG, " kg", 1)],
    ["Module maximum discharge", fmtSafe(lastResults.moduleMaxDischargeCurrentA, " A", 0)],
    ["Module continuous discharge", fmtSafe(lastResults.moduleContinuousDischargeCurrentA, " A", 0)],
    ["Module maximum charge", fmtSafe(lastResults.moduleMaxChargeCurrentA, " A", 0)]
  ];

  const module2Rows = [
    ["Module configuration", textSafe(lastResults.module2Config)],
    ["Module count", fmtSafe(lastResults.moduleCount2, "", 0)],
    ["Module cell count", fmtSafe(lastResults.module2CellCount, "", 0)],
    ["Module nominal voltage", fmtSafe(lastResults.module2NominalVoltageV, " V", 1)],
    ["Module voltage range", `${fmtSafe(lastResults.module2MinVoltageV, " V", 1)} to ${fmtSafe(lastResults.module2MaxVoltageV, " V", 1)}`],
    ["Module capacity", fmtSafe(lastResults.module2CapacityAh, " Ah", 1)],
    ["Module energy", fmtSafe(lastResults.module2EnergyKWh, " kWh", 2)],
    ["Module mass", fmtSafe(lastResults.module2WeightKG, " kg", 1)],
    ["Module maximum discharge", fmtSafe(lastResults.module2MaxDischargeCurrentA, " A", 0)],
    ["Module continuous discharge", fmtSafe(lastResults.module2ContinuousDischargeCurrentA, " A", 0)],
    ["Module maximum charge", fmtSafe(lastResults.module2MaxChargeCurrentA, " A", 0)]
  ];

const packResultRows = [
  ["Pack configuration", `${lastResults.seriesCount}S${lastResults.parallelCount}P`],
  ["Total cell count", fmtSafe(lastResults.numberOfCells, "", 0)],
  ["Nominal voltage", fmtSafe(lastResults.nominalVoltageV, " V", 1)],
  ["Maximum voltage", fmtSafe(lastResults.maxVoltageV, " V", 1)],
  ["Minimum voltage", fmtSafe(lastResults.minVoltageV, " V", 1)],
  ["Capacity", fmtSafe(lastResults.packCapacityAh, " Ah", 1)],
  ["Nominal energy", fmtSafe(lastResults.packEnergyKWh, " kWh", 2)],
  ["Usable energy", fmtSafe(lastResults.usableEnergyKWh, " kWh", 2)],
  ["Cell mass estimate", fmtSafe(lastResults.totalCellWeightKG, " kg", 1)]
];

const designRequirementRows = [
  pdfRequirementCheckRow(
    "Pulse discharge current",
    lastResults.requiredPulseCurrentA,
    lastResults.maxDischargeCurrentA,
    "A",
    0
  ),

  lastResults.advancedCellEnabled
    ? pdfRequirementCheckRow(
        `Pulse power at low charge (${LOW_CHARGE_DISPLAY_SOC} %, with sag)`,
        lastResults.requiredPeakPowerKW,
        lastResults.packPeakPowerBottomKW,
        "kW",
        0
      )
    : null,

  lastResults.requiredPulseDurationSeconds > 0
    ? (lastResults.cellPulseDurationSeconds > 0
        ? pdfRequirementCheckRow(
            "Pulse duration (cell pulse rating)",
            lastResults.requiredPulseDurationSeconds,
            lastResults.cellPulseDurationSeconds,
            "s",
            0
          )
        : ["Pulse duration requirement", `${fmtSafe(lastResults.requiredPulseDurationSeconds, " s", 0)} requested - enter the cell max discharge duration to check it`])
    : null,

  pdfRequirementCheckRow(
    "Continuous discharge current",
    lastResults.requiredContinuousCurrentA,
    lastResults.continuousDischargeCurrentA,
    "A",
    0
  ),

  pdfRequirementCheckRow(
    "Max charge current",
    lastResults.requiredMaxChargeCurrentA,
    lastResults.maxChargeCurrentA,
    "A",
    0
  ),

  pdfRequirementCheckRow(
    "Regen current",
    lastResults.requiredRegenCurrentA,
    lastResults.maxRegenCurrentA,
    "A",
    0
  ),

  pdfRequirementCheckRow(
    "Usable energy",
    lastResults.requiredUsableEnergyKWh,
    lastResults.usableEnergyKWh,
    "kWh",
    1
  )
].filter(Boolean);
const pdfSohRows = (lastResults.sohRows || []).map(row => [
  `${fmtSafe(row.percentage, "%", 0)} SOH`,
  fmtSafe(row.usableEnergyKWh, " kWh", 2)
]);

const vehicleResultRows = getVehicleResultRows(lastResults);
const performanceRows = getPerformanceAtLimitsRows(lastResults);
const simulationSettingRows = getSimulationSettingRows(lastResults);
const assumptionItems = getSimulationAssumptions(lastResults);

  const cellTestProfileRows = [
  ["Service life target", fmtSafe(lastResults.degradationServiceLifeYears, " years", 0)],
  ["Target mileage", fmtSafe(lastResults.degradationTargetMileageMiles, " miles", 0)],
  ["Calculated annual mileage", fmtSafe(lastResults.degradationAnnualMileageMiles, " miles/year", 0)],
  ["Energy consumption", `${fmtSafe(lastResults.degradationEnergyConsumptionKWhPerMile, " kWh/mile", 3)} ${lastResults.degradationEnergyConsumptionSource === "auto" ? "(auto)" : "(manual)"}`],
  ["Charging method", degradationChargingMethodLabel(lastResults.degradationChargingMethod)],
  ["BOL usable energy", fmtSafe(lastResults.degradationBolUsableEnergyKWh, " kWh", 2)],
  ["EOL usable energy target", fmtSafe(lastResults.degradationEolUsableEnergyKWh, " kWh", 2)],
  ["EOL capacity target", fmtSafe(lastResults.degradationEolCapacityPercent, "%", 0)],
  ["Calculated SOC window", `${fmtSafe(lastResults.degradationSocWindowMinPercent, "%", 0)}–${fmtSafe(lastResults.degradationSocWindowMaxPercent, "%", 0)}`],
  ["Lifetime energy throughput", fmtSafe(lastResults.degradationLifetimeEnergyThroughputKWh, " kWh", 0)],
  ["Energy throughput per year", fmtSafe(lastResults.degradationEnergyThroughputPerYearKWh, " kWh/year", 0)],
  ["Average daily energy use", fmtSafe(lastResults.degradationAverageDailyEnergyUseKWh, " kWh/day", 2)],
  ["Equivalent full cycles", fmtSafe(lastResults.degradationEquivalentFullCycles, " cycles", 0)],
  ["Estimated BOL range", fmtSafe(lastResults.degradationBolRangeMiles, " miles", 1)],
  ["Estimated EOL range target", fmtSafe(lastResults.degradationEolRangeMiles, " miles", 1)]
];

const leftX = margin;
const rightX = margin + columnWidth + columnGap;

let flowY = 62;

/* Row 1 */
addTwoColumnRow(
  "Pack Overview",
  packOverviewRows,
  pdfOptions.packOverview,
  "Pack Current & Power Limits",
  powerLimitRows,
  pdfOptions.packOverview
);

/* Row 2 */
addTwoColumnRow(
  "Pack Results",
  packResultRows,
  pdfOptions.packResults,
  "Cell Specification",
  cellSpecRows,
  pdfOptions.cellSpecification
);

/* Row 3 */
addTwoColumnRow(
  "Module 1 Specification",
  module1Rows,
  pdfOptions.module1,
  "Module 2 Specification",
  module2Rows,
  pdfOptions.module2 && lastResults.hasSecondModule
);

/* Row 4 */
addTwoColumnRow(
  "Usable Energy vs SOH",
  pdfSohRows,
  pdfOptions.soh,
  "Simulation Settings",
  simulationSettingRows,
  pdfOptions.simulationSettings && lastResults.variableSimulationEnabled
);

/* Row 5 */
if (pdfOptions.designRequirements && lastResults.designRequirementsEnabled) {
  addFullWidthSection(
    "Design Requirements Check",
    designRequirementRows
  );
}

if (pdfOptions.vehicleResults && lastResults.variableSimulationEnabled) {
  addFullWidthSection(
    "Vehicle Simulation Results",
    vehicleResultRows
  );
  addFullWidthSection(
    "Performance at the Limits",
    performanceRows
  );
  addTextSection("Simulation Method & Assumptions", assumptionItems.map(item => `- ${item}`).join("\n"));
}
  
if (pdfOptions.cellTestProfile && lastResults.degradationEnabled) {
  addFullWidthSection(
    "Cell Test Profile Data",
    cellTestProfileRows
  );
}
/* Notes full width at the end */
if (pdfOptions.notesEnabled && pdfOptions.notesText) {
  addNotesSection(pdfOptions.notesText);
}
addFooter();

doc.save("battery-pack-specification.pdf");
}

async function downloadCellTestProfilePdf() {
  if (!lastResults) {
    alert("Please calculate the battery pack first.");
    return;
  }

  if (!lastResults.degradationEnabled) {
    alert("Enable Cell Test Profile Data and calculate again before downloading this PDF.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library has not loaded yet. Please refresh and try again.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const columnGap = 8;
  const columnWidth = (contentWidth - columnGap) / 2;

  const black = [20, 20, 20];
  const darkGrey = [80, 80, 80];
  const lightGrey = [245, 245, 245];
  const borderGrey = [205, 205, 205];

  const leftX = margin;
  const rightX = margin + columnWidth + columnGap;
  let flowY = 62;

  function fmtSafe(value, suffix = "", decimals = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "N/A";
    }

    return `${fmt(number, decimals)}${suffix}`;
  }

  function textSafe(value) {
    return value === undefined || value === null || value === "" ? "N/A" : String(value);
  }

  async function getImageDataUrl(src) {
    try {
      const response = await fetch(src);
      const blob = await response.blob();

      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function addLogo() {
    const logo = await getImageDataUrl("assets/pdf-logo.png");

    if (logo) {
      doc.addImage(logo, "PNG", pageWidth / 2 - 38, 6, 76, 17);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("VOLT ENERGY SYSTEMS", pageWidth / 2, 20, { align: "center" });
    }
  }

  function addHeader() {
    const today = new Date().toLocaleDateString("en-GB");

    doc.setTextColor(...black);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(today, pageWidth - margin, 12, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.text("Cell Degradation Test Profile Data", pageWidth / 2, 40, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...darkGrey);
    doc.text(
      "Use-case, pack and cell data for creating a cell ageing / degradation test profile.",
      pageWidth / 2,
      47,
      { align: "center" }
    );

    doc.setDrawColor(...black);
    doc.setLineWidth(0.3);
    doc.line(margin, 54, pageWidth - margin, 54);
  }

  function addFooter() {
    const pageNumber = doc.internal.getNumberOfPages();

    doc.setDrawColor(...black);
    doc.setLineWidth(0.25);
    doc.line(margin + 20, pageHeight - 10, pageWidth - margin - 20, pageHeight - 10);

    doc.setTextColor(...black);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    doc.text("www.voltenergysystems.co.uk", pageWidth / 2, pageHeight - 5, { align: "center" });
    doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 5, { align: "right" });
    doc.setFontSize(5.5);
    doc.setTextColor(...darkGrey);
    doc.text("Calculated estimate for engineering discussion. Not a specification commitment.", pageWidth / 2, pageHeight - 1.8, { align: "center" });
    doc.setTextColor(...black);
  }

  function getSectionHeight(rows) {
    const rowHeight = 5.2;
    const headerHeight = 7.5;

    return headerHeight + rows.length * rowHeight + 4;
  }

  function addSectionBox(title, rows, x, boxY, width) {
    const rowHeight = 5.2;
    const headerHeight = 7.5;
    const boxHeight = getSectionHeight(rows);

    doc.setDrawColor(...borderGrey);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, boxY, width, boxHeight, 2, 2, "FD");

    doc.setFillColor(...lightGrey);
    doc.rect(x, boxY, width, headerHeight, "F");

    doc.setTextColor(...black);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title, x + 3, boxY + 6);

    let rowY = boxY + headerHeight + 5;

    rows.forEach(([label, value]) => {
      doc.setDrawColor(230, 230, 230);
      doc.line(x + 3, rowY + 2, x + width - 3, rowY + 2);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkGrey);
      doc.setFontSize(7.2);
      doc.text(String(label), x + 3, rowY);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...black);

      const valueText = String(value);
      const maxValueWidth = width * 0.44;
      const valueLines = doc.splitTextToSize(valueText, maxValueWidth);

      doc.text(valueLines, x + width - 3, rowY, { align: "right" });

      rowY += rowHeight;
    });

    return boxHeight;
  }

  function addNewPdfPage() {
    addFooter();
    doc.addPage();
    addHeader();
  }

  function addTwoColumnRow(leftTitle, leftRows, rightTitle, rightRows) {
    const leftHeight = getSectionHeight(leftRows);
    const rightHeight = getSectionHeight(rightRows);
    const rowHeight = Math.max(leftHeight, rightHeight);

    if (flowY + rowHeight > pageHeight - 18) {
      flowY = 62;
      addNewPdfPage();
    }

    addSectionBox(leftTitle, leftRows, leftX, flowY, columnWidth);
    addSectionBox(rightTitle, rightRows, rightX, flowY, columnWidth);

    flowY += rowHeight + 8;
  }

  await addLogo();
  addHeader();

  const applicationProfileRows = [
    ["Service life target", fmtSafe(lastResults.degradationServiceLifeYears, " years", 0)],
    ["Target mileage", fmtSafe(lastResults.degradationTargetMileageMiles, " miles", 0)],
    ["Calculated annual mileage", fmtSafe(lastResults.degradationAnnualMileageMiles, " miles/year", 0)],
    ["Energy consumption", fmtSafe(lastResults.degradationEnergyConsumptionKWhPerMile, " kWh/mile", 2)],
    ["Charging method", degradationChargingMethodLabel(lastResults.degradationChargingMethod)],
    ["EOL capacity target", fmtSafe(lastResults.degradationEolCapacityPercent, "%", 0)]
  ];

const moduleConfigurationRows = lastResults.hasSecondModule
  ? [
      [
        "Module configuration 1",
        `${lastResults.moduleConfig} - ${fmt(lastResults.moduleCount1, 0)} module${lastResults.moduleCount1 === 1 ? "" : "s"}`
      ],
      [
        "Module configuration 2",
        `${lastResults.module2Config} - ${fmt(lastResults.moduleCount2, 0)} module${lastResults.moduleCount2 === 1 ? "" : "s"}`
      ]
    ]
  : [
      [
        "Module configuration",
        `${lastResults.moduleConfig} - ${fmt(lastResults.moduleCount1, 0)} module${lastResults.moduleCount1 === 1 ? "" : "s"}`
      ]
    ];

const packBasisRows = [
  ["Pack configuration", `${lastResults.seriesCount}S${lastResults.parallelCount}P`],
  ...moduleConfigurationRows,
  ["Total cell count", fmtSafe(lastResults.numberOfCells, "", 0)],
  ["Nominal voltage", fmtSafe(lastResults.nominalVoltageV, " V", 1)],
  ["Voltage range", `${fmtSafe(lastResults.minVoltageV, " V", 1)} to ${fmtSafe(lastResults.maxVoltageV, " V", 1)}`],
  ["Pack capacity", fmtSafe(lastResults.packCapacityAh, " Ah", 1)],
  ["Nominal energy", fmtSafe(lastResults.packEnergyKWh, " kWh", 2)],
  ["BOL usable energy", fmtSafe(lastResults.degradationBolUsableEnergyKWh, " kWh", 2)]
];

  const socChargingRows = [
    ["Usable factor", fmtSafe(lastResults.usableEnergyFactor * 100, "%", 0)],
    ["Calculated SOC window", `${fmtSafe(lastResults.degradationSocWindowMinPercent, "%", 0)} to ${fmtSafe(lastResults.degradationSocWindowMaxPercent, "%", 0)}`],
    ["SOC window size", fmtSafe(lastResults.degradationSocWindowPercent, "%", 0)],
    ["Maximum charge current", fmtSafe(lastResults.maxChargeCurrentA, " A", 0)],
    ["Maximum charge power", fmtSafe(lastResults.maxChargePowerKW, " kW", 1)],
    ["Charging method", degradationChargingMethodLabel(lastResults.degradationChargingMethod)]
  ];

  const lifetimeDutyRows = [
    ["Lifetime energy throughput", fmtSafe(lastResults.degradationLifetimeEnergyThroughputKWh, " kWh", 0)],
    ["Energy throughput per year", fmtSafe(lastResults.degradationEnergyThroughputPerYearKWh, " kWh/year", 0)],
    ["Average daily energy use", fmtSafe(lastResults.degradationAverageDailyEnergyUseKWh, " kWh/day", 2)],
    ["Equivalent full cycles", fmtSafe(lastResults.degradationEquivalentFullCycles, " cycles", 0)],
    ["Estimated BOL range", fmtSafe(lastResults.degradationBolRangeMiles, " miles", 1)],
    ["Estimated EOL range target", fmtSafe(lastResults.degradationEolRangeMiles, " miles", 1)]
  ];

 const cellLevelRows = [
  ["Nominal cell voltage", fmtSafe(lastResults.cellNominalVoltage, " V", 2)],
  ["Maximum cell voltage", fmtSafe(lastResults.cellMaxVoltage, " V", 2)],
  ["Minimum cell voltage", fmtSafe(lastResults.cellMinVoltage, " V", 2)],
  ["Cell capacity", fmtSafe(lastResults.cellCapacityAh, " Ah", 2)],
  ["Cell energy", fmtSafe(lastResults.cellEnergyWh, " Wh", 2)],
  ["Maximum discharge current", fmtSafe(lastResults.cellMaxDischargeCurrentA, " A", 1)],
  ["Continuous discharge current", fmtSafe(lastResults.cellContinuousDischargeCurrentA, " A", 1)],
  ["Maximum charge current", fmtSafe(lastResults.cellMaxChargeCurrentA, " A", 1)],
  ["Max discharge C-rate", fmtSafe(lastResults.cellMaxDischargeCRating, " C", 1)],
  ["Continuous discharge C-rate", fmtSafe(lastResults.cellContinuousDischargeCRating, " C", 1)],
  ["Max charge C-rate", fmtSafe(lastResults.cellMaxChargeCRating, " C", 1)]
];

const cellRequiredPulseCurrentA =
  lastResults.designRequirementsEnabled &&
  lastResults.requiredPulseCurrentA > 0 &&
  lastResults.parallelCount > 0
    ? lastResults.requiredPulseCurrentA / lastResults.parallelCount
    : null;

const cellRequiredContinuousCurrentA =
  lastResults.designRequirementsEnabled &&
  lastResults.requiredContinuousCurrentA > 0 &&
  lastResults.parallelCount > 0
    ? lastResults.requiredContinuousCurrentA / lastResults.parallelCount
    : null;

const cellRequiredChargeCurrentA =
  lastResults.designRequirementsEnabled &&
  lastResults.requiredMaxChargeCurrentA > 0 &&
  lastResults.parallelCount > 0
    ? lastResults.requiredMaxChargeCurrentA / lastResults.parallelCount
    : null;

const requirementPulsePowerKW =
  lastResults.designRequirementsEnabled &&
  lastResults.requiredPulseCurrentA > 0
    ? lastResults.nominalVoltageV * lastResults.requiredPulseCurrentA / 1000
    : null;

const requirementContinuousPowerKW =
  lastResults.designRequirementsEnabled &&
  lastResults.requiredContinuousCurrentA > 0
    ? lastResults.nominalVoltageV * lastResults.requiredContinuousCurrentA / 1000
    : null;

const vehicleRequirementRows = lastResults.designRequirementsEnabled
  ? [
      ["Required pulse current", fmtSafe(lastResults.requiredPulseCurrentA, " A", 0)],
      ["Required pulse duration", fmtSafe(lastResults.requiredPulseDurationSeconds, " s", 0)],
      ["Required pulse power", requirementPulsePowerKW !== null ? fmtSafe(requirementPulsePowerKW, " kW", 1) : "N/A"],
      ["Required continuous current", fmtSafe(lastResults.requiredContinuousCurrentA, " A", 0)],
      ["Required continuous power", requirementContinuousPowerKW !== null ? fmtSafe(requirementContinuousPowerKW, " kW", 1) : "N/A"],
     ["Required max charge", `${fmtSafe(lastResults.requiredMaxChargeCurrentA, " A", 0)} / ${fmtSafe(lastResults.requiredMaxChargePowerKW, " kW", 1)}`],
      ["Required usable energy", fmtSafe(lastResults.requiredUsableEnergyKWh, " kWh", 1)],
      ["Required regen current", fmtSafe(lastResults.requiredRegenCurrentA, " A", 0)],
      ["Cell-level pulse current", cellRequiredPulseCurrentA !== null ? fmtSafe(cellRequiredPulseCurrentA, " A", 2) : "N/A"],
      ["Cell-level continuous current", cellRequiredContinuousCurrentA !== null ? fmtSafe(cellRequiredContinuousCurrentA, " A", 2) : "N/A"],
      ["Cell-level charge current", cellRequiredChargeCurrentA !== null ? fmtSafe(cellRequiredChargeCurrentA, " A", 2) : "N/A"]
    ]
  : [
      ["Design requirements", "Not enabled"],
      ["Required pulse current", "N/A"],
      ["Required pulse duration", "N/A"],
      ["Required continuous current", "N/A"],
      ["Required max charge current", "N/A"],
      ["Cell-level requirement", "N/A"]
    ];

  addTwoColumnRow(
    "Application Profile",
    applicationProfileRows,
    "Pack Basis",
    packBasisRows
  );

  addTwoColumnRow(
    "Lifetime Duty",
    lifetimeDutyRows,
    "SOC / Charging",
    socChargingRows
  );

addTwoColumnRow(
  "Cell-Level Data",
  cellLevelRows,
  "Vehicle / Pack Requirement",
  vehicleRequirementRows
);

  addFooter();

  doc.save("cell-degradation-test-profile-data.pdf");
}

function runCalculation(inputs) {
  lastResults = calculate(inputs);
  lastResultsInputsKey = JSON.stringify(inputs);
  return lastResults;
}

function handleCalculate(event) {
  event?.preventDefault();

  try {
    const inputs = getInputs();
    const errors = getInputValidationErrors(inputs);
    if (errors.length) {
      alert("Please check these inputs:\n\n- " + errors.join("\n- "));
      return;
    }

    saveInputs(inputs);
    runCalculation(inputs);

    animateToResultsPage();

    window.setTimeout(() => {
      renderResults(lastResults);

      if (window.showMobileResultsMenu) {
        window.showMobileResultsMenu();
      }
    }, 900);
  } catch (error) {
    alert("Calculation error: " + error.message);
    console.error(error);
  }
}
function resetAll() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  setInputs({ ...DEFAULT_INPUTS });
  updateModuleConfigurationOptions();
  updateCalculatedMaxRegenCurrentInput();
  lastResults = null;
  lastResultsInputsKey = null;
  showCalculatorPage();
}
function refreshResultsIfVisible() {
  const resultsPage = document.getElementById('resultsPage');

  if (!resultsPage || resultsPage.hidden) return;

  const inputs = getInputs();
  if (getInputValidationErrors(inputs).length) return;
  runCalculation(inputs);
  renderResults(lastResults);
}
function toggleAdvancedCellOptions() {
  const enabled = document.getElementById('advancedCellEnabled')?.checked || false;
  const inputs = document.getElementById('advancedCellInputs');
  if (inputs) inputs.hidden = !enabled;
}
function toggleMotorOptions() {
  const enabled = document.getElementById('motorLimitsEnabled')?.checked || false;
  const inputs = document.getElementById('motorInputs');
  if (inputs) inputs.hidden = !enabled;
}
function handleFieldChange(name) {
  if (name === "seriesCount" || name === "parallelCount" || name === "useSecondModuleConfiguration") {
    updateModuleConfigurationOptions();
  } else if (name === "moduleConfiguration") {
    updateModuleCount1FromConfiguration();
  } else if (name === "secondModuleConfiguration") {
    updateSecondModuleConfigurationOptions();
  } else if (name === "moduleCount1" || name === "moduleCount2") {
    updateSecondModuleConfigurationOptions(name);
  } else if (name === "cellOcvTable") {
    updateOcvTableStatus();
  } else if (name === "tyreSize") {
    updateTyreSizeStatus(true);
  } else if (name === "tyreRadiusMm") {
    updateTyreSizeStatus(false);
  }

  saveInputs(getInputs());
  updateCalculatedMaxRegenCurrentInput();
  refreshResultsIfVisible();
  updateDegradationEnergyConsumptionInput();
}
function init() {
  setInputs(loadInputs());
  updateModuleConfigurationOptions();

  document.getElementById('calculatorForm')?.addEventListener('submit', handleCalculate);
  document.getElementById('resetBtn')?.addEventListener('click', resetAll);
  document.getElementById('backBtn')?.addEventListener('click', showCalculatorPage);
  document.getElementById('downloadPdfBtn')?.addEventListener('click', openPdfOptionsModal);
  document.getElementById('downloadCellTestPdfBtn')?.addEventListener('click', downloadCellTestProfilePdf);
  document.getElementById("closePdfOptionsBtn")?.addEventListener("click", closePdfOptionsModal);
  document.getElementById("cancelPdfOptionsBtn")?.addEventListener("click", closePdfOptionsModal);
  document.getElementById("confirmPdfOptionsBtn")?.addEventListener("click", confirmPdfOptionsAndDownload);
  document.getElementById("pdfNotesEnabled")?.addEventListener("change", togglePdfNotesInput);
  document.getElementById("pdfCellSpecification")?.addEventListener("change", togglePdfCellDetailsInput);
  document.getElementById("cellOcvTableFile")?.addEventListener("change", loadOcvTableFile);

  document.getElementById("pdfOptionsModal")?.addEventListener("click", event => {
    if (event.target.id === "pdfOptionsModal") {
      closePdfOptionsModal();
    }
  });

  const sectionToggles = {
    variableCurrentSimulationEnabled: toggleSimulationOptions,
    advancedVehicleRealismEnabled: toggleAdvancedVehicleRealismOptions,
    designRequirementsEnabled: toggleDesignRequirementsOptions,
    degradationEnabled: toggleDegradationOptions,
    advancedCellEnabled: toggleAdvancedCellOptions,
    motorLimitsEnabled: toggleMotorOptions
  };
  Object.entries(sectionToggles).forEach(([id, toggle]) => {
    document.getElementById(id)?.addEventListener('change', toggle);
  });

  document.getElementById('animateBtn')?.addEventListener('click', animateChart);
  initChartControls();

  // One handler per field. Text-like inputs update on 'input' (live typing);
  // selects and checkboxes on 'change'. Previously both events ran every
  // handler, so each keystroke recalculated several times.
  for (const [name] of fields) {
    const el = document.getElementById(name);
    if (!el) continue;
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => handleFieldChange(name));
  }

  updateCalculatedMaxRegenCurrentInput();
  updateDegradationEnergyConsumptionInput();

  initMobileInputSections();
  initMobileResultSections();

  window.addEventListener('orientationchange', handleMobileGraphOrientation);
  window.addEventListener('resize', handleMobileGraphOrientation);

  document.getElementById('calculatorPage').hidden = false;
  document.getElementById('resultsPage').hidden = true;
  hideLoading();
}

function initMobileInputSections() {
  const menu = document.getElementById('mobileInputMenu');
  const toolbar = document.getElementById('mobileInputToolbar');
  const backBtn = document.getElementById('mobileInputBack');
  const title = document.getElementById('mobileInputTitle');

   const sections = [
    { id: 'inputCellData', title: 'Cell Data' },
    { id: 'inputPackLayout', title: 'Pack Layout' },
    { id: 'inputAdvancedCell', title: 'Advanced Cell Data' },
    { id: 'inputMotor', title: 'Motor & Drivetrain' },
    { id: 'inputDesignRequirements', title: 'Design Requirements' },
    { id: 'inputPackDegradation', title: 'Pack Degradation / EOL' },
    { id: 'inputVehicleSimulation', title: 'Vehicle Simulation' }
  ];

  const mobileQuery = window.matchMedia('(max-width: 950px), (pointer: coarse)')

  function showMenu() {
    if (!mobileQuery.matches) {
      document.body.classList.remove('mobile-input-menu-open', 'mobile-input-section-open');
      if (menu) menu.hidden = true;
      if (toolbar) toolbar.hidden = true;
      sections.forEach(section => {
        const el = document.getElementById(section.id);
        if (el) el.hidden = false;
      });
      return;
    }

    document.body.classList.add('mobile-input-menu-open');
    document.body.classList.remove('mobile-input-section-open');

    if (menu) menu.hidden = false;
    if (toolbar) toolbar.hidden = true;

    sections.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) el.hidden = true;
    });
  }

    function showSection(sectionId) {
    const selected = sections.find(section => section.id === sectionId);

    document.body.classList.remove('mobile-input-menu-open');
    document.body.classList.add('mobile-input-section-open');

    if (menu) menu.hidden = true;
    if (toolbar) toolbar.hidden = false;
    if (title) title.textContent = selected?.title || 'Section';

    sections.forEach(section => {
      const el = document.getElementById(section.id);
      if (el) el.hidden = section.id !== sectionId;
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-open-input]').forEach(button => {
    button.addEventListener('click', () => {
      showSection(button.dataset.openInput);
    });
  });

  if (backBtn) {
    backBtn.addEventListener('click', showMenu);
  }

  mobileQuery.addEventListener('change', showMenu);
  showMenu();

  window.showMobileInputMenu = showMenu;
}
function moveGraphIntoFullscreenOverlay() {
  const stage = document.getElementById('graphFullscreenStage');
  const chart = document.getElementById('currentChart');
  const driverLive = document.getElementById('driverLive');

  if (!stage || !chart || !driverLive) return;

  if (!chartPlaceholder) {
    chartPlaceholder = document.createComment('currentChart original position');
    chart.parentNode.insertBefore(chartPlaceholder, chart);
  }

  if (!driverLivePlaceholder) {
    driverLivePlaceholder = document.createComment('driverLive original position');
    driverLive.parentNode.insertBefore(driverLivePlaceholder, driverLive);
  }

  stage.appendChild(chart);
  stage.appendChild(driverLive);
}

function moveGraphBackToResultsCard() {
  const chart = document.getElementById('currentChart');
  const driverLive = document.getElementById('driverLive');

  if (chartPlaceholder?.parentNode && chart) {
    chartPlaceholder.parentNode.insertBefore(chart, chartPlaceholder);
  }

  if (driverLivePlaceholder?.parentNode && driverLive) {
    driverLivePlaceholder.parentNode.insertBefore(driverLive, driverLivePlaceholder);
  }
}

function openMobileGraphExperience() {
  if (!lastResults?.variableSimulationRows?.length) {
    alert("Enable Vehicle energy simulation and calculate again before viewing the simulation graph.");

    if (window.showMobileResultsMenu) {
      window.showMobileResultsMenu();
    }

    return;
  }

  mobileGraphExperienceActive = true;
  mobileGraphHasPlayed = false;

  document.body.classList.add('mobile-graph-overlay-active');

  const overlay = document.getElementById('graphFullscreenOverlay');
  if (overlay) overlay.hidden = false;

  handleMobileGraphOrientation();
}

function closeMobileGraphExperience(returnToResultsMenu = true) {
  const overlay = document.getElementById('graphFullscreenOverlay');
  const prompt = document.getElementById('graphRotatePrompt');
  const stage = document.getElementById('graphFullscreenStage');

  stopMobileGraphLoop();
  moveGraphBackToResultsCard();

  mobileGraphExperienceActive = false;
  mobileGraphHasPlayed = false;

  document.body.classList.remove('mobile-graph-overlay-active');

  if (overlay) overlay.hidden = true;
  if (prompt) prompt.hidden = false;
  if (stage) stage.hidden = true;

  if (returnToResultsMenu && window.showMobileResultsMenu) {
    window.showMobileResultsMenu();
  }
}

function startMobileGraphLoop() {
  if (!lastResults?.simulationTrace?.seconds?.length) return;
  mobileGraphLoopActive = true;
  chartState.loop = true;
  chartState.progress = 0;
  playChart();
}

function stopMobileGraphLoop() {
  mobileGraphLoopActive = false;
  chartState.loop = false;
  pauseChart();
}

function handleMobileGraphOrientation() {
  if (!mobileGraphExperienceActive) return;

  const overlay = document.getElementById('graphFullscreenOverlay');
  const prompt = document.getElementById('graphRotatePrompt');
  const stage = document.getElementById('graphFullscreenStage');

  if (!overlay || !prompt || !stage) return;

  const isLandscape = window.matchMedia('(orientation: landscape)').matches;
  const isMobile = window.matchMedia('(max-width: 950px), (pointer: coarse)').matches;

  if (!isMobile) {
    closeMobileGraphExperience(true);
    return;
  }

  overlay.hidden = false;

  if (isLandscape) {
    mobileGraphHasPlayed = true;

    prompt.hidden = true;
    stage.hidden = false;

    moveGraphIntoFullscreenOverlay();

    window.setTimeout(() => {
      startMobileGraphLoop();
    }, 200);

    return;
  }

  stopMobileGraphLoop();

  if (mobileGraphHasPlayed) {
    closeMobileGraphExperience(true);
    return;
  }

  moveGraphBackToResultsCard();

  prompt.hidden = false;
  stage.hidden = true;
}
function initMobileResultSections() {
  const menu = document.getElementById('mobileResultsMenu');
  const toolbar = document.getElementById('mobileResultsToolbar');
  const backBtn = document.getElementById('mobileResultsBack');
  const title = document.getElementById('mobileResultsTitle');

   const sections = [
    { id: 'overviewResults', title: 'Overview', visible: () => true },
    { id: 'cellSpec', title: 'Cell Specification', visible: () => true },
    { id: 'modules', title: 'Modules', visible: () => true },
    { id: 'packResults', title: 'Pack Results', visible: () => true },
    { id: 'requirementCheck', title: 'Requirement Check', visible: () => !!lastResults?.designRequirementsEnabled },
    { id: 'sohResults', title: 'Usable Energy vs SOH', visible: () => true },
    { id: 'degradationResults', title: 'Cell Test Profile Data', visible: () => !!lastResults?.degradationEnabled },
    { id: 'vehicleResults', title: 'Vehicle Results', visible: () => !!lastResults?.variableSimulationEnabled },
    { id: 'simulationGraph', title: 'Simulation Graph', visible: () => !!lastResults?.variableSimulationEnabled },
    { id: 'simulationSettings', title: 'Simulation Settings', visible: () => !!lastResults?.variableSimulationEnabled }
  ];

  function isResultSectionVisible(sectionId) {
    const config = sections.find(section => section.id === sectionId);
    return config ? config.visible() : true;
  }

  function updateResultMenuButtons() {
    document.querySelectorAll('[data-open-result]').forEach(button => {
      const sectionId = button.dataset.openResult;
      button.hidden = !isResultSectionVisible(sectionId);
    });
  }
  const mobileQuery = window.matchMedia('(max-width: 950px), (pointer: coarse)')

  function allResultSections() {
    return [...document.querySelectorAll('.mobile-result-section')];
  }
allResultSections().forEach(section => {
  const sectionId = section.dataset.resultSection;

  if (sectionId === 'requirementCheck') {
    section.hidden = !lastResults?.designRequirementsEnabled;
  } else if (sectionId === 'degradationResults') {
    section.hidden = !lastResults?.degradationEnabled;
  } else if (
    sectionId === 'vehicleResults' ||
    sectionId === 'simulationGraph' ||
    sectionId === 'simulationSettings'
  ) {
    section.hidden = !lastResults?.variableSimulationEnabled;
  } else {
    section.hidden = false;
  }
});
  function showMenu() {
    if (mobileGraphExperienceActive) {
  closeMobileGraphExperience(false);
}
    if (!mobileQuery.matches) {
      document.body.classList.remove('mobile-results-menu-open', 'mobile-results-section-open');

      if (menu) menu.hidden = true;
      if (toolbar) toolbar.hidden = true;

           updateResultMenuButtons();

      allResultSections().forEach(section => {
        const sectionId = section.dataset.resultSection;
        section.hidden = !isResultSectionVisible(sectionId);
      });

      return;
    }

    document.body.classList.add('mobile-results-menu-open');
    document.body.classList.remove('mobile-results-section-open');

    updateResultMenuButtons();

    if (menu) menu.hidden = false;
    if (toolbar) toolbar.hidden = true;

    allResultSections().forEach(section => {
      section.hidden = true;
    });
  }

  function showSection(sectionId) {
    const selected = sections.find(section => section.id === sectionId);

    document.body.classList.remove('mobile-results-menu-open');
    document.body.classList.add('mobile-results-section-open');

    if (menu) menu.hidden = true;
    if (toolbar) toolbar.hidden = false;
    if (title) title.textContent = selected?.title || 'Results';

    allResultSections().forEach(section => {
      const isSelected = section.dataset.resultSection === sectionId;

         if (!isResultSectionVisible(section.dataset.resultSection)) {
        section.hidden = true;
      } else {
        section.hidden = !isSelected;
      }
    });
if (sectionId === 'simulationGraph') {
  openMobileGraphExperience();
  return;
}

window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-open-result]').forEach(button => {
    button.addEventListener('click', () => {
      showSection(button.dataset.openResult);
    });
  });

  if (backBtn) {
    backBtn.addEventListener('click', showMenu);
  }

  mobileQuery.addEventListener('change', showMenu);
  showMenu();

  window.showMobileResultsMenu = showMenu;
  window.showMobileResultSection = showSection;
}
document.addEventListener('DOMContentLoaded', init);
