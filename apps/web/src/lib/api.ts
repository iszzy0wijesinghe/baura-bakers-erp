export const API_BASE_URL =
  import.meta.env
    .VITE_API_BASE_URL ||
  "http://localhost:4000/api";

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
    throw new Error(
      "Cannot connect to the Baura ERP server. Make sure the backend service is running."
    );
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  const data =
    contentType.includes(
      "application/json"
    )
      ? await response
          .json()
          .catch(() => null)
      : null;

  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login"
    ) {
      localStorage.removeItem(
        "baura_token"
      );
    }

    throw new Error(
      data?.message ||
        `Request failed (${response.status})`
    );
  }

  return data as T;
}