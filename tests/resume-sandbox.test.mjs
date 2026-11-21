import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildEnv, installFakeCodex } from "./fake-codex-fixture.mjs";
import { initGitRepo, makeTempDir, run } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "plugins", "codex", "scripts", "codex-companion.mjs");

function setUp(behavior) {
  const repo = makeTempDir();
  initGitRepo(repo);
  const binDir = makeTempDir();
  installFakeCodex(binDir, behavior);
  const env = { ...buildEnv(binDir), CLAUDE_PLUGIN_DATA: makeTempDir(), CODEX_COMPANION_SESSION_ID: "sandbox-test" };
  return {
    task: (...args) => run(process.execPath, [SCRIPT, "task", ...args], { cwd: repo, env }),
    fakeState: () => JSON.parse(fs.readFileSync(path.join(binDir, "fake-codex-state.json"), "utf8"))
  };
}

test("a read-only follow-up does not keep the write access of the run it continues", () => {
  const { task, fakeState } = setUp();
  const edit = task("--write", "--", "Fix it");
  assert.equal(edit.status, 0, edit.stderr);
  assert.equal(fakeState().lastTurnStart.sandbox, "workspace-write");

  const followup = task("--resume-session", "--", "Explain what changed");
  assert.equal(followup.status, 0, followup.stderr);
  const state = fakeState();
  assert.equal(state.appServerStarts, 1, "both runs must share one app server for this test to mean anything");
  assert.equal(state.lastTurnStart.prompt, "Explain what changed");
  assert.equal(state.lastTurnStart.sandbox, "read-only");
});

test("a write follow-up is not stuck in the read-only mode of the run it continues", () => {
  const { task, fakeState } = setUp();
  assert.equal(task("--", "Diagnose").status, 0);
  const fix = task("--resume-session", "--write", "--", "Apply the fix");
  assert.equal(fix.status, 0, fix.stderr);
  assert.equal(fakeState().lastTurnStart.sandbox, "workspace-write");
});

test("a follow-up in the same mode resumes without reloading the thread", () => {
  const { task, fakeState } = setUp();
  assert.equal(task("--", "Diagnose").status, 0);
  assert.equal(task("--resume-session", "--", "Go on").status, 0);
  assert.equal(fakeState().unsubscribes ?? 0, 0);
});

test("a follow-up is refused when Codex will not apply the requested sandbox", () => {
  const { task, fakeState } = setUp("sticky-sandbox");
  assert.equal(task("--write", "--", "Fix it").status, 0);
  const followup = task("--resume-session", "--", "Explain what changed");
  assert.notEqual(followup.status, 0);
  assert.match(followup.stderr, /kept thread .* in workspaceWrite mode instead of read-only/);
  assert.equal(fakeState().lastTurnStart.prompt, "Fix it");
});

test("task accepts the max and ultra reasoning efforts", () => {
  const { task, fakeState } = setUp();
  for (const effort of ["max", "ultra"]) {
    const result = task("--effort", effort, "--", "Think hard");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fakeState().lastTurnStart.effort, effort);
  }
  assert.match(task("--effort", "extreme", "--", "x").stderr, /Unsupported reasoning effort/);
});
