import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from './session';

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

  if (mode === 'register' && !values.firstName.trim()) errors.firstName = 'Enter your first name.';
  if (mode === 'register' && !values.lastName.trim()) errors.lastName = 'Enter your last name.';
  if (!values.email.trim()) errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Enter a valid email address.';
  if (!values.password) errors.password = 'Enter your password.';
  if (mode === 'register' && !values.confirmPassword) {
    errors.confirmPassword = 'Confirm your password.';
  } else if (mode === 'register' && values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Passwords must match.';
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
        errors?: Array<{ field?: string[] | null; message: string }>;
      };
      if (!response.ok) {
        const nextErrors: FormErrors = {};
        for (const error of payload.errors ?? []) {
          const field = error.field?.[0];
          if (field) nextErrors[field] = error.message;
        }
        setErrors(Object.keys(nextErrors).length ? nextErrors : { form: payload.errors?.[0]?.message ?? 'Authentication failed.' });
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
        setErrors({ form: 'The authentication service returned no session.' });
      }
    } catch {
      setErrors({ form: 'The authentication service is unavailable. Try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <button className="auth-back" type="button" onClick={onBack}>← Back to catalog</button>
        <p className="auth-eyebrow">BGG Shop</p>
        <h1 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-intro">
          {isRegister ? 'Join the community of board game lovers.' : 'Sign in to continue your board game journey.'}
        </p>

        {submitted ? (
          <div className="auth-success" role="status">
            <strong>{isRegister ? 'Account details received.' : 'Sign-in details received.'}</strong>
            <p>{isRegister ? 'Your account was created. Redirecting to sign in…' : 'Redirecting to the catalog…'}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {errors.form && <p className="auth-form-error" role="alert">{errors.form}</p>}
            {isRegister && (
              <div className="auth-name-fields">
                <Field id="firstName" label="First name" value={values.firstName} onChange={update('firstName')} error={errors.firstName} autoComplete="given-name" />
                <Field id="lastName" label="Last name" value={values.lastName} onChange={update('lastName')} error={errors.lastName} autoComplete="family-name" />
              </div>
            )}
            <Field id="email" label="Email address" type="email" value={values.email} onChange={update('email')} error={errors.email} autoComplete="email" />
            <Field id="password" label="Password" type="password" value={values.password} onChange={update('password')} error={errors.password} autoComplete={isRegister ? 'new-password' : 'current-password'} />
            {isRegister && <Field id="confirmPassword" label="Confirm password" type="password" value={values.confirmPassword} onChange={update('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>
        )}

        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New to BGG Shop?'}{' '}
          <button type="button" onClick={() => navigate(isRegister ? '/login' : '/register')}>
            {isRegister ? 'Sign in' : 'Create an account'}
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
