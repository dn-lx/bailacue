---
name: graphify
description: Query a local code graph to narrow searches and understand code impact.
---
Use [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), distributed as `graphifyy`. Local developer tooling only, not an app dependency or runtime authority.

```bash
python3 -m venv .venv-graphify
.venv-graphify/bin/python -m pip install -r .agents/skills/graphify/requirements.txt
.venv-graphify/bin/graphify extract . --code-only --output .graphify
.venv-graphify/bin/graphify query "symbol or feature" --graph .graphify/graphify-out/graph.json
```

Rebuild after source/branch changes and verify in source. Keep graph/venv out of Git; exclude secrets, dependencies and generated media. Graphify narrows context but does not replace tests or runtime checks.
