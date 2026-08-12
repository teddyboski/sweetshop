import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error";

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: ToastState | null;
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 2200;

/**
 * Round 1 polish (2026-08-12): every "Add to Cart" across the app used to
 * just relabel the button to "Added ✓" with no other feedback - Ted's
 * word for the app overall was "kinda plain." A single app-wide toast
 * avoids wiring separate animated state into every screen that adds
 * something to the cart (SnackDetail, BoxDetail, BuildABox, and future
 * ones) - call useToast().showToast(...) from anywhere under this provider.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    const id = ++nextId.current;
    setToast({ id, message, variant });
    dismissTimer.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, AUTO_DISMISS_MS);
  }, []);

  return <ToastContext.Provider value={{ toast, showToast }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
