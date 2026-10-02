import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  ReactNode
} from "react";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X
} from "lucide-react";

type ToastType =
  | "success"
  | "error"
  | "warning"
  | "info";

type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  exiting?: boolean;
};

type ToastContextValue = {
  success: (
    title: string,
    message?: string
  ) => void;

  error: (
    title: string,
    message?: string
  ) => void;

  warning: (
    title: string,
    message?: string
  ) => void;

  info: (
    title: string,
    message?: string
  ) => void;
};

const ToastContext =
  createContext<
    ToastContextValue | null
  >(null);

const TOAST_DURATION =
  4200;

const EXIT_DURATION =
  190;

function createToastId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function ToastProvider({
  children
}: {
  children: ReactNode;
}) {
  const [
    toasts,
    setToasts
  ] =
    useState<
      ToastItem[]
    >([]);

  const timers =
    useRef(
      new Map<
        string,
        number
      >()
    );

  const removeToast =
    useCallback(
      (
        id: string
      ) => {
        const timer =
          timers.current.get(
            id
          );

        if (timer) {
          window.clearTimeout(
            timer
          );

          timers.current.delete(
            id
          );
        }

        setToasts(
          (current) =>
            current.map(
              (toast) =>
                toast.id ===
                id
                  ? {
                      ...toast,
                      exiting:
                        true
                    }
                  : toast
            )
        );

        window.setTimeout(
          () => {
            setToasts(
              (current) =>
                current.filter(
                  (toast) =>
                    toast.id !==
                    id
                )
            );
          },

          EXIT_DURATION
        );
      },
      []
    );

  const pushToast =
    useCallback(
      (
        type:
          ToastType,

        title:
          string,

        message?:
          string
      ) => {
        const id =
          createToastId();

        const toast:
          ToastItem = {
          id,
          type,
          title,
          message
        };

        setToasts(
          (current) => [
            ...current.slice(
              -3
            ),

            toast
          ]
        );

        const timer =
          window.setTimeout(
            () =>
              removeToast(
                id
              ),

            TOAST_DURATION
          );

        timers.current.set(
          id,
          timer
        );
      },
      [
        removeToast
      ]
    );

  useEffect(() => {
    const currentTimers =
      timers.current;

    return () => {
      currentTimers.forEach(
        (timer) => {
          window.clearTimeout(
            timer
          );
        }
      );

      currentTimers.clear();
    };
  }, []);

  const value =
    useMemo<ToastContextValue>(
      () => ({
        success(
          title,
          message
        ) {
          pushToast(
            "success",
            title,
            message
          );
        },

        error(
          title,
          message
        ) {
          pushToast(
            "error",
            title,
            message
          );
        },

        warning(
          title,
          message
        ) {
          pushToast(
            "warning",
            title,
            message
          );
        },

        info(
          title,
          message
        ) {
          pushToast(
            "info",
            title,
            message
          );
        }
      }),
      [
        pushToast
      ]
    );

  return (
    <ToastContext.Provider
      value={value}
    >
      {children}

      {/*
       * TOP-RIGHT NOTIFICATION STACK
       */}
      <div className="pointer-events-none fixed right-4 top-4 z-[250] flex w-[calc(100vw-32px)] max-w-[390px] flex-col gap-2.5 sm:right-5 sm:top-5 sm:w-full">
        {toasts.map(
          (toast) => (
            <ToastChip
              key={
                toast.id
              }
              toast={
                toast
              }
              onClose={() =>
                removeToast(
                  toast.id
                )
              }
            />
          )
        )}
      </div>
    </ToastContext.Provider>
  );
}

function ToastChip({
  toast,
  onClose
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const config = {
    success: {
      icon:
        CheckCircle2,

      iconClass:
        "bg-bauraSuccessSoft text-bauraSuccess",

      bar:
        "bg-bauraSuccess"
    },

    error: {
      icon:
        AlertCircle,

      iconClass:
        "bg-bauraDangerSoft text-bauraDanger",

      bar:
        "bg-bauraDanger"
    },

    warning: {
      icon:
        AlertTriangle,

      iconClass:
        "bg-bauraWarningSoft text-bauraWarning",

      bar:
        "bg-bauraWarning"
    },

    info: {
      icon:
        Info,

      iconClass:
        "bg-bauraGoldSoft text-bauraGoldDark",

      bar:
        "bg-bauraGold"
    }
  }[
    toast.type
  ];

  const Icon =
    config.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto relative overflow-hidden rounded-[15px] border border-bauraBorder bg-white shadow-bauraToast ${
        toast.exiting
          ? "animate-bauraToastOut"
          : "animate-bauraToastIn"
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.iconClass}`}
        >
          <Icon
            size={17}
          />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[10px] font-semibold text-bauraInk">
            {
              toast.title
            }
          </p>

          {toast.message && (
            <p className="mt-1 text-[9px] leading-4 text-bauraMuted">
              {
                toast.message
              }
            </p>
          )}
        </div>

        <button
          type="button"
          aria-label="Close notification"
          onClick={
            onClose
          }
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-bauraMuted transition hover:bg-bauraCanvas2 hover:text-bauraInk"
        >
          <X
            size={13}
          />
        </button>
      </div>

      {!toast.exiting && (
        <div className="h-[2px] bg-bauraCanvas2">
          <div
            className={`h-full animate-bauraToastBar ${config.bar}`}
          />
        </div>
      )}
    </div>
  );
}

export function useToast() {
  const context =
    useContext(
      ToastContext
    );

  if (!context) {
    throw new Error(
      "useToast must be used inside ToastProvider"
    );
  }

  return context;
}