# BGG Shop Frontend

## Integración del catálogo

Aplicación React/TypeScript con Vite. El navegador consume la API REST del BFF
Flask y no llama directamente a GraphQL del Core. No expone endpoints HTTP
propios.

El flujo implementado es:

```text
Frontend React/Vite ── REST/JSON ──> BFF Flask ──> Core GraphQL
```

El contrato REST canónico está en
[`../bgg-shop-bff/specs/openapi.yaml`](../bgg-shop-bff/specs/openapi.yaml); el
contrato GraphQL del Core está en
[`../bgg-shop-core/specs/schema.graphql`](../bgg-shop-core/specs/schema.graphql).
Los tipos de `src/types/generated/bff-api.d.ts` se generan desde OpenAPI y no
demuestran que todas las operaciones estén implementadas. El Compose define
`VITE_API_BASE_URL=http://localhost:5000/api/v1`. Los
filtros se envían en `snake_case` (`search`, `year_published`, `min_players`,
`max_players`, `category_id`, `price_min`, `price_max`). La búsqueda por nombre
o editorial se confirma con Enter o el botón `Buscar`; no se solicita al BFF
durante la escritura. Compose publica el servidor en
`http://localhost:3000`.

## Servicios expuestos

| Servicio | Método | Ruta u operación | Request | Response / error |
| --- | --- | --- | --- | --- |
| Frontend | `GET` | `/api/v1/products` vía BFF | `search`, `year_published`, `min_players`, `max_players`, `category_id`, `price_min`, `price_max`; solicita `page=1&page_size=100`. | Estados de carga, error, vacío y éxito. |
| BFF | `GET` | `/api/v1/products?page=1&page_size=20` | Filtros REST del catálogo. | `ProductPage` REST o `400`/`502`. |
| Core | `POST` | `/graphql/` | No se invoca directamente desde el Frontend; el BFF lo consume. | Respuesta GraphQL o `errors`, según el contrato del Core. |

### Panel de métricas de ventas (Admin)

La ruta `/admin/sales` está disponible para cuentas staff/superuser y consume
en paralelo `GET /api/v1/admin/sales-metrics` y
`GET /api/v1/admin/sales-metrics/categories` del BFF. La primera carga omite
`from` y `to` para usar el rango predeterminado de 30 días; los filtros de
categoría (`category`) e ID BGG (`product_id`) se envían como parámetros
repetidos. El panel muestra revenue, órdenes pagas, productos principales,
estados de pago/despacho y revenue diario. Los tipos se regeneran desde el
OpenAPI del BFF con `npm run generate:types`; no se editan manualmente.
La semántica y los errores de los endpoints están en el
[`README del BFF`](../bgg-shop-bff/README.md).

La respuesta del BFF usa `snake_case` (`bgg_id`, `page_size`,
`total_pages`, etc.) y devuelve `items` con los campos del producto. El Core
usa GraphQL `camelCase` (`bggId`, `pageSize`, `totalPages`). Para consultar
el contrato y ejemplos ejecutables, véanse
[`../bgg-shop-bff/README.md`](../bgg-shop-bff/README.md) y
[`../bgg-shop-core/README.md`](../bgg-shop-core/README.md).

El Frontend muestra el stock (`quantity`) de cada juego y permite agregar,
modificar y quitar artículos del carrito (`/carrito`) con el total calculado
por el BFF. Los órdenes disponibles para el catálogo se resuelven localmente;
la UI no expone navegación de páginas ni botones de categoría.

## Lista de deseos (CU-C06)

La ruta `/wishlist` requiere una sesión autenticada. Desde el detalle de un
juego se puede guardar el producto; si la persona no inició sesión, se abre el
login existente y se conserva la ruta de detalle para volver después de
autenticarse. La navegación desde el catálogo incluye el `bgg_id` en la URL del
detalle porque el DTO `ProductDetail` actual no expone ese identificador.

