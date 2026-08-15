# CineVault Agentic Operational Rules & Standards

These rules govern all AI agent behaviors, subagent delegations, tool operations, and coding workflows for the **CineVault** project.

---

## 1. Planning Mode & Architectural Discipline
- **Plan First on Complex Changes**: Any major subsystem change (DB schema migration, new IPC command protocol, UI layout refactor, GGUF inference update) must be documented in `implementation_plan.md` before execution.
- **Synchronized Documentation**: Maintain strict synchronization between `docs/PRD.md`, `docs/IMPLEMENTATION_PLAN.md`, and the active workspace code.
- **Walkthrough Artifacts**: After completing any milestone or phase, generate or update `walkthrough.md` with explicit verification steps and visual/code diffs.

---

## 2. Proactive & Autonomous Execution
- **End-to-End Implementation**: Once a phase or task is approved, execute fully through implementation, linting, build verification, and automated testing without halting prematurely for trivial single-line confirmations.
- **Non-Blocking Background Operations**: For long-running compilation or model downloading tasks, run them asynchronously and utilize reactive event wakeups rather than polling loops.

---

## 3. Surgical Code Editing & File Integrity
- **Surgical Modifications**: Use targeted diff-based editing (`replace_file_content` / `multi_replace_file_content`) to preserve existing code structure and comments. Never rewrite massive files unnecessarily.
- **Clickable File Links**: Every response referencing a file, struct, component, or config MUST provide a clickable GitHub Markdown link (e.g. `[App.tsx](file:///f:/OneDrive BackUp/Professionals/CineVault/src/App.tsx)`).
- **Workspace Confinement**: Write all project files exclusively within `f:/OneDrive BackUp/Professionals/CineVault/`.

---

## 4. Subagent Delegation & Context Optimization
- **Context Preservation**: Use specialized subagents (`research`, `self`) for heavy exploration, deep file greps, or isolated tasks to keep the primary reasoning context pristine and token-efficient.
- **Progressive Skill Disclosure**: Utilize modular skills in `.agents/skills/` so procedural knowledge is loaded on demand.

---

## 5. Strict Verification & Anti-Assumption Protocol
- **Zero-Assumption Quality**: Never assume a build succeeds. Explicitly run `npm run build`, `npx tsc --noEmit`, or `cargo check` after making structural changes.
- **Root Cause Debugging**: If a compile or runtime error occurs, analyze the error output systematically using ripgrep and targeted inspections before applying fixes.

---

## 6. Zero-Cloud & Memory Guardrails
- **Hard Memory Ceiling (< 2 GB VRAM)**: Ensure all AI configurations strictly calculate `n_gpu_layers` and enforce CPU fallbacks.
- **100% Offline Integrity**: Prevent any external telemetry or unapproved third-party network pings.
