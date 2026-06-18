import { useCallback, useState } from "react";
import type { Toast, ToastVariant } from "../components/ToastNotification";

/**
 * Hook to manage toast state.
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
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
