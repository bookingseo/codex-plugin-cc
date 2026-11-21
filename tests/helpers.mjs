import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { after } from "node:test";

import { loadBrokerSession, teardownBrokerSession } from "../plugins/codex/scripts/lib/broker-lifecycle.mjs";
import { terminateProcessTree } from "../plugins/codex/scripts/lib/process.mjs";

const tempDirs = [];

export function makeTempDir(prefix = "codex-plugin-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// A broker session is recorded under the state root in effect when the command
// ran: the inherited plugin data dir, the default root, or a temp data dir.
function findBrokerSessions(dir) {
  const stateRoot = path.join(dir, "state");
  const nested = fs.existsSync(stateRoot)
    ? fs.readdirSync(stateRoot).map((name) => readJsonOrNull(path.join(stateRoot, name, "broker.json")))
    : [];
  const inherited = loadBrokerSession(dir);
  const previous = process.env.CLAUDE_PLUGIN_DATA;
  delete process.env.CLAUDE_PLUGIN_DATA;
  try {
    return [inherited, loadBrokerSession(dir), ...nested].filter(Boolean);
  } finally {
    if (previous != null) {
      process.env.CLAUDE_PLUGIN_DATA = previous;
    }
  }
}

// Commands under test start a detached broker per workspace. Stop them and
// drop the fixtures once the file's tests are done, so runs leave nothing behind.
after(() => {
  for (const dir of tempDirs) {
    for (const session of findBrokerSessions(dir)) {
      teardownBrokerSession({ ...session, killProcess: terminateProcessTree });
    }
  }
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

export function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { encoding: "utf8", mode: 0o755 });
}

export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    shell: options.shell ?? (process.platform === "win32" && !path.isAbsolute(command)),
    windowsHide: true
  });
}

export function initGitRepo(cwd) {
  run("git", ["init", "-b", "main"], { cwd });
  run("git", ["config", "user.name", "Codex Plugin Tests"], { cwd });
  run("git", ["config", "user.email", "tests@example.com"], { cwd });
  run("git", ["config", "commit.gpgsign", "false"], { cwd });
  run("git", ["config", "tag.gpgsign", "false"], { cwd });
}

// Points the plugin state at a fresh directory for the duration of the callback.
export function withPluginData(callback) {
  const previous = process.env.CLAUDE_PLUGIN_DATA;
  const dataDir = makeTempDir();
  process.env.CLAUDE_PLUGIN_DATA = dataDir;
  const restore = () => {
    if (previous == null) {
      delete process.env.CLAUDE_PLUGIN_DATA;
    } else {
      process.env.CLAUDE_PLUGIN_DATA = previous;
    }
  };
  let result;
  try {
    result = callback(dataDir);
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.finally(restore);
  }
  restore();
  return result;
}
