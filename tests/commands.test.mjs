import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "codex");

function read(relativePath) {
  return fs.readFileSync(path.join(PLUGIN_ROOT, relativePath), "utf8");
}

for (const command of ["review", "adversarial-review"]) {
  test(`${command} runs in the foreground unless background is requested`, () => {
    const source = read(`commands/${command}.md`);
    assert.match(source, /^disable-model-invocation: true$/m);
    assert.match(source, /^allowed-tools: Bash\(node:\*\)$/m);
    assert.ok(source.includes(`codex-companion.mjs" ${command}`));
    assert.match(source, /foreground Bash by default/);
    assert.match(source, /Only an explicit leading `--background` selects Bash with `run_in_background: true`/);
    assert.match(source, /read-only review/);
    assert.doesNotMatch(source, /AskUserQuestion|git diff --shortstat/);
  });
}

test("all user commands are exposed and documented", () => {
  const commands = fs.readdirSync(path.join(PLUGIN_ROOT, "commands")).sort();
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.deepEqual(commands, [
    "adversarial-review.md", "cancel.md", "critique.md", "rescue.md",
    "result.md", "review.md", "setup.md", "status.md", "transfer.md"
  ]);
  for (const command of commands) {
    assert.ok(readme.includes("/codex:" + path.basename(command, ".md")));
  }
});

test("rescue hands off once without another Claude agent or a resume probe", () => {
  const source = read("commands/rescue.md");
  assert.match(source, /^disable-model-invocation: true$/m);
  assert.match(source, /^allowed-tools: Bash\(node:\*\)$/m);
  assert.match(source, /codex-companion\.mjs" task/);
  assert.match(source, /--resume-session/);
  assert.match(source, /--from <job-id>/);
  assert.match(source, /--fresh/);
  assert.match(source, /--write.*only for an explicit edit/);
  assert.doesNotMatch(source, /task-resume-candidate|AskUserQuestion|^context: fork/m);
  assert.match(read("agents/codex-rescue.md"), /explicitly requests the Codex rescue agent/);
});

test("spec critique is an explicit read-only command for Claude", () => {
  const source = read("commands/critique.md");
  assert.match(source, /^disable-model-invocation: true$/m);
  assert.match(source, /^allowed-tools: Read, Glob, Grep$/m);
  assert.match(source, /one verdict for the entire milestone/);
  assert.match(source, /verify the original points once/);
});

test("transfer, result, and cancel commands are exposed as deterministic runtime entrypoints", () => {
  const transfer = read("commands/transfer.md");
  const result = read("commands/result.md");
  const cancel = read("commands/cancel.md");
  const resultHandling = read("skills/codex-result-handling/SKILL.md");

  assert.match(transfer, /disable-model-invocation:\s*true/);
  assert.match(transfer, /codex-companion\.mjs" transfer "\$ARGUMENTS"/);
  assert.match(transfer, /codex resume <session-id>/);
  assert.match(result, /disable-model-invocation:\s*true/);
  assert.match(result, /codex-companion\.mjs" result "\$ARGUMENTS"/);
  assert.match(cancel, /disable-model-invocation:\s*true/);
  assert.match(cancel, /codex-companion\.mjs" cancel "\$ARGUMENTS"/);
  assert.match(resultHandling, /do not turn a failed or incomplete Codex run into a Claude-side implementation attempt/i);
  assert.match(resultHandling, /if Codex was never successfully invoked, do not generate a substitute answer at all/i);
});

test("internal docs use task terminology for rescue runs", () => {
  const runtimeSkill = read("skills/codex-cli-runtime/SKILL.md");
  const promptingSkill = read("skills/gpt-5-4-prompting/SKILL.md");
  const promptRecipes = read("skills/gpt-5-4-prompting/references/codex-prompt-recipes.md");

  assert.match(runtimeSkill, /codex-companion\.mjs" task/);
  assert.match(runtimeSkill, /--resume-session/);
  assert.match(promptingSkill, /Use `task` when the task is diagnosis/i);
  assert.match(promptRecipes, /Codex task prompts/i);
  assert.match(promptRecipes, /Use these as starting templates for Codex task prompts/i);
  assert.match(promptRecipes, /## Diagnosis/);
  assert.match(promptRecipes, /## Narrow Fix/);
});

test("hooks keep session-end cleanup and stop gating enabled", () => {
  const source = read("hooks/hooks.json");
  assert.match(source, /SessionStart/);
  assert.match(source, /SessionEnd/);
  assert.match(source, /stop-review-gate-hook\.mjs/);
  assert.match(source, /session-lifecycle-hook\.mjs/);
});

test("setup command can offer Codex install and still points users to codex login", () => {
  const setup = read("commands/setup.md");
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  assert.match(setup, /argument-hint:\s*'\[--enable-review-gate\|--disable-review-gate\]'/);
  assert.match(setup, /AskUserQuestion/);
  assert.match(setup, /npm install -g @openai\/codex/);
  assert.match(setup, /codex-companion\.mjs" setup --json \$ARGUMENTS/);
  assert.match(readme, /!codex login/);
  assert.match(readme, /thiếu CLI, setup có thể đề nghị cài/);
  assert.match(readme, /\/codex:setup --enable-review-gate/);
  assert.match(readme, /\/codex:setup --disable-review-gate/);
});
