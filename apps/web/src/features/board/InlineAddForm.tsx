import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { describeError } from '../../lib/api-error';

interface InlineAddFormProps {
  /** The text on the collapsed button, e.g. "Add a card". */
  openLabel: string;
  fieldLabel: string;
  submitLabel: string;
  schema: z.ZodType<{ title: string }, { title: string }>;
  onAdd: (title: string) => Promise<unknown>;
  testId: string;
}

// Shared by "Add a card" and "Add a list": a button that expands into a one-field form.
// It stays open after a successful add, so several items can be typed in a row.
export function InlineAddForm(props: InlineAddFormProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
      >
        + {props.openLabel}
      </button>
    );
  }
  return <ExpandedForm {...props} onClose={() => setOpen(false)} />;
}

function ExpandedForm({
  fieldLabel,
  submitLabel,
  schema,
  onAdd,
  testId,
  onClose,
}: InlineAddFormProps & { onClose: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { title: '' } });

  const submit = handleSubmit(async ({ title }) => {
    setServerError(null);
    try {
      await onAdd(title);
      reset();
      setFocus('title');
    } catch (error) {
      setServerError(describeError(error));
    }
  });

  const error = errors.title?.message ?? serverError;

  return (
    <form
      noValidate
      data-testid={testId}
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="space-y-2"
    >
      <input
        aria-label={fieldLabel}
        placeholder={fieldLabel}
        autoFocus
        aria-invalid={error ? true : undefined}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        {...register('title')}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200/60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
