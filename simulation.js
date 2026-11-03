// Vehicle / battery pack simulation engine.
//
// Pure functions only (no DOM access) so they can be unit tested with Node:
//   node tests/simulation.test.js
//
// Method summary
// --------------
// * Drive cycle: official WLTC Class 3b speed trace (1 Hz), or a constant
//   70 mph motorway cruise. The cycle is repeated until the usable SOC window
//   is exhausted, so range is simulated directly rather than extrapolated.
// * Vehicle: longitudinal road-load model
//     F = m·a + m·g·Crr + ½·ρ·Cd·A·v²   (flat road, still air)
//   with a simple driver model: the vehicle follows the trace unless a motor,
//   torque, controller, cell-current or voltage limit prevents it, in which
//   case it accelerates at the limit and catches up later.
// * Drivetrain: constant battery-to-wheel efficiency. Regen recovers a fixed
//   fraction of braking energy at the wheels, limited by the motor regen
//   power limit and the pack charge-current limit; friction brakes take the rest.
// * Pack: equivalent circuit, V_terminal = OCV(SOC) − I·R.
//   OCV is the cell OCV-SOC table (if supplied) or the cell nominal voltage;
//   R is the cell DC internal resistance × S / P (if supplied) or zero.
//   Current is solved from power each step, so voltage sag and I²R losses
//   are included and the BMS minimum / maximum voltage limits are enforced.

