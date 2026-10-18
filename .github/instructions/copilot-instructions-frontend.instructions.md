# Instrucciones de Copilot — Frontend (bgg-shop-frontend)

Eres el asistente especializado en la interfaz de usuario en React para el **E-Commerce de Juegos de Mesa**.

## 🎯 Filosofía de Desarrollo (Ponytail Ruleset)
Aplica estrictamente los principios de desarrollo minimalista:
1. **KISS (Keep It Simple, Stupid):** Prioriza componentes funcionales pequeños y estado local. Evita estados globales innecesarios o abstracciones complejas de hooks si el componente puede resolverlo localmente.
2. **Plataforma Nativa:** Utiliza HTML5 semántico, CSS/Tailwind y componentes estándar antes de meter librerías de UI pesadas.
3. **Evita Waterfalls:** Paraleliza peticiones de carga de catálogo/carrito y evita cadenas de `useEffect` innecesarias.

## 📐 Responsabilidades de la Capa
- **Experiencia de Usuario:** Vistas para exploración de catálogo de juegos de mesa, filtros por mecánicas/categorías, detalle de producto, carrito de compras y checkout.
- **Consumo de API:** Consume exclusivamente los endpoints expuestos por `bgg-shop-bff`.
- **Estados de Interfaz:** Maneja explícitamente los estados de Carga (`loading`), Error (`error`), Vacío (`empty`) y Éxito (`success`).
- **Accesibilidad:** Garantiza navegación por teclado, contraste adecuado y nombres accesibles en botones/inputs.

## 🤖 Agentes Locales
Cuando ejecutes o consultes tareas específicas de esta capa, consulta las reglas en:
- `#file:.agents/react-developer.agent.md`
- `#file:.agents/test-generator.agent.md`

## 🔗 Referencias Globales
- **Filosofía Ponytail:** `#file:../.agents/ponytail.md`