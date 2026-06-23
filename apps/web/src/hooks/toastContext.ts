import { createContext, useContext } from "react";
import type { ToastVariant } from "../components/ToastNotification";

export type ToastContextValue = {
  notify: (message: string, variant?: ToastVariant) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Returns a `notify(message, variant)` helper. Falls back to a no-op when used
 * outside a `ToastProvider` (e.g. isolated component tests), so consumers never
 * need defensive null checks.
 */
export function useToastNotifier(): ToastContextValue {
  return useContext(ToastContext) ?? { notify: () => undefined };
}
