import { createContext } from "react";

export type ToastContextValue = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

export const ToastContext =
  createContext<ToastContextValue | null>(null);
