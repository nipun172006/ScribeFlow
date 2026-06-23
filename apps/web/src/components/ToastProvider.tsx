import { useMemo, type ReactNode } from "react";
import { useToast } from "../hooks/useToast";
import { ToastContext, type ToastContextValue } from "../hooks/toastContext";
import { ToastContainer } from "./ToastNotification";

/**
 * Provides app-wide toast notifications and renders the toast stack. Mounted
 * once at the application root so any page can surface success/error feedback.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, addToast, dismissToast } = useToast();

  const value = useMemo<ToastContextValue>(
    () => ({
      notify: (message, variant = "info") => addToast({ message, variant }),
    }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}
