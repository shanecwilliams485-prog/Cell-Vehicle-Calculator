# Battery Cell Calculator – v2 simulation rebuild

## What changed

### Vehicle simulation (new `simulation.js`)
- **Standard drive cycles.** The randomly generated city/mixed/motorway/performance cycles have been replaced by:
  - **WLTP Class 3b**, the official UN GTR 15 speed trace (in `wltc-class3b.js`; checksum and phase distances verified against the EC JRC `wltp` package and DieselNet).
  - **A constant 70 mph motorway cruise.**
- **Range is simulated to empty.** The cycle repeats until the usable SOC window is used up. Previously a single 30-minute run was extrapolated.
- **Physics only.** Removed the artificial current pulses, smoothing, sine-wave ripple, "sensor noise", random seeds and fixed kW/A caps. Each 1 s step uses a road-load model: F = m·a + m·g·Crr + ½ρCdAv².
- **Driver model.** The vehicle follows the trace unless a limit stops it. It then accelerates at that limit, and the results report the time spent off the trace.
- **Regen.** A single signed power balance. Regen is limited by the pack charge limit, the motor regen limit and the "disable above SOC" setting, which is now applied.
- **Deterministic.** Identical inputs always give identical results.

### New input sections
- **Advanced Cell Data** (optional): per-cell DCIR and an OCV-vs-SOC table, which can be pasted or loaded from a CSV file. The pack is modelled as V = OCV(SOC) − I·R, so the simulation includes voltage sag, I²R losses and the cell min/max voltage limits.
- **Motor & Drivetrain** (optional): motor peak and continuous power, controller battery-current limit, max regen power, peak torque, gear ratio, tyre radius and top speed. Leave any field at 0 for no limit.

### New results ("Performance at the limits")
- Pack peak power at the top and bottom of the SOC window, including voltage sag and the limit that applies.
- Full-power acceleration (0–60 and 50–70 mph) at full and low SOC, with peak current, minimum voltage and the limiting factor. This needs torque, gear ratio and tyre radius.
- Maximum sustained speed on the continuous ratings.
- Peak discharge and regen current, pack voltage range in use, time above the continuous current rating, which limits were active and for how long, and time spent off the speed trace.
- A "Method and assumptions" list on screen and in the PDF, and a disclaimer in every PDF footer.

### Behaviour changes to be aware of
- **Design requirements are now pass/fail checks only.** They no longer cap the simulation. Vehicle limits belong in Motor & Drivetrain.
- **New requirement check** (only with Advanced Cell Data on): pulse power at the bottom of the SOC window, including voltage sag.
- **Advanced Options is now just show/hide.** Regen, payload and auxiliary loads apply whether the panel is open or not. Regen is on by default.
- **Removed unsourced estimates.** Battery temperature from weather, weather/road-gradient multipliers, driver aggression and regen efficiency derived from weather are gone. Regen efficiency is now an editable input with a default of 65 %. Temperature effects should be entered as the DCIR at that temperature.
- **Saved inputs from the old version still load.** Old drive cycle choices map to WLTP.

### Fixes
- C-rates shown to 1 decimal place (3.6 C no longer appears as "4 C").
- Number inputs are no longer filled with locale-formatted text ("1,200" or "0,300").
- Removed the duplicate "peak power" and "continuous power" requirement rows.
- Removed five duplicate function definitions.
- Each field change now triggers one recalculation instead of several.
- Input validation runs before calculating (min/max voltage, usable factor, etc.).

## Tests
`node tests/simulation.test.js` runs 23 checks:
- WLTP data integrity
- the 70 mph result against a hand calculation
- energy balance
- voltage limits
- range independence from the series/parallel split
- controller limits
- full-power physics bounds
- OCV table parsing

## Known limitations (also listed in the app's assumptions)
- Constant drivetrain efficiency (no motor efficiency map) and constant DCIR (no change with SOC, temperature or age).
- No thermal model.
- Flat road and still air.
- No rotating inertia.
- No tyre-grip limit in the full-power test.
- WLTP downscaling for low-power vehicles is not applied; trace misses are reported instead.

---

# v3 – Simulation graph shows the full run

