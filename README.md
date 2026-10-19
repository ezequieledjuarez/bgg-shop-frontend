# React + TypeScript + Vite

## Integración del catálogo

Este frontend es una aplicación client-only. `src/App.tsx` renderiza la Home
y consume `GET /api/v1/products` del BFF para la búsqueda del CU-C02. No
expone endpoints HTTP propios.

El flujo previsto es:

```text
Frontend React/Vite ── REST/JSON ──> BFF Flask ──> Core GraphQL
```

La configuración de Compose declara
`VITE_API_BASE_URL=http://localhost:5000/api/v1` y la Home la consume. Los
filtros se envían en `snake_case` (`search`, `year_published`, `min_players`,
`max_players`, `category_id`, `price_min`, `price_max`). La búsqueda por nombre
o editorial se confirma con Enter o el botón `Buscar`; no se solicita al BFF
durante la escritura. El servidor local se publica en
`http://localhost:3000` cuando se inicia mediante `podman-compose.yaml`.

## Servicios expuestos

| Servicio | Método | Ruta u operación | Request | Response / error |
| --- | --- | --- | --- | --- |
| Frontend | `GET` | `/api/v1/products` vía BFF | `search`, `year_published`, `min_players`, `max_players`, `category_id`, `price_min`, `price_max`; solicita `page=1&page_size=100`. | Estados de carga, error, vacío y éxito. |
| BFF | `GET` | `/api/v1/products?page=1&page_size=20` | Filtros REST del catálogo. | `ProductPage` REST o `400`/`502`. |
| Core | `POST` | `/graphql/` | No se invoca directamente desde el Frontend; el BFF lo consume. | Respuesta GraphQL o `errors`, según el contrato del Core. |

La respuesta del BFF usa `snake_case` (`bgg_id`, `page_size`,
`total_pages`, etc.) y devuelve `items` con los campos del producto. El Core
usa GraphQL `camelCase` (`bggId`, `pageSize`, `totalPages`). Para consultar
el contrato y ejemplos ejecutables, véanse
[`../bgg-shop-bff/README.md`](../bgg-shop-bff/README.md) y
[`../bgg-shop-core/README.md`](../bgg-shop-core/README.md).

El Frontend no implementa autenticación, carrito, checkout, pedidos ni
mutaciones de compra. La UI no expone navegación de páginas ni botones de
categoría; el orden de relevancia no está implementado y los órdenes
disponibles se resuelven localmente.

El alcance, los contratos y las limitaciones verificadas están documentados en
[`../docs/CU-C02-FILTERING-CHANGES.md`](../docs/CU-C02-FILTERING-CHANGES.md).

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
