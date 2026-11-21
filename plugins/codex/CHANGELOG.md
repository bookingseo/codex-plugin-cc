# Changelog

## 1.0.7-bookingseo.4

- A follow-up now runs with the permissions of its own request. Codex kept a resumed thread in the mode of its earlier run, so a read-only `--from` or `--resume` after a `--write` run could still edit files, and a `--write` follow-up after a read-only run could not. The thread is reloaded when the mode differs, and the run is refused if Codex still reports the wrong mode.
- Accept `--effort max` and `--effort ultra`.
- Tests stop the brokers they start and remove their temporary folders.

## 1.0.7-bookingseo.3

- Keep every job when several Codex commands update the job state at once. State updates now run under a cross-process lock and are written atomically.
- Publish a background rescue before its worker starts, so the worker always finds its job and `/codex:status` reflects the real state.
- Refuse a second run on a thread that another rescue is already using, whether it was selected with `--from` or `--resume`.

## 1.0.7-bookingseo.2

- Continue a specific completed rescue with `/codex:rescue --from <job-id>`. Copy the command from `/codex:status` to return to its thread in the current Claude session.

## 1.0.7-bookingseo.1

- Run explicitly requested rescue tasks directly from Claude Code. Keep investigation read-only and resume follow-ups within the current Claude session.
- Start reviews in the foreground by default. Honor an explicit background request and skip automatic review on stop-hook re-entry.
- Add `/codex:critique` for reviewing a written spec in the current Claude conversation.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