- **The graph now shows the whole simulation used for the range result.** It runs from 100 % to 0 % charge, not just the first 30-minute cycle. WLTP cycle boundaries are marked C2, C3 and so on.
- **Charge is shown the way a driver sees it:** 100 % at the start and 0 % when the usable energy is used up. The actual cell SOC window appears only in Simulation Settings and the assumptions.
- **Accelerated replay at a fixed length** (15 s, 30 s, 60 s or 2 min) whatever the run length, with the speed-up shown (e.g. "×630").
- **Controls:**
  - Play/Pause
  - a scrubber to jump to any point
  - a View choice: full run, first cycle (full battery) or final cycle (near empty)
- **Two-panel chart:**
  - Top panel: peak discharge and regen current and speed. Power-limited moments are shown in red.
  - Bottom panel: driver charge level and, with Advanced Cell Data on, pack voltage under load.
- **Peaks are kept visible when the run is compressed.** Each pixel shows that period's peak current and voltage range instead of an average.
- **Live tiles follow the playhead.** They show driving time, current, regen, speed, distance, pack voltage, charge, energy used, regen recovered, and cycle/phase. Two tiles (distance and pack voltage) are new.
- **"Performance at the limits" now says "full charge (100 %)" and "empty (0 %)"** instead of cell SOC percentages.
- **The phone full-screen graph loops the full run.** I also removed a stray, unused block of code from the phone-rotation handler.

---

# v4 – Motor & Drivetrain input units

- **Motor peak and continuous power are now labelled "kW (datasheet)".** Enter the motor manufacturer's rated output. The simulation applies it as the limit on power at the wheels, and the assumptions note that gearbox losses aren't separated out, which makes power-limited results slightly optimistic.
- **Tyre rolling radius is now entered in mm** (it was metres), with an example in the help text. Saved values in metres convert automatically.

---

# v5 – Tyre size helper

- **New optional "Tyre size" box in Motor & Drivetrain.** Entering a size fills in the tyre rolling radius automatically. It accepts:
  - metric sizes: 205/55 R16, P215/60R16, 225/45 ZR18 95W, LT265/70R17
  - flotation sizes: 31x10.50R15
- **How the radius is worked out:**
  - Metric unloaded radius = rim diameter ÷ 2 + width × aspect ratio. Flotation unloaded radius = overall diameter ÷ 2.
  - Rolling radius = 98 % of the unloaded radius, allowing for tyre deflection under load.
  - The status line shows both figures.
- **You can still type your own measured radius.** It's kept unless you change the tyre size again.
- The tyre size appears in Simulation Settings and the PDF next to the radius.
- Added 4 unit tests, making 27 in total.

---

# v6 – Low-charge reference at 15 %

- **The low-charge figures now use 15 % displayed charge instead of 0 % (empty).** This applies to:
  - Pack Results, Performance at the Limits and the PDF: pack peak power at low charge
  - full-power acceleration at low charge
  - max sustained speed at low charge
  - the design-requirement check "Pulse power at low charge (15 %, with voltage sag)"
- 15 % is of the usable window, as the driver sees it, so it is 15 % of the usable energy above empty. The assumptions list gives the equivalent actual cell SOC.
- The level is set in one place in app.js (`LOW_CHARGE_DISPLAY_SOC = 15`) if it needs changing.

---

# v7 – Time-limited peak ratings

- **New inputs** (0 = no time limit, which keeps the previous results):
  - **Cell Data: "Max discharge duration (s)"**, how long the cell max (pulse) current can be held, from the cell datasheet.
  - **Motor & Drivetrain: "Peak power duration (s)"**, how long motor peak power can be held. Motor continuous power is then required.
- **Full-power test:** peak current and power apply only for those durations, then the continuous ratings take over. The results say when and at what speed this happened, e.g. "cell pulse rating ended at 3.0 s / 45 mph". 0–60 is from rest; 50–70 is now a separate rolling-start run that starts with the full peak time available, as a real overtake would.
- **Drive cycles (WLTP / 70 mph):** peak time is used up while running above the continuous rating and recovers at the same rate while at or below it. Time spent on the continuous limit is reported under "Power-limited time".
- **Design requirements:** "Required pulse duration" is now a pass/fail check against the cell's max discharge duration. Without a cell duration it still shows as a note.
- **Pack peak power rows** show "for up to N s" when a duration is set.
- The assumptions list explains the rule.
- Added 6 unit tests, making 33 in total.
