import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRead, isOurError } from "../lib/store-failure.ts";

test("our own 404 means the store answered and has no such hash", () => {
  assert.equal(classifyRead(404, { error: "No trajectory with that hash." }), "absent");
});

test("the platform's 404 means the store never answered at all", () => {
  // What thenar.io returned for every /api/* read while the backend was gone.
  const railway = {
    status: "error", code: 404,
    message: "Application not found",
    request_id: "f174T1X0RZSE9unlAXC71g",
  };
  assert.equal(classifyRead(404, railway), "unreachable");
  assert.equal(isOurError(railway), false);
});

test("an HTML error page is not our answer either", () => {
  assert.equal(classifyRead(404, null), "unreachable");
  assert.equal(classifyRead(404, "<!DOCTYPE html>"), "unreachable");
});

test("any other status is the store not answering, whatever the body", () => {
  for (const s of [500, 502, 503, 504, 0]) {
    assert.equal(classifyRead(s, { error: "boom" }), "unreachable");
  }
});

test("a body carrying a correlation id is never read as ours", () => {
  assert.equal(isOurError({ error: "nope", requestId: "abc" }), false);
});
