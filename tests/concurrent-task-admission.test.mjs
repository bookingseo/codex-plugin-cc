import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildEnv, installFakeCodex } from "./fake-codex-fixture.mjs";
import { initGitRepo, makeTempDir, run, withPluginData } from "./helpers.mjs";
import * as state from "../plugins/codex/scripts/lib/state.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "plugins", "codex", "scripts", "codex-companion.mjs");

const QUEUE_ORDER_HOOK = `
const fs = require("node:fs");
const path = require("node:path");
const receipt = process.env.QUEUE_TEST_RECEIPT;
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
if (process.argv[2] === "task-worker") {
  // What the worker finds at the very start of its process.
  const jobId = process.argv[process.argv.indexOf("--job-id") + 1];
  const stateRoot = path.join(process.env.CLAUDE_PLUGIN_DATA, "state");
  let status = null;
  for (const dir of fs.existsSync(stateRoot) ? fs.readdirSync(stateRoot) : []) {
    const file = path.join(stateRoot, dir, "jobs", jobId + ".json");
    if (fs.existsSync(file)) status = JSON.parse(fs.readFileSync(file, "utf8")).status;
  }
  fs.writeFileSync(receipt, JSON.stringify({ status }));
} else if (process.argv[2] === "task") {
  // Hold the launcher right after the spawn until the worker has looked.
  const childProcess = require("node:child_process");
  const spawn = childProcess.spawn;
  childProcess.spawn = function (command, args, ...rest) {
    const child = spawn.call(this, command, args, ...rest);
    if (Array.isArray(args) && args.includes("task-worker")) {
      const deadline = Date.now() + 8000;
      while (!fs.existsSync(receipt) && Date.now() < deadline) wait(10);
    }
    return child;
  };
  require("node:module").syncBuiltinESMExports();
}
`;

test("a background job is published before its worker starts", () => {
  withPluginData((dataDir) => {
    const workspace = makeTempDir();
    initGitRepo(workspace);
    const binDir = makeTempDir();
    installFakeCodex(binDir);
    const hook = path.join(binDir, "queue-order-hook.cjs");
    fs.writeFileSync(hook, QUEUE_ORDER_HOOK);
    const receipt = path.join(binDir, "worker-start.json");
    const env = {
      ...buildEnv(binDir),
      CLAUDE_PLUGIN_DATA: dataDir,
      CODEX_COMPANION_SESSION_ID: "queue-test",
      QUEUE_TEST_RECEIPT: receipt,
      NODE_OPTIONS: `--require ${JSON.stringify(hook)}`
    };

    const launch = run(process.execPath, [SCRIPT, "task", "--background", "--json", "--", "Explain"], { cwd: workspace, env });
    assert.equal(launch.status, 0, launch.stderr);
    const { jobId } = JSON.parse(launch.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(receipt, "utf8")), { status: "queued" });

    const settled = run(process.execPath, [SCRIPT, "status", jobId, "--wait", "--json"], { cwd: workspace, env });
    assert.equal(settled.status, 0, settled.stderr);
    assert.equal(JSON.parse(settled.stdout).job.status, "completed");
  });
});

const HOLD_HELPER = `
function holdAt(label, releaseFile, thread) {
  const root = process.env.REVIEW_TIMING_DIR;
  fs.writeFileSync(path.join(root, label), thread);
  const end = Date.now() + 15000;
  while (!fs.existsSync(path.join(root, releaseFile))) {
    if (Date.now() > end) throw new Error("Fixture timed out at " + label);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}`;

