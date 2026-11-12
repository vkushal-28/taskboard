import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@taskboard/shared';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import { FormError } from '../../components/FormError';
import { TextField } from '../../components/TextField';
import { describeError, isApiError } from '../../lib/api-error';
import { useRegister } from './api';
import { AuthLayout } from './AuthLayout';
import { Divider, GitHubButton, SubmitButton } from './form-parts';

/**
 * The register form. After signing up, the user goes back to where they were heading (for example
 * an invite link).
 */
export function RegisterPage() {
  const registerUser = useRegister();
  // Carries "where to go after signing in" (e.g. an invite link) over to the sign-in page.
  const location = useLocation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  function submit(input: RegisterInput) {
    registerUser.mutate(input, {
      onError: (error) => {
        // The one server error that belongs to a single field: show it there, not in the banner.
        if (isApiError(error, 409)) setError('email', { message: error.message });
      },
    });
  }

  const bannerError = registerUser.isError && !isApiError(registerUser.error, 409);

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already have one?{' '}
          <Link
            to="/login"
            state={location.state as unknown}
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Sign in
          </Link>
        </>
      }
    >
      <GitHubButton />
      <Divider />

      <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
        {bannerError && <FormError>{describeError(registerUser.error)}</FormError>}
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <SubmitButton pending={registerUser.isPending}>
          {registerUser.isPending ? 'Creating account…' : 'Create account'}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