La vista consulta `GET /api/v1/wishlist`, permite quitar elementos mediante
`DELETE /api/v1/wishlist/{bgg_id}` y agregarlos al carrito mediante
`POST /api/v1/cart/items`. La acción de carrito no elimina el producto de la
lista de deseos: solo la confirmación de una compra pagada lo hace en Core.
Todas las llamadas privadas usan el bearer token de la sesión existente; el
Frontend no envía identificadores de usuario. La UI comunica los estados de
carga, error, lista vacía y éxito.

Las operaciones y DTO de Wishlist se generan desde
`../bgg-shop-bff/specs/openapi.yaml` con `npm run generate:types`; no se editan
manualmente en `src/types/generated/bff-api.d.ts`. El flujo se describe en
[`specs/006-wishlist/spec.md`](specs/006-wishlist/spec.md).

## Compras y pagos (CU-C05)

El botón **Proceder al Pago** requiere una sesión; si todavía no existe, el
frontend ofrece iniciar sesión y conserva el destino de checkout. La ruta
`/checkout` captura la modalidad de entrega (`standard` o `pickup`) y valida en
el cliente los datos obligatorios de envío estándar. Envía `POST /api/v1/checkout` con el bearer token de sesión y redirige el navegador a
`init_point`; no contiene ni almacena credenciales de Mercado Pago.

La ruta `/compra/resultado` admite `payment_id` o `collection_id`, junto con
`external_reference` o `order_id`, y solicita al BFF confirmar el pago. Muestra
el resultado aprobado, rechazado, pendiente o el conflicto de stock pagado. Los
pedidos se consultan en `/mis-compras` y `/mis-compras/{id}`. La factura PDF se
solicita con bearer token y se descarga como archivo; no se expone como una
URL pública sin autenticación.

Los DTO de checkout, pago y pedidos se generan desde
`../bgg-shop-bff/specs/openapi.yaml` mediante `npm run generate:types`; no se
mantienen copias manuales de esos contratos.

El alcance, los contratos y las limitaciones verificadas están documentados en
[`../docs/CU-C02-FILTERING-CHANGES.md`](../docs/CU-C02-FILTERING-CHANGES.md).

## Chatbot CU-C07 (en progreso)

El Frontend no incluye interfaz ni flujo de chatbot. El archivo generado
`src/types/generated/bff-api.d.ts` incluye tipos de operaciones descritas en
OpenAPI; eso no implica que haya integración funcional. La especificación
aprobada requiere una futura recuperación con ChromaDB; no hay evidencia de
que ChromaDB, retrieval o un modelo estén disponibles en ejecución. La FAQ
aprobada tampoco está conectada al cliente.

Estado y requisito: [`../specs/013-add-chatbot/spec.md`](../specs/013-add-chatbot/spec.md),
[`../specs/013-add-chatbot/plan.md`](../specs/013-add-chatbot/plan.md) y
[`../odd/tasks/013-add-chatbot.md`](../odd/tasks/013-add-chatbot.md).
El OpenAPI del BFF mantiene las rutas del chatbot como planificadas. No hay
pruebas de interfaz o end-to-end del chatbot.

## Desarrollo local

Prerequisito: Node.js 20 (la imagen del Frontend usa `node:20-alpine`). Para
iniciar el stack integrado con Podman, sigue las instrucciones de la
[guía raíz](../README.MD). Para ejecutar Vite directamente, inicia primero el
BFF y el Core, luego ejecuta desde la raíz:

```bash
cd bgg-shop-frontend
npm ci
VITE_API_BASE_URL=http://localhost:5000/api/v1 npm run dev -- --host 0.0.0.0 --port 3000
```

Los scripts definidos en `package.json` incluyen `npm run build`,
`npm run lint`, `npm test` y `npm run generate:types`. La generación usa el
contrato OpenAPI del BFF; no edites manualmente
`src/types/generated/bff-api.d.ts`.
