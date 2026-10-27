# Agent → Task Mapping (Orchestrator root)

Fecha: 2026-10-22

Propósito: documento de referencia a nivel del orquestador que mapea agentes especializados a tipos de tarea para los tres proyectos principales: `bgg-shop-core`, `bgg-shop-bff` y `bgg-shop-frontend`. Está pensado para que el orquestador y las personas lo consulten antes de delegar trabajo.

Resumen rápido
- El orquestador sigue la política ODD (Authorize → Explore → Resolve → Classify → Track → Implement).
- Cuando se dispara una regla de delegación (mapping, writer, preparación), el orquestador selecciona el agente más apropiado según este mapeo.
- Esta es una guía humana; si quieres, se puede serializar a JSON/CSV para reglas automatizadas.

1) `bgg-shop-core` (Python / Saleor)

- Tareas típicas:
  - Cambios de modelos, migraciones, servicios del dominio, resolvers GraphQL, integración con la base de datos.
  - Tests unitarios e integración (DB), migraciones, contratos SDL.
  - Performance o seguridad de back-end.

- Agentes recomendados:
  - `Python Entity Implementer` — implementar entidades, resolvers, servicios y migraciones.
  - `Test Generator (Core)` — generar y ejecutar tests unitarios/integración para Core.
  - `Database Migration Agent` — diseñar y aplicar migraciones, revisar impactos.
  - `Security Reviewer` — auditoría y revisión para cambios sensibles.
  - `Documentation Agent` — actualizar diseños técnicos y SDL docs.

2) `bgg-shop-bff` (Python - Flask)

- Tareas típicas:
  - OpenAPI / contratos, controladores, DTOs, validaciones, adaptadores a Core (proxy), mapping de errores.
  - Tests unitarios, contract tests, validación OpenAPI.
  - Orquestación de rollbacks y caché/invalidation points.

- Agentes recomendados:
  - `API Contract Validator` — reconciliar OpenAPI ↔ handlers y detectar drift.
  - `Python Entity Implementer` (BFF variant) — cambios en controllers, services y DTOs.
  - `Test Generator (BFF)` — crear/ejecutar tests unitarios y contract tests.
  - `QA Integration Validator` — ejecutar y verificar pruebas E2E que incluyan BFF.
  - `Documentation Agent` — mantener `specs/openapi.yaml` y ejemplos.

3) `bgg-shop-frontend` (React)

- Tareas típicas:
  - Componentes React, consumo de API (fetch/clients), estados, integración con contratos OpenAPI, pruebas unitarias y e2e.
  - Experiencia de usuario, accesibilidad, y performance en cliente.

- Agentes recomendados:
  - `React Developer` — implementar y refactorizar componentes, pages y hooks.
  - `Test Generator (Frontend)` — generar tests unitarios (Jest/RTL) y e2e (Playwright/Cypress).
  - `QA Integration Validator` — validar integración end-to-end con BFF+Core.
  - `Documentation Agent` — actualizar documentación de integración y ejemplos.

Reglas operativas y verificación
- `Allowed edit surfaces`: Cada delegación debe llevar un bloque `## Allowed edit surfaces` con paths exactos (ningún wildcard global). El agente no debe escribir fuera de esos paths.
- `Skills to load before work`: El orquestador inyecta `SKILL.md` relevantes; los agentes deben leerlos antes de actuar.
- Verificación proporcional:
  - Cambios pasivos/documentación: readback estructural.
  - Cambios medios: writer self-verification (tests unitarios, linter, formatting).
  - Cambios de alto riesgo (migrations, contratos públicos, seguridad): writer + independent verifier.
- PR/MR gating: respeta la política en `/.agents/agents.md` — no abrir PR/MR para los flujos gestionados hasta que la validación front <-> bff <-> core y la evidencia QA estén registradas en `odd/tasks/<feature>.md`.

Ejemplo de uso (orquestador):

1. Detecta `speckit.implement` task que modifica `bgg-shop-bff/specs/openapi.yaml` y controllers → trigger = `contracts & writer`.
2. Selecciona `API Contract Validator` + `Python Entity Implementer` como writers; inyecta `SKILL.md` y `Allowed edit surfaces` (lista de archivos a editar).
3. Writer crea cambios y produce evidencia (tests, logs). Por política, no prepara PR si falta evidencia E2E.

Contacto: mantener este archivo actualizado en el orquestador cuando se agreguen nuevos agentes o cambien responsabilidades.

Fin del documento
