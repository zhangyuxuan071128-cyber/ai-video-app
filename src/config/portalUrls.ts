export type PortalPort = 3000 | 3001;

type LocationLike = Pick<Location, "protocol" | "hostname" | "port" | "origin">;

function normalizedOverride(value?: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function derivePortalUrl(
  targetPort: PortalPort,
  location: LocationLike,
  override?: string,
): string | null {
  const configured = normalizedOverride(override);
  if (configured) return configured;

  const cloudStudioHost = location.hostname.match(/^(.*)--\d+(\..+)$/);
  if (cloudStudioHost) {
    return `${location.protocol}//${cloudStudioHost[1]}--${targetPort}${cloudStudioHost[2]}`;
  }

  if (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "0.0.0.0"
  ) {
    return `${location.protocol}//${location.hostname}:${targetPort}`;
  }

  if (Number(location.port) === targetPort) return location.origin;
  return null;
}

export function getAdminPortalUrl(): string | null {
  if (typeof window === "undefined") return null;
  return derivePortalUrl(3001, window.location, import.meta.env.VITE_ADMIN_PORTAL_URL);
}

export function getMemberPortalUrl(): string | null {
  if (typeof window === "undefined") return null;
  return derivePortalUrl(3000, window.location, import.meta.env.VITE_MEMBER_PORTAL_URL);
}
