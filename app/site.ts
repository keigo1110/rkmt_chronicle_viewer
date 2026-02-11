const FALLBACK_SITE_URL = "https://rkmt-chronicle-viewer.vercel.app";

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (explicit) {
    return normalizeUrl(explicit);
  }

  if (process.env.VERCEL_URL) {
    return normalizeUrl(process.env.VERCEL_URL);
  }

  return FALLBACK_SITE_URL;
}

export const SITE_NAME = "Chronicle Viewer";
export const SITE_DESCRIPTION =
  "超高解像度の年表画像を Deep Zoom で閲覧し、OCR テキスト検索で該当箇所へ瞬時にジャンプできるビューワー。";
