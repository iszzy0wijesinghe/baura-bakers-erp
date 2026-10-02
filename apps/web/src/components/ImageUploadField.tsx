import {
  ImagePlus,
  Loader2,
  Trash2,
  Upload
} from "lucide-react";
import {
  useRef,
  useState
} from "react";
import {
  uploadImageToCloudinary
} from "../lib/cloudinary";
import {
  useToast
} from "../ui/ToastProvider";

type ImageUploadFieldProps = {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  folder?: string;
  disabled?: boolean;
};

export function ImageUploadField({
  label,
  value,
  onChange,
  folder,
  disabled = false
}: ImageUploadFieldProps) {
  const toast =
    useToast();

  const fileInputRef =
    useRef<HTMLInputElement>(
      null
    );

  const [
    isUploading,
    setIsUploading
  ] = useState(false);

  async function handleFile(
    file:
      | File
      | null
  ) {
    if (
      !file ||
      disabled
    ) {
      return;
    }

    setIsUploading(
      true
    );

    try {
      const imageUrl =
        await uploadImageToCloudinary(
          file,
          folder
        );

      onChange(
        imageUrl
      );

      toast.success(
        "Image uploaded",
        "Cloudinary image is ready to save."
      );
    } catch (error) {
      toast.error(
        "Image upload failed",
        error instanceof Error
          ? error.message
          : "Unable to upload image."
      );
    } finally {
      setIsUploading(
        false
      );

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    }
  }

  const trimmedValue =
    value.trim();

  return (
    <div>
      <span className="erp-label">
        {label}
      </span>

      <div className="overflow-hidden rounded-[16px] border border-bauraBorder bg-bauraCanvas2">
        <div className="relative aspect-[16/7] overflow-hidden bg-white">
          {trimmedValue ? (
            <>
              <img
                src={trimmedValue}
                alt={`${label} preview`}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(
                  event
                ) => {
                  event.currentTarget.style.display =
                    "none";
                }}
              />

              {!disabled && (
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      ""
                    )
                  }
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-white/95 text-bauraDanger shadow-bauraCard transition hover:bg-bauraDangerSoft"
                  title="Remove image"
                >
                  <Trash2
                    size={14}
                  />
                </button>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-[145px] flex-col items-center justify-center px-5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-bauraGoldSoft text-bauraGoldDark">
                <ImagePlus
                  size={19}
                />
              </div>

              <p className="mt-3 text-[10px] font-semibold text-bauraInk">
                No image selected
              </p>

              <p className="mt-1 text-[9px] text-bauraMuted">
                JPG, PNG or WebP · maximum 5 MB
              </p>
            </div>
          )}
        </div>

        {!disabled && (
          <div className="border-t border-bauraBorder bg-white p-3">
            <input
              ref={
                fileInputRef
              }
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(
                event
              ) =>
                handleFile(
                  event.target.files?.[0] ||
                    null
                )
              }
            />

            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  isUploading
                }
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="erp-button-secondary flex-1"
              >
                {isUploading ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <Upload
                    size={14}
                  />
                )}

                {isUploading
                  ? "Uploading..."
                  : trimmedValue
                    ? "Replace Image"
                    : "Upload Image"}
              </button>

              {trimmedValue && (
                <button
                  type="button"
                  disabled={
                    isUploading
                  }
                  onClick={() =>
                    onChange(
                      ""
                    )
                  }
                  className="erp-button-danger"
                >
                  <Trash2
                    size={14}
                  />
                </button>
              )}
            </div>

            <label className="mt-3 block">
              <span className="erp-label">
                Or paste Cloudinary image URL
              </span>

              <input
                type="url"
                value={value}
                onChange={(
                  event
                ) =>
                  onChange(
                    event.target.value
                  )
                }
                placeholder="https://res.cloudinary.com/..."
                className="erp-input"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}