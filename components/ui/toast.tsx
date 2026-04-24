"use client";

import { useCallback, useEffect, useState } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  variant: ToastVariant;
  text: string;
}

export function useToast(dismissMs = 3000) {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), dismissMs);
    return () => clearTimeout(t);
  }, [toast, dismissMs]);

  const showToast = useCallback((variant: ToastVariant, text: string) => {
    setToast({ id: Date.now(), variant, text });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showToast, dismissToast };
}

export function ToastView({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  const styles: Record<ToastVariant, string> = {
    success: "bg-emerald-50 text-emerald-700",
    error: "bg-red-50 text-red-700",
    info: "bg-gray-100 text-gray-700",
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-sm",
        "max-w-[min(640px,90vw)]",
        styles[toast.variant],
      ].join(" ")}
      key={toast.id}
    >
      {toast.text}
    </div>
  );
}
