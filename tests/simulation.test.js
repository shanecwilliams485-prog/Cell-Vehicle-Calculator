// Unit tests for simulation.js. Run with:  node tests/simulation.test.js
// No dependencies. Exits with code 1 if any check fails.

const path = require("path");
Object.assign(globalThis, require(path.join(__dirname, "..", "wltc-class3b.js")));
const Sim = require(path.join(__dirname, "..", "simulation.js"));

let failures = 0;
function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) failures += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const base = {
  nominalVoltage: 3.6, maxVoltage: 4.2, minVoltage: 3.0, capacityAh: 5,
  maxDischargeCurrentA: 18, continuousDischargeCurrentA: 8, maxChargeCurrentA: 5,
  seriesCount: 96, parallelCount: 24, usableEnergyFactor: 0.88,
  vehicleMassKg: 1300, dragCoefficient: 0.34, frontalAreaM2: 2.1, rollingResistanceCoefficient: 0.013,
  drivetrainEfficiencyPercent: 90, assumedLoadKW: 1, simulationTimeStepSeconds: 10,
  regenEnabled: true, regenEfficiencyPercent: 65, regenDisableAboveSocPercent: 95,
  driveCycle: "wltp3b"
};
const OCV = "0,3.00\n5,3.30\n10,3.45\n20,3.55\n30,3.60\n40,3.65\n50,3.70\n60,3.78\n70,3.88\n80,3.97\n90,4.08\n100,4.20";

// 1. WLTC data integrity (UN GTR 15 Class 3b)
const trace = globalThis.WLTC_CLASS3B_KMH;
const sum = trace.reduce((a, b) => a + b, 0);
let distKm = 0;
for (let i = 0; i < trace.length - 1; i++) distKm += (trace[i] + trace[i + 1]) / 2 / 3600;
check("WLTC 3b has 1801 samples", trace.length === 1801);
check("WLTC 3b checksum 83758.6", near(sum, 83758.6, 0.05), sum.toFixed(1));
check("WLTC 3b distance 23.266 km", near(distKm, 23.266, 0.002), distKm.toFixed(3));
check("WLTC 3b max speed 131.3 km/h", Math.max(...trace) === 131.3);

// 2. Simulated vehicle follows the full WLTC distance when unconstrained
const unconstrained = Sim.simulateDriveCycle({ ...base, regenEnabled: false });
const kmPerCycle = unconstrained.distanceMiles * 1.609344 / unconstrained.cyclesCompleted;
check("No trace misses for a capable vehicle", unconstrained.secondsTraceMissed === 0);
check("Distance per WLTC cycle = 23.27 km", near(kmPerCycle, 23.266, 0.05), kmPerCycle.toFixed(3));

// 3. Constant 70 mph against a hand calculation
const v = 70 * 0.44704;
const force = 1300 * 9.81 * 0.013 + 0.5 * 1.225 * 0.34 * 2.1 * v * v;
const handWhPerMile = ((force * v / 0.9 + 1000) / 1000) / 70 * 1000;
const motorway = Sim.simulateDriveCycle({ ...base, driveCycle: "motorway70" });
check("70 mph consumption matches road-load hand calc", near(motorway.consumptionKWhPerMile * 1000, handWhPerMile, 0.5),
  `${(motorway.consumptionKWhPerMile * 1000).toFixed(1)} vs ${handWhPerMile.toFixed(1)} Wh/mile`);

// 4. Range is independent of pack voltage for the same energy (no electrical model)
const ranges = [[96, 24], [24, 96], [192, 12]].map(([s, p]) => Sim.simulateDriveCycle({ ...base, seriesCount: s, parallelCount: p }).distanceMiles);
check("Range independent of series/parallel split", Math.max(...ranges) - Math.min(...ranges) < 0.01, ranges.map(r => r.toFixed(2)).join(" / "));

// 5. Deterministic
const r1 = Sim.simulateDriveCycle(base).distanceMiles;
const r2 = Sim.simulateDriveCycle(base).distanceMiles;
check("Same inputs give identical results", r1 === r2);

