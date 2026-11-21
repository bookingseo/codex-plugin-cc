import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { makeTempDir, run, withPluginData } from "./helpers.mjs";
import * as state from "../plugins/codex/scripts/lib/state.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_URL = pathToFileURL(path.join(ROOT, "plugins", "codex", "scripts", "lib", "state.mjs")).href;

const WRITER = `
import fs from "node:fs";
import * as state from ${JSON.stringify(STATE_URL)};
const [cwd, id] = process.argv.slice(1);
const record = { id, status: "running", jobClass: "task", logFile: state.resolveJobLogFile(cwd, id) };
fs.writeFileSync(record.logFile, "started\\n");
state.writeJobFile(cwd, id, record);
state.upsertJob(cwd, record);
`;

function writerArgs(workspace, id) {
  return ["--input-type=module", "-e", WRITER, workspace, id];
}

function snapshot(workspace, id) {
  return {
    indexed: state.listJobs(workspace).some((job) => job.id === id),
    record: fs.existsSync(state.resolveJobFile(workspace, id)),
    log: fs.existsSync(state.resolveJobLogFile(workspace, id))
  };
}

const PRESENT = { indexed: true, record: true, log: true };

test("a state update in progress cannot be overtaken by another process", () => {
  withPluginData(() => {
    const workspace = makeTempDir();
    let blocked = null;
    state.updateState(workspace, (current) => {
      try {
        execFileSync(process.execPath, writerArgs(workspace, "task-b"), { stdio: "pipe" });
      } catch (error) {
        blocked = String(error.stderr);
      }
      current.jobs.push({ id: "task-a", status: "running", jobClass: "task" });
    });
    assert.match(blocked ?? "", /Codex job state is busy/);
    assert.equal(snapshot(workspace, "task-b").indexed, false);

    execFileSync(process.execPath, writerArgs(workspace, "task-b"), { stdio: "pipe" });
    state.upsertJob(workspace, { id: "task-a", phase: "investigating" });
    assert.equal(snapshot(workspace, "task-a").indexed, true);
    assert.deepEqual(snapshot(workspace, "task-b"), PRESENT);
  });
});

test("a failed state update saves nothing and releases the lock", () => {
  withPluginData(() => {
    const workspace = makeTempDir();
    state.upsertJob(workspace, { id: "task-a", status: "completed" });
    assert.throws(() =>
      state.updateState(workspace, (current) => {
        current.jobs = [];
        throw new Error("rejected");
      })
    );
    assert.deepEqual(state.listJobs(workspace).map((job) => job.id), ["task-a"]);
    state.upsertJob(workspace, { id: "task-b", status: "completed" });
    assert.equal(state.listJobs(workspace).length, 2);
  });
});

test("a lock left by a dead process is taken over", () => {
  withPluginData(() => {
    const workspace = makeTempDir();
    state.ensureStateDir(workspace);
    const dead = run(process.execPath, ["-e", "console.log(process.pid)"]);
    fs.writeFileSync(path.join(state.resolveStateDir(workspace), "state.lock"), `${dead.stdout.trim()}-stale`);
    state.upsertJob(workspace, { id: "task-a", status: "completed" });
    assert.equal(state.listJobs(workspace).length, 1);
  });
});

test("parallel writers keep every job, record and log", async () => {
  await withPluginData(async () => {
    const workspace = makeTempDir();
    const ids = Array.from({ length: 8 }, (_, index) => `task-${index}`);
    const codes = await Promise.all(
      ids.map(
        (id) =>
          new Promise((resolve) => {
            spawn(process.execPath, writerArgs(workspace, id), { env: process.env, stdio: "ignore" }).on("close", resolve);
          })
      )
    );
    assert.deepEqual(codes, ids.map(() => 0));
    for (const id of ids) {
      assert.deepEqual(snapshot(workspace, id), PRESENT, id);
    }
  });
});
