import toast, { type ToastOptions } from "react-hot-toast";

type ToastKind = "success" | "error";

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
  success: "1px solid #70E0B0",
  error: "1px solid #ff6b6b",
};

export const showCenteredToast = (
  message: string,
  type: ToastKind = "error",
  options?: ToastOptions
) => {
  const config: ToastOptions = {
    duration: 5000,
    position: "top-center",
    ...options,
    style: {
      ...baseStyle,
      ...(options?.style ?? {}),
      border: options?.style?.border ?? defaultBorders[type],
    },
  };

  const toastFn = type === "success" ? toast.success : toast.error;
  toastFn(message, config);
};

export const showCenteredErrorToast = (message: string, options?: ToastOptions) =>
  showCenteredToast(message, "error", options);

export const showCenteredSuccessToast = (message: string, options?: ToastOptions) =>
  showCenteredToast(message, "success", options);
