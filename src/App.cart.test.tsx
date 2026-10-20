import { fireEvent, render, screen, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { components } from "./types/generated/bff-api"
import App from "./App"

type Cart = components["schemas"]["CartResponse"]
type ProductPage = components["schemas"]["ProductPage"]

const productPage: ProductPage = {
  items: [{
    bgg_id: 1,
    name: "Watergate",
    release_year: 2019,
    min_players: 2,
    max_players: 2,
    playing_time_minutes: 60,
    min_age: 12,
    weight: 2.25,
    category: ["Estrategia"],
    price: 90000,
    quantity: 3,
    publisher: "Salt & Pepper Games",
    image_url: "/watergate.webp",
  }],
  page: 1,
  page_size: 100,
  total: 1,
  total_pages: 1,
}

let cart: Cart = { lines: [], total: 0, warnings: [] }

const server = setupServer(
  http.get("*/api/v1/products", () => HttpResponse.json(productPage)),
  http.get("*/api/v1/cart", () => HttpResponse.json(cart)),
  http.post("*/api/v1/cart/items", async ({ request }) => {
    const item = await request.json() as components["schemas"]["CartItemRequest"]
    const line = cart.lines.find((current) => current.bgg_id === item.bgg_id)
    const quantity = (line?.quantity ?? 0) + item.quantity
    cart = {
      lines: [{ bgg_id: 1, name: "Watergate", quantity, available_stock: 3, unit_price: 90000, subtotal: quantity * 90000 }],
      total: quantity * 90000,
      warnings: [],
    }
    return HttpResponse.json(cart)
  }),
  http.patch("*/api/v1/cart/items/:bgg_id", async ({ request }) => {
    const item = await request.json() as components["schemas"]["CartQuantityRequest"]
    cart = {
      lines: item.quantity === 0 ? [] : [{ bgg_id: 1, name: "Watergate", quantity: item.quantity, available_stock: 3, unit_price: 90000, subtotal: item.quantity * 90000 }],
      total: item.quantity * 90000,
      warnings: [],
    }
    return HttpResponse.json(cart)
  }),
  http.delete("*/api/v1/cart/items/:bgg_id", () => {
    cart = { lines: [], total: 0, warnings: [] }
    return HttpResponse.json(cart)
  }),
)

beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  cart = { lines: [], total: 0, warnings: [] }
  vi.restoreAllMocks()
  sessionStorage.clear()
  window.history.replaceState({}, "", "/")
})
afterAll(() => server.close())

describe("shopping cart flow", () => {
  it("shows inventory, adds a game, updates quantity and total, then removes it", async () => {
    sessionStorage.setItem("bgg-shop.session", JSON.stringify({ access_token: "cart-token" }))
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    render(<App />)

    const productCard = await screen.findByRole("article", { name: /watergate/i })
    expect(within(productCard).getByText(/disponibles: 3/i)).toBeInTheDocument()
    fireEvent.click(within(productCard).getByRole("button", { name: /agregar watergate al carrito/i }))
    expect(await screen.findByText("Watergate se agregó al carrito.")).toBeInTheDocument()
    const cartRequest = fetchSpy.mock.calls.find(([input]) => String(input).includes("/cart/items"))
    expect(cartRequest?.[1]).toMatchObject({ credentials: "include" })
    expect(new Headers(cartRequest?.[1]?.headers).get("Authorization")).toBe("Bearer cart-token")

    fireEvent.click(await screen.findByRole("link", { name: /carrito/i }))
    expect(await screen.findByRole("heading", { name: /tu carrito/i })).toBeInTheDocument()
    expect(await screen.findByText("$ 90.000,00")).toBeInTheDocument()

    const quantity = screen.getByRole("spinbutton", { name: /cantidad de watergate/i })
    fireEvent.change(quantity, { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: /actualizar cantidad de watergate/i }))
    expect(await screen.findByText("$ 180.000,00")).toBeInTheDocument()

    const line = screen.getByRole("listitem", { name: /watergate/i })
    fireEvent.click(within(line).getByRole("button", { name: /quitar watergate/i }))
    expect(await screen.findByText(/tu carrito está vacío/i)).toBeInTheDocument()
    expect(screen.getByText("$ 0,00")).toBeInTheDocument()
  })


  it("disables adding a game with no available stock", async () => {
    server.use(http.get("*/api/v1/products", () => HttpResponse.json({ ...productPage, items: [{ ...productPage.items[0], quantity: 0 }] })))
    render(<App />)
    const productCard = await screen.findByRole("article", { name: /watergate/i })
    expect(within(productCard).getByText(/disponibles: 0/i)).toBeInTheDocument()
    expect(within(productCard).getByRole("button", { name: /agregar watergate al carrito/i })).toBeDisabled()
  })

  it("shows the BFF stock-cap warning after an add attempt", async () => {
    server.use(http.post("*/api/v1/cart/items", () => HttpResponse.json({
      lines: [],
      total: 0,
      warnings: [{ code: "INSUFFICIENT_STOCK", message: "La cantidad se ajustó al stock disponible." }],
    }, { status: 409 })))
    render(<App />)
    const productCard = await screen.findByRole("article", { name: /watergate/i })
    fireEvent.click(within(productCard).getByRole("button", { name: /agregar watergate al carrito/i }))
    expect(await screen.findByRole("status")).toHaveTextContent("La cantidad se ajustó al stock disponible.")
  })

  it("shows loading and cart error states", async () => {
    window.history.replaceState({}, "", "/carrito")
    server.use(http.get("*/api/v1/cart", () => HttpResponse.json({ error: "Servicio no disponible" }, { status: 502 })))
    render(<App />)
    expect(screen.getByRole("status")).toHaveTextContent(/cargando carrito/i)
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar el carrito/i)
  })

  it("shows empty cart state", async () => {
    window.history.replaceState({}, "", "/carrito")
    render(<App />)
    expect(await screen.findByText(/tu carrito está vacío/i)).toBeInTheDocument()
  })
})
