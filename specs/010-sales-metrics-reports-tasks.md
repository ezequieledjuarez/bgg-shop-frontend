# Tasks (Frontend): CU-A02 — Sales Metrics & Reports

Plan and rules: `../../specs/010-sales-metrics-reports/plan.md`. Global ledger: `../../specs/010-sales-metrics-reports/tasks.md`.
Branch: `010-sales-metrics-reports`. Local validation only. Consume only BFF endpoints; no chart library.

- [ ] F-1 After the BFF contract (X-4) is approved, run `npm run generate:types` and keep the regenerated `src/types/generated/bff-api.d.ts`; never hand-edit it.
- [ ] F-2 Write failing Vitest tests in `src/admin/sales/SalesPanel.test.tsx`: loading, error, empty and success states; filter wiring (dates, category, product); default range; Spanish dispatch labels; keyboard access and accessible names. (after F-1)
- [ ] F-3 Implement `src/admin/sales/SalesPanel.tsx`: date range and filters, revenue/orders summary, top-10 table, dispatch and payment status counts, native SVG/CSS bar chart for `revenueByDay`; load metrics and categories in parallel. Make F-2 pass.
- [ ] F-4 Register `/admin/sales` and add a "Ventas" link in `src/admin/AdminRouter.tsx`.
- [ ] F-5 Add Playwright flow `tests/e2e/sales.spec.ts` (admin login → dashboard → apply filter → values match seeded data), following `audit.spec.ts`. Run only in the isolated local environment. (after F-3, F-4, Core C-2, BFF B-3)
- [ ] F-6 Run lint, build, Vitest and the E2E flow; record results in the global ledger.