function setUpHeldTurns() {
  const workspace = makeTempDir();
  initGitRepo(workspace);
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  const fake = path.join(binDir, "codex");
  const source = fs.readFileSync(fake, "utf8");
  const patched = source
    .replace("function now()", `${HOLD_HELPER}\nfunction now()`)
    .replace('case "thread/resume": {', 'case "thread/resume": { if (process.env.REVIEW_ROLE === "latest") holdAt("latest-resume", "release", message.params.threadId);')
    .replace('case "turn/start": {', 'case "turn/start": { if (process.env.REVIEW_ROLE !== "seed") holdAt(process.env.REVIEW_ROLE + "-turn", "release", message.params.threadId);');
  assert.notEqual(patched, source);
  fs.writeFileSync(fake, patched);

  const env = {
    ...buildEnv(binDir),
    CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA,
    CODEX_COMPANION_SESSION_ID: "mixed-test",
    REVIEW_TIMING_DIR: binDir,
    // No shared broker: each command talks to its own app server.
    CODEX_COMPANION_APP_SERVER_ENDPOINT: "unix:/tmp/cxc-test-intentionally-absent.sock"
  };
  const start = (role, args) => {
    const child = spawn(process.execPath, [SCRIPT, "task", "--json", ...args], {
      cwd: workspace,
      env: { ...env, REVIEW_ROLE: role },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.resume();
    return new Promise((resolve) => child.on("close", (code) => resolve({ code, stderr })));
  };
  const waitFile = async (name) => {
    const file = path.join(binDir, name);
    const end = Date.now() + 10000;
    while (!fs.existsSync(file)) {
      assert.ok(Date.now() < end, `timed out waiting for ${name}`);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return fs.readFileSync(file, "utf8");
  };
  return {
    workspace,
    start,
    waitFile,
    reached: (name) => fs.existsSync(path.join(binDir, name)),
    release: () => fs.writeFileSync(path.join(binDir, "release"), "ok")
  };
}

test("--from is refused while --resume-session is resuming the same thread", async () => {
  await withPluginData(async () => {
    const turns = setUpHeldTurns();
    assert.equal((await turns.start("seed", ["--", "Seed"])).code, 0);
    const source = state.listJobs(turns.workspace)[0];
    let latest;
    try {
      latest = turns.start("latest", ["--resume-session", "--", "Latest followup"]);
      assert.equal(await turns.waitFile("latest-resume"), source.threadId);
      const named = await turns.start("named", ["--from", source.id, "--", "Named followup"]);
      assert.notEqual(named.code, 0);
      assert.match(named.stderr, /already using this thread/);
      assert.equal(turns.reached("named-turn"), false);
    } finally {
      turns.release();
    }
    assert.equal((await latest).code, 0);
    const active = state.listJobs(turns.workspace).filter((job) => job.status === "queued" || job.status === "running");
    assert.deepEqual(active, []);
  });
});

test("--resume-session is refused while --from holds the same thread", async () => {
  await withPluginData(async () => {
    const turns = setUpHeldTurns();
    assert.equal((await turns.start("seed", ["--", "Seed"])).code, 0);
    const source = state.listJobs(turns.workspace)[0];
    let named;
    try {
      named = turns.start("named", ["--from", source.id, "--", "Named followup"]);
      assert.equal(await turns.waitFile("named-turn"), source.threadId);
      const latest = await turns.start("latest", ["--resume-session", "--", "Latest followup"]);
      assert.notEqual(latest.code, 0);
      assert.match(latest.stderr, /still running/);
      assert.equal(turns.reached("latest-resume"), false);
    } finally {
      turns.release();
    }
    assert.equal((await named).code, 0);
  });
});

test("two parallel --from runs on one job produce exactly one winner", async () => {
  await withPluginData(async () => {
    const turns = setUpHeldTurns();
    assert.equal((await turns.start("seed", ["--", "Seed"])).code, 0);
    const source = state.listJobs(turns.workspace)[0];
    const runs = ["first", "second"].map((role) => turns.start(role, ["--from", source.id, "--", `${role} followup`]));
    let results;
    try {
      const firstTurn = await Promise.race(["first-turn", "second-turn"].map((name) => turns.waitFile(name).catch(() => null)));
      assert.equal(firstTurn, source.threadId);
    } finally {
      turns.release();
      results = await Promise.all(runs);
    }
    const codes = results.map((result) => result.code).sort();
    assert.equal(codes[0], 0, JSON.stringify(results));
    assert.notEqual(codes[1], 0, JSON.stringify(results));
    assert.match(results.find((result) => result.code !== 0).stderr, /already using this thread/);
  });
});
