# Implementation Plan: Checkout, Orders, and Invoice (As-Built)

**Branch**: `005-checkout-orders-invoice` (retrospective; ODD records branch `CU-05`) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-checkout-orders-invoice/spec.md`

**Note**: Retrospective plan documenting the existing Frontend implementation of CU-C05. The payment integration is sandbox-only.

## Summary

`/checkout` (`CheckoutScreen`) collects the delivery selection and posts `POST /api/v1/checkout` with the bearer token, then redirects to the returned Mercado Pago `init_point` after a host allowlist check. `/compra/resultado` (`PurchaseResultScreen`) confirms the return through `POST /api/v1/checkout/confirm` and renders paid, rejected, pending, or `paid_stock_conflict` states, with retry via `/api/v1/orders/{order_id}/retry-payment`. `/mis-compras` and `/mis-compras/{order_id}` (`OrdersScreen`) list and show orders; paid orders offer an invoice download from `GET /api/v1/orders/{order_id}/invoice`.

## Technical Context

**Language/Version**: TypeScript ~5.4, React 19
**Primary Dependencies**: Vite 5, `openapi-typescript`; Mercado Pago is reached only by browser redirect
**Storage**: Browser `sessionStorage` for the session token; no payment data stored by the Frontend
**Testing**: Vitest, Testing Library, MSW; the checkout test mocks the payment-navigation helper
**Target Platform**: Modern browsers
**Project Type**: Web application (Frontend only; consumes the BFF)
**Performance Goals**: N/A
**Constraints**: Redirect target limited to HTTPS Mercado Pago/Mercado Libre hosts (`src/checkout/navigation.ts`); BFF/Core own order creation, payment verification, ownership, stock, and invoices; the `cancelled` status falls through to the pending presentation (documented gap)
**Scale/Scope**: 3 screens, 1 API helper module, 1 navigation helper

## Constitution Check

*Checked retrospectively against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).*

- Generate API types from the BFF contract: PASS (`CheckoutRequest`, `CheckoutResponse`, `ConfirmPaymentRequest`, `PurchaseOrder`, `OrderListResponse`, `OrderResponse`).
- Protect browser users and credentials: PASS for the `init_point` allowlist and bearer-only invoice download; the redirect alone is never treated as payment approval.
- Verify user-facing changes: tests in `src/App.checkout.test.tsx` and `src/checkout/navigation.test.ts`; see [tasks.md](./tasks.md).

## Project Structure

### Documentation (this feature)

```text
specs/005-checkout-orders-invoice/
├── spec.md
├── plan.md              # This file
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── checkout/
│   ├── CheckoutScreen.tsx          # Delivery form and checkout request
│   ├── OrdersScreen.tsx            # OrdersScreen, PurchaseResultScreen, InvoiceButton
│   ├── api.ts                      # apiBaseUrl, purchaseRequestOptions, confirmPayment, downloadInvoice
│   ├── navigation.ts               # isAllowedPaymentUrl, redirectToPayment
│   └── navigation.test.ts          # Redirect URL validation tests
├── App.tsx                         # Routes /checkout, /compra/resultado, /mis-compras
├── App.checkout.test.tsx           # Checkout/order tests
├── ui/messages.ts                  # Purchase copy
└── types/generated/bff-api.d.ts    # Purchase types
```

**Structure Decision**: Purchase flow isolated in `src/checkout/`, wired by path in `src/App.tsx`.

## Traceability and Evidence

- Root canonical spec: [005-checkout-orders-invoice-as-built](../../../specs/005-checkout-orders-invoice-as-built/spec.md).
- BFF contract: [`openapi.yaml`](../../../bgg-shop-bff/specs/openapi.yaml) (`checkout`, `confirmCheckoutPayment`, `retryOrderPayment`, `listOrders`, `getOrder`, `downloadOrderInvoice`).
- ODD record: [`cu-c05-purchase.md`](../../../odd/tasks/cu-c05-purchase.md); docs: [`CU-C05-PURCHASE.md`](../../../docs/CU-C05-PURCHASE.md).

## Complexity Tracking

No constitution violations to justify.
