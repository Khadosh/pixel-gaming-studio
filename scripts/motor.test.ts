// @vitest-environment node
// Juntar el motor y ver lo suelto (Khadosh/pixel-gaming-studio#50): los dos
// scripts sobre un repo de mentira con sus carpetas de trabajo, como las de
// /private/tmp.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { juntar, numero, partir, propias, ultimoNumero } from "./changelog_entrada.mjs";

const SCRIPTS = path.resolve(__dirname);
const ENV = {
	...process.env,
	GIT_AUTHOR_NAME: "t",
	GIT_AUTHOR_EMAIL: "t@t",
	GIT_COMMITTER_NAME: "t",
	GIT_COMMITTER_EMAIL: "t@t",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};
const HOY = new Date().toISOString().slice(0, 10);

const CABEZA = "# CHANGELOG\n\nLa historia.\n\n---\n\n";
const entrada = (fecha: string, n: string | number, que: string) => `## ${fecha} (${n})\n\n- ${que}\n`;
const changelog = (...entradas: string[]) => CABEZA + entradas.join("\n");

let raices: string[] = [];
afterEach(() => {
	for (const r of raices) fs.rmSync(r, { recursive: true, force: true });
	raices = [];
});

function git(dir: string, ...args: string[]) {
	return execFileSync("git", ["-C", dir, ...args], { env: ENV, encoding: "utf8" }).trim();
}
function correr(script: string, args: string[], cwd: string) {
	const r = spawnSync("bash", [path.isAbsolute(script) ? script : path.join(SCRIPTS, script), ...args], { cwd, env: ENV, encoding: "utf8" });
	return { code: r.status, out: r.stdout + r.stderr };
}
// Desde otra carpeta, como lo corre un agente.
const juntarMotor = (repo: string, ...args: string[]) => correr("juntar_motor.sh", args, path.dirname(repo));
const suelto = (repo: string, ...args: string[]) => correr("motor_suelto.sh", ["-C", repo, ...args], path.dirname(repo));

// Un PGS de mentira: main con dos entradas y la 2 arriba.
function repo() {
	const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pgs50-")));
	raices.push(raiz);
	const main = path.join(raiz, "pgs");
	fs.mkdirSync(main);
	git(main, "init", "-q", "-b", "main");
	fs.writeFileSync(path.join(main, ".gitignore"), "node_modules\n");
	fs.writeFileSync(path.join(main, "CHANGELOG.md"), changelog(entrada("2026-10-24", 2, "lo segundo"), entrada("2026-10-23", 1, "lo primero")));
	fs.writeFileSync(path.join(main, "motor.ts"), "uno\n");
	git(main, "add", "-A");
	git(main, "commit", "-q", "-m", "inicio");
	return { raiz, main };
}

// Una carpeta de trabajo con su rama, su cambio y su entrada (escrita con el número que le parece).
function trabajo(r: { raiz: string; main: string }, nombre: string, { archivo = `${nombre}.ts`, n = 3, commitear = true } = {}) {
	const dir = path.join(r.raiz, `pgs-traba-${nombre}`);
	git(r.main, "worktree", "add", "-q", "-b", `motor/${nombre}`, dir, "main");
	fs.symlinkSync(path.join(r.main, "node_modules-falso"), path.join(dir, "node_modules"));
	fs.writeFileSync(path.join(dir, archivo), `${nombre}\n`);
	const cl = fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8");
	fs.writeFileSync(path.join(dir, "CHANGELOG.md"), cl.replace("## 2026-10-24", `${entrada("2026-10-24", n, nombre)}\n## 2026-10-24`));
	if (commitear) {
		git(dir, "add", "-A");
		git(dir, "commit", "-q", "-m", `feat(motor): ${nombre} (${n}, Khadosh/pixel-gaming-studio#9)`);
	}
	return dir;
}

