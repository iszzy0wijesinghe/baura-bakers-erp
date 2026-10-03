export const API_BASE_URL =
  import.meta.env
    .VITE_API_BASE_URL ||
  "http://localhost:4000/api";

export type ApiErrorData = {
  message?: string;
  code?: string;
  approvalType?: string;

  [key: string]:
    unknown;
};

export class ApiError extends Error {
  status: number;
  data: ApiErrorData | null;

  constructor(
    message: string,
    status: number,
    data:
      | ApiErrorData
      | null = null
  ) {
    super(message);

    this.name =
      "ApiError";

    this.status =
      status;

    this.data =
      data;

    Object.setPrototypeOf(
      this,
      ApiError.prototype
    );
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    localStorage.getItem(
      "baura_token"
    );

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,

        headers: {
          "Content-Type":
            "application/json",

          ...(token
            ? {
                Authorization:
                  `Bearer ${token}`
              }
            : {}),

          ...(options.headers ||
            {})
        }
      }
    );
  } catch {
    throw new ApiError(
      "Cannot connect to the Baura ERP server. Make sure the backend service is running.",
      0,
      null
    );
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  let data:
    | ApiErrorData
    | T
    | null = null;

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    data =
      await response
        .json()
        .catch(
          () => null
        );
  }

  if (!response.ok) {
    if (
      response.status ===
        401 &&
      path !==
        "/auth/login"
    ) {
      localStorage.removeItem(
        "baura_token"
      );
    }

    const errorData =
      data &&
      typeof data ===
        "object" &&
      !Array.isArray(
        data
      )
        ? (data as ApiErrorData)
        : null;

    throw new ApiError(
      errorData?.message ||
        `Request failed (${response.status})`,
      response.status,
      errorData
    );
  }

  return data as T;
}

export function isApiError(
  error: unknown
): error is ApiError {
  return (
    error instanceof
    ApiError
  );
}