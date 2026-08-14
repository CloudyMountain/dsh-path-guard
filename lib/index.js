/**
 * path-guard — a DeepSeek Harness profile plugin.
 *
 * Registers a monotonic tool guard via `ctx.tools.guard()` so that every
 * model-facing tool call whose arguments reference a protected root is
 * denied BEFORE execution. This is the harness equivalent of Claude Code's
 * PreToolUse hook:
 *
 *   - file tools (read / write / edit / grep / glob / str_replace_editor /
 *     read_image / ...) are matched on their `file_path` / `path` /
 *     `directory` arguments, resolved against the calling session's cwd;
 *   - shell tools (bash / terminal / ...) are matched on their `command` /
 *     `program` / `script` text, scanning for the canonical root and the
 *     `~/root` and `$HOME/root` aliases.
 *
 * Protected roots are configured per deployment through the plugin row's
 * `config.guardRoots` (an array of absolute paths). There is NO default:
 * a plugin loaded without `guardRoots` is inert and prints a loud warning,
 * so a misconfigured install can never lull the user into false safety.
 *
 * The guard is monotonic: later `tools/pre-execute` listeners cannot turn a
 * denial back into permission. It applies to every agent in the tree
 * (subagents included) and to `run_code` sub-dispatches, which traverse the
 * same pipeline.
 *
 * Design notes / limitations:
 *   - The shell scan is a conservative text check (like Claude Code hooks):
 *     it denies canonical spellings and common aliases; a command that
 *     reaches the root through `cd`+relative tricks or symlink paths is not
 *     caught by the text scan. The file-argument checks, by contrast, are
 *     exact. This is a policy guard over trusted code, not a kernel
 *     boundary — for a kernel-tight boundary the host would have to confine
 *     the whole process (separate user / container), which dsh does not do.
 *   - Relative `file_path` values are resolved against
 *     `exec.agent.session.header.cwd`, matching how dsh's fs tools resolve
 *     paths themselves.
 */
import path from "node:path";
import os from "node:os";

/** No default roots: users must configure `guardRoots` explicitly. */
const DEFAULT_GUARD_ROOTS = [];

/** Argument keys that carry a filesystem path. */
const FILE_ARG_KEYS = new Set(["file_path", "path", "directory", "dir"]);

/** Argument keys that carry a shell command / program text. */
const COMMAND_ARG_KEYS = new Set(["command", "program", "script"]);

function canonicalRoots(list) {
	return (list ?? []).map((p) => String(p)).map((p) => path.resolve(p));
}

/** True when `candidate` is `root` itself or a descendant of it. */
function underRoot(candidate, roots) {
	return roots.some((root) => candidate === root || candidate.startsWith(root + path.sep));
}

function resolveCandidate(value, cwd) {
	const base = cwd ?? process.cwd();
	return path.normalize(path.isAbsolute(value) ? value : path.resolve(base, value));
}

/** Text scan for canonical and common alias spellings of the roots. */
function commandMentionsRoot(command, roots) {
	if (roots.some((root) => command.includes(root))) return true;
	const home = os.homedir();
	for (const root of roots) {
		const base = path.basename(root);
		if (path.dirname(root) === home) {
			if (command.includes(`~/${base}`)) return true;
			if (command.includes(`$HOME/${base}`)) return true;
			if (command.includes(`"${base}/`)) return true; // quoted relative form from home
		}
	}
	return false;
}

/**
 * Pure guard factory — exported for direct testing.
 * Returns a ToolGuard `(execution) => string | undefined`.
 */
export function createGuard(config = {}) {
	const roots = canonicalRoots(config.guardRoots ?? DEFAULT_GUARD_ROOTS);
	const reason = (target) =>
		`path-guard: access to "${target}" is denied — the protected root ${roots.join(", ")} is off-limits to the agent (reads and writes)`;
	return (exec) => {
		const args = exec?.arguments ?? {};
		const cwd = exec.agent?.session?.header?.cwd;
		for (const [key, value] of Object.entries(args)) {
			if (typeof value !== "string" || value.length === 0) continue;
			if (FILE_ARG_KEYS.has(key)) {
				if (underRoot(resolveCandidate(value, cwd), roots)) return reason(value);
			} else if (COMMAND_ARG_KEYS.has(key)) {
				if (commandMentionsRoot(value, roots)) return reason(value);
			}
		}
		return undefined;
	};
}

/** Cordis plugin entry: registers the guard on the root context. */
export default function vaultGuard(ctx, config = {}) {
	const roots = canonicalRoots(config.guardRoots ?? DEFAULT_GUARD_ROOTS);
	if (roots.length === 0) {
		const message =
			"path-guard: no guardRoots configured — protection is OFF. " +
			'Add config.guardRoots to the plugin row, e.g. guardRoots: ["/home/you/vault"].';
		try {
			ctx.logger?.warn?.(message);
		} catch {
			console.warn(message);
		}
	}
	const guard = createGuard({ guardRoots: roots });
	ctx.tools.guard(guard);
}

vaultGuard.inject = ["tools"];
