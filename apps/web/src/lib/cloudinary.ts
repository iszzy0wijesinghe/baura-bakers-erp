type CloudinaryUploadResponse = {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  format?: string;
  error?: {
    message?: string;
  };
};

const cloudName =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();

const uploadPreset =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

export function isCloudinaryConfigured() {
  return Boolean(
    cloudName &&
    uploadPreset
  );
}

export async function uploadImageToCloudinary(
  file: File,
  folder?: string
): Promise<string> {
  if (
    !cloudName ||
    !uploadPreset
  ) {
    throw new Error(
      "Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to apps/web/.env."
    );
  }

  if (
    !ALLOWED_TYPES.includes(
      file.type
    )
  ) {
    throw new Error(
      "Only JPG, PNG and WebP images are allowed."
    );
  }

  if (
    file.size >
    MAX_FILE_SIZE
  ) {
    throw new Error(
      "Image must be 5 MB or smaller."
    );
  }

  const body =
    new FormData();

  body.append(
    "file",
    file
  );

  body.append(
    "upload_preset",
    uploadPreset
  );

  if (folder) {
    body.append(
      "folder",
      folder
    );
  }

  const response =
    await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body
      }
    );

  const data =
    await response.json() as
      CloudinaryUploadResponse;

  if (
    !response.ok ||
    !data.secure_url
  ) {
    throw new Error(
      data.error?.message ||
        "Cloudinary image upload failed."
    );
  }

  return data.secure_url;
}