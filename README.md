# dsh-path-guard

> The path-level deny rule that [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) never had: deny agent tool access to the directories **you** configure — **reads and writes alike**, for file tools and shell commands. The harness equivalent of Claude Code's `permissions.deny` / PreToolUse hooks.

[中文文档](README.zh.md)

## Why

dsh's built-in permission vocabulary is only *sandbox mode* (`read-only` / `workspace-write` / `danger-full-access`) plus an approval policy. There is **no path-level deny rule**: any file inside the workspace is readable, and the sandbox fence only gates writes. If you keep trading data, keys, or private documents next to your work, there was no way to tell the agent "never touch this directory." This plugin is that way.

## Features

- ✅ **Denies reads AND writes** — the sandbox cannot stop reads; this guard does, at the tool-execution gate;
- ✅ **Your paths, your call**: configure `guardRoots` in the plugin row — an array of absolute paths, multiple allowed, Chinese/any text fine;
- ✅ **Both surfaces covered**: file tools (`read`/`write`/`edit`/`grep`/`glob`/`str_replace_editor`/`read_image`…) matched on `file_path`/`path`/`directory` arguments (exact, resolved against the session cwd); shell commands (`bash`/`terminal`…) matched by text scan (canonical path, `~/`, `$HOME` spellings);
- ✅ **Monotonic & global**: later `tools/pre-execute` listeners cannot re-allow a denial; applies to subagents and `run_code` sub-dispatches;
- ✅ **Fail-loud**: no `guardRoots` configured → the plugin is inert and prints a warning at load. No false safety;
- ✅ **Zero dependencies**, plain `ctx.tools.guard()` — loads anywhere.

## Installation

```bash
# 1. Get the plugin
git clone https://github.com/CloudyMountain/dsh-path-guard
cd dsh-path-guard

# 2. Install with your protected path(s)
./install.sh /home/you/vault                 # one path
./install.sh /home/you/vault /home/you/keys  # multiple paths
./install.sh                                 # interactive prompt

# 3. Restart dsh web (systemd user service example)
systemctl --user restart dsh-web

# 4. New session → the paths are now off-limits to the agent
```

Manual install: `ln -s "$PWD" ~/.dsh/profiles/node_modules/path-guard`, then append to `~/.dsh/profiles/web/cordis.patch.yml` (and headless):

```yaml
- insert:
    - id: path-guard
      name: path-guard
      config:
        guardRoots:
          - /home/you/vault
          - /home/you/.secrets
```

## What a denial looks like

The agent's tool call fails before execution with:

```
path-guard: access to "/home/you/vault/x.csv" is denied — the protected root /home/you/vault is off-limits to the agent (reads and writes)
```

## Threat model — read this

**This is a policy guard over trusted code, not a kernel boundary.** It stops accidental touches, "just following the instructions" mistakes, and routine overreach. It does **not** stop a deliberately adversarial model:

- shell text scan is heuristic: `cd` + relative paths, command substitution, variable indirection, encoding, and symlink paths pass through (the `test.js` BYPASS rows document each one);
- the file-argument check is exact *lexically* — a symlink elsewhere pointing into a protected root is not caught;
- denial happens in-process (TOCTOU race between check and syscall is narrowed but not eliminated).

If you need kernel-grade isolation, run dsh as a separate user / in a container, or mount the directory read-only. The guard's job is the 99% case: **the agent never wanders in by accident.**

## Configuration

| Key | Type | Default | Notes |
|---|---|---|---|
| `guardRoots` | `string[]` | `[]` (inert + warning) | Absolute paths to protect. Relative paths are resolved against the plugin's cwd — use absolute. |

## Development

```bash
node test.js   # decision table + documented bypasses + no-config behavior
```

## Uninstall

```bash
rm ~/.dsh/profiles/node_modules/path-guard
# remove the path-guard insert block from both cordis.patch.yml files
```

## License

MIT
