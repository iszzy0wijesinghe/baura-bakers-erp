import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  widthClassName?: string;
};

export function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  widthClassName = "max-w-2xl"
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
      <button
        className="absolute inset-0 bg-bauraBrown/45 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div
        className={`relative z-[81] max-h-[calc(100vh-3rem)] w-full ${widthClassName} overflow-hidden rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft shadow-2xl shadow-bauraBrown/20`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-bauraBrown/10 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-bauraBrown">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm leading-6 text-bauraBrown/60">
                {subtitle}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-bauraBrown/60 hover:text-bauraBrown"
          >
            <X size={18} />
          </button>
        </div>

        <div className="baura-scrollbar max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}