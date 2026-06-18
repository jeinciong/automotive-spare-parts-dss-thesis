const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");

export const API_BASE_URL = configuredApiUrl || "";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
