import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for screen readers; shown as the heading unless `hideTitle`. */
  title: string;
  /** For dialogs that render their own heading, e.g. an editable card title. */
  hideTitle?: boolean;
  size?: 'md' | 'xl';
  children: ReactNode;
}

const WIDTH = { md: 'max-w-md', xl: 'max-w-3xl' };

// The native <dialog> with showModal() traps focus, closes on Esc and returns focus to the
// opener, so no dialog library is needed. React state stays the source of truth: the effect
// syncs it into the element, and the element's "close" event (Esc) reports back via onClose.
export function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  size = 'md',
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto w-full ${WIDTH[size]} rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40`}
    >
      {/* Unmounted while closed, so a reopened form starts empty. */}
      {open && (
        <div className="p-6">
          <h2
            id={titleId}
            className={hideTitle ? 'sr-only' : 'text-lg font-semibold text-slate-900'}
          >
            {title}
          </h2>
          <div className={hideTitle ? undefined : 'mt-4'}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
