import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

// forwardRef so React Hook Form's register() can attach its ref to the input.
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, id, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm focus:ring-2 focus:outline-none ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
        }`}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
});
