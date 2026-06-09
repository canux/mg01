# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Project status: greenfield

**This repository is currently empty of source code.** As of this writing it contains only:

- `README.md` — one line: the project is `mg01`, a "mobilegame".
- `.gitignore` — ignores compiled C/C++ artifacts (`*.o`, `*.a`, `*.lib`, `*.so`, `*.dll`, `*.dylib`, `*.exe`, `*.out`, `*.app`).
- A single `Initial commit` in the history.

There is no build system, no dependency manifest, no test suite, and no application code yet. Do **not** describe or assume a structure that isn't here — the sections below are about what's known and how to proceed, not a map of existing files.

## What the signals tell us

Two technical hints exist, and they don't fully agree:

- **A Unity → WebGL build workflow.** GitHub Actions has a registered workflow named `Build WebGL (Unity)` (path `.github/workflows/build-webgl.yml`). **Note:** the file is not actually present in the repository tree on `master` — it's an orphaned Actions registration (likely added then removed), so nothing runs on PRs today and the head commit has zero check runs. Despite being orphaned, it's the strongest indication of intent: a **Unity** game (C#) targeting **WebGL**, consistent with the "mobilegame" description.
- **A C/C++ `.gitignore`.** The committed `.gitignore` targets a compiled C/C++ toolchain (`*.o`, `*.a`, `*.so`, `*.dll`, `*.exe`, etc.). This does **not** match a Unity/C# project, which has a very different ignore profile (`Library/`, `Temp/`, `Obj/`, `Build/`, `*.csproj`, etc.). Treat this `.gitignore` as a generic/leftover starter, not evidence of a C/C++ project.

Net: the most likely intent is a **Unity mobile game built to WebGL**, but nothing is committed to confirm it. Treat this as a hint, not a commitment — confirm the engine, language, and target platforms with the user before scaffolding, and replace the `.gitignore` with a Unity-appropriate one if that direction is confirmed.

## Before you build anything

Because the project is unscaffolded, the highest-value first step is usually to **clarify direction rather than guess**. Good things to confirm with the user:

- Engine: is this the **Unity** project the orphaned WebGL workflow implies? If so, which Unity version?
- Target platform(s): WebGL (per the workflow), Android, iOS, or some combination?
- Language and toolchain: Unity implies C#; the C/C++ `.gitignore` conflicts with that and should be replaced.
- CI: should the `Build WebGL (Unity)` workflow file be (re)added so the registered workflow actually runs?

Once a direction is set, update this file to document the real structure, build/test commands, and conventions as they are created.

## Development workflow

### Branching

- All work for AI-assisted sessions happens on a designated feature branch (currently `claude/claude-md-docs-dexjij`); never push to `master` without explicit permission.
- Create feature branches off `master`.

### Git conventions

- Commit with clear, descriptive messages; keep commits focused.
- Push with `git push -u origin <branch-name>`.
- After pushing, open a **draft** pull request if one does not already exist.
- Do not commit build artifacts — the `.gitignore` already covers common native outputs. Extend it when a build system is added (e.g. `build/`, `bin/`, IDE files, dependency caches).

### When code is added

As soon as a build system and source layout exist, this file should be updated to include:

- The exact commands to build, run, and test (the most useful thing an assistant can have).
- The directory layout and where the entry point lives.
- Any code-style or naming conventions adopted.
- How to run a single test, once a test framework is in place.

## Conventions for editing this file

Keep CLAUDE.md **honest and current**. If you scaffold the project, replace the "greenfield" framing with the actual structure and commands in the same change. Don't leave aspirational documentation describing things that don't exist.
