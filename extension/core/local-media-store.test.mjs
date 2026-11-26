import test from "node:test";
import assert from "node:assert/strict";
import {
  findPossibleDuplicateFiles,
  MAX_VIDEO_SIZE_BYTES,
  validateVideoFile,
} from "./local-media-store.mjs";

const validFile = (overrides = {}) => ({
  name: "clip.mp4",
  type: "video/mp4",
  size: 1024,
  lastModified: 1_000,
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

test("detects a possible duplicate only when normalized name, size and modification time match", () => {
  const existing = [{ name: "Café.mp4", size: 1024, lastModified: 1_000 }];
  const selected = [
    validFile({ name: "Cafe\u0301.MP4" }),
    validFile({ name: "Cafe\u0301.MP4", size: 2048 }),
    validFile({ name: "Cafe\u0301.MP4", lastModified: 2_000 }),
  ];

  const duplicates = findPossibleDuplicateFiles(selected, existing);

  assert.deepEqual(duplicates.map(({ index }) => index), [0]);
  assert.equal(duplicates[0].matchesName, "Café.mp4");
});

test("detects duplicate files within one selection without marking the first copy", () => {
  const selected = [validFile(), validFile({ name: "CLIP.MP4" }), validFile({ size: 2048 })];
  const duplicates = findPossibleDuplicateFiles(selected, []);

  assert.deepEqual(duplicates.map(({ index }) => index), [1]);
  assert.equal(duplicates[0].matchesName, "clip.mp4");
});
