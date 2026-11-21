import { randomBytes } from "node:crypto";
import fs from "node:fs";
import process from "node:process";

// Kept well under the 5s SessionEnd hook timeout so a blocked hook still reports.
const LOCK_WAIT_MS = 3000;
const LOCK_POLL_MS = 15;

const heldLocks = new Set();

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readOwner(lockFile) {
  try {
    return fs.readFileSync(lockFile, "utf8");
  } catch {
    return null;
  }
}

function ownerIsDead(owner) {
  const pid = Number.parseInt(owner ?? "", 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

function tryAcquire(lockFile, token) {
  try {
    fs.writeFileSync(lockFile, token, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

function removeIfOwnedBy(lockFile, owner) {
  if (readOwner(lockFile) !== owner) {
    return;
  }
  try {
    fs.unlinkSync(lockFile);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

// Runs a synchronous callback while holding an exclusive cross-process lock.
// A lock is only taken over when its owner process no longer exists; a waiter
// that times out fails instead of proceeding without the lock.
export function withFileLock(lockFile, callback) {
  if (heldLocks.has(lockFile)) {
    return callback();
  }

  const token = `${process.pid}-${randomBytes(6).toString("hex")}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!tryAcquire(lockFile, token)) {
    const owner = readOwner(lockFile);
    if (owner && ownerIsDead(owner)) {
      removeIfOwnedBy(lockFile, owner);
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Codex job state is busy (lock ${lockFile} held by ${owner || "an unknown process"}). ` +
          "Retry shortly. If no Codex command is running, delete that lock file."
      );
    }
    sleepSync(LOCK_POLL_MS);
  }

  heldLocks.add(lockFile);
  try {
    return callback();
  } finally {
    heldLocks.delete(lockFile);
    removeIfOwnedBy(lockFile, token);
  }
}

// Readers never observe a partially written file: the content lands under a
// temporary name and is renamed into place.
export function writeFileAtomic(filePath, content) {
  const tempFile = `${filePath}.${process.pid}-${randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tempFile, content, "utf8");
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    fs.rmSync(tempFile, { force: true });
    throw error;
  }
}
