import toast, { type ToastOptions } from "react-hot-toast";

type ToastKind = "success" | "error";

type PendingToastKind = ToastKind | "loading";

const DEFAULT_TRANSACTION_TIMEOUT_MS = 20000;

const baseStyle = {
  background: "#1E1F26",
  color: "#E6E7EA",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: "500",
  maxWidth: "400px",
  zIndex: 9999,
} as const;

const defaultBorders: Record<ToastKind, string> = {
  success: "1px solid #FFFFFF",
  error: "1px solid #ff6b6b",
};

const loadingBorder = "1px solid #3B82F6";

const buildOptions = (
  type: PendingToastKind,
  options?: ToastOptions
): ToastOptions => {
  const border =
    type === "loading"
      ? loadingBorder
      : defaultBorders[type as ToastKind] ?? defaultBorders.error;

  return {
    duration: type === "loading" ? Infinity : 5000,
    position: "top-center",
    ...options,
    style: {
      ...baseStyle,
      ...(options?.style ?? {}),
      border: options?.style?.border ?? border,
    },
  };
};

export const showCenteredToast = (
  message: string,
  type: ToastKind = "error",
  options?: ToastOptions
) => {
  const toastFn = type === "success" ? toast.success : toast.error;
  toastFn(message, buildOptions(type, options));
};

export const showCenteredErrorToast = (message: string, options?: ToastOptions) =>
  showCenteredToast(message, "error", options);

export const showCenteredSuccessToast = (message: string, options?: ToastOptions) =>
  showCenteredToast(message, "success", options);

export const showTransactionPendingToast = (
  message: string,
  options?: ToastOptions
): string => toast.loading(message, buildOptions("loading", options));

export const updateTransactionToast = (
  id: string | null,
  type: ToastKind,
  message: string,
  options?: ToastOptions
) => {
  if (!id) return;
  const toastFn = type === "success" ? toast.success : toast.error;
  toastFn(message, { id, ...buildOptions(type, options) });
};

export const startTransactionToastTimeout = (
  id: string | null,
  message = "❌ Transaction timed out. Please try again.",
  timeoutMs: number = DEFAULT_TRANSACTION_TIMEOUT_MS
): (() => void) => {
  if (!id) {
    return () => undefined;
  }
  const timeoutId = window.setTimeout(() => {
    updateTransactionToast(id, "error", message);
  }, timeoutMs);
  return () => window.clearTimeout(timeoutId);
};
