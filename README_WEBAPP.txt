Battery Cell Calculator - Web App

Open index.html in a browser to use the calculator locally.

To share it with a friend:
1. Upload the contents of this folder to a simple static host such as Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any ordinary web hosting.
2. Share the hosted URL.

No server or database is required. Inputs are saved only in the user's own browser local storage.

Pack calculations were ported from CalculatorModel.swift. The vehicle simulation (simulation.js) uses the official WLTP Class 3b drive cycle (wltc-class3b.js) or a constant 70 mph cruise, with an optional equivalent-circuit cell model and motor limits. See CHANGES.md for the method, and run `node tests/simulation.test.js` to check the engine.

Keep wltc-class3b.js, simulation.js and app.js together when uploading.
