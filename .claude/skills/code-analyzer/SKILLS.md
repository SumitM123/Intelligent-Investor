---
name: code-analyzer
description: Runs a full three-stage quality pass (QC Enforcer → Code Reviewer → Test Automator) on recently edited files. Invoke manually with /code-analyzer only.
disable-model-invocation: true
---

# Code Analyzer — Automated Review Workflow

Trigger a full three-stage quality pass on recently edited files.

## Step 1 — Identify target files

Extract the list of files that were recently edited from the current conversation context (tool call history, user messages, or any explicit file list the user provided). If the user named specific files, use those. If nothing is explicit, use every file touched in this session.

Announce the file list to the user before proceeding.

## Step 2 — QC Enforcer (correctness, security, edge cases)

Spawn the `qc-enforcer` subagent. Pass it:
- The list of target files
- A brief description of what the code is supposed to do (from the task context in this conversation)

The qc-enforcer checks whether the implementation is correct for the task, secure, and handles edge cases. It is adversarial — it will find problems. Present its full findings to the user.

**Do not proceed to Step 3 until the qc-enforcer report is complete.**

## Step 3 — Code Reviewer (holistic, zero-assumption review)

Spawn the `code-reviewer` subagent. Pass it:
- The same list of target files
- The qc-enforcer findings from Step 2 (so it knows what has already been flagged and can focus on what was missed)

The code-reviewer starts with zero prior context and re-reads every file independently. It will catch architectural issues, pattern violations, and anything the qc-enforcer missed because it was task-scoped. Present its full findings to the user.

**Do not proceed to Step 4 until the code-reviewer report is complete.**

## Step 4 — Test Automator (write tests against reviewed code)

Spawn the `test-automator` subagent. Pass it:
- The list of target files
- A description of the feature or module being tested
- Any specific test cases the user has requested in this conversation
- A summary of the findings from Steps 2 and 3 so the test-automator knows which edge cases and failure modes were identified and must be covered by tests

The test-automator writes complete, runnable tests — not stubs. Present the full test output to the user.

## Step 5 — Final summary

After all three agents have reported, produce a single consolidated summary:

1. **Blockers** — Critical and High findings that must be resolved before this code ships (from qc-enforcer and code-reviewer combined, deduplicated)
2. **Improvements** — Medium and Low findings, ranked by impact
3. **Test coverage** — what the test-automator wrote and what edge cases are now covered
4. **Verdict** — one sentence: safe to ship, needs fixes, or has blockers

---

## Ordering rationale

qc-enforcer → code-reviewer → test-automator is the correct order because:
- Tests written against unreviewed code must be rewritten after bugs are fixed — waste avoided by reviewing first
- The code-reviewer's fresh-eyes pass catches what task-scoped QC misses
- The test-automator locks in behavior last, after both reviewers confirm the behavior is correct
