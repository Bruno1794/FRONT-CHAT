const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);

export function getApiUrl() {
  return API_URL;
}

type RequestOptions = RequestInit & {
  token?: string;
  json?: unknown;
};

export async function apiFetch<T>(
  path: string,
  { token, headers, json, body, ...options }: RequestOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);

  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    body: json !== undefined ? JSON.stringify(json) : body,
    headers: requestHeaders,
  });

  if (!response.ok) {
    let message = `API request failed with status ${response.status}`;

    try {
      const errorBody = (await response.json()) as { message?: string };
      message = errorBody.message ?? message;
    } catch {
      // Keep the default status message when the API does not return JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export { API_URL };
