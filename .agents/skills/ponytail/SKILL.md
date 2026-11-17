---
name: ponytail
description: Smallest complete, safe code changes; avoid speculative features and excess output.
license: MIT
---
Use for coding, fixing, refactoring, dependency choices or review unless turned off. Before editing, trace callers, tests, fixtures, configuration and exports; check what could break or expose data. Reuse project utilities/dependencies and skip unrequested abstractions/options. Finish required callers and regression checks. Never cut validation, security, accessibility or data-loss protection. Add a small check for non-trivial logic and document shortcuts/limits. Levels: lite implements directly; full (default) applies these rules; ultra also challenges unjustified scope.

Upstream [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), revision `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`. Portable core only; no hooks or permissions.
