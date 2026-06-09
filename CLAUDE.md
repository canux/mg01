# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Project status: greenfield

**This repository is currently empty of source code.** As of this writing it contains only:

- `README.md` — one line: the project is `mg01`, a "mobilegame".
- `.gitignore` — ignores compiled C/C++ artifacts (`*.o`, `*.a`, `*.lib`, `*.so`, `*.dll`, `*.dylib`, `*.exe`, `*.out`, `*.app`).
- A single `Initial commit` in the history.

There is no build system, no dependency manifest, no test suite, and no application code yet. Do **not** describe or assume a structure that isn't here — the sections below are about what's known and how to proceed, not a map of existing files.

## What the signals tell us

The only technical hint in the repo is the `.gitignore`, which targets a **compiled, C/C++-family toolchain** (object files, static/shared libraries, and native executables for Windows, Linux, and macOS). Combined with the "mobilegame" description, the likely intent is a native or cross-platform mobile game rather than a web/JS project. Treat this as a hint, not a commitment — confirm the intended language, engine, and target platforms with the user before scaffolding.

## Before you build anything

Because the project is unscaffolded, the highest-value first step is usually to **clarify direction rather than guess**. Good things to confirm with the user:

- Target platform(s): Android, iOS, or both? Native or via an engine?
- Engine/framework: a game engine (e.g. a C++ engine), a cross-platform toolkit, or hand-rolled?
- Language and toolchain, since the `.gitignore` only weakly implies C/C++.
- Build system (CMake, Make, Gradle, Xcode, etc.) — none is chosen yet.

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
