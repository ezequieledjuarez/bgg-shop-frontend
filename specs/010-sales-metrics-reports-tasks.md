# Tasks (Frontend): CU-A02 — Sales Metrics & Reports

Plan and rules: `../../specs/010-sales-metrics-reports/plan.md`. Global ledger: `../../specs/010-sales-metrics-reports/tasks.md`.
Branch: `010-sales-metrics-reports`. Local validation only. Consume only BFF endpoints; no chart library.

- [x] F-1 After the BFF contract (X-4) is approved, run `npm run generate:types` and keep the regenerated `src/types/generated/bff-api.d.ts`; never hand-edit it.
- [x] F-2 Write failing Vitest tests in `src/admin/sales/SalesPanel.test.tsx`: loading, error, empty and success states; filter wiring (dates, category, product); default range; Spanish dispatch labels; keyboard access and accessible names. Expected RED observed because `SalesPanel` is not implemented. (after F-1)
- [x] F-3 Implement `src/admin/sales/SalesPanel.tsx`: date range and filters, revenue/orders summary, top-10 table, dispatch and payment status counts, native SVG/CSS bar chart for `revenueByDay`; load metrics and categories in parallel. F-2 passes.
- [x] F-4 Register `/admin/sales` and add a "Ventas" link in `src/admin/AdminRouter.tsx`.
- [x] F-5 Seed deterministic sales rows and complete Playwright flow `tests/e2e/sales.spec.ts` (admin login → dashboard → apply filter → compare UI/BFF output with direct SQL). Seed and cleanup only the disposable local test DB; never use the active `saleor` database. (after F-3, F-4, Core C-2, BFF B-3, Core C-6)
- [x] F-6 Run lint, build, Vitest and the E2E flow; record results in the global ledger.

## Evidence Ledger

| Task | Check | Result | Date |
| --- | --- | --- | --- |
| F-1 | `npm run generate:types`; generated-path check; `git diff --check` | PASS: both admin sales paths appear in the generated declaration; only `src/types/generated/bff-api.d.ts` changed. | 2026-11-05 |
| F-2 | `npm test -- --run src/admin/sales/SalesPanel.test.tsx` | EXPECTED RED: Vitest collected the test file and failed resolving `./SalesPanel`, which is not implemented yet. | 2026-11-05 |
| F-3 | `npm test -- --run src/admin/sales/SalesPanel.test.tsx` | PASS: 6 tests passed after implementation; parent rerun also passed after correcting whitespace-free IDs for the status heading labels. `get_errors` and `git diff --check` reported no issues before the final ID adjustment; focused tests passed after it. | 2026-11-05 |
| F-4 | `npm test -- --run src/admin/sales/SalesPanel.test.tsx`; `get_errors`; `git diff --check` | PASS: all 7 focused tests passed, including route rendering and the "Ventas" navigation link. | 2026-11-05 |
| F-5 | `E2E_CORE_CONTAINER=bgg-e2e-007-closeout-api npm run test:e2e:opkey` | PASS: 10 isolated Chromium specs, including sales; SQL fixture verified revenue 25.50, 1 paid order, top product, approved payment and derived dispatch status; runner verified cleanup. | 2026-11-05 |
| F-6 | `npm run lint`; `npm run build`; `npm test -- --run --reporter=dot`; OpKey E2E | PASS: lint/build exit 0; 20 Vitest files, 212 tests, and 10 Playwright specs. | 2026-11-05 |
