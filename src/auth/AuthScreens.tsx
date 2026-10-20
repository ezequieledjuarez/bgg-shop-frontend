import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from './session';
import { authenticationErrorMessage } from '../ui/messages';

type AuthMode = 'login' | 'register';

type FormErrors = Record<string, string>;

const initialValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';

function validate(mode: AuthMode, values: typeof initialValues): FormErrors {
  const errors: FormErrors = {};

  if (mode === 'register' && !values.firstName.trim()) errors.firstName = 'Ingresá tu nombre.';
  if (mode === 'register' && !values.lastName.trim()) errors.lastName = 'Ingresá tu apellido.';
  if (!values.email.trim()) errors.email = 'Ingresá tu correo electrónico.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Ingresá un correo electrónico válido.';
  if (!values.password) errors.password = 'Ingresá tu contraseña.';
  if (mode === 'register' && !values.confirmPassword) {
    errors.confirmPassword = 'Confirmá tu contraseña.';
  } else if (mode === 'register' && values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Las contraseñas deben coincidir.';
  }

  return errors;
}

function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        required
      />
      {error && <p className="auth-field-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

function AuthScreen({ mode, onBack }: { mode: AuthMode; onBack: () => void }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (submitTimer.current !== undefined) window.clearTimeout(submitTimer.current);
  }, []);

  const isRegister = mode === 'register';
  const update = (key: keyof typeof initialValues) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setSubmitted(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors = validate(mode, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister ? {
          email: values.email.trim(),
          password: values.password,
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
        } : {
          email: values.email.trim(),
          password: values.password,
        }),
      });
      const payload = await response.json() as {
        user?: { id: string; email: string; first_name: string; last_name: string; is_active: boolean };
        session?: { access_token: string; refresh_token?: string | null; csrf_token?: string | null } | null;
        errors?: Array<{ field?: string[] | null; code?: string; message?: string }>;
      };
      if (!response.ok) {
        const nextErrors: FormErrors = {};
        for (const error of payload.errors ?? []) {
          const field = error.field?.[0];
          if (field) nextErrors[field] = authenticationErrorMessage(error.code);
        }
        setErrors(Object.keys(nextErrors).length
          ? nextErrors
          : { form: authenticationErrorMessage(payload.errors?.[0]?.code) });
        return;
      }
      if (isRegister) {
        setSubmitted(true);
        submitTimer.current = window.setTimeout(() => navigate('/login'), 900);
      } else if (payload.session?.access_token) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload.session));
        window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
        navigate('/');
      } else {
        setErrors({ form: 'El servicio de autenticación no devolvió una sesión.' });
      }
    } catch {
      setErrors({ form: 'El servicio de autenticación no está disponible. Intentá nuevamente.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <button className="auth-back" type="button" onClick={onBack}>← Volver al catálogo</button>
        <p className="auth-eyebrow">BGG Shop</p>
        <h1 id="auth-title">{isRegister ? 'Creá tu cuenta' : 'Te damos la bienvenida'}</h1>
        <p className="auth-intro">
          {isRegister ? 'Sumate a la comunidad de amantes de los juegos de mesa.' : 'Iniciá sesión para continuar tu recorrido por los juegos de mesa.'}
        </p>

        {submitted ? (
          <div className="auth-success" role="status">
            <strong>{isRegister ? 'Recibimos los datos de tu cuenta.' : 'Recibimos tus datos de inicio de sesión.'}</strong>
            <p>{isRegister ? 'Tu cuenta fue creada. Te estamos redirigiendo al inicio de sesión…' : 'Te estamos redirigiendo al catálogo…'}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {errors.form && <p className="auth-form-error" role="alert">{errors.form}</p>}
            {isRegister && (
              <div className="auth-name-fields">
                <Field id="firstName" label="Nombre" value={values.firstName} onChange={update('firstName')} error={errors.firstName} autoComplete="given-name" />
                <Field id="lastName" label="Apellido" value={values.lastName} onChange={update('lastName')} error={errors.lastName} autoComplete="family-name" />
              </div>
            )}
            <Field id="email" label="Correo electrónico" type="email" value={values.email} onChange={update('email')} error={errors.email} autoComplete="email" />
            <Field id="password" label="Contraseña" type="password" value={values.password} onChange={update('password')} error={errors.password} autoComplete={isRegister ? 'new-password' : 'current-password'} />
            {isRegister && <Field id="confirmPassword" label="Confirmar contraseña" type="password" value={values.confirmPassword} onChange={update('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Esperá…' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>
        )}

        <p className="auth-switch">
          {isRegister ? '¿Ya tenés una cuenta?' : '¿Es tu primera vez en BGG Shop?'}{' '}
          <button type="button" onClick={() => navigate(isRegister ? '/login' : '/register')}>
            {isRegister ? 'Iniciar sesión' : 'Crear una cuenta'}
          </button>
        </p>
      </section>
    </main>
  );
}

export function LoginScreen({ onBack }: { onBack: () => void }) {
  return <AuthScreen mode="login" onBack={onBack} />;
}

export function RegisterScreen({ onBack }: { onBack: () => void }) {
  return <AuthScreen mode="register" onBack={onBack} />;
}
