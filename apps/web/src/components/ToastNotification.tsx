import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cx } from "../lib/classNames";

export type ToastVariant = "success" | "error" | "info";

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastItemProps = {
  toast: Toast;
  onDismiss: (id: string) => void;
};

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-danger/30 bg-danger/10 text-danger",
  info: "border-cyan/30 bg-cyan/10 text-cyan",
};

const variantIcons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

/**
 * ToastItem
 *
 * Individual toast notification card. Auto-dismisses after 4 seconds.
 */
function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const Icon = variantIcons[toast.variant];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "flex items-start gap-3 rounded-card border px-4 py-3.5 shadow-soft backdrop-blur-xl",
        "animate-[sf-fade-up_280ms_ease-out_both]",
        variantStyles[toast.variant],
      )}
    >
      <Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 font-ui text-sm font-medium leading-snug text-primary">
        {toast.message}
      </p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md p-0.5 opacity-60 transition hover:opacity-100 focus-visible:outline-accent"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

type ToastContainerProps = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

/**
 * ToastContainer
 *
 * Renders a stack of toasts in the bottom-left corner of the viewport.
 * Added by AryanSirohi148 — UI polish component.
 */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-6 left-6 z-50 flex max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * useToast
 *
 * Hook to manage toast state. Returns the toast list and a function to add toasts.
 *
 * Usage:
 *   const { toasts, addToast, dismissToast } = useToast();
 *   addToast({ message: "Saved!", variant: "success" });
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    ({ message, variant }: { message: string; variant: ToastVariant }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
