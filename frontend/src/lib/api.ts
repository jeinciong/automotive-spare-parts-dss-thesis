const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");
const railwayApiUrl = "https://backend-production-a3ac0.up.railway.app";
const retiredRenderApiUrl = "https://automotive-spare-parts-dss-thesis.onrender.com";

// Keep existing Vercel deployments working while their environment variable is
// migrated away from Render. Explicit non-legacy values still take precedence.
export const API_BASE_URL =
  configuredApiUrl && configuredApiUrl !== retiredRenderApiUrl
    ? configuredApiUrl
    : railwayApiUrl;

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
