import {
  AlertTriangle,
  RefreshCw
} from "lucide-react";

import {
  Modal
} from "./Modal";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;

  confirmText?:
    string;

  cancelText?:
    string;

  isDanger?:
    boolean;

  isLoading?:
    boolean;

  onConfirm:
    () => void;

  onCancel:
    () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText =
    "Confirm",
  cancelText =
    "Cancel",
  isDanger = false,
  isLoading = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Modal
      open={
        open
      }
      onClose={() =>
        !isLoading &&
        onCancel()
      }
      title={
        title
      }
      widthClassName="max-w-md"
    >
      <div className="flex gap-3 rounded-2xl bg-bauraCanvas2 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isDanger
              ? "bg-bauraDangerSoft text-bauraDanger"
              : "bg-bauraWarningSoft text-bauraWarning"
          }`}
        >
          <AlertTriangle
            size={
              18
            }
          />
        </div>

        <div>
          <p className="text-[10px] font-semibold text-bauraInk">
            Please confirm this action
          </p>

          <p className="mt-1 text-[9px] leading-5 text-bauraMuted">
            {
              message
            }
          </p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={
            isLoading
          }
          onClick={
            onCancel
          }
          className="erp-button-secondary"
        >
          {
            cancelText
          }
        </button>

        <button
          type="button"
          disabled={
            isLoading
          }
          onClick={
            onConfirm
          }
          className={
            isDanger
              ? "erp-button-danger"
              : "erp-button-primary"
          }
        >
          {isLoading && (
            <RefreshCw
              size={
                13
              }
              className="animate-spin"
            />
          )}

          {
            isLoading
              ? "Processing..."
              : confirmText
          }
        </button>
      </div>
    </Modal>
  );
}