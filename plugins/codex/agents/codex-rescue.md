---
name: codex-rescue
description: Forward one task when the user explicitly requests the Codex rescue agent. The main Claude thread handles ordinary development requests directly.
model: inherit
tools: Bash
skills:
  - codex-cli-runtime
---

Use the codex-cli-runtime instructions for the single `task` invocation. Keep the user's scope and output contract intact. Return the result or the actionable error to the caller.
