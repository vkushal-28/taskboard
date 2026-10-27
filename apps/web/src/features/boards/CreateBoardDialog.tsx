import { zodResolver } from '@hookform/resolvers/zod';
import { createBoardSchema, DEFAULT_BOARD_COLOR } from '@taskboard/shared';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { TextField } from '../../components/TextField';
import { describeError } from '../../lib/api-error';
import { useCreateBoard } from './api';

export const BOARD_COLORS = [
  { value: DEFAULT_BOARD_COLOR, name: 'Blue' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#db2777', name: 'Pink' },
  { value: '#ea580c', name: 'Orange' },
  { value: '#16a34a', name: 'Green' },
  { value: '#0891b2', name: 'Cyan' },
];

interface CreateBoardDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateBoardDialog({ open, onClose }: CreateBoardDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Create board">
      <CreateBoardForm onCancel={onClose} />
    </Dialog>
  );
}

function CreateBoardForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const createBoard = useCreateBoard();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createBoardSchema),
    defaultValues: { title: '', color: DEFAULT_BOARD_COLOR },
  });

  const submit = handleSubmit((input) =>
    createBoard.mutate(input, {
      onSuccess: (detail) => void navigate(`/b/${detail.board.id}`),
    }),
  );

  return (
    <form noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
      {createBoard.isError && <FormError>{describeError(createBoard.error)}</FormError>}
      <TextField
        label="Board title"
        placeholder="e.g. Website Redesign"
        autoFocus
        error={errors.title?.message}
        {...register('title')}
      />

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Color</legend>
        <div className="mt-2 flex gap-2">
          {BOARD_COLORS.map((color) => (
            <label key={color.value} className="cursor-pointer">
              <input
                type="radio"
                value={color.value}
                aria-label={color.name}
                className="peer sr-only"
                {...register('color')}
              />
              <span
                className="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400"
                style={{ backgroundColor: color.value }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createBoard.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {createBoard.isPending ? 'Creating…' : 'Create board'}
        </button>
      </div>
    </form>
  );
}
