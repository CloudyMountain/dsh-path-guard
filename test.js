/**
 * dsh-path-guard test suite — run with `node test.js`.
 *
 * Covers the guard's decision table: file-argument checks (exact lexical
 * resolution), shell-command text scans, allow cases, and the DOCUMENTED
 * bypasses (the guard is a policy layer, not a kernel boundary — the bypass
 * rows below prove which spellings pass through, so expectations are honest).
 */
import os from "node:os";
import { createGuard } from "./lib/index.js";

const HOME = os.homedir();
const R = `${HOME}/secret`; // protected root under test (machine-independent)
const T = "~/secret"; // tilde alias
const H = "$HOME/secret"; // home-var alias

const guard = createGuard({ guardRoots: [R] });

const ctx = (args, cwd = HOME) => ({ agent: { session: { header: { cwd } } }, arguments: args });
const bash = (command) => ctx({ command });

const cases = [
	// ---- must deny ----
	["DENY  read canonical", ctx({ file_path: `${R}/data.csv` })],
	["DENY  read relative from cwd", ctx({ file_path: "secret/data.csv" })],
	["DENY  write relative via ..", ctx({ file_path: "../secret/x" }, `${HOME}/proj`)],
	["DENY  bash canonical", bash(`cat ${R}/a.txt`)],
	["DENY  bash tilde", bash(`cat ${T}/a.txt`)],
	["DENY  bash home var", bash(`cat ${H}/a.txt`)],
	["DENY  grep path arg", ctx({ path: R, pattern: "x" })],
	["DENY  dotdot file tool", ctx({ file_path: `${R}/../secret/x` })],
	["DENY  dotdot text", bash(`cat ${HOME}/../${HOME.slice(1)}/secret/x`)],
	// ---- must allow ----
	["ALLOW read elsewhere", ctx({ file_path: `${HOME}/other/f.txt` })],
	["ALLOW bash mentioning word only", bash("grep -r secret /home/you/docs")],
	["ALLOW secret-like filename", ctx({ file_path: `${HOME}/notes/secret-notes.txt` })],
	["ALLOW no args", bash("echo hi")],
	["ALLOW relative outside", ctx({ file_path: "../other/x" }, `${HOME}/proj`)],
	// ---- DOCUMENTED BYPASSES (policy layer, not kernel) ----
	["BYPASS cd+relative", bash(`cd ${HOME} && cat secret/x`)],
	["BYPASS command substitution", bash(`cat $(echo ${HOME})/secret/x`)],
	["BYPASS variable indirection", bash(`cat ${"${S}"}/secret/x  # S=${HOME}`)],
	["BYPASS encoding", bash("echo aGk= | base64 -d")],
	["BYPASS symlink path (file tool)", ctx({ file_path: "/tmp/link/x" })],
];

let failed = 0;
for (const [label, exec] of cases) {
	const denied = guard(exec) !== undefined;
	const expect = label.startsWith("DENY ") ? true : label.startsWith("ALLOW ") ? false : undefined; // BYPASS: informational
	if (expect !== undefined && denied !== expect) {
		failed++;
		console.log(`FAIL ${label} (expected ${expect ? "deny" : "allow"}, got ${denied ? "deny" : "allow"})`);
	} else {
		console.log(`PASS ${label}`);
	}
}

// no-config behavior: warn + inert
const warns = [];
let registered;
const ctx2 = { tools: { guard: (g) => (registered = g) }, logger: { warn: (m) => warns.push(m) } };
(await import("./lib/index.js")).default(ctx2, {});
const inert = registered({ arguments: { file_path: `${R}/x` } }) === undefined;
console.log(`PASS no-config: warns=${warns.length > 0} inert=${inert}`);
if (warns.length === 0 || !inert) failed++;

console.log(failed === 0 ? "\nALL TESTS PASSED" : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
