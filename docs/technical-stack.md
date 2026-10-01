# Technical stack — evidence engine additions (PROMPT A / A2)

Every new runtime dependency is pinned to an exact version and its license
is permissive (MIT/ISC). `npm audit`: **0 vulnerabilities**.

| Package | Version | License | Why |
|---|---|---|---|
| `json-logic-js` | 2.0.5 | MIT | Evaluates `knowledge/seed/*.json` rule payloads — rules are data, so thresholds/units are versioned and auditable without code changes. |
| `date-fns` | 4.4.0 | MIT | Small, tree-shakeable date math for the hour-1 bundle clock and "data as of" freshness labels. |
| `lru-cache` | 10.4.3 | ISC | Bounded in-memory cache for external terminology/API responses (offline fallback source). |
| `@types/json-logic-js` | 2.0.8 | MIT (dev) | Types for the rule evaluator. |

Already present and reused: `zod` (seed-file validation, env schema),
`recharts` (Why? panel / KPI charts). **No ML libraries in the runtime** —
the rules engine is deterministic by design.

## Python (validation only — `requirements.txt`, not shipped)

| Package | Version | Purpose |
|---|---|---|
| pandas | 2.3.1 | Dataset assembly for offline model evaluation. |
| numpy | 2.3.1 | Arrays for metric computation. |
| scikit-learn | 1.7.0 | `roc_auc_score`, `calibration_curve` for any future trained model. |
| matplotlib | 3.10.3 | Calibration/ROC plots for validation reports. |

## License posture

New direct deps: MIT / ISC only. Transitive tree contains
BlueOak-1.0.0 (permissive, MIT-style with patent grant — `tar`, `glob`,
`rimraf` build tooling), MPL-2.0 (`axe-core`, `lightningcss`), OFL-1.1
(bundled fonts), CC-BY datasets (`caniuse-lite`, `spdx-*`) — all
permissive or weak-copyleft, none are new additions, none impose
non-commercial terms.
