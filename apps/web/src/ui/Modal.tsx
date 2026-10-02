import {
  useEffect
} from "react";

import {
  X
} from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children:
    React.ReactNode;
  widthClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  widthClassName =
    "max-w-xl"
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event:
        KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    open,
    onClose
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close modal"
        onClick={
          onClose
        }
        className="absolute inset-0 cursor-default bg-[#1A2340]/25 backdrop-blur-[3px]"
      />

      <section
        className={`relative z-10 flex max-h-[calc(100vh-32px)] w-full flex-col overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(30,43,77,0.19)] ${widthClassName}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-bauraBorder px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-bauraPrimary">
              Baura ERP
            </p>

            <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.025em] text-bauraInk">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-1 max-w-2xl text-[9px] leading-5 text-bauraMuted">
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-bauraBorder bg-bauraCanvas2 text-bauraMuted transition hover:bg-bauraPrimarySoft hover:text-bauraPrimary"
          >
            <X
              size={
                15
              }
            />
          </button>
        </header>

        <div className="baura-scrollbar min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {children}
        </div>
      </section>
    </div>
  );
}