// @vitest-environment node
// El motor en un paquete (de Khadosh/estudio#769): se arma y, copiado lejos del
// repo (sin node_modules ni tsx al lado), contesta, dibuja y sirve MCP.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { empaquetar } from "./empaquetar.mjs";

let raiz = "";
let motor = "";
beforeAll(async () => {
	raiz = fs.mkdtempSync(path.join(os.tmpdir(), "pgs-paquete-"));
	const { tar } = await empaquetar(path.join(raiz, "armado"));
	// Desarmado en otra carpeta, como lo hace el instalador: nada del repo cerca.
	fs.mkdirSync(path.join(raiz, "casa"));
	execFileSync("tar", ["-xzf", tar, "-C", path.join(raiz, "casa")]);
	motor = path.join(raiz, "casa", "pgs-motor");
}, 120_000);
afterAll(() => fs.rmSync(raiz, { recursive: true, force: true }));

const correr = (args: string[], cwd = raiz) =>
	spawnSync(path.join(motor, "bin", "pgs"), args, { cwd, encoding: "utf8", timeout: 60_000 });

describe("el paquete del motor", () => {
	it("trae los lanzadores, el código en un archivo por programa, la licencia y la versión", () => {
		for (const f of ["bin/pgs", "bin/pgs-mcp", "lib/cli.mjs", "lib/mcp.mjs", "LICENSE", "VERSION"]) {
			expect(fs.existsSync(path.join(motor, f)), f).toBe(true);
		}
		expect(fs.existsSync(path.join(motor, "node_modules"))).toBe(false);
	});

	it("no importa nada de afuera: sólo lo que trae Node", () => {
		for (const f of ["cli.mjs", "mcp.mjs"]) {
			const codigo = fs.readFileSync(path.join(motor, "lib", f), "utf8");
			const de = [...codigo.matchAll(/^import\s.*?from\s+["']([^"']+)["']/gm)].map(m => m[1]);
			expect(de.filter(d => !d.startsWith("node:")), f).toEqual([]);
		}
	});

	it("contesta help (con la guarda de cli.ts de antes salía mudo y con 0)", () => {
		const r = correr(["help"]);
		expect(r.status).toBe(0);
		expect(r.stdout).toContain("pgs <command>");
	});

	it("dibuja de un texto a un PNG", () => {
		const dir = path.join(raiz, "dibujo");
		fs.mkdirSync(dir);
		fs.writeFileSync(path.join(dir, "x.txt"), "id: x\nname: x\nsize: 2x2\n\n1 = #ff0000 rojo\n\n==\n1.\n.1\n");
		expect(correr(["from_ascii", "txt=x.txt", "out=x.pss.json"], dir).status).toBe(0);
		expect(correr(["render", "path=x.pss.json", "out=x.png", "scale=4"], dir).status).toBe(0);
		const png = fs.readFileSync(path.join(dir, "x.png"));
		expect(png.subarray(1, 4).toString()).toBe("PNG");
	});

	it("el servidor MCP lista sus herramientas", () => {
		const entrada = [
			{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		].map(m => JSON.stringify(m)).join("\n") + "\n";
		const r = spawnSync(path.join(motor, "bin", "pgs-mcp"), [], { cwd: raiz, input: entrada, encoding: "utf8", timeout: 60_000 });
		const lista = r.stdout.split("\n").filter(Boolean).map(l => JSON.parse(l)).find(m => m.id === 2);
		expect(lista?.result?.tools?.length).toBeGreaterThan(10);
	});
});