(function (root) {
  const GRAVITY = 9.81;          // m/s²
  const AIR_DENSITY = 1.225;     // kg/m³, ISA sea level 15 °C
  const MPH_TO_MPS = 0.44704;
  const KMH_TO_MPS = 1 / 3.6;
  const MILES_PER_M = 1 / 1609.344;
  const TRACE_TOLERANCE_MPS = 2 * KMH_TO_MPS; // 2 km/h speed tolerance used for "trace missed" reporting

  const DRIVE_CYCLES = {
    wltp3b: { label: "WLTP Class 3b (official cycle)", shortLabel: "WLTP Class 3b" },
    motorway70: { label: "Constant 70 mph motorway", shortLabel: "70 mph motorway" }
  };

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function positiveOrInfinity(value) {
    const n = num(value, 0);
    return n > 0 ? n : Infinity;
  }

  function normaliseDriveCycle(value) {
    return DRIVE_CYCLES[value] ? value : "wltp3b";
  }

  // ---------------------------------------------------------------------------
  // OCV table parsing
  // ---------------------------------------------------------------------------

  // Accepts pasted text or CSV: one "SOC, voltage" pair per line. SOC may be a
  // percentage (0-100) or a fraction (0-1). Header / non-numeric lines are
  // skipped. Separators: comma, semicolon, tab or spaces.
  function parseOcvTable(text) {
    const result = { points: [], errors: [] };
    if (!text || !String(text).trim()) return result;

    const lines = String(text).split(/\r?\n/);
    const raw = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const parts = trimmed.split(/[,;\t ]+/).filter(Boolean);
      if (parts.length < 2) return;
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        if (raw.length > 0) result.errors.push(`Line ${index + 1} is not numeric and was ignored.`);
        return;
      }
      raw.push([a, b]);
    });

    if (raw.length < 2) {
      result.errors.push("At least two numeric SOC, voltage points are needed.");
      return result;
    }

    // Column order: SOC first, voltage second. If the first column looks like
    // voltage (all values 1-6 V) and the second like SOC, swap them.
    const firstLooksLikeVoltage = raw.every(([a]) => a > 1 && a < 6);
    const secondLooksLikeSoc = raw.some(([, b]) => b > 6);
    let pairs = firstLooksLikeVoltage && secondLooksLikeSoc ? raw.map(([a, b]) => [b, a]) : raw;

    const maxSoc = Math.max(...pairs.map(([s]) => s));
    if (maxSoc <= 1.0001) pairs = pairs.map(([s, v]) => [s * 100, v]);

    pairs.sort((p, q) => p[0] - q[0]);

    const points = [];
    for (const [soc, v] of pairs) {
      if (soc < -0.001 || soc > 100.001) {
        result.errors.push(`SOC ${soc} is outside 0-100 % and was ignored.`);
        continue;
      }
      if (v <= 0 || v > 6) {
        result.errors.push(`Voltage ${v} V is not a plausible cell voltage and was ignored.`);
        continue;
      }
      if (points.length && Math.abs(points[points.length - 1].soc - soc) < 1e-9) continue;
      points.push({ soc, v });
    }

    for (let i = 1; i < points.length; i++) {
      if (points[i].v < points[i - 1].v - 1e-6) {
        result.errors.push("OCV must rise with SOC. Check the column order and values.");
        break;
      }
    }

    if (points.length >= 2 && (points[0].soc > 0.5 || points[points.length - 1].soc < 99.5)) {
      result.errors.push("Table does not cover 0-100 % SOC; the end values are held flat outside its range.");
    }

    result.points = points.length >= 2 ? points : [];
    return result;
  }

  function interpolateOcv(points, socPercent) {
    if (socPercent <= points[0].soc) return points[0].v;
    const last = points[points.length - 1];
    if (socPercent >= last.soc) return last.v;
    for (let i = 1; i < points.length; i++) {
      if (socPercent <= points[i].soc) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const t = (socPercent - p0.soc) / (p1.soc - p0.soc);
        return p0.v + t * (p1.v - p0.v);
      }
    }
    return last.v;
  }

  // ---------------------------------------------------------------------------
  // Pack model
  // ---------------------------------------------------------------------------

  function buildPackModel(input) {
    const series = Math.max(0, Math.round(num(input.seriesCount)));
    const parallel = Math.max(0, Math.round(num(input.parallelCount)));
    const capacityAh = Math.max(0, num(input.capacityAh)) * parallel;

    const advancedCell = !!input.advancedCellEnabled;
    const ocvParse = advancedCell ? parseOcvTable(input.cellOcvTable) : { points: [], errors: [] };
    const hasOcvTable = ocvParse.points.length >= 2;

    const cellResistanceOhm = advancedCell ? Math.max(0, num(input.cellDcirMilliOhm)) / 1000 : 0;
    const resistanceOhm = parallel > 0 ? cellResistanceOhm * series / parallel : 0;

    const cellNominalV = num(input.nominalVoltage);
    // Pre-sampled OCV lookup at 0.05 % SOC resolution (linear between samples),
    // so the per-second simulation does not search the table every step.
    const LOOKUP_STEPS = 2000;
    const ocvLookup = hasOcvTable
      ? Array.from({ length: LOOKUP_STEPS + 1 }, (_, i) => interpolateOcv(ocvParse.points, i * 100 / LOOKUP_STEPS))
      : null;
    const cellOcv = (soc) => {
      if (!ocvLookup) return cellNominalV;
      const x = Math.min(LOOKUP_STEPS, Math.max(0, soc * LOOKUP_STEPS / 100));
      const i = Math.min(LOOKUP_STEPS - 1, Math.floor(x));
      return ocvLookup[i] + (ocvLookup[i + 1] - ocvLookup[i]) * (x - i);
    };

    const usableFactor = Math.min(1, Math.max(0.01, num(input.usableEnergyFactor, 1)));
    const socBottom = (1 - usableFactor) * 50;
    const socTop = 100 - socBottom;

    const motorEnabled = !!input.motorLimitsEnabled;
    const controllerLimitA = motorEnabled ? positiveOrInfinity(input.controllerMaxCurrentA) : Infinity;
    const cellDischargeLimitA = Math.max(0, num(input.maxDischargeCurrentA)) * parallel;
    const cellContinuousLimitA = Math.max(0, num(input.continuousDischargeCurrentA)) * parallel;
    // Pack regen/charge current limit: cell max charge × P × 80 % (existing app derate).
    const chargeLimitA = Math.max(0, num(input.maxChargeCurrentA)) * parallel * 0.8;

    const dischargeLimitA = Math.min(cellDischargeLimitA, controllerLimitA);
    // How long the cell max (pulse) discharge current may be held, from the
    // cell datasheet. After this the cell continuous rating applies.
    const cellPulseDurationS = positiveOrInfinity(input.cellPulseDurationSeconds);

    // Usable energy at OCV over the SOC window (= nominal × usable when no table).
    let usableEnergyAtOcvKWh = 0;
    const steps = 200;
    for (let i = 0; i < steps; i++) {
      const s0 = socBottom + (socTop - socBottom) * i / steps;
      const s1 = socBottom + (socTop - socBottom) * (i + 1) / steps;
      const v = series * (cellOcv(s0) + cellOcv(s1)) / 2;
      usableEnergyAtOcvKWh += v * capacityAh * (s1 - s0) / 100 / 1000;
    }

    return {
      series,
      parallel,
      capacityAh,
      resistanceOhm,
      cellResistanceOhm,
      hasOcvTable,
      ocvPoints: ocvParse.points,
      ocvErrors: ocvParse.errors,
      advancedCell,
      vMax: num(input.maxVoltage) * series,
      vMin: num(input.minVoltage) * series,
      ocv: (soc) => series * cellOcv(soc),
      socTop,
      socBottom,
      cellDischargeLimitA,
      controllerLimitA,
      dischargeLimitA,
      cellPulseDurationS,
      continuousLimitA: cellContinuousLimitA,
      chargeLimitA,
      usableEnergyAtOcvKWh
    };
  }

  // Battery current for a given terminal power (W, + = discharge, − = charge).
  // Solves P = (OCV − I·R)·I. Returns null if the power is beyond the pack's
  // maximum deliverable power at this OCV.
  function currentForPower(powerW, ocv, resistanceOhm) {
    if (ocv <= 0) return null;
    if (resistanceOhm <= 0) return powerW / ocv;
    const disc = ocv * ocv - 4 * resistanceOhm * powerW;
    if (disc < 0) return null;
    return (ocv - Math.sqrt(disc)) / (2 * resistanceOhm);
  }

  // Maximum discharge current and the limit that sets it, at a given SOC.
  // cellPeak = false once the cell pulse duration has been used up.
  function dischargeCapability(pack, soc, cellPeak = true) {
    const ocv = pack.ocv(soc);
    const R = pack.resistanceOhm;
    const candidates = [
      cellPeak
        ? { limit: "cell", amps: pack.cellDischargeLimitA }
        : { limit: "cellContinuous", amps: pack.continuousLimitA },
      { limit: "controller", amps: pack.controllerLimitA }
    ];
    if (R > 0) {
      candidates.push({ limit: "voltage", amps: Math.max(0, (ocv - pack.vMin) / R) });
      candidates.push({ limit: "maxPower", amps: ocv / (2 * R) }); // peak of the P-I curve
    }
    let best = candidates[0];
    for (const c of candidates) if (c.amps < best.amps) best = c;
    const amps = Number.isFinite(best.amps) ? best.amps : 0;
    const terminalV = ocv - amps * R;
    return { amps, limit: best.limit, ocv, terminalV, powerW: Math.max(0, terminalV * amps) };
  }

  // Maximum charge (regen) current and power at a given SOC.
  function chargeCapability(pack, soc) {
    const ocv = pack.ocv(soc);
    const R = pack.resistanceOhm;
    let amps = pack.chargeLimitA;
    if (R > 0) amps = Math.min(amps, Math.max(0, (pack.vMax - ocv) / R));
    else if (ocv >= pack.vMax) amps = 0;
    return { amps, powerW: (ocv + amps * R) * amps };
  }

  // ---------------------------------------------------------------------------
  // Vehicle model
  // ---------------------------------------------------------------------------

  function buildVehicleModel(input) {
    const massKg = Math.max(1, num(input.vehicleMassKg, 1300)) + Math.max(0, num(input.payloadKg, 0));
    const motorEnabled = !!input.motorLimitsEnabled;

    const torque = motorEnabled ? num(input.motorPeakTorqueNm) : 0;
    const gear = motorEnabled ? num(input.gearRatio) : 0;
    // Tyre rolling radius is entered in mm (older saved inputs used metres).
    const radiusMm = num(input.tyreRadiusMm) > 0 ? num(input.tyreRadiusMm) : num(input.tyreRadiusM) * 1000;
    const radius = motorEnabled ? radiusMm / 1000 : 0;
    const hasTorqueLimit = torque > 0 && gear > 0 && radius > 0;

    return {
      massKg,
      cd: Math.max(0, num(input.dragCoefficient, 0.34)),
      frontalAreaM2: Math.max(0, num(input.frontalAreaM2, 2.1)),
      crr: Math.max(0, num(input.rollingResistanceCoefficient, 0.013)),
      efficiency: Math.min(1, Math.max(0.3, num(input.drivetrainEfficiencyPercent, 90) / 100)),
      auxiliaryLoadW: getAuxiliaryLoadKW(input) * 1000,
      regenEnabled: !!input.regenEnabled,
      regenEfficiency: Math.min(1, Math.max(0, num(input.regenEfficiencyPercent, 65) / 100)),
      regenDisableAboveSoc: Math.min(100, Math.max(0, num(input.regenDisableAboveSocPercent, 100))),
      motorEnabled,
      // Datasheet motor output power. Applied as the limit on power delivered
      // to the wheels (gearbox losses between shaft and wheel are not split out
      // of the overall drivetrain efficiency, so this is slightly optimistic).
      motorPeakPowerW: motorEnabled ? positiveOrInfinity(input.motorPeakPowerKW) * 1000 : Infinity,
      motorContinuousPowerW: motorEnabled ? positiveOrInfinity(input.motorContinuousPowerKW) * 1000 : Infinity,
      // How long motor peak power may be held (datasheet). After this the
      // continuous power applies (if entered).
      motorPeakDurationS: motorEnabled ? positiveOrInfinity(input.motorPeakDurationSeconds) : Infinity,
      motorRegenPowerW: motorEnabled ? positiveOrInfinity(input.motorMaxRegenPowerKW) * 1000 : Infinity,
      maxTractiveForceN: hasTorqueLimit ? torque * gear / radius : Infinity,
      hasTorqueLimit,
      topSpeedMps: motorEnabled ? positiveOrInfinity(input.vehicleTopSpeedMph) * MPH_TO_MPS : Infinity
    };
  }

  // Base load is always applied; HVAC / lighting toggles add their stated loads.
  const AUXILIARY_LOADS_KW = {
    airConditioning: 1.5,
    heatingResistive: 2.5,
    heatingHeatPump: 0.75,
    electricalAccessories: 0.5
  };

  function getAuxiliaryLoadKW(input) {
    let load = Math.max(0, num(input.assumedLoadKW, 1.0));
    if (input.airConditioningEnabled) load += AUXILIARY_LOADS_KW.airConditioning;
    if (input.heatingEnabled) {
      load += input.heaterType === "heatPump" ? AUXILIARY_LOADS_KW.heatingHeatPump : AUXILIARY_LOADS_KW.heatingResistive;
    }
    if (input.electricalAccessoriesEnabled) load += AUXILIARY_LOADS_KW.electricalAccessories;
    return load;
  }

  function roadLoadForceN(vehicle, speedMps) {
    const rolling = speedMps > 0.01 ? vehicle.massKg * GRAVITY * vehicle.crr : 0;
    const aero = 0.5 * AIR_DENSITY * vehicle.cd * vehicle.frontalAreaM2 * speedMps * speedMps;
    return rolling + aero;
  }

  // Wheel power (W) needed to go from v0 to v1 in dt seconds.
  function wheelPowerForStep(vehicle, v0, v1, dt) {
    const vAvg = (v0 + v1) / 2;
    const force = vehicle.massKg * (v1 - v0) / dt + roadLoadForceN(vehicle, vAvg);
    return { force, vAvg, powerW: force * vAvg };
  }

  // Maximum wheel power available for traction at this SOC, with the limit that sets it.
  // peak = { cell, motor }: whether each peak rating is still available.
  function tractionCapability(pack, vehicle, soc, peak = { cell: true, motor: true }) {
    const battery = dischargeCapability(pack, soc, peak.cell);
    const fromBatteryW = Math.max(0, (battery.powerW - vehicle.auxiliaryLoadW) * vehicle.efficiency);
    const motorOnContinuous = !peak.motor && Number.isFinite(vehicle.motorContinuousPowerW);
    const motorLimitW = motorOnContinuous
      ? Math.min(vehicle.motorPeakPowerW, vehicle.motorContinuousPowerW)
      : vehicle.motorPeakPowerW;
    if (motorLimitW < fromBatteryW) {
      return { wheelPowerW: motorLimitW, limit: motorOnContinuous ? "motorContinuous" : "motorPower", battery };
    }
    return { wheelPowerW: fromBatteryW, limit: battery.limit, battery };
  }

  // Time-at-peak budget: used up while running above the continuous rating,
  // recovered at the same rate while at or below it.
  function updatePeakBudget(budget, duration, aboveContinuous, dt) {
    if (!Number.isFinite(duration)) return Infinity;
    return aboveContinuous ? Math.max(0, budget - dt) : Math.min(duration, budget + dt);
  }

  function getCycleSpeedsMps(driveCycle) {
    if (driveCycle === "motorway70") {
      const speeds = new Array(1801).fill(70 * MPH_TO_MPS);
      return { speeds, phaseAt: () => "Motorway cruise 70 mph" };
    }
    // Top-level `const` in wltc-class3b.js is a global binding in the browser
    // (not a window property); in Node the tests attach it to globalThis.
    const kmh = typeof WLTC_CLASS3B_KMH !== "undefined" ? WLTC_CLASS3B_KMH : root.WLTC_CLASS3B_KMH;
    const phases = typeof WLTC_CLASS3B_PHASES !== "undefined" ? WLTC_CLASS3B_PHASES : root.WLTC_CLASS3B_PHASES;
    if (!kmh || kmh.length < 2) throw new Error("WLTC Class 3b data not loaded (wltc-class3b.js).");
    return {
      speeds: kmh.map(v => v * KMH_TO_MPS),
      phaseAt: (i) => (phases.find(p => i >= p.start && i <= p.end) || phases[phases.length - 1]).name
    };
  }

  // ---------------------------------------------------------------------------
  // Drive cycle simulation (run until the usable SOC window is exhausted)
  // ---------------------------------------------------------------------------

  function simulateDriveCycle(input, options = {}) {
    const pack = buildPackModel(input);
    const vehicle = buildVehicleModel(input);
    const driveCycle = normaliseDriveCycle(input.driveCycle);
    const cycle = getCycleSpeedsMps(driveCycle);
    const chartStepSeconds = Math.max(1, Math.round(num(input.simulationTimeStepSeconds, 10)));
    const maxCycles = options.maxCycles || 400;
    const dt = 1;

    const empty = { ok: false, reason: "", pack, vehicle, rows: [] };
    if (pack.series <= 0 || pack.parallel <= 0 || pack.capacityAh <= 0) {
      return { ...empty, reason: "Pack has no capacity." };
    }
    if (pack.ocv(50) <= 0) return { ...empty, reason: "Cell voltage must be above zero." };
    if (pack.socTop - pack.socBottom <= 0) return { ...empty, reason: "Usable factor gives no SOC window." };

    const steps = cycle.speeds.length - 1;
    const isStandardTrace = driveCycle === "wltp3b";

    let soc = pack.socTop;
    let v = cycle.speeds[0];
    let time = 0;

    const totals = {
      distanceM: 0,
      dischargeEnergyJ: 0,   // energy drawn from the terminals
      chargeEnergyJ: 0,      // energy returned to the terminals by regen
      lossEnergyJ: 0,        // I²R loss inside the pack
      regenWheelEnergyJ: 0,
      dischargeAmpSeconds: 0,
      peakDischargeA: 0,
      peakChargeA: 0,
      peakPowerW: 0,
      minTerminalV: Infinity,
      maxTerminalV: 0,
      secondsAboveContinuous: 0,
      longestAboveContinuous: 0,
      secondsTraceMissed: 0,
      maxSpeedShortfallMps: 0,
      limitSeconds: { motorPower: 0, motorContinuous: 0, torque: 0, cell: 0, cellContinuous: 0, controller: 0, voltage: 0, maxPower: 0, topSpeed: 0 },
      regenLimitedSeconds: 0
    };
    let currentRunAboveContinuous = 0;
    let cellPeakBudget = pack.cellPulseDurationS;
    let motorPeakBudget = vehicle.motorPeakDurationS;

    const firstCycle = [];
    // Full-run trace at 1 Hz (every second from full to empty) for the graph.
    const trace = {
      seconds: [], speedMps: [], targetMps: [], current: [], terminalV: [], soc: [],
      cycle: [], phase: [], distanceM: [], netEnergyJ: [], regenEnergyJ: [], limited: []
    };
    let cycleIndex = 0;
    let finished = false;
    let firstCycleEnergyJ = 0;
    let firstCycleDistanceM = 0;

    while (!finished && cycleIndex < maxCycles) {
      for (let i = 0; i < steps; i++) {
        let target = cycle.speeds[i + 1];
        if (target > vehicle.topSpeedMps) {
          target = vehicle.topSpeedMps;
          if (cycle.speeds[i + 1] > v + 0.01) totals.limitSeconds.topSpeed += dt;
        }

        // Requested step
        let step = wheelPowerForStep(vehicle, v, target, dt);
        let v1 = target;
        let activeLimit = null;

        if (step.powerW > 0) {
          const traction = tractionCapability(pack, vehicle, soc, { cell: cellPeakBudget > 0, motor: motorPeakBudget > 0 });
          const maxForce = vehicle.maxTractiveForceN;
          const exceeds = (s) => s.powerW > traction.wheelPowerW + 1e-6 || s.force > maxForce + 1e-6;

          if (exceeds(step)) {
            // Find the highest reachable end speed within the limits (bisection).
            let lo = Math.max(0, Math.min(v, target));
            let hi = target;
            if (exceeds(wheelPowerForStep(vehicle, v, lo, dt))) {
              // Cannot even hold speed: coast down at the available force.
              const available = Math.min(maxForce, traction.wheelPowerW / Math.max(v, 0.1));
              lo = Math.max(0, v + (available - roadLoadForceN(vehicle, v)) / vehicle.massKg * dt);
              hi = lo;
            }
            for (let k = 0; k < 40 && hi - lo > 1e-4; k++) {
              const mid = (lo + hi) / 2;
              if (exceeds(wheelPowerForStep(vehicle, v, mid, dt))) hi = mid; else lo = mid;
            }
            v1 = lo;
            step = wheelPowerForStep(vehicle, v, v1, dt);
            const forceBound = step.force >= maxForce - 1;
            activeLimit = forceBound ? "torque" : traction.limit;
          }
        }

        // Battery power for this step
        let regenBatteryW = 0;
        let batteryW;
        if (step.powerW >= 0) {
          batteryW = step.powerW / vehicle.efficiency + vehicle.auxiliaryLoadW;
        } else {
          const brakingW = -step.powerW;
          if (vehicle.regenEnabled && soc < vehicle.regenDisableAboveSoc) {
            const capability = chargeCapability(pack, soc);
            const requested = brakingW * vehicle.regenEfficiency;
            const allowed = Math.min(requested, vehicle.motorRegenPowerW, capability.powerW + vehicle.auxiliaryLoadW);
            if (allowed < requested - 1e-6) totals.regenLimitedSeconds += dt;
            regenBatteryW = Math.max(0, allowed);
            totals.regenWheelEnergyJ += brakingW * dt;
          }
          batteryW = vehicle.auxiliaryLoadW - regenBatteryW;
        }

        const ocv = pack.ocv(soc);
        let current = currentForPower(batteryW, ocv, pack.resistanceOhm);
        if (current === null) {
          // Beyond the pack's maximum power point; clamp (should be rare after traction limiting).
          current = ocv / (2 * pack.resistanceOhm);
          batteryW = (ocv - current * pack.resistanceOhm) * current;
        }
        const terminalV = ocv - current * pack.resistanceOhm;

        // State update
        soc -= current * dt / 3600 / pack.capacityAh * 100;
        const vAvg = (v + v1) / 2;
        totals.distanceM += vAvg * dt;
        if (batteryW >= 0) totals.dischargeEnergyJ += batteryW * dt;
        else totals.chargeEnergyJ += -batteryW * dt;
        totals.lossEnergyJ += current * current * pack.resistanceOhm * dt;
        if (current > 0) totals.dischargeAmpSeconds += current * dt;
        totals.peakDischargeA = Math.max(totals.peakDischargeA, current);
        totals.peakChargeA = Math.max(totals.peakChargeA, -current);
        totals.peakPowerW = Math.max(totals.peakPowerW, batteryW);
        totals.minTerminalV = Math.min(totals.minTerminalV, terminalV);
        totals.maxTerminalV = Math.max(totals.maxTerminalV, terminalV);

        cellPeakBudget = updatePeakBudget(cellPeakBudget, pack.cellPulseDurationS, current > pack.continuousLimitA + 1e-6, dt);
        motorPeakBudget = updatePeakBudget(motorPeakBudget, vehicle.motorPeakDurationS, step.powerW > vehicle.motorContinuousPowerW + 1e-6, dt);

        if (current > pack.continuousLimitA + 1e-6) {
          totals.secondsAboveContinuous += dt;
          currentRunAboveContinuous += dt;
          totals.longestAboveContinuous = Math.max(totals.longestAboveContinuous, currentRunAboveContinuous);
        } else {
          currentRunAboveContinuous = 0;
        }

        if (activeLimit && totals.limitSeconds[activeLimit] !== undefined) totals.limitSeconds[activeLimit] += dt;
        const shortfall = cycle.speeds[i + 1] - v1;
        if (shortfall > TRACE_TOLERANCE_MPS) totals.secondsTraceMissed += dt;
        totals.maxSpeedShortfallMps = Math.max(totals.maxSpeedShortfallMps, shortfall);

        trace.seconds.push(time + dt);
        trace.speedMps.push(v1);
        trace.targetMps.push(cycle.speeds[i + 1]);
        trace.current.push(current);
        trace.terminalV.push(terminalV);
        trace.soc.push(soc);
        trace.cycle.push(cycleIndex + 1);
        trace.phase.push(cycle.phaseAt(i + 1));
        trace.distanceM.push(totals.distanceM);
        trace.netEnergyJ.push(totals.dischargeEnergyJ - totals.chargeEnergyJ);
        trace.regenEnergyJ.push(totals.chargeEnergyJ);
        trace.limited.push(activeLimit ? 1 : 0);

        if (cycleIndex === 0) {
          firstCycle.push({
            t: i + 1,
            phase: cycle.phaseAt(i + 1),
            speedMps: v1,
            targetMps: cycle.speeds[i + 1],
            current,
            terminalV,
            batteryW,
            regenBatteryW,
            soc,
            dischargeEnergyJ: totals.dischargeEnergyJ,
            chargeEnergyJ: totals.chargeEnergyJ,
            limit: activeLimit
          });
        }

        v = v1;
        time += dt;

        if (soc <= pack.socBottom) {
          finished = true;
          break;
        }
      }
      if (cycleIndex === 0) {
        firstCycleEnergyJ = totals.dischargeEnergyJ - totals.chargeEnergyJ;
        firstCycleDistanceM = totals.distanceM;
      }
      cycleIndex += 1;
      // Guard: a cycle that uses no energy would never finish.
      if (!finished && totals.dischargeEnergyJ - totals.chargeEnergyJ <= 0) break;
    }

    const netEnergyJ = totals.dischargeEnergyJ - totals.chargeEnergyJ;
    const distanceMiles = totals.distanceM * MILES_PER_M;
    const netEnergyKWh = netEnergyJ / 3.6e6;
    const hours = time / 3600;

    // Chart rows for the first cycle, averaged over the chart resolution.
    const rows = [];
    const nominalPackV = num(input.nominalVoltage) * pack.series;
    for (let start = 0; start < firstCycle.length; start += chartStepSeconds) {
      const bucket = firstCycle.slice(start, start + chartStepSeconds);
      const n = bucket.length;
      const last = bucket[n - 1];
      const avg = (fn) => bucket.reduce((sum, r) => sum + fn(r), 0) / n;
      const limits = bucket.map(r => r.limit).filter(Boolean);
      rows.push({
        minute: last.t / 60,
        driveMode: last.phase + (limits.length ? " (limited)" : ""),
        speedMph: avg(r => r.speedMps) / MPH_TO_MPS,
        targetSpeedMph: avg(r => r.targetMps) / MPH_TO_MPS,
        averageCurrentA: avg(r => Math.max(0, r.current)),
        regenCurrentA: avg(r => Math.max(0, -r.current)),
        peakCurrentA: Math.max(...bucket.map(r => r.current)),
        currentLimitA: pack.dischargeLimitA,
        terminalVoltageV: avg(r => r.terminalV),
        powerKW: avg(r => r.batteryW) / 1000,
        regenPowerKW: avg(r => r.regenBatteryW) / 1000,
        socPercent: last.soc,
        cumulativeEnergyUsedKWh: (last.dischargeEnergyJ - last.chargeEnergyJ) / 3.6e6,
        cumulativeRegenRecoveredKWh: last.chargeEnergyJ / 3.6e6,
        remainingEnergyKWh: Math.max(0, (last.soc - pack.socBottom) / 100 * pack.capacityAh * nominalPackV / 1000)
      });
    }

    return {
      ok: true,
      reachedEmpty: finished,
      driveCycle,
      driveCycleLabel: DRIVE_CYCLES[driveCycle].label,
      isStandardTrace,
      pack,
      vehicle,
      cyclesCompleted: time / steps,
      runtimeMinutes: time / 60,
      distanceMiles,
      netEnergyKWh,
      dischargeEnergyKWh: totals.dischargeEnergyJ / 3.6e6,
      regenRecoveredKWh: totals.chargeEnergyJ / 3.6e6,
      packLossKWh: totals.lossEnergyJ / 3.6e6,
      averagePowerKW: hours > 0 ? netEnergyKWh / hours : 0,
      averageDischargeCurrentA: time > 0 ? totals.dischargeAmpSeconds / time : 0,
      averageSpeedMph: hours > 0 ? distanceMiles / hours : 0,
      consumptionKWhPerMile: distanceMiles > 0 ? netEnergyKWh / distanceMiles : null,
      firstCycleConsumptionKWhPerMile: firstCycleDistanceM > 0
        ? (firstCycleEnergyJ / 3.6e6) / (firstCycleDistanceM * MILES_PER_M)
        : null,
      peakDischargeCurrentA: totals.peakDischargeA,
      peakChargeCurrentA: totals.peakChargeA,
      peakPowerKW: totals.peakPowerW / 1000,
      minTerminalVoltageV: Number.isFinite(totals.minTerminalV) ? totals.minTerminalV : null,
      maxTerminalVoltageV: totals.maxTerminalV || null,
      secondsAboveContinuous: totals.secondsAboveContinuous,
      longestSecondsAboveContinuous: totals.longestAboveContinuous,
      secondsTraceMissed: totals.secondsTraceMissed,
      maxSpeedShortfallMph: Math.max(0, totals.maxSpeedShortfallMps) / MPH_TO_MPS,
      limitSeconds: totals.limitSeconds,
      regenLimitedSeconds: totals.regenLimitedSeconds,
      cycleSeconds: steps,
      trace,
      rows
    };
  }

  // ---------------------------------------------------------------------------
  // Full-power performance test (wide-open throttle) at a given SOC
  // ---------------------------------------------------------------------------

  function fullPowerTest(input, socPercent) {
    const pack = buildPackModel(input);
    const vehicle = buildVehicleModel(input);
    if (!vehicle.hasTorqueLimit) {
      return { ok: false, reason: "Enter motor peak torque, gear ratio and tyre radius in the Motor section." };
    }
    if (pack.capacityAh <= 0) return { ok: false, reason: "Pack has no capacity." };

    const soc = Math.min(100, Math.max(0, socPercent));
    // Each run starts with the full peak durations available.
    const capabilityAt = (t) => tractionCapability(pack, vehicle, soc, {
      cell: t < pack.cellPulseDurationS,
      motor: t < vehicle.motorPeakDurationS
    });
    const initialTraction = capabilityAt(0);

    function run(startMph, endMph) {
      const dt = 0.01;
      const marks = {};
      const events = [];
      let v = startMph * MPH_TO_MPS;
      let t = 0;
      let peakCurrent = 0;
      let minTerminalV = Infinity;
      let limitingFactor = "torque";
      let traction = capabilityAt(0);

      while (t < 120 && v < endMph * MPH_TO_MPS && v < vehicle.topSpeedMps) {
        const checkEnd = (duration, what) => {
          if (Number.isFinite(duration) && t < duration && t + dt >= duration) {
            events.push({ seconds: duration, mph: v / MPH_TO_MPS, what });
            traction = capabilityAt(duration + 1e-9);
          }
        };
        checkEnd(pack.cellPulseDurationS, "cell pulse rating ended");
        checkEnd(vehicle.motorPeakDurationS, "motor peak power ended");

        const powerLimitedForce = traction.wheelPowerW / Math.max(v, 0.01);
        const force = Math.min(vehicle.maxTractiveForceN, powerLimitedForce);
        if (force < vehicle.maxTractiveForceN) limitingFactor = traction.limit;
        const net = force - roadLoadForceN(vehicle, v);
        if (net <= 0) break;
        const batteryW = force * v / vehicle.efficiency + vehicle.auxiliaryLoadW;
        const current = currentForPower(batteryW, traction.battery.ocv, pack.resistanceOhm) ?? traction.battery.amps;
        peakCurrent = Math.max(peakCurrent, current);
        minTerminalV = Math.min(minTerminalV, traction.battery.ocv - current * pack.resistanceOhm);

        v += net / vehicle.massKg * dt;
        t += dt;
        for (const mph of [30, 60, 70]) {
          if (marks[mph] === undefined && mph > startMph && v >= mph * MPH_TO_MPS) marks[mph] = t;
        }
      }
      return { marks, events, peakCurrent, minTerminalV, limitingFactor };
    }

    const standing = run(0, 60);
    const rolling = run(50, 70);

    return {
      ok: true,
      socPercent: soc,
      zeroToSixtySeconds: standing.marks[60] ?? null,
      zeroToThirtySeconds: standing.marks[30] ?? null,
      fiftyToSeventySeconds: rolling.marks[70] ?? null,
      peakCurrentA: Math.max(standing.peakCurrent, rolling.peakCurrent),
      minTerminalVoltageV: Number.isFinite(Math.min(standing.minTerminalV, rolling.minTerminalV)) ? Math.min(standing.minTerminalV, rolling.minTerminalV) : null,
      availableWheelPowerKW: initialTraction.wheelPowerW / 1000,
      batteryPeakPowerKW: initialTraction.battery.powerW / 1000,
      batteryLimit: initialTraction.battery.limit,
      limitingFactor: standing.limitingFactor,
      rollingLimitingFactor: rolling.limitingFactor,
      peakEvents: standing.events,
      rollingPeakEvents: rolling.events
    };
  }

  // Highest speed the vehicle can hold indefinitely on a flat road, using the
  // continuous ratings (pack continuous current, motor continuous power).
  function maxSustainedSpeedMph(input, socPercent) {
    const pack = buildPackModel(input);
    const vehicle = buildVehicleModel(input);
    const ocv = pack.ocv(socPercent);
    const R = pack.resistanceOhm;
    let amps = Math.min(pack.continuousLimitA, pack.controllerLimitA);
    if (R > 0) amps = Math.min(amps, Math.max(0, (ocv - pack.vMin) / R), ocv / (2 * R));
    const batteryW = (ocv - amps * R) * amps;
    const wheelW = Math.min(vehicle.motorContinuousPowerW, Math.max(0, (batteryW - vehicle.auxiliaryLoadW) * vehicle.efficiency));
    const cap = Math.min(vehicle.topSpeedMps, 250 * MPH_TO_MPS);
    if (roadLoadForceN(vehicle, cap) * cap <= wheelW) return cap / MPH_TO_MPS;
    let lo = 0;
    let hi = cap;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (roadLoadForceN(vehicle, mid) * mid <= wheelW) lo = mid; else hi = mid;
    }
    return lo / MPH_TO_MPS;
  }

  // ---------------------------------------------------------------------------
  // Tyre size -> radius
  // ---------------------------------------------------------------------------

  // Dynamic rolling radius is typically ~2 % smaller than the unloaded radius
  // for passenger car tyres (tyre deflection under load).
  const ROLLING_RADIUS_FACTOR = 0.98;

  // Accepts metric sizes ("205/55 R16", "P215/60R16 95H", "225/45 ZR18") and
  // flotation sizes in inches ("31x10.50R15", "LT33x12.5R17").
  function parseTyreSize(text) {
    const value = String(text || "").trim().toUpperCase();
    if (!value) return null;

    const metric = value.match(/^(?:P|LT)?\s*(\d{3})\s*\/\s*(\d{2,3})\s*(?:Z?R|-|D|B)?\s*F?\s*(\d{2}(?:\.\d)?)\b/);
    if (metric) {
      const widthMm = Number(metric[1]);
      const aspectPercent = Number(metric[2]);
      const rimInch = Number(metric[3]);
      if (widthMm >= 100 && widthMm <= 455 && aspectPercent >= 20 && aspectPercent <= 95 && rimInch >= 10 && rimInch <= 26) {
        const sidewallMm = widthMm * aspectPercent / 100;
        const unloadedRadiusMm = rimInch * 25.4 / 2 + sidewallMm;
        return {
          description: `${widthMm}/${aspectPercent} R${rimInch}`,
          widthMm,
          aspectPercent,
          rimInch,
          sidewallMm,
          unloadedRadiusMm,
          rollingRadiusMm: unloadedRadiusMm * ROLLING_RADIUS_FACTOR
        };
      }
    }

    const flotation = value.match(/^(?:LT)?\s*(\d{2}(?:\.\d+)?)\s*X\s*(\d{1,2}(?:\.\d+)?)\s*(?:Z?R|-)?\s*(\d{2}(?:\.\d)?)\b/);
    if (flotation) {
      const diameterInch = Number(flotation[1]);
      const rimInch = Number(flotation[3]);
      if (diameterInch > rimInch && diameterInch <= 45) {
        const unloadedRadiusMm = diameterInch * 25.4 / 2;
        return {
          description: `${flotation[1]}x${flotation[2]} R${flotation[3]}`,
          rimInch,
          unloadedRadiusMm,
          rollingRadiusMm: unloadedRadiusMm * ROLLING_RADIUS_FACTOR
        };
      }
    }

    return null;
  }

  // State of charge as the driver sees it: 100 % at the top of the usable
  // window, 0 % at the bottom (the actual cell SOC window is hidden).
  function displaySocPercent(pack, actualSoc) {
    const span = pack.socTop - pack.socBottom;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, (actualSoc - pack.socBottom) / span * 100));
  }

  const api = {
    DRIVE_CYCLES,
    displaySocPercent,
    parseTyreSize,
    ROLLING_RADIUS_FACTOR,
    AUXILIARY_LOADS_KW,
    normaliseDriveCycle,
    parseOcvTable,
    interpolateOcv,
    buildPackModel,
    buildVehicleModel,
    currentForPower,
    dischargeCapability,
    chargeCapability,
    getAuxiliaryLoadKW,
    roadLoadForceN,
    simulateDriveCycle,
    fullPowerTest,
    maxSustainedSpeedMph
  };

  root.BatterySimulation = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
