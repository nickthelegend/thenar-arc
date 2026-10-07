import { test } from "node:test";
import assert from "node:assert/strict";
import { LEADER_HOME, leaderCommand, parseLeaderLine } from "../lib/leader-protocol.ts";
import { SO101 } from "../lib/so101.ts";

test("a calibrated leader line is six joint angles in degrees", () => {
  assert.deepEqual(parseLeaderLine("L 0.000 -25.000 35.000 0.000 0.000 20.000\r"), {
    kind: "joints", q: [0, -25, 35, 0, 0, 20],
  });
});

test("an uncalibrated leader reports raw 12-bit counts", () => {
  assert.deepEqual(parseLeaderLine("RAW 1024 2210 3000 512 1800 400"), { kind: "raw", raw: [1024, 2210, 3000, 512, 1800, 400] });
  assert.equal(parseLeaderLine("RAW 1024 2210 3000 512 1800 4096"), null, "a count past 12 bits is not an AS5600's");
});

test("faults, the banner and replies are named; anything else is not the leader's", () => {
  assert.deepEqual(parseLeaderLine("FAULT encoder 3"), { kind: "fault", text: "encoder 3" });
  assert.deepEqual(parseLeaderLine("FAULT joint_range"), { kind: "fault", text: "joint_range" });
  assert.equal(parseLeaderLine("THENAR AS5600 LEADER L1")?.kind, "banner");
  assert.equal(parseLeaderLine("ZERO saved at displayed home pose")?.kind, "info");
  for (const junk of ["", "L 1 2 3", "L 1 2 3 4 5 x", "Q 0 -25 35 0 0 20", "ARMED", "garbage"]) {
    assert.equal(parseLeaderLine(junk), null, junk);
  }
});

test("the leader's home and joints are the station's SO-101's", () => {
  assert.deepEqual([...LEADER_HOME], SO101.homeDeg, "one home pose, from one CAD manifest");
  assert.equal(SO101.joints.length, 6);
});

test("commands are the firmware's", () => {
  assert.equal(leaderCommand.zero, "ZERO");
  assert.equal(leaderCommand.forget, "FORGET");
  assert.equal(leaderCommand.sign(2, -1), "SIGN 2 -1");
});
