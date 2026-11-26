import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedStudioUploadUrl, TIKTOK_STUDIO_UPLOAD_URL } from "./studio-target.mjs";

test("accepts the configured TikTok Studio upload route and harmless query strings", () => {
  assert.equal(isSupportedStudioUploadUrl(TIKTOK_STUDIO_UPLOAD_URL), true);
  assert.equal(isSupportedStudioUploadUrl("https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video"), true);
  assert.equal(isSupportedStudioUploadUrl("https://www.tiktok.com/tiktokstudio/upload/"), true);
});

test("rejects non-HTTPS, other hosts, deceptive hostnames, credentials, and other paths", () => {
  const rejected = [
    "http://www.tiktok.com/tiktokstudio/upload",
    "https://tiktok.com/tiktokstudio/upload",
    "https://studio.tiktok.com/tiktokstudio/upload",
    "https://www.tiktok.com.evil.example/tiktokstudio/upload",
    "https://www.tiktok.com@evil.example/tiktokstudio/upload",
    "https://user:pass@www.tiktok.com/tiktokstudio/upload",
    "https://www.tiktok.com/tiktokstudio/",
    "https://www.tiktok.com/tiktokstudio/creator-center",
    "not a URL",
    "",
    null,
  ];

  for (const value of rejected) assert.equal(isSupportedStudioUploadUrl(value), false, String(value));
});
