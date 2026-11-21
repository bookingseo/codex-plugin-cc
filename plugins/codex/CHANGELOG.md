# Changelog

## 1.0.7-bookingseo.1

- Run explicitly requested rescue tasks directly from Claude Code. Keep investigation read-only and resume follow-ups within the current Claude session.
- Start reviews in the foreground by default. Honor an explicit background request and skip automatic review on stop-hook re-entry.
- Add `/codex:critique` for reviewing a written spec in the current Claude conversation.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