describe("changelog_entrada", () => {
	const base = changelog(entrada("2026-10-24", 2, "b"), entrada("2026-10-23", 1, "a"));
	const main = changelog(entrada("2026-10-25", 3, "la otra"), entrada("2026-10-24", 2, "b"), entrada("2026-10-23", 1, "a"));
	const rama = changelog(entrada("2026-10-25", 3, "la mía"), entrada("2026-10-24", 2, "b"), entrada("2026-10-23", 1, "a"));

	it("parte y vuelve a armar el CHANGELOG real sin cambiar un byte", () => {
		const real = fs.readFileSync(path.join(SCRIPTS, "..", "CHANGELOG.md"), "utf8");
		const p = partir(real);
		expect(`${p.cabeza}\n${p.entradas.map((e) => e.texto).join("\n")}`).toBe(real);
		expect(ultimoNumero(real)).toBeGreaterThan(170);
	});

	it("la entrada de la rama va arriba de la de main con el número que sigue", () => {
		expect(numero({ main, base, rama })).toBe(4);
		expect(juntar({ main, base, rama, fecha: "2026-10-26" })).toBe(
			changelog(entrada("2026-10-26", 4, "la mía"), entrada("2026-10-25", 3, "la otra"), entrada("2026-10-24", 2, "b"), entrada("2026-10-23", 1, "a")),
		);
	});

	it("acepta «(N)» y varias entradas, numeradas de abajo arriba", () => {
		const dos = changelog(entrada("x", "N", "segunda"), entrada("x", "N", "primera"), entrada("2026-10-24", 2, "b"), entrada("2026-10-23", 1, "a"));
		expect(propias({ main: base, base, rama: dos }).map((e) => e.titulo)).toEqual(["## x (N)", "## x (N)"]);
		expect(juntar({ main: base, base, rama: dos, fecha: "d" })).toBe(
			changelog(entrada("d", 4, "segunda"), entrada("d", 3, "primera"), entrada("2026-10-24", 2, "b"), entrada("2026-10-23", 1, "a")),
		);
	});

	it("una rama sin entrada, o que cambia una vieja, se dice", () => {
		expect(() => numero({ main: base, base, rama: base })).toThrow(/no tiene entrada/);
		const vieja = changelog(entrada("2026-10-25", 3, "la mía"), entrada("2026-10-24", 2, "b cambiada"), entrada("2026-10-23", 1, "a"));
		expect(() => juntar({ main, base, rama: vieja, fecha: "d" })).toThrow(/entrada vieja.*2026-10-24/);
	});
});

