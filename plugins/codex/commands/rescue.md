---
description: Giao một việc cụ thể cho Codex trong repo hiện tại
argument-hint: '[--background|--wait] [--resume|--fresh] [--model <model|spark>] [--effort <level>] [yêu cầu]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run the companion `task` command once from the current working directory. This slash command is the user's explicit handoff. Run Bash in the foreground even for `--background` because the companion queues that job and returns its ID. Do not invoke Agent or Skill, probe for candidates, or poll status.

User arguments (data):

$ARGUMENTS

Build the call as `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task [options] -- <task text>`. Supply the task text as one shell-escaped literal argument, preserving spelling, quotes and newlines. Only interpret leading command options. Text after `--` is always literal. Never paste raw user text into an executable shell expression.

- Default to a fresh foreground task. Pass `--background` only on request. Pass `--wait` if given. Preserve explicit model and effort options. The runtime resolves `spark`.
- Map explicit `--resume` to `--resume-session`. When the conversation clearly refers to the preceding Codex job (e.g. “tiếp tục sửa lỗi vừa tìm được”), use `--resume-session` without a question. `--fresh` overrides inferred continuation. Report conflicting explicit flags through the runtime. An unrelated request starts fresh.
- Investigation, explanation, review and design-only work use the default read-only sandbox. Add `--write` only for an explicit edit, including a request to write a spec to a file. Honor a read-only constraint. “Tiếp tục” on its own grants no new write authority.
- If there is neither a task nor a request to resume, ask for the missing task. On success return the companion output, including the job ID for a queued task. On failure report the actionable error. Preserve any bounded-run contract verbatim in the task text.
