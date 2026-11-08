# HeatOpt — Final Deployment Package

This is the **final user-provided HeatOpt v16 design**, with the existing hourly calculation engine and datasets retained.

## Deploy

Upload the *contents* of this folder to Netlify, Vercel, GitHub Pages, or any static web host. Set the entrypoint to `index.html`. Keep `assets/` in the same directory. There is no npm build step, API key, or Python server required.

This repository deploys `index.html`, `standalone.html`, and `assets/` to GitHub Pages whenever a commit is pushed to `main`. The live site is at <https://SatyamParashar01.github.io/heatopt-heating-final/>.

To test locally, run `python -m http.server 8000` from this folder and open `http://localhost:8000`.

`standalone.html` bundles HTML, CSS and JS in one file and can also be opened directly in a local browser. Some chat previewers do not execute HTML or JavaScript; download the file rather than relying on an in-app preview.

## Project files
- `index.html` — deployable homepage
- `assets/styles.css` — final design styles
- `assets/data.js` — hourly weather, prices, emissions, model performance data
- `assets/model.js` — preserved calculation engine
- `assets/app.js` — controls, cards, advanced charts and interactions
- `standalone.html` — same application, bundled as a single file
- `tests/` — browser test script and report

## Scope and limitations
- Three supported cities: Boston, Atlanta and Montreal.
- Cost is annualized energy plus modeled heat pump capital recovery (15 years, 5% rate), not an actual quote.
- Home heating load uses a calibrated archetype approximation, not site-specific 5R1C simulation or measured consumption.
- No rebate, new backup installation costs, hourly marginal grid emissions or equipment certification verification is implied.
- The renovation-sensitivity text in the footer is informational only.
- Team MegaSize names and flags are preserved from the supplied final UI.

## Verification results
- 19/19 independent mathematical regression checks passed (`tests/engine_report.json`).
- 9 desktop browser checks passed, including initial load and the Simple/Advanced switching (`tests/browser_report.json`).
- An automated mobile browser run did not complete in the testing environment; responsive CSS is included but mobile interactions should be checked on a real device before public launch.

## Frontend execution note
The calculator performs intensive hourly scenario comparisons in JavaScript. The Simple view computes the selected city first; the other cities are computed only when opening Advanced mode. Very slow devices can take longer to update.
