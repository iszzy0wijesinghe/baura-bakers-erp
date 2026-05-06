import { AlertTriangle } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDanger = false,
  isLoading = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      <button
        className="absolute inset-0 bg-bauraBrown/45 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Cancel"
      />

      <div className="relative z-[91] w-full max-w-md rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-6 shadow-2xl shadow-bauraBrown/20">
        <div
          className={`mb-5 flex h-14 w-14 items-center justify-center rounded-3xl ${
            isDanger ? "bg-red-100 text-red-700" : "bg-bauraBrown text-bauraGold"
          }`}
        >
          <AlertTriangle size={26} />
        </div>

        <h2 className="text-xl font-bold text-bauraBrown">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-bauraBrown/65">{message}</p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-2xl border border-bauraBrown/10 bg-white px-5 py-3 text-sm font-bold text-bauraBrown disabled:opacity-60"
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-2xl px-5 py-3 text-sm font-bold disabled:opacity-60 ${
              isDanger
                ? "bg-red-600 text-white"
                : "bg-bauraBrown text-bauraCream"
            }`}
          >
            {isLoading ? "Please wait..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}