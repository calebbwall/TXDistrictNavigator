import { getApiUrl } from "./query-client";

export function getProxiedPhotoUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;

  if (photoUrl.startsWith("/")) {
    return `${getApiUrl()}${photoUrl}`;
  }

  try {
    const url = new URL(photoUrl);
    const externalDomains = [
      "directory.texastribune.org",
      "www.congress.gov",
      "congress.gov",
      "bioguide.congress.gov",
    ];
    if (externalDomains.includes(url.hostname)) {
      const baseUrl = getApiUrl();
      return `${baseUrl}/api/photo-proxy?url=${encodeURIComponent(photoUrl)}`;
    }
  } catch {
    // not a valid URL
  }

  return photoUrl;
}
