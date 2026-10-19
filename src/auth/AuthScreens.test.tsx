import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const loginPath = '/login';
const registerPath = '/register';

function visit(pathname: string) {
  window.history.pushState({}, '', pathname);
}

describe('authentication screens', () => {
  beforeEach(() => {
    visit(loginPath);
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes('/products')
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
      screen.getByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password|contraseña/i)).toBeInTheDocument();
  });

  it('renders the registration fields at the register pathname', () => {
    visit(registerPath);
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: 'Create your account',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeInTheDocument();
    expect(screen.getByLabelText('Last name')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$|contraseña/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/confirm password|repeat password|repetir contraseña|confirmar/i),
    ).toBeInTheDocument();
  });

  it('uses required and email validation before submitting an empty or invalid login form', async () => {
    render(<App />);

    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/password|contraseña/i);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(email).toBeInvalid();
    expect(password).toBeInvalid();

    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.change(password, { target: { value: 'a-valid-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(email).toBeInvalid();
  });

  it('shows a validation message when registration passwords do not match', async () => {
    visit(registerPath);
    render(<App />);

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Player' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'player@example.test' } });
    fireEvent.change(
      screen.getByLabelText(/^password$|contraseña/i),
      { target: { value: 'first-password' } },
    );
    fireEvent.change(
      screen.getByLabelText(/confirm password|repeat password|repetir contraseña|confirmar/i),
      { target: { value: 'different-password' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      screen.getByText(/passwords? (do not|don't) match|passwords? must match|contraseñas? no coinciden|contraseñas? deben coincidir/i),
    ).toBeInTheDocument();
  });

  it('submits registration to the BFF and shows the success state', async () => {
    visit(registerPath);
    render(<App />);

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Player' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'player@example.test' } });
    fireEvent.change(
      screen.getByLabelText(/^password$|contraseña/i),
      { target: { value: 'same-password' } },
    );
    fireEvent.change(
      screen.getByLabelText(/confirm password|repeat password|repetir contraseña|confirmar/i),
      { target: { value: 'same-password' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Account details received.')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows the catalog-style account link for visitors', () => {
    visit('/');
    render(<App />);

    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveClass('main-nav-account');
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('hides account links and removes the session on logout', () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    }));
    visit('/');
    render(<App />);

    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(sessionStorage.getItem('bgg-shop.session')).toBeNull();
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('updates the catalog actions after a successful login', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'player@example.test' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'safe-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Crear cuenta' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('bgg-shop.session')).not.toBeNull();
  });
});
