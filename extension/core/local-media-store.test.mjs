import test from "node:test";
import assert from "node:assert/strict";
import { MAX_VIDEO_SIZE_BYTES, validateVideoFile } from "./local-media-store.mjs";

const validFile = (overrides = {}) => ({
  name: "clip.mp4",
  type: "video/mp4",
  size: 1024,
  ...overrides,
});

test("accepts MP4 and MOV with recognized video MIME types", () => {
  assert.equal(validateVideoFile(validFile()), null);
  assert.equal(validateVideoFile(validFile({ name: "scene.mov", type: "video/quicktime" })), null);
});

test("rejects unsupported extensions and mismatched MIME types", () => {
  assert.match(validateVideoFile(validFile({ name: "clip.exe" })), /MP4 o MOV/);
  assert.match(validateVideoFile(validFile({ type: "text/plain" })), /MP4 o MOV/);
});

test("rejects zero-byte files and files above the 2 GiB beta limit", () => {
  assert.match(validateVideoFile(validFile({ size: 0 })), /vacío/);
  assert.match(validateVideoFile(validFile({ size: MAX_VIDEO_SIZE_BYTES + 1 })), /2 GiB/);
});
