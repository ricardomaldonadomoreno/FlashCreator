import test from "node:test";
import assert from "node:assert/strict";
import {
  getTransferChunkRange,
  isValidTransferDescriptor,
  transferChunkCount,
  transferMetadataMatches,
  isValidTransferAuthorization,
  TRANSFER_AUTH_TTL_MS,
  TRANSFER_CHUNK_SIZE_BYTES,
} from "./transfer-protocol.mjs";

const descriptor = {
  id: "video-1",
  name: "sample.mp4",
  size: TRANSFER_CHUNK_SIZE_BYTES + 17,
  lastModified: 123456,
  type: "video/mp4",
};

test("accepts only complete local video transfer descriptors", () => {
  assert.equal(isValidTransferDescriptor(descriptor), true);
  assert.equal(isValidTransferDescriptor({ ...descriptor, size: Number.NaN }), false);
  assert.equal(isValidTransferDescriptor({ ...descriptor, lastModified: -1 }), false);
  assert.equal(isValidTransferDescriptor({ ...descriptor, id: " " }), false);
});

test("verifies stored metadata and blob size before transfer", () => {
  assert.equal(transferMetadataMatches(descriptor, { ...descriptor }, descriptor.size), true);
  assert.equal(transferMetadataMatches(descriptor, { ...descriptor, name: "other.mp4" }, descriptor.size), false);
  assert.equal(transferMetadataMatches(descriptor, { ...descriptor, size: descriptor.size - 1 }, descriptor.size), false);
  assert.equal(transferMetadataMatches(descriptor, descriptor, descriptor.size - 1), false);
});

test("splits a large video into bounded, contiguous chunks", () => {
  const totalBytes = TRANSFER_CHUNK_SIZE_BYTES * 2 + 17;
  assert.equal(transferChunkCount(totalBytes), 3);
  assert.deepEqual(getTransferChunkRange(0, totalBytes), { start: 0, end: TRANSFER_CHUNK_SIZE_BYTES });
  assert.deepEqual(getTransferChunkRange(1, totalBytes), { start: TRANSFER_CHUNK_SIZE_BYTES, end: TRANSFER_CHUNK_SIZE_BYTES * 2 });
  assert.deepEqual(getTransferChunkRange(2, totalBytes), { start: TRANSFER_CHUNK_SIZE_BYTES * 2, end: totalBytes });
});

test("rejects invalid chunk ranges rather than retrying or skipping data", () => {
  assert.throws(() => getTransferChunkRange(-1, 100), RangeError);
  assert.throws(() => getTransferChunkRange(1, 100), RangeError);
  assert.throws(() => getTransferChunkRange(0, 0), RangeError);
  assert.throws(() => transferChunkCount(0), RangeError);
});

test("accepts only a matching, unexpired one-time transfer authorization", () => {
  const now = 10_000;
  const request = {
    transferId: "transfer-1",
    videoId: descriptor.id,
    authorizationToken: "a".repeat(36),
    expected: { ...descriptor },
  };
  const authorization = {
    transferId: request.transferId,
    videoId: request.videoId,
    authorizationToken: request.authorizationToken,
    expected: { ...descriptor },
    expiresAt: now + TRANSFER_AUTH_TTL_MS,
  };

  assert.equal(isValidTransferAuthorization(authorization, request, now), true);
  assert.equal(isValidTransferAuthorization(authorization, { ...request, authorizationToken: "b".repeat(36) }, now), false);
  assert.equal(isValidTransferAuthorization(authorization, { ...request, videoId: "other-video" }, now), false);
  assert.equal(isValidTransferAuthorization({ ...authorization, expiresAt: now }, request, now), false);
  assert.equal(isValidTransferAuthorization({ ...authorization, expected: { ...descriptor, name: "other.mp4" } }, request, now), false);
});