// 6. Energy balance with the equivalent-circuit model
const ecm = Sim.simulateDriveCycle({ ...base, advancedCellEnabled: true, cellOcvTable: OCV, cellDcirMilliOhm: 30 });
const expectedNet = ecm.pack.usableEnergyAtOcvKWh - ecm.packLossKWh;
check("Net pack energy = OCV energy in window − I²R losses", near(ecm.netEnergyKWh, expectedNet, 0.05),
  `${ecm.netEnergyKWh.toFixed(3)} vs ${expectedNet.toFixed(3)} kWh`);
check("Terminal voltage never below pack minimum", ecm.minTerminalVoltageV >= ecm.pack.vMin - 1e-6, `${ecm.minTerminalVoltageV.toFixed(1)} V`);
check("Terminal voltage never above pack maximum", ecm.maxTerminalVoltageV <= ecm.pack.vMax + 1e-6, `${ecm.maxTerminalVoltageV.toFixed(1)} V`);

// 7. Resistance costs range
const noR = Sim.simulateDriveCycle({ ...base, advancedCellEnabled: true, cellOcvTable: OCV, cellDcirMilliOhm: 0 });
check("Internal resistance reduces range", ecm.distanceMiles < noR.distanceMiles,
  `${ecm.distanceMiles.toFixed(1)} vs ${noR.distanceMiles.toFixed(1)} miles`);

// 8. Regen improves WLTP range and never exceeds the pack charge limit
check("Regen increases WLTP range", r1 > unconstrained.distanceMiles);
const packChargeLimit = 5 * 24 * 0.8;
check("Peak regen current within pack charge limit", Sim.simulateDriveCycle(base).peakChargeCurrentA <= packChargeLimit + 1e-6);

// 9. Controller limit caps discharge current
const motor = { motorLimitsEnabled: true, controllerMaxCurrentA: 60 };
const limited = Sim.simulateDriveCycle({ ...base, ...motor });
check("Controller current limit respected", limited.peakDischargeCurrentA <= 60 + 1e-6, `${limited.peakDischargeCurrentA.toFixed(1)} A`);
check("Limited vehicle reports missed trace", limited.secondsTraceMissed > 0, `${limited.secondsTraceMissed} s`);

// 10. Full-power test: physics sanity and SOC dependence
const wot = { motorLimitsEnabled: true, motorPeakPowerKW: 150, motorPeakTorqueNm: 310, gearRatio: 9.7, tyreRadiusMm: 330,
  advancedCellEnabled: true, cellOcvTable: OCV, cellDcirMilliOhm: 30 };
const top = Sim.fullPowerTest({ ...base, ...wot }, 94);
const bottom = Sim.fullPowerTest({ ...base, ...wot }, 6);
const torqueLimitedAccel = (310 * 9.7 / 0.33) / 1300; // m/s², upper bound from torque
const lowerBound = 60 * 0.44704 / torqueLimitedAccel;
check("0-60 not faster than torque-limited bound", top.zeroToSixtySeconds >= lowerBound, `${top.zeroToSixtySeconds.toFixed(2)} s >= ${lowerBound.toFixed(2)} s`);
check("0-60 slower at low SOC (voltage sag)", bottom.zeroToSixtySeconds > top.zeroToSixtySeconds,
  `${top.zeroToSixtySeconds.toFixed(2)} s vs ${bottom.zeroToSixtySeconds.toFixed(2)} s`);

// 11. OCV table parsing
const parsedPct = Sim.parseOcvTable("SOC,V\n0,3.0\n50,3.7\n100,4.2");
const parsedFrac = Sim.parseOcvTable("0;3.0\n0.5;3.7\n1;4.2");
const parsedSwap = Sim.parseOcvTable("3.0 0\n3.7 50\n4.2 100");
check("OCV parse: % with header", parsedPct.points.length === 3 && parsedPct.errors.length === 0);
check("OCV parse: fractional SOC", parsedFrac.points[1].soc === 50);
check("OCV parse: swapped columns", parsedSwap.points[2].soc === 100 && parsedSwap.points[2].v === 4.2);
check("OCV parse: rejects falling voltage", Sim.parseOcvTable("0,4.2\n100,3.0").errors.length > 0);

