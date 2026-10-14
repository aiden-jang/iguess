import { useId, useRef, type CSSProperties, type ReactNode } from "react";

export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel,
  onConfirm,
  style,
  className,
  label,
}: {
  children: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  style?: CSSProperties;
  className?: string;
  label?: string;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        style={style}
        aria-label={label}
        onClick={() => dialog.current?.showModal()}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        onClose={() => trigger.current?.focus()}
        className="resource-dialog confirmation"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        <div className="confirm-actions">
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-destructive"
            onClick={() => {
              dialog.current?.close();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
