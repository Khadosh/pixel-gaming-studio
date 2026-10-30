// @vitest-environment node
// El control contra un juego (Khadosh/pixel-gaming-studio#52): un juego de
// mentira dibujado con el PGS de HEAD y con esta carpeta.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expandir, leerArgs } from "./control_cliente.mjs";

const SCRIPT = path.join(__dirname, "control_cliente.mjs");
const PGS = path.resolve(__dirname, "..");

let raices: string[] = [];
afterEach(() => {
	for (const r of raices) fs.rmSync(r, { recursive: true, force: true });
	raices = [];
});

function juego() {
	const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "juego52-")));
	raices.push(raiz);
	fs.mkdirSync(path.join(raiz, "recetas"));
	fs.writeFileSync(path.join(raiz, "recetas", "punto.receta.json"), JSON.stringify({
		steps: [
			{ command: "new", path: "art/punto.pss.json", width: 4, height: 4 },
			{ command: "draw", path: "art/punto.pss.json", frame: 0, ops: [{ op: "pixel", x: 1, y: 1, color: "#aa3366" }] },
			{ command: "render", path: "art/punto.pss.json", out: "art/punto.png" },
		],
	}));
	return raiz;
}

function control(...args: string[]) {
	const lamina = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lamina52-")), "l.png");
	raices.push(path.dirname(lamina));
	const r = spawnSync("node", [SCRIPT, ...args, "--rama", PGS, "--base", "HEAD", "--lamina", lamina], { encoding: "utf8", cwd: os.tmpdir() });
	const out = r.stdout + r.stderr;
	const dir = /logs(?: y lámina)?: (.+)$/m.exec(out)?.[1];
	if (dir) raices.push(dir);
	return { code: r.status, out, lamina };
}

describe("control_cliente", () => {
	it("lee sus argumentos y expande las recetas relativas al juego", () => {
		expect(leerArgs(["j", "--receta", "a", "--receta", "b", "--only", "x", "--tope", "9", "--dejar"]))
			.toMatchObject({ juego: "j", recetas: ["a", "b"], only: ["x"], tope: 9, dejar: true });
		const j = juego();
		expect(expandir(j, "recetas/*.receta.json")).toEqual(["recetas/punto.receta.json"]);
		expect(expandir(j, "otra/*.json")).toEqual([]);
	});

	it("las recetas con el mismo motor: nada cambió, sale 0 y no deja copias", () => {
		const r = control(juego(), "--receta", "recetas/*.receta.json");
		expect(r.out).toContain("ningún dibujo cambió");
		expect(r.code).toBe(0);
		const dir = /logs: (.+)$/m.exec(r.out)![1];
		expect(fs.readdirSync(dir).sort()).toEqual(["antes.log", "despues.log"]);
		// Y dibujó de verdad: un control que no dibuja nada da «nada cambió» siempre.
		for (const lado of ["antes", "despues"]) expect(fs.readFileSync(path.join(dir, `${lado}.log`), "utf8")).toMatch(/render.*punto\.png/);
	});

	it("un comando que dibuja distinto de cada lado: lo lista y sale 1", () => {
		// Cada lado escribe con qué PGS corrió: distinto por construcción.
		const r = control(juego(), "--comando", "mkdir -p art && echo \"$PGS\" > art/quien.txt && command -v pgs > art/cual.txt");
		expect(r.code).toBe(1);
		expect(r.out).toContain("art/quien.txt: −1 +1 lines");
		expect(r.out).toContain("art/cual.txt: −1 +1 lines");
		expect(r.out).toContain("CAMBIARON DIBUJOS");
	});

	it("un lado falla y el otro no: sale 2, el control no vale", () => {
		const r = control(juego(), "--comando", "case \"$PGS\" in *pgs-base*) exit 1;; esac");
		expect(r.code).toBe(2);
		expect(r.out).toContain("un lado falló y el otro no");
	});

	it("sin qué dibujar, o con una receta que no está, no arranca", () => {
		expect(control(juego()).code).toBe(2);
		const r = control(juego(), "--receta", "recetas/no.json");
		expect(r.code).toBe(2);
		expect(r.out).toContain("no hay receta recetas/no.json");
	});
});