describe("juntar_motor.sh", () => {
	it("dos ramas que salieron del mismo main y escriben las dos la 3: quedan 3 y 4, sin choque, y las carpetas se borran", () => {
		const r = repo();
		const a = trabajo(r, "aa");
		const b = trabajo(r, "bb");
		const ja = juntarMotor(r.main, a);
		expect(ja.out).toContain("la entrada del CHANGELOG es la 3");
		expect(ja.code).toBe(0);
		const jb = juntarMotor(r.main, b);
		expect(jb.code).toBe(0);
		expect(jb.out).toContain("main se había movido");
		expect(jb.out).toContain("la entrada del CHANGELOG es la 4");
		const cl = fs.readFileSync(path.join(r.main, "CHANGELOG.md"), "utf8");
		expect(cl).toBe(changelog(entrada(HOY, 4, "bb"), entrada(HOY, 3, "aa"), entrada("2026-10-24", 2, "lo segundo"), entrada("2026-10-23", 1, "lo primero")));
		expect(git(r.main, "log", "--first-parent", "--format=%s", "-2").split("\n")).toEqual([
			"Merge motor/bb: bb (4, Khadosh/pixel-gaming-studio#9)",
			"Merge motor/aa: aa (3, Khadosh/pixel-gaming-studio#9)",
		]);
		expect(fs.existsSync(path.join(r.main, "aa.ts")) && fs.existsSync(path.join(r.main, "bb.ts"))).toBe(true);
		expect(fs.existsSync(a) || fs.existsSync(b)).toBe(false);
		expect(git(r.main, "branch", "--format=%(refname:short)")).toBe("main");
		expect(git(r.main, "status", "--porcelain")).toBe("");
		expect(suelto(r.main).code).toBe(0);
	});

	it("corrido por un camino con enlaces (/tmp es /private/tmp) numera igual, y si el número no sale no toca nada", () => {
		const r = repo();
		const a = trabajo(r, "aa");
		const enlace = path.join(r.raiz, "scripts-enlace");
		fs.symlinkSync(SCRIPTS, enlace);
		const j = correr(path.join(enlace, "juntar_motor.sh"), [a], r.raiz);
		expect(j.out).toContain("la entrada del CHANGELOG es la 3");
		expect(fs.readFileSync(path.join(r.main, "CHANGELOG.md"), "utf8")).toContain(`## ${HOY} (3)\n\n- aa`);

		const b = trabajo(r, "bb");
		const mudo = path.join(r.raiz, "mudo");
		fs.mkdirSync(mudo);
		fs.copyFileSync(path.join(SCRIPTS, "juntar_motor.sh"), path.join(mudo, "juntar_motor.sh"));
		fs.writeFileSync(path.join(mudo, "changelog_entrada.mjs"), "");
		const antes = git(b, "rev-parse", "HEAD");
		const m = correr(path.join(mudo, "juntar_motor.sh"), [b], r.raiz);
		expect(m.code).toBe(1);
		expect(m.out).toContain("no dio un número");
		expect(git(b, "rev-parse", "HEAD")).toBe(antes);
		expect(fs.readFileSync(path.join(b, "CHANGELOG.md"), "utf8")).toContain("- bb");
	});

	it("lo sin commitear: sin -m frena y lo lista; con -m lo commitea con {N} en su número", () => {
		const r = repo();
		const a = trabajo(r, "aa", { commitear: false });
		const sin = juntarMotor(r.main, a);
		expect(sin.code).toBe(1);
		expect(sin.out).toMatch(/sin commitear.*-m/);
		expect(sin.out).toContain("aa.ts");
		expect(git(r.main, "log", "--format=%s")).toBe("inicio");
		const con = juntarMotor(r.main, "-m", "feat(motor): lo de aa ({N}, Khadosh/pixel-gaming-studio#50)", "--dejar", a);
		expect(con.code).toBe(0);
		expect(git(a, "log", "--no-merges", "--format=%s", "-1")).toBe("feat(motor): lo de aa (3, Khadosh/pixel-gaming-studio#50)");
		expect(git(r.main, "log", "-1", "--format=%s")).toBe("Merge motor/aa: lo de aa (3, Khadosh/pixel-gaming-studio#50)");
		expect(fs.existsSync(a)).toBe(true);
	});

	it("un choque fuera del CHANGELOG frena y deja main y la rama como estaban", () => {
		const r = repo();
		const a = trabajo(r, "aa", { archivo: "motor.ts" });
		const b = trabajo(r, "bb", { archivo: "motor.ts" });
		expect(juntarMotor(r.main, a).code).toBe(0);
		const antes = git(r.main, "rev-parse", "HEAD");
		const antesB = git(b, "rev-parse", "HEAD");
		const jb = juntarMotor(r.main, b);
		expect(jb.code).toBe(1);
		expect(jb.out).toMatch(/choca en: motor\.ts/);
		expect(git(r.main, "rev-parse", "HEAD")).toBe(antes);
		expect(git(b, "rev-parse", "HEAD")).toBe(antesB);
		expect(git(b, "status", "--porcelain")).toBe("");
	});

	it("no junta encima de una carpeta principal sucia, ni con otro juntando, ni con --probar en rojo", () => {
		const r = repo();
		const a = trabajo(r, "aa");
		fs.writeFileSync(path.join(r.main, "motor.ts"), "a medias\n");
		expect(juntarMotor(r.main, a).out).toMatch(/carpeta principal .* sin commitear/);
		git(r.main, "checkout", "-q", "motor.ts");

		const candado = path.join(r.main, ".git", "juntar_motor.lock");
		fs.mkdirSync(candado);
		expect(juntarMotor(r.main, a).out).toContain("otro está juntando");
		fs.rmdirSync(candado);

		const rojo = juntarMotor(r.main, "--probar", "test -f no-existe.ts", a);
		expect(rojo.code).toBe(1);
		expect(rojo.out).toContain("--probar dio rojo");
		expect(git(r.main, "log", "--format=%s")).toBe("inicio");
		expect(fs.existsSync(candado)).toBe(false);

		expect(juntarMotor(r.main, "--probar", "test -f aa.ts", a).code).toBe(0);
	});
});

