export const TIKTOK_STUDIO_UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video";

const SUPPORTED_ORIGIN = "https://www.tiktok.com";
const SUPPORTED_PATH = /^\/tiktokstudio\/upload\/?$/;

export function isSupportedStudioUploadUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.origin === SUPPORTED_ORIGIN
      && SUPPORTED_PATH.test(url.pathname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}
