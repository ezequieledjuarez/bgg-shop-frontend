import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const loginPath = '/iniciar-sesion';
const registerPath = '/registro';

function visit(pathname: string) {
  window.history.pushState({}, '', pathname);
}

describe('authentication screens', () => {
  beforeEach(() => {
    visit(loginPath);
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes('/product-publishers')
        ? []
        : url.includes('/products')
        ? { items: [], page: 1, page_size: 100, total: 0, total_pages: 0 }
        : {
          user: { id: '1', email: 'player@example.test', first_name: 'Test', last_name: 'Player', is_active: true },
          session: { access_token: 'access-token', refresh_token: 'refresh-token' },
        };
      return Promise.resolve(new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    visit('/');
  });

  it('renders the login screen at the login pathname', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Te damos la bienvenida' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('keeps the legacy login URL as a canonicalizing alias', () => {
    visit('/login?next=%2Fwishlist#form');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Te damos la bienvenida' })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/iniciar-sesion?next=%2Fwishlist#form');
  });

  it('renders the registration fields at the register pathname', () => {
    visit(registerPath);
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: 'Creá tu cuenta',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Apellido')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Confirmar contraseña'),
    ).toBeInTheDocument();
    expect(screen.getByText(/mayúscula.*minúscula.*número.*símbolo/)).toBeInTheDocument();
  });

  it('uses required and email validation before submitting an empty or invalid login form', async () => {
    render(<App />);

    const email = screen.getByLabelText('Correo electrónico');
    const password = screen.getByLabelText('Contraseña');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(email).toBeInvalid();
    expect(password).toBeInvalid();

    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.change(password, { target: { value: 'a-valid-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(email).toBeInvalid();
  });

  it('shows a validation message when registration passwords do not match', async () => {
    visit(registerPath);
    render(<App />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Player' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    fireEvent.change(
      screen.getByLabelText('Contraseña'),
      { target: { value: 'First-Pass1!' } },
    );
    fireEvent.change(
      screen.getByLabelText('Confirmar contraseña'),
      { target: { value: 'Other-Pass1!' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(
      screen.getByRole('alert'),
    ).toBeInTheDocument();
  });

  it('submits registration to the BFF and shows the success state', async () => {
    visit(registerPath);
    render(<App />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Player' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    fireEvent.change(
      screen.getByLabelText('Contraseña'),
      { target: { value: 'Boardgame-Test-123!' } },
    );
    fireEvent.change(
      screen.getByLabelText('Confirmar contraseña'),
      { target: { value: 'Boardgame-Test-123!' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Recibimos los datos de tu cuenta.')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects registration passwords without each required ASCII category accessibly', () => {
    visit(registerPath);
    render(<App />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Player' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    const password = screen.getByLabelText('Contraseña');
    fireEvent.change(password, { target: { value: 'Abcdefg1 ' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Abcdefg1 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(password).toBeInvalid();
    expect(password).toHaveAccessibleDescription(/mayúscula.*minúscula.*número.*símbolo/);
    expect(screen.getByRole('alert')).toHaveTextContent(/mayúscula.*minúscula.*número.*símbolo/);
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.anything(),
    );
  });

  it.each([
    ['shorter than the existing minimum', 'Abc1!xy'],
    ['longer than the existing maximum', `Aa0!${'x'.repeat(125)}`],
  ])('keeps the existing registration length bound when the password is %s', (_case, value) => {
    visit(registerPath);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Player' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByLabelText('Contraseña')).toBeInvalid();
    expect(screen.getByRole('alert')).toHaveTextContent(/8 y 128 caracteres/);
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.anything(),
    );
  });

  it('shows the pending verification state after registration without redirecting or signing in', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    visit(registerPath);
    render(<App />);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Player' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Boardgame-Test-123!' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Boardgame-Test-123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText(/pendiente de verificación/)).toBeInTheDocument();
    vi.advanceTimersByTime(5000);
    expect(window.location.pathname).toBe(registerPath);
    expect(sessionStorage.getItem('bgg-shop.session')).toBeNull();
    expect(screen.getByLabelText('Correo para reenviar la verificación')).toHaveValue('player@example.test');
    vi.useRealTimers();
  });

  it('guides unverified accounts to resend verification and stores no session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      errors: [{ code: 'EMAIL_NOT_VERIFIED', message: 'x' }],
    }), { status: 403 }))));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'same-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Verificá tu correo electrónico antes de iniciar sesión.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar correo de verificación' })).toBeInTheDocument();
    expect(sessionStorage.getItem('bgg-shop.session')).toBeNull();
  });

  it('shows the catalog-style account link for visitors', () => {
    visit('/');
    render(<App />);

    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveClass('main-nav-account');
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('clears the refresh cookie and removes a JWT-only session on logout', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    }));
    visit('/');
    render(<App />);

    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(sessionStorage.getItem('bgg-shop.session')).toBeNull());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.objectContaining({
      method: 'POST', headers: {}, credentials: 'include',
    }));
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('revokes an optional operation key before clearing the session', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'access-token', op_key: 'synthetic-op-key' }));
    vi.mocked(fetch).mockImplementation(async (input) => String(input).includes('/auth/logout')
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ items: [] }), { status: 200 }));
    visit('/');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(sessionStorage.getItem('bgg-shop.session')).toBeNull());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.objectContaining({
      method: 'POST', headers: { 'X-Op-Key': 'synthetic-op-key' }, credentials: 'include',
    }));
  });

  it('keeps the session when operation-key revocation cannot be confirmed', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'access-token', op_key: 'synthetic-op-key' }));
    vi.mocked(fetch).mockImplementation(async (input) => String(input).includes('/auth/logout')
      ? new Response(null, { status: 502 })
      : String(input).includes('/product-categories')
        ? new Response(JSON.stringify([]), { status: 200 })
        : String(input).includes('/product-publishers')
          ? new Response(JSON.stringify([]), { status: 200 })
        : new Response(JSON.stringify({ items: [], total: 0, total_pages: 0 }), { status: 200 }));
    visit('/');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByText(/No se pudo cerrar sesión/)).toBeInTheDocument();
    expect(sessionStorage.getItem('bgg-shop.session')).not.toBeNull();
  });

  it('updates the catalog actions after a successful login', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'safe-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('bgg-shop.session')).not.toBeNull();
  });

  it('retains an operation key when login returns one', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => String(input).includes('/auth/login')
      ? new Response(JSON.stringify({ session: { access_token: 'access-token', op_key: 'synthetic-op-key',
        op_key_expires_at: '2099-01-01T00:00:00Z', ops: ['GET:/api/v1/admin/*'] } }), { status: 200 })
      : new Response(JSON.stringify({ items: [] }), { status: 200 }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'player@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'safe-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}').op_key).toBe('synthetic-op-key'));
  });
});