describe("motor_suelto.sh", () => {
	it("dice lo sin commitear, lo sin juntar (con carpeta, sin carpeta y HEAD suelto) y lo que sobra; sale con 1", () => {
		const r = repo();
		const sucia = trabajo(r, "sucia", { commitear: false });
		const sinJuntar = trabajo(r, "lista");
		trabajo(r, "hecha");
		expect(juntarMotor(r.main, "--dejar", path.join(r.raiz, "pgs-traba-hecha")).code).toBe(0);
		git(r.main, "branch", "motor/sin-carpeta", "motor/lista");
		const suelta = path.join(r.raiz, "pgs-suelta");
		git(r.main, "worktree", "add", "-q", "--detach", suelta, "motor/lista");

		const s = suelto(r.main);
		expect(s.code).toBe(1);
		expect(s.out).toMatch(new RegExp(`SIN COMMITEAR +${sucia} \\(motor/sucia\\): 2 archivos`));
		expect(s.out).toMatch(new RegExp(`SIN JUNTAR +${sinJuntar} \\(motor/lista\\): 1 commit que main no tiene`));
		expect(s.out).toMatch(new RegExp(`SIN JUNTAR +${suelta} \\(HEAD suelto\\)`));
		expect(s.out).toMatch(/SIN JUNTAR +rama motor\/sin-carpeta \(sin carpeta\)/);
		expect(s.out).toMatch(/SOBRA +.*pgs-traba-hecha \(motor\/hecha\)/);
		expect(s.out).not.toMatch(new RegExp(`${r.main} `));
		expect(s.out).toContain("4 cosas sueltas");
	});

	it("con todo juntado sale con 0, y --limpiar borra sólo lo que sobra", () => {
		const r = repo();
		const hecha = trabajo(r, "hecha");
		expect(juntarMotor(r.main, "--dejar", hecha).code).toBe(0);
		const vieja = path.join(r.raiz, "pgs-vieja");
		git(r.main, "worktree", "add", "-q", "--detach", vieja, "main");

		const s = suelto(r.main);
		expect(s.code).toBe(0);
		expect(s.out).toContain("Nada suelto");
		expect(s.out).toContain("2 carpetas sobran");

		const l = suelto(r.main, "--limpiar");
		expect(l.code).toBe(0);
		expect(fs.existsSync(hecha) || fs.existsSync(vieja)).toBe(false);
		expect(git(r.main, "branch", "--format=%(refname:short)")).toBe("main");
		expect(suelto(r.main).out).not.toContain("sobra");
	});

	it("la carpeta principal sucia también cuenta", () => {
		const r = repo();
		fs.writeFileSync(path.join(r.main, "nuevo.ts"), "x\n");
		const s = suelto(r.main);
		expect(s.code).toBe(1);
		expect(s.out).toMatch(new RegExp(`SIN COMMITEAR +${r.main} \\(main\\): 1 archivo`));
	});
});
