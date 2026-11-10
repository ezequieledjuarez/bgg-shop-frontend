import { useState } from 'react';
import type { FormEvent } from 'react';
import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from './session';
import { authenticationErrorMessage } from '../ui/messages';
import { uiRoutes } from '../routing/routes'
import { ResendVerificationForm } from './EmailVerificationScreen';

type AuthMode = 'login' | 'register';

type FormErrors = Record<string, string>;

const initialValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const registrationPasswordHelper = 'Usá entre 8 y 128 caracteres e incluí una mayúscula, una minúscula, un número y un símbolo ASCII imprimible (A-Z, a-z y 0-9; los espacios en blanco no cuentan como símbolo).';
const registrationPasswordError = 'La contraseña debe tener entre 8 y 128 caracteres e incluir una mayúscula, una minúscula, un número y un símbolo ASCII imprimible (A-Z, a-z y 0-9; los espacios en blanco no cuentan como símbolo).';
const registrationPasswordPattern = /^(?=[\s\S]*[A-Z])(?=[\s\S]*[a-z])(?=[\s\S]*[0-9])(?=[\s\S]*[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E])[\s\S]*$/;

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
  else if (mode === 'register') {
    const passwordLength = Array.from(values.password).length;
    if (passwordLength < 8 || passwordLength > 128) errors.password = registrationPasswordError;
    else if (!registrationPasswordPattern.test(values.password)) errors.password = registrationPasswordError;
  }
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
  helperText,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  autoComplete: string;
}) {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const descriptionIds = [helperText ? helperId : '', error ? errorId : ''].filter(Boolean).join(' ');
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
        aria-describedby={descriptionIds || undefined}
        required
      />
      {helperText && <p id={helperId}>{helperText}</p>}
      {error && <p className="auth-field-error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

function AuthScreen({ mode, onBack }: { mode: AuthMode; onBack: () => void }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const isRegister = mode === 'register';
  const update = (key: keyof typeof initialValues) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setSubmitted(false);
    setNeedsVerification(false);
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
        credentials: 'include',
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
        session?: { access_token: string; refresh_token?: string | null; csrf_token?: string | null;
          op_key?: string; op_key_expires_at?: string | null; ops?: string[] | null } | null;
        errors?: Array<{ field?: string[] | null; code?: string; message?: string }>;
      };
      if (!response.ok) {
        setNeedsVerification(!isRegister && payload.errors?.[0]?.code === 'EMAIL_NOT_VERIFIED');
        const nextErrors: FormErrors = {};
        for (const error of payload.errors ?? []) {
          const field = error.field?.[0];
          if (field) nextErrors[field] = isRegister && field === 'password'
            ? registrationPasswordError
            : authenticationErrorMessage(error.code);
        }
        setErrors(Object.keys(nextErrors).length
          ? nextErrors
          : { form: authenticationErrorMessage(payload.errors?.[0]?.code) });
        return;
      }
      if (isRegister) {
        setSubmitted(true);
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
            <strong>Recibimos los datos de tu cuenta.</strong>
            <p>Tu cuenta fue creada y está pendiente de verificación. Revisá tu correo y abrí el enlace para activarla antes de iniciar sesión.</p>
            <ResendVerificationForm initialEmail={values.email.trim()} />
            <p><button type="button" onClick={() => navigate(uiRoutes.login)}>Ir a iniciar sesión</button></p>
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
            <Field id="password" label="Contraseña" type="password" value={values.password} onChange={update('password')} error={errors.password} helperText={isRegister ? registrationPasswordHelper : undefined} autoComplete={isRegister ? 'new-password' : 'current-password'} />
            {isRegister && <Field id="confirmPassword" label="Confirmar contraseña" type="password" value={values.confirmPassword} onChange={update('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Esperá…' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>
        )}
        {!submitted && needsVerification && (
          <div role="group" aria-label="Reenviar verificación">
            <p>Todavía no verificaste tu correo.</p>
            <ResendVerificationForm initialEmail={values.email.trim()} />
          </div>
        )}

        <p className="auth-switch">
          {isRegister ? '¿Ya tenés una cuenta?' : '¿Es tu primera vez en BGG Shop?'}{' '}
          <button type="button" onClick={() => navigate(isRegister ? uiRoutes.login : uiRoutes.register)}>
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
