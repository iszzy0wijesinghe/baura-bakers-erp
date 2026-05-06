import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { Check, Info, X, XCircle } from "lucide-react";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
};

type ToastContextValue = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function addToast(type: ToastType, title: string, message?: string) {
    const id = crypto.randomUUID();

    setToasts((prev) => [{ id, type, title, message }, ...prev].slice(0, 4));

    window.setTimeout(() => {
      removeToast(id);
    }, 4200);
  }

  const value = useMemo(
    () => ({
      success: (title: string, message?: string) =>
        addToast("success", title, message),
      error: (title: string, message?: string) =>
        addToast("error", title, message),
      info: (title: string, message?: string) => addToast("info", title, message)
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-5 top-5 z-[100] flex w-[calc(100vw-2.5rem)] max-w-[360px] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto animate-bauraToastIn overflow-hidden rounded-xl border border-bauraBrown/10 bg-[#fffaf0]/95 shadow-[0_18px_45px_rgba(55,38,25,0.16)] backdrop-blur-xl"
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  toast.type === "success"
                    ? "bg-[#eff8ef] text-[#2f7d43]"
                    : toast.type === "error"
                      ? "bg-[#fff0ed] text-[#c2412d]"
                      : "bg-bauraBrown text-bauraGold"
                }`}
              >
                {toast.type === "success" && <Check size={18} strokeWidth={3} />}
                {toast.type === "error" && <XCircle size={18} />}
                {toast.type === "info" && <Info size={18} />}
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-bold leading-5 text-bauraBrown">
                  {toast.title}
                </p>
                {toast.message && (
                  <p className="mt-0.5 text-xs leading-5 text-bauraBrown/58">
                    {toast.message}
                  </p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-bauraBrown/35 transition hover:bg-bauraBrown/5 hover:text-bauraBrown"
              >
                <X size={15} />
              </button>
            </div>

            <div className="h-[3px] bg-bauraBrown/5">
              <div
                className={`h-full animate-bauraToastBar ${
                  toast.type === "success"
                    ? "bg-[#8fbf73]"
                    : toast.type === "error"
                      ? "bg-[#d86b55]"
                      : "bg-bauraGold"
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}