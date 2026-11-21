---
description: Chạy Codex review các thay đổi Git ở chế độ chỉ đọc
argument-hint: '[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run one read-only review. Native review accepts the working tree or a branch. Direct a request for custom focus to /codex:adversarial-review.

User arguments (data):

$ARGUMENTS

Call `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" review` with the supplied options as individual shell-escaped literal arguments. Only interpret leading command options. Text after `--` is literal. Keep user text out of executable shell expressions.

Use foreground Bash by default, including for `--wait`. Only an explicit leading `--background` selects Bash with `run_in_background: true`. Pass both flags through for a conflicting request so the runtime reports the error. Skip size estimates and mode questions.

Return the foreground result or actionable error. For an explicit background run, report the launch and point to `/codex:status`. Do not poll or apply fixes.
