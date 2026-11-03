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

  // WLTC Class 3b drive cycle (vehicles with PMR > 34 W/kg and v_max >= 120 km/h).
  // Vehicle speed in km/h at 1 Hz, t = 0 ... 1800 s (1801 samples).
  //
  // Source: UN GTR No. 15 (WLTP), Annex 1, as distributed in the European Commission
  // JRC reference implementation `wltp` (PyPI package wltp 0.1.2a0, wltp/cycles/class3.py,
  // class_data_b, checksum 83758.6 - verified).
  // Cross-checked against DieselNet "Worldwide Harmonized Light Vehicles Test Cycle (WLTC)",
  // Table 2: Low 3,095 m / Medium 4,756 m / High 7,162 m / Extra High 8,254 m,
  // total 23,266 m, v_max 131.3 km/h.
  //
  // Do not edit these values. Phase boundaries (sample index): Low 0-589,
  // Medium 590-1022, High 1023-1477, Extra High 1478-1800.
  const WLTC_CLASS3B_PHASES = [
    { name: "WLTP Low", start: 0, end: 589 },
    { name: "WLTP Medium", start: 590, end: 1022 },
    { name: "WLTP High", start: 1023, end: 1477 },
    { name: "WLTP Extra High", start: 1478, end: 1800 }
  ];

  const WLTC_CLASS3B_KMH = [
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 1.7, 5.4, 9.9, 13.1, 16.9, 21.7, 26.0,
    27.5, 28.1, 28.3, 28.8, 29.1, 30.8, 31.9, 34.1, 36.6, 39.1, 41.3, 42.5, 43.3, 43.9, 44.4, 44.5, 44.2, 42.7, 39.9, 37.0,
    34.6, 32.3, 29.0, 25.1, 22.2, 20.9, 20.4, 19.5, 18.4, 17.8, 17.8, 17.4, 15.7, 13.1, 12.1, 12.0, 12.0, 12.0, 12.3, 12.6,
    14.7, 15.3, 15.9, 16.2, 17.1, 17.8, 18.1, 18.4, 20.3, 23.2, 26.5, 29.8, 32.6, 34.4, 35.5, 36.4, 37.4, 38.5, 39.3, 39.5,
    39.0, 38.5, 37.3, 37.0, 36.7, 35.9, 35.3, 34.6, 34.2, 31.9, 27.3, 22.0, 17.0, 14.2, 12.0, 9.1, 5.8, 3.6, 2.2, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 1.9,
    6.1, 11.7, 16.4, 18.9, 19.9, 20.8, 22.8, 25.4, 27.7, 29.2, 29.8, 29.4, 27.2, 22.6, 17.3, 13.3, 12.0, 12.6, 14.1, 17.2,
    20.1, 23.4, 25.5, 27.6, 29.5, 31.1, 32.1, 33.2, 35.2, 37.2, 38.0, 37.4, 35.1, 31.0, 27.1, 25.3, 25.1, 25.9, 27.8, 29.2,
    29.6, 29.5, 29.2, 28.3, 26.1, 23.6, 21.0, 18.9, 17.1, 15.7, 14.5, 13.7, 12.9, 12.5, 12.2, 12.0, 12.0, 12.0, 12.0, 12.5,
    13.0, 14.0, 15.0, 16.5, 19.0, 21.2, 23.8, 26.9, 29.6, 32.0, 35.2, 37.5, 39.2, 40.5, 41.6, 43.1, 45.0, 47.1, 49.0, 50.6,
    51.8, 52.7, 53.1, 53.5, 53.8, 54.2, 54.8, 55.3, 55.8, 56.2, 56.5, 56.5, 56.2, 54.9, 52.9, 51.0, 49.8, 49.2, 48.4, 46.9,
    44.3, 41.5, 39.5, 37.0, 34.6, 32.3, 29.0, 25.1, 22.2, 20.9, 20.4, 19.5, 18.4, 17.8, 17.8, 17.4, 15.7, 14.5, 15.4, 17.9,
    20.6, 23.2, 25.7, 28.7, 32.5, 36.1, 39.0, 40.8, 42.9, 44.4, 45.9, 46.0, 45.6, 45.3, 43.7, 40.8, 38.0, 34.4, 30.9, 25.5,
    21.4, 20.2, 22.9, 26.6, 30.2, 34.1, 37.4, 40.7, 44.0, 47.3, 49.2, 49.8, 49.2, 48.1, 47.3, 46.8, 46.7, 46.8, 47.1, 47.3,
    47.3, 47.1, 46.6, 45.8, 44.8, 43.3, 41.8, 40.8, 40.3, 40.1, 39.7, 39.2, 38.5, 37.4, 36.0, 34.4, 33.0, 31.7, 30.0, 28.0,
    26.1, 25.6, 24.9, 24.9, 24.3, 23.9, 23.9, 23.6, 23.3, 20.5, 17.5, 16.9, 16.7, 15.9, 15.6, 15.0, 14.5, 14.3, 14.5, 15.4,
    17.8, 21.1, 24.1, 25.0, 25.3, 25.5, 26.4, 26.6, 27.1, 27.7, 28.1, 28.2, 28.1, 28.0, 27.9, 27.9, 28.1, 28.2, 28.0, 26.9,
    25.0, 23.2, 21.9, 21.1, 20.7, 20.7, 20.8, 21.2, 22.1, 23.5, 24.3, 24.5, 23.8, 21.3, 17.7, 14.4, 11.9, 10.2, 8.9, 8.0,
    7.2, 6.1, 4.9, 3.7, 2.3, 0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 2.1, 4.8, 8.3, 12.3, 16.6, 20.9, 24.2,
    25.6, 25.6, 24.9, 23.3, 21.6, 20.2, 18.7, 17.0, 15.3, 14.2, 13.9, 14.0, 14.2, 14.5, 14.9, 15.9, 17.4, 18.7, 19.1, 18.8,
    17.6, 16.6, 16.2, 16.4, 17.2, 19.1, 22.6, 27.4, 31.6, 33.4, 33.5, 32.8, 31.9, 31.3, 31.1, 30.6, 29.2, 26.7, 23.0, 18.2,
    12.9, 7.7, 3.8, 1.3, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 2.5, 6.6, 11.8, 16.8, 20.5, 21.9, 21.9,
    21.3, 20.3, 19.2, 17.8, 15.5, 11.9, 7.6, 4.0, 2.0, 1.0, 0.0, 0.0, 0.0, 0.2, 1.2, 3.2, 5.2, 8.2, 13.0, 18.8,
    23.1, 24.5, 24.5, 24.3, 23.6, 22.3, 20.1, 18.5, 17.2, 16.3, 15.4, 14.7, 14.3, 13.7, 13.3, 13.1, 13.1, 13.3, 13.8, 14.5,
    16.5, 17.0, 17.0, 17.0, 15.4, 10.1, 4.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 2.1, 4.8, 9.1, 14.2, 19.8, 25.5, 30.5, 34.8, 38.8, 42.9, 46.4, 48.3, 48.7, 48.5, 48.4, 48.2, 47.8, 47.0,
    45.9, 44.9, 44.4, 44.3, 44.5, 45.1, 45.7, 46.0, 46.0, 46.0, 46.1, 46.7, 47.7, 48.9, 50.3, 51.6, 52.6, 53.0, 53.0, 52.9,
    52.7, 52.6, 53.1, 54.3, 55.2, 55.5, 55.9, 56.3, 56.7, 56.9, 56.8, 56.0, 54.2, 52.1, 50.1, 47.2, 43.2, 39.2, 36.5, 34.3,
    31.0, 26.0, 20.7, 15.4, 13.1, 12.0, 12.5, 14.0, 19.0, 23.2, 28.0, 32.0, 34.0, 36.0, 38.0, 40.0, 40.3, 40.5, 39.0, 35.7,
    31.8, 27.1, 22.8, 21.1, 18.9, 18.9, 21.3, 23.9, 25.9, 28.4, 30.3, 30.9, 31.1, 31.8, 32.7, 33.2, 32.4, 28.3, 25.8, 23.1,
    21.8, 21.2, 21.0, 21.0, 20.9, 19.9, 17.9, 15.1, 12.8, 12.0, 13.2, 17.1, 21.1, 21.8, 21.2, 18.5, 13.9, 12.0, 12.0, 13.0,
    16.0, 18.5, 20.6, 22.5, 24.0, 26.6, 29.9, 34.8, 37.8, 40.2, 41.6, 41.9, 42.0, 42.2, 42.4, 42.7, 43.1, 43.7, 44.0, 44.1,
    45.3, 46.4, 47.2, 47.3, 47.4, 47.4, 47.5, 47.9, 48.6, 49.4, 49.8, 49.8, 49.7, 49.3, 48.5, 47.6, 46.3, 43.7, 39.3, 34.1,
    29.0, 23.7, 18.4, 14.3, 12.0, 12.8, 16.0, 19.1, 22.4, 25.6, 30.1, 35.3, 39.9, 44.5, 47.5, 50.9, 54.1, 56.3, 58.1, 59.8,
    61.1, 62.1, 62.8, 63.3, 63.6, 64.0, 64.7, 65.2, 65.3, 65.3, 65.4, 65.7, 66.0, 65.6, 63.5, 59.7, 54.6, 49.3, 44.9, 42.3,
    41.4, 41.3, 42.1, 44.7, 48.4, 51.4, 52.7, 53.0, 52.5, 51.3, 49.7, 47.4, 43.7, 39.7, 35.5, 31.1, 26.3, 21.9, 18.0, 17.0,
    18.0, 21.4, 24.8, 27.9, 30.8, 33.0, 35.1, 37.1, 38.9, 41.4, 44.0, 46.3, 47.7, 48.2, 48.7, 49.3, 49.8, 50.2, 50.9, 51.8,
    52.5, 53.3, 54.5, 55.7, 56.5, 56.8, 57.0, 57.2, 57.7, 58.7, 60.1, 61.1, 61.7, 62.3, 62.9, 63.3, 63.4, 63.5, 64.5, 65.8,
    66.8, 67.4, 68.8, 71.1, 72.3, 72.8, 73.4, 74.6, 76.0, 76.6, 76.5, 76.2, 75.8, 75.4, 74.8, 73.9, 72.7, 71.3, 70.4, 70.0,
    70.0, 69.0, 68.0, 68.0, 68.0, 68.1, 68.4, 68.6, 68.7, 68.5, 68.1, 67.3, 66.2, 64.8, 63.6, 62.6, 62.1, 61.9, 61.9, 61.8,
    61.5, 60.9, 59.7, 54.6, 49.3, 44.9, 42.3, 41.4, 41.3, 42.1, 44.7, 48.4, 51.4, 52.7, 54.0, 57.0, 58.1, 59.2, 59.0, 59.1,
    59.5, 60.5, 62.3, 63.9, 65.1, 64.1, 62.7, 62.0, 61.3, 60.9, 60.5, 60.2, 59.8, 59.4, 58.6, 57.5, 56.6, 56.0, 55.5, 55.0,
    54.4, 54.1, 54.0, 53.9, 53.9, 54.0, 54.2, 55.0, 55.8, 56.2, 56.1, 55.1, 52.7, 48.4, 43.1, 37.8, 32.5, 27.2, 25.1, 26.0,
    29.3, 34.6, 40.4, 45.3, 49.0, 51.1, 52.1, 52.2, 52.1, 51.7, 50.9, 49.2, 45.9, 40.6, 35.3, 30.0, 24.7, 19.3, 16.0, 13.2,
    10.7, 8.8, 7.2, 5.5, 3.2, 1.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 3.6, 8.6, 14.6, 20.0, 24.4, 28.2, 31.7, 35.0, 37.6, 39.7, 41.5, 43.6,
    46.0, 48.4, 50.5, 51.9, 52.6, 52.8, 52.9, 53.1, 53.3, 53.1, 52.3, 50.7, 48.8, 46.5, 43.8, 40.3, 36.0, 30.7, 25.4, 21.0,
    16.7, 13.4, 12.0, 12.1, 12.8, 15.6, 19.9, 23.4, 24.6, 25.2, 26.4, 28.8, 31.8, 35.3, 39.5, 44.5, 49.3, 53.3, 56.4, 58.9,
    61.2, 62.6, 63.0, 62.5, 60.9, 59.3, 58.6, 58.6, 58.7, 58.8, 58.8, 58.8, 59.1, 60.1, 61.7, 63.0, 63.7, 63.9, 63.5, 62.3,
    60.3, 58.9, 58.4, 58.8, 60.2, 62.3, 63.9, 64.5, 64.4, 63.5, 62.0, 61.2, 61.3, 62.6, 65.3, 68.0, 69.4, 69.7, 69.3, 68.1,
    66.9, 66.2, 65.7, 64.9, 63.2, 60.3, 55.8, 50.5, 45.2, 40.1, 36.2, 32.9, 29.8, 26.6, 23.0, 19.4, 16.3, 14.6, 14.2, 14.3,
    14.6, 15.1, 16.4, 19.1, 22.5, 24.4, 24.8, 22.7, 17.4, 13.8, 12.0, 12.0, 12.0, 13.9, 17.7, 22.8, 27.3, 31.2, 35.2, 39.4,
    42.5, 45.4, 48.2, 50.3, 52.6, 54.5, 56.6, 58.3, 60.0, 61.5, 63.1, 64.3, 65.7, 67.1, 68.3, 69.7, 70.6, 71.6, 72.6, 73.5,
    74.2, 74.9, 75.6, 76.3, 77.1, 77.9, 78.5, 79.0, 79.7, 80.3, 81.0, 81.6, 82.4, 82.9, 83.4, 83.8, 84.2, 84.7, 85.2, 85.6,
    86.3, 86.8, 87.4, 88.0, 88.3, 88.7, 89.0, 89.3, 89.8, 90.2, 90.6, 91.0, 91.3, 91.6, 91.9, 92.2, 92.8, 93.1, 93.3, 93.5,
    93.7, 93.9, 94.0, 94.1, 94.3, 94.4, 94.6, 94.7, 94.8, 95.0, 95.1, 95.3, 95.4, 95.6, 95.7, 95.8, 96.0, 96.1, 96.3, 96.4,
    96.6, 96.8, 97.0, 97.2, 97.3, 97.4, 97.4, 97.4, 97.4, 97.3, 97.3, 97.3, 97.3, 97.2, 97.1, 97.0, 96.9, 96.7, 96.4, 96.1,
    95.7, 95.5, 95.3, 95.2, 95.0, 94.9, 94.7, 94.5, 94.4, 94.4, 94.3, 94.3, 94.1, 93.9, 93.4, 92.8, 92.0, 91.3, 90.6, 90.0,
    89.3, 88.7, 88.1, 87.4, 86.7, 86.0, 85.3, 84.7, 84.1, 83.5, 82.9, 82.3, 81.7, 81.1, 80.5, 79.9, 79.4, 79.1, 78.8, 78.5,
    78.2, 77.9, 77.6, 77.3, 77.0, 76.7, 76.0, 76.0, 76.0, 75.9, 75.9, 75.8, 75.7, 75.5, 75.2, 75.0, 74.7, 74.1, 73.7, 73.3,
    73.5, 74.0, 74.9, 76.1, 77.7, 79.2, 80.3, 80.8, 81.0, 81.0, 81.0, 81.0, 81.0, 80.9, 80.6, 80.3, 80.0, 79.9, 79.8, 79.8,
    79.8, 79.9, 80.0, 80.4, 80.8, 81.2, 81.5, 81.6, 81.6, 81.4, 80.7, 79.6, 78.2, 76.8, 75.3, 73.8, 72.1, 70.2, 68.2, 66.1,
    63.8, 61.6, 60.2, 59.8, 60.4, 61.8, 62.6, 62.7, 61.9, 60.0, 58.4, 57.8, 57.8, 57.8, 57.3, 56.2, 54.3, 50.8, 45.5, 40.2,
    34.9, 29.6, 27.3, 29.3, 32.9, 35.6, 36.7, 37.6, 39.4, 42.5, 46.5, 50.2, 52.8, 54.3, 54.9, 54.9, 54.7, 54.1, 53.2, 52.1,
    50.7, 49.1, 47.4, 45.2, 41.8, 36.5, 31.2, 27.6, 26.9, 27.3, 27.5, 27.4, 27.1, 26.7, 26.8, 28.2, 31.1, 34.8, 38.4, 40.9,
    41.7, 40.9, 38.3, 35.3, 34.3, 34.6, 36.3, 39.5, 41.8, 42.5, 41.9, 40.1, 36.6, 31.3, 26.0, 20.6, 19.1, 19.7, 21.1, 22.0,
    22.1, 21.4, 19.6, 18.3, 18.0, 18.3, 18.5, 17.9, 15.0, 9.9, 4.6, 1.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.2,
    4.4, 6.3, 7.9, 9.2, 10.4, 11.5, 12.9, 14.7, 17.0, 19.8, 23.1, 26.7, 30.5, 34.1, 37.5, 40.6, 43.3, 45.7, 47.7, 49.3,
    50.5, 51.3, 52.1, 52.7, 53.4, 54.0, 54.5, 55.0, 55.6, 56.3, 57.2, 58.5, 60.2, 62.3, 64.7, 67.1, 69.2, 70.7, 71.9, 72.7,
    73.4, 73.8, 74.1, 74.0, 73.6, 72.5, 70.8, 68.6, 66.2, 64.0, 62.2, 60.9, 60.2, 60.0, 60.4, 61.4, 63.2, 65.6, 68.4, 71.6,
    74.9, 78.4, 81.8, 84.9, 87.4, 89.0, 90.0, 90.6, 91.0, 91.5, 92.0, 92.7, 93.4, 94.2, 94.9, 95.7, 96.6, 97.7, 98.9, 100.4,
    102.0, 103.6, 105.2, 106.8, 108.5, 110.2, 111.9, 113.7, 115.3, 116.8, 118.2, 119.5, 120.7, 121.8, 122.6, 123.2, 123.6, 123.7, 123.6, 123.3,
    123.0, 122.5, 122.1, 121.5, 120.8, 120.0, 119.1, 118.1, 117.1, 116.2, 115.5, 114.9, 114.5, 114.1, 113.9, 113.7, 113.3, 112.9, 112.2, 111.4,
    110.5, 109.5, 108.5, 107.7, 107.1, 106.6, 106.4, 106.2, 106.2, 106.2, 106.4, 106.5, 106.8, 107.2, 107.8, 108.5, 109.4, 110.5, 111.7, 113.0,
    114.1, 115.1, 115.9, 116.5, 116.7, 116.6, 116.2, 115.2, 113.8, 112.0, 110.1, 108.3, 107.0, 106.1, 105.8, 105.7, 105.7, 105.6, 105.3, 104.9,
    104.4, 104.0, 103.8, 103.9, 104.4, 105.1, 106.1, 107.2, 108.5, 109.9, 111.3, 112.7, 113.9, 115.0, 116.0, 116.8, 117.6, 118.4, 119.2, 120.0,
    120.8, 121.6, 122.3, 123.1, 123.8, 124.4, 125.0, 125.4, 125.8, 126.1, 126.4, 126.6, 126.7, 126.8, 126.9, 126.9, 126.9, 126.8, 126.6, 126.3,
    126.0, 125.7, 125.6, 125.6, 125.8, 126.2, 126.6, 127.0, 127.4, 127.6, 127.8, 127.9, 128.0, 128.1, 128.2, 128.3, 128.4, 128.5, 128.6, 128.6,
    128.5, 128.3, 128.1, 127.9, 127.6, 127.4, 127.2, 127.0, 126.9, 126.8, 126.7, 126.8, 126.9, 127.1, 127.4, 127.7, 128.1, 128.5, 129.0, 129.5,
    130.1, 130.6, 131.0, 131.2, 131.3, 131.2, 130.7, 129.8, 128.4, 126.5, 124.1, 121.6, 119.0, 116.5, 114.1, 111.8, 109.5, 107.1, 104.8, 102.5,
    100.4, 98.6, 97.2, 95.9, 94.8, 93.8, 92.8, 91.8, 91.0, 90.2, 89.6, 89.1, 88.6, 88.1, 87.6, 87.1, 86.6, 86.1, 85.5, 85.0,
    84.4, 83.8, 83.2, 82.6, 82.0, 81.3, 80.4, 79.1, 77.4, 75.1, 72.3, 69.1, 65.9, 62.7, 59.7, 57.0, 54.6, 52.2, 49.7, 46.8,
    43.5, 39.9, 36.4, 33.2, 30.5, 28.3, 26.3, 24.4, 22.5, 20.5, 18.2, 15.5, 12.3, 8.7, 5.2, 0.0, 0.0, 0.0, 0.0, 0.0,
    0.0,
  ];

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
    const cellChargeLimitA = Math.max(0, num(input.maxChargeCurrentA)) * parallel * 0.8;

    // BMS current limits: set by the weakest component in the current path
    // (fuse, contactor, busbar, connector...). 0 = not set.
    const bmsEnabled = !!input.bmsLimitsEnabled;
    const bmsPeakA = bmsEnabled ? positiveOrInfinity(input.bmsPeakDischargeCurrentA) : Infinity;
    const bmsContinuousA = bmsEnabled ? positiveOrInfinity(input.bmsContinuousDischargeCurrentA) : Infinity;
    const bmsPeakDurationS = bmsEnabled && Number.isFinite(bmsPeakA) && Number.isFinite(bmsContinuousA)
      ? positiveOrInfinity(input.bmsPeakDurationSeconds)
      : Infinity;
    const bmsChargeA = bmsEnabled ? positiveOrInfinity(input.bmsMaxChargeCurrentA) : Infinity;
    const chargeLimitA = Math.min(cellChargeLimitA, bmsChargeA);

    const dischargeLimitA = Math.min(cellDischargeLimitA, bmsPeakA, controllerLimitA);
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
      cellContinuousLimitA,
      bmsPeakA,
      bmsContinuousA,
      bmsPeakDurationS,
      bmsChargeA,
      cellChargeLimitA,
      // Pack continuous rating = lower of the cells and the BMS.
      continuousLimitA: Math.min(cellContinuousLimitA, bmsContinuousA),
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
  // peak = { cell, bms }: false once that peak duration has been used up.
  function dischargeCapability(pack, soc, peak = { cell: true, bms: true }) {
    const ocv = pack.ocv(soc);
    const R = pack.resistanceOhm;
    const cellPeak = peak.cell !== false;
    const bmsPeak = peak.bms !== false;
    const candidates = [
      cellPeak
        ? { limit: "cell", amps: pack.cellDischargeLimitA }
        : { limit: "cellContinuous", amps: pack.cellContinuousLimitA },
      bmsPeak
        ? { limit: "bms", amps: pack.bmsPeakA }
        : { limit: "bmsContinuous", amps: pack.bmsContinuousA },
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

    // Speed at motor max rpm: v = rpm × 2π × r / (60 × gear ratio).
    const maxRpm = motorEnabled ? num(input.motorMaxRpm) : 0;
    const rpmLimitedSpeedMps = maxRpm > 0 && gear > 0 && radius > 0
      ? maxRpm * 2 * Math.PI * radius / (60 * gear)
      : Infinity;
    const enteredTopSpeedMps = motorEnabled ? positiveOrInfinity(input.vehicleTopSpeedMph) * MPH_TO_MPS : Infinity;

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
      // Vehicle maximum speed: the lower of the entered top speed and the
      // speed at which the motor reaches its maximum rpm.
      topSpeedMps: Math.min(enteredTopSpeedMps, rpmLimitedSpeedMps),
      topSpeedLimit: rpmLimitedSpeedMps < enteredTopSpeedMps ? "motorRpm" : (Number.isFinite(enteredTopSpeedMps) ? "topSpeed" : null),
      rpmLimitedSpeedMps,
      enteredTopSpeedMps
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
  function tractionCapability(pack, vehicle, soc, peak = { cell: true, bms: true, motor: true }) {
    const battery = dischargeCapability(pack, soc, peak);
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
    const kmh = WLTC_CLASS3B_KMH;
    const phases = WLTC_CLASS3B_PHASES;
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
      limitSeconds: { motorPower: 0, motorContinuous: 0, torque: 0, cell: 0, cellContinuous: 0, bms: 0, bmsContinuous: 0, controller: 0, voltage: 0, maxPower: 0, topSpeed: 0 },
      regenLimitedSeconds: 0
    };
    let currentRunAboveContinuous = 0;
    let cellPeakBudget = pack.cellPulseDurationS;
    let bmsPeakBudget = pack.bmsPeakDurationS;
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
          const traction = tractionCapability(pack, vehicle, soc, { cell: cellPeakBudget > 0, bms: bmsPeakBudget > 0, motor: motorPeakBudget > 0 });
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

        cellPeakBudget = updatePeakBudget(cellPeakBudget, pack.cellPulseDurationS, current > pack.cellContinuousLimitA + 1e-6, dt);
        bmsPeakBudget = updatePeakBudget(bmsPeakBudget, pack.bmsPeakDurationS, current > pack.bmsContinuousA + 1e-6, dt);
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
      bms: t < pack.bmsPeakDurationS,
      motor: t < vehicle.motorPeakDurationS
    });
    const initialTraction = capabilityAt(0);

    // run(): full throttle from startMph. Acceleration runs stop at endMph;
    // the top-speed run (holdSeconds > 0) keeps going for that long, letting
    // the speed fall back if a peak rating ends, and records the highest speed.
    function run(startMph, endMph, holdSeconds = 0) {
      const dt = holdSeconds > 0 ? 0.02 : 0.01;
      const maxTime = holdSeconds > 0 ? holdSeconds : 120;
      let vMax = startMph * MPH_TO_MPS;
      let tAtVMax = 0;
      let limitAtVMax = null;
      const samples = [];
      const marks = {};
      const events = [];
      let v = startMph * MPH_TO_MPS;
      let t = 0;
      let peakCurrent = 0;
      let minTerminalV = Infinity;
      let limitingFactor = "torque";
      let traction = capabilityAt(0);

      while (t < maxTime && v < endMph * MPH_TO_MPS && v < vehicle.topSpeedMps) {
        const checkEnd = (duration, what) => {
          if (Number.isFinite(duration) && t < duration && t + dt >= duration) {
            events.push({ seconds: duration, mph: v / MPH_TO_MPS, what });
            traction = capabilityAt(duration + 1e-9);
          }
        };
        checkEnd(pack.cellPulseDurationS, "cell pulse rating ended");
        checkEnd(pack.bmsPeakDurationS, "BMS peak limit ended");
        checkEnd(vehicle.motorPeakDurationS, "motor peak power ended");

        const powerLimitedForce = traction.wheelPowerW / Math.max(v, 0.01);
        const force = Math.min(vehicle.maxTractiveForceN, powerLimitedForce);
        if (force < vehicle.maxTractiveForceN) limitingFactor = traction.limit;
        const net = force - roadLoadForceN(vehicle, v);
        if (net <= 0 && holdSeconds <= 0) break;
        const batteryW = force * v / vehicle.efficiency + vehicle.auxiliaryLoadW;
        const current = currentForPower(batteryW, traction.battery.ocv, pack.resistanceOhm) ?? traction.battery.amps;
        peakCurrent = Math.max(peakCurrent, current);
        minTerminalV = Math.min(minTerminalV, traction.battery.ocv - current * pack.resistanceOhm);

        v = Math.max(0, v + net / vehicle.massKg * dt);
        t += dt;
        if (holdSeconds > 0) samples.push([t, v]);
        if (v > vMax + 1e-6) {
          vMax = Math.min(v, vehicle.topSpeedMps);
          tAtVMax = t;
          limitAtVMax = force < vehicle.maxTractiveForceN ? traction.limit : "torque";
        }
        for (const mph of [30, 60, 70]) {
          if (marks[mph] === undefined && mph > startMph && v >= mph * MPH_TO_MPS) marks[mph] = t;
        }
      }
      if (v >= vehicle.topSpeedMps - 1e-6) limitAtVMax = vehicle.topSpeedLimit || limitAtVMax;
      // Still accelerating when a peak rating ran out: that is what set the top speed.
      const endedAtTop = events.find(e => Math.abs(e.seconds - tAtVMax) < 0.1);
      if (endedAtTop) limitAtVMax = `peakEnded:${endedAtTop.what}`;
      const near = samples.find(([, speed]) => speed >= 0.98 * vMax);
      return { marks, events, peakCurrent, minTerminalV, limitingFactor, vMax, tAtVMax, limitAtVMax, finalSpeed: v, t98: near ? near[0] : tAtVMax };
    }

    const standing = run(0, 60);
    const rolling = run(50, 70);
    // Top speed: 3 minutes at full throttle from rest on a flat road.
    const top = run(0, 1000, 180);

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
      rollingPeakEvents: rolling.events,
      topSpeedMph: top.vMax / MPH_TO_MPS,
      topSpeedReachedSeconds: top.tAtVMax,
      topSpeed98Seconds: top.t98,
      topSpeedLimit: top.limitAtVMax,
      // Speed still held at the end of the 3-minute run (after any peak ratings end).
      topSpeedHeldMph: top.finalSpeed / MPH_TO_MPS,
      topSpeedEvents: top.events
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
    if (roadLoadForceN(vehicle, cap) * cap <= wheelW) {
      return { mph: cap / MPH_TO_MPS, limit: vehicle.topSpeedLimit || "power" };
    }
    let lo = 0;
    let hi = cap;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (roadLoadForceN(vehicle, mid) * mid <= wheelW) lo = mid; else hi = mid;
    }
    return { mph: lo / MPH_TO_MPS, limit: "power" };
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

  // Bump whenever app.js depends on new engine output. app.js checks this so a
  // stale simulation.js on the server is reported instead of giving wrong results.
  const ENGINE_VERSION = 13;

  const api = {
    ENGINE_VERSION,
    WLTC_CLASS3B_KMH,
    WLTC_CLASS3B_PHASES,
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
