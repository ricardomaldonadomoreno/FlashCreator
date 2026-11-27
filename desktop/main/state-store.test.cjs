const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createEmptyState,
  ensureDirectories,
  importVideoFiles,
  readState,
  removeVideo,
  writeState,
} = require("./state-store.cjs");

function box(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(header.length + payload.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, payload]);
}

function makeVideoFixture(brand = "isom", handlerType = "vide") {
  const fileType = Buffer.alloc(8);
  fileType.write(brand, 0, "ascii");
  fileType.writeUInt32BE(0, 4);
  const handler = Buffer.alloc(12);
  handler.write(handlerType, 8, "ascii");
  const media = box("mdia", box("hdlr", handler));
  const track = box("trak", media);
  return Buffer.concat([box("ftyp", fileType), box("moov", track), box("mdat", Buffer.from([1, 2, 3, 4]))]);
}

test("local state persists atomically and imports a valid MP4 video into the managed library", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flashcreator-state-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directories = ensureDirectories(root);
  const source = path.join(root, "sample.mp4");
  const fixture = makeVideoFixture();
  fs.writeFileSync(source, fixture);

  const imported = importVideoFiles([source], directories.library, createEmptyState());
  assert.equal(imported.added.length, 1);
  assert.equal(imported.rejected.length, 0);
  assert.equal(imported.state.queue.videoIds[0], imported.added[0].id);
  assert.deepEqual(fs.readFileSync(imported.added[0].path), fixture);

  writeState(directories.stateFile, imported.state);
  const restored = readState(directories.stateFile);
  assert.equal(restored.videos[0].id, imported.added[0].id);
  assert.deepEqual(restored.queue.videoIds, [imported.added[0].id]);
});

test("local import rejects disguised or audio-only files, recognizes MOV, and reports duplicates", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flashcreator-duplicates-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directories = ensureDirectories(root);
  const source = path.join(root, "sample.mov");
  const unsupported = path.join(root, "sample.webm");
  const fakeVideo = path.join(root, "fake.mp4");
  const audioOnly = path.join(root, "audio.mp4");
  fs.writeFileSync(source, makeVideoFixture("qt  "));
  fs.writeFileSync(unsupported, Buffer.from("video"));
  fs.writeFileSync(fakeVideo, Buffer.from("random bytes with ftyp hidden in data"));
  fs.writeFileSync(audioOnly, makeVideoFixture("isom", "soun"));

  const first = importVideoFiles([source], directories.library, createEmptyState());
  const second = importVideoFiles([source, unsupported, fakeVideo, audioOnly], directories.library, first.state);
  assert.equal(first.added.length, 1);
  assert.equal(second.added.length, 0);
  assert.equal(second.duplicates.length, 1);
  assert.equal(second.rejected.length, 3);
  assert.match(second.rejected.find((item) => item.name === "fake.mp4").reason, /pista de video/);
  assert.match(second.rejected.find((item) => item.name === "audio.mp4").reason, /pista de video/);
});

test("removeVideo deletes the managed file and removes it from active queue structures", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flashcreator-remove-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directories = ensureDirectories(root);
  const source = path.join(root, "sample.mp4");
  fs.writeFileSync(source, makeVideoFixture());
  const imported = importVideoFiles([source], directories.library, createEmptyState());
  const record = imported.added[0];

  const result = removeVideo(imported.state, record.id);
  assert.equal(fs.existsSync(record.path), false);
  assert.deepEqual(result.queue.videoIds, []);
  assert.deepEqual(result.videos, []);
});
