import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@taskboard/shared';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { TextField } from '../../components/TextField';
import { useLogin } from './api';
import { AuthLayout } from './AuthLayout';
import { describeAuthError, Divider, FormError, GitHubButton, SubmitButton } from './form-parts';

// Created by the Phase 7 seed script. Keep the two in sync.
export const DEMO_CREDENTIALS: LoginInput = { email: 'priya@acme.dev', password: 'demo1234!' };

export function SignInPage() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  function fillDemoAccount() {
    setValue('email', DEMO_CREDENTIALS.email, { shouldValidate: true });
    setValue('password', DEMO_CREDENTIALS.password, { shouldValidate: true });
  }

  return (
    <AuthLayout
      title="Sign in to Taskboard"
      subtitle={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Create an account
          </Link>
        </>
      }
    >
      <GitHubButton />
      <Divider />

      <form
        noValidate
        className="space-y-4"
        // handleSubmit returns a promise; React ignores it, so mark it as deliberately unawaited.
        onSubmit={(event) => void handleSubmit((input) => login.mutate(input))(event)}
      >
        {login.isError && <FormError>{describeAuthError(login.error)}</FormError>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <SubmitButton pending={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </SubmitButton>
      </form>

      <div className="mt-6 rounded-lg border border-dashed border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        <p>
          Just looking? Use the demo account <strong>{DEMO_CREDENTIALS.email}</strong>.
        </p>
        <button
          type="button"
          onClick={fillDemoAccount}
          className="mt-1 font-medium text-indigo-700 underline hover:text-indigo-600"
        >
          Fill in demo login
        </button>
      </div>
    </AuthLayout>
  );
}
