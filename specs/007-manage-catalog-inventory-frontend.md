# CU-A01 — Frontend Responsibilities (React)

Reference: ../007-manage-catalog-inventory/spec.md

## Purpose
Construir la interfaz administrativa para que los Administradores gestionen catálogo, inventario y promociones, y asegurar que la experiencia muestre estados claros, validaciones y feedback de errores.

## Responsibilities
- Implementar pantallas/admin flows:
  - Lista de productos (filtros, búsqueda, paginación)
  - Formulario de crear/editar producto (campos obligatorios, subida de imágenes, variantes)
  - Gestión de stock por variante con controles para ajuste y mensajes cuando reducción no permitida
  - Panel de promociones y cupones (crear, editar, marcar `stackable`)
  - Vista de auditoría (historial de cambios)
- Validaciones en cliente (complementarias al servidor) y mostrar mensajes de error por campo.
- Mostrar estado de operaciones asíncronas (saving, success, error) y prevenir duplicados de envío.
- Soportar preview de promoción en la ficha antes de publicar.

## Data/Contract Expectations
- Use admin endpoints at BFF (e.g., `/admin/products`, `/admin/promotions`).
- Expect field-level error payloads: { field: 'price', message: 'required' } and map to form fields.
- For stock adjustments, BFF returns current reserved units and min_allowed_stock; frontend must prevent user from setting lower value.

## Accessibility & UX
- Forms accessible with labels, ARIA where necessary, and keyboard navigation.
- Provide confirmation modals for destructive operations (unpublish, delete, large stock reductions).

## Acceptance Criteria (Frontend)
- AC-FE-1: Admin can create and edit products using the UI; after save, the UI shows the new data as returned by the BFF.
- AC-FE-2: Attempts to reduce stock below allowed value are blocked client-side using the info from BFF and display an explanatory message.
- AC-FE-3: Promotions can be created/edited including setting `stackable` and previewing the effective price.
- AC-FE-4: Field-level errors from BFF are rendered inline and prevent form submission until resolved.

## Tests (Frontend)
- Unit tests for form components and validation logic.
- Integration tests (Playwright or Cypress) covering product create/edit flow, image uploads (mocked), stock adjustments, and promotions.

## Next steps
- Implement forms and wire to BFF endpoints.
- Add E2E tests for admin flows and CI job to run them.
