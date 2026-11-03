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