// 12. Tyre size parsing
const tyre = Sim.parseTyreSize("205/55 R16 91V");
check("Tyre 205/55 R16 unloaded radius 315.95 mm", tyre && near(tyre.unloadedRadiusMm, 315.95, 0.01), tyre && tyre.unloadedRadiusMm.toFixed(2));
check("Tyre rolling radius = 98 % of unloaded", tyre && near(tyre.rollingRadiusMm, 315.95 * 0.98, 0.01));
check("Tyre flotation 31x10.50R15 = 393.7 mm unloaded", near(Sim.parseTyreSize("31x10.50R15").unloadedRadiusMm, 393.7, 0.01));
check("Tyre size rejects incomplete input", Sim.parseTyreSize("205/55") === null && Sim.parseTyreSize("abc") === null);

// 13. Peak (pulse) duration limits
const wotNoLimit = Sim.fullPowerTest({ ...base, ...wot }, 94);
const wotCell3 = Sim.fullPowerTest({ ...base, ...wot, cellPulseDurationSeconds: 3 }, 94);
const wotCell10 = Sim.fullPowerTest({ ...base, ...wot, cellPulseDurationSeconds: 10 }, 94);
const wotMotor3 = Sim.fullPowerTest({ ...base, ...wot, motorContinuousPowerKW: 70, motorPeakDurationSeconds: 3 }, 94);
check("3 s cell pulse rating slows 0-60", wotCell3.zeroToSixtySeconds > wotNoLimit.zeroToSixtySeconds + 0.5,
  `${wotNoLimit.zeroToSixtySeconds.toFixed(2)} s -> ${wotCell3.zeroToSixtySeconds.toFixed(2)} s`);
check("Pulse rating longer than the run has no effect", near(wotCell10.zeroToSixtySeconds, wotNoLimit.zeroToSixtySeconds, 0.02));
check("Cell pulse end is reported at 3 s", wotCell3.peakEvents.length === 1 && wotCell3.peakEvents[0].seconds === 3);
check("Current after pulse within continuous rating", wotCell3.limitingFactor === "cellContinuous");
check("3 s motor peak slows 0-60", wotMotor3.zeroToSixtySeconds > wotNoLimit.zeroToSixtySeconds + 0.5,
  `${wotMotor3.zeroToSixtySeconds.toFixed(2)} s`);
const cycleWithPulse = Sim.simulateDriveCycle({ ...base, motorLimitsEnabled: true, cellPulseDurationSeconds: 2, maxDischargeCurrentA: 18, continuousDischargeCurrentA: 2 });
check("Drive cycle respects continuous current after pulse time", cycleWithPulse.limitSeconds.cellContinuous > 0,
  `${cycleWithPulse.limitSeconds.cellContinuous} s on continuous limit`);

// 14. BMS current limits
const bms = { bmsLimitsEnabled: true, bmsPeakDischargeCurrentA: 350, bmsPeakDurationSeconds: 10, bmsContinuousDischargeCurrentA: 150, bmsMaxChargeCurrentA: 60 };
const bmsPack = Sim.buildPackModel({ ...base, ...bms });
check("BMS caps pack peak, continuous and charge limits", bmsPack.dischargeLimitA === 350 && bmsPack.continuousLimitA === 150 && bmsPack.chargeLimitA === 60);
const bmsHigh = Sim.buildPackModel({ ...base, bmsLimitsEnabled: true, bmsPeakDischargeCurrentA: 1000, bmsContinuousDischargeCurrentA: 1000 });
check("BMS above cell capability has no effect", bmsHigh.dischargeLimitA === 432 && bmsHigh.continuousLimitA === 192);
const wotBms = Sim.fullPowerTest({ ...base, ...wot, ...bms }, 94);
check("Full-power test peak current within BMS peak", wotBms.peakCurrentA <= 350 + 1e-6, `${wotBms.peakCurrentA.toFixed(1)} A`);
const wotBms3 = Sim.fullPowerTest({ ...base, ...wot, ...bms, bmsPeakDurationSeconds: 3 }, 94);
check("BMS peak duration slows 0-60", wotBms3.zeroToSixtySeconds > wotBms.zeroToSixtySeconds + 0.5
  && wotBms3.peakEvents.some(e => e.what.startsWith("BMS")), `${wotBms.zeroToSixtySeconds.toFixed(2)} -> ${wotBms3.zeroToSixtySeconds.toFixed(2)} s`);
const cycleBms = Sim.simulateDriveCycle({ ...base, ...bms });
check("Drive cycle regen within BMS charge limit", cycleBms.peakChargeCurrentA <= 60 + 1e-6, `${cycleBms.peakChargeCurrentA.toFixed(1)} A`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
