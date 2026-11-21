---
name: codex-cli-runtime
description: Internal contract for the explicitly selected Codex rescue agent
user-invocable: false
---

Invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task [options] -- <task text>` once. Pass the task text as a single shell-escaped literal argument. Preserve the request and its output contract. Do not delegate recursively.

Run in the foreground by default. Only an explicit request sets `--background`, `--model` or `--effort`. The companion handles background jobs itself. Use its default read-only mode for investigation or design. Add `--write` only for requested edits. Use `--resume-session` for an explicit resume or a clear follow-up within the current Claude session. An explicit `--fresh` starts a new thread. Report the result, job ID or error from the helper.

Pass `--from <job-id>` through unchanged to continue the thread of that specific completed rescue. It selects the thread for this run, including a background run. Only infer `--resume-session` when the caller supplied no routing option.
