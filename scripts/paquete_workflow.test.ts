// @vitest-environment node
// El workflow que publica el paquete (paquete.yml) instala lo que pide
// scripts/empaquetar.mjs (de Khadosh/estudio#799). Con `npm ci --omit=dev` y
// esbuild sin declarar (venía de rebote con vite, de desarrollo), el CI cortaba
// en «Cannot find package 'esbuild'» y la versión «motor» nunca existió: el
// instalador del estudio daba «no pude bajar PGS».
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leer = (r: string) => fs.readFileSync(path.join(RAIZ, r), "utf8");

// Los paquetes que importa un script (lo de `node:` y lo relativo, afuera).
export function importados(codigo: string): string[] {
	const de = [...codigo.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
	const paquete = (d: string) => (d.startsWith("@") ? d.split("/").slice(0, 2).join("/") : d.split("/")[0]);
	return [...new Set(de.filter((d) => !d.startsWith("node:") && !d.startsWith(".")).map(paquete))];
}

// Las líneas `npm ci` / `npm install` de un workflow.
export function instalaciones(yml: string): string[] {
	return [...yml.matchAll(/run:\s*(npm (?:ci|install)\b[^\n]*)/g)].map((m) => m[1].trim());
}

describe("el workflow del paquete", () => {
	const pkg = JSON.parse(leer("package.json"));
	const deps = pkg.dependencies ?? {};
	const dev = pkg.devDependencies ?? {};
	const usa = importados(leer("scripts/empaquetar.mjs"));
	const npm = instalaciones(leer(".github/workflows/paquete.yml"));

	it("empaquetar.mjs importa algo de afuera (si no, este control no mira nada)", () => {
		expect(usa).toContain("esbuild");
	});

	it("cada paquete que importa empaquetar.mjs está declarado en package.json", () => {
		expect(usa.filter((d) => !(d in deps) && !(d in dev))).toEqual([]);
	});

	it("el workflow instala las de desarrollo si empaquetar.mjs usa alguna", () => {
		expect(npm.length).toBeGreaterThan(0);
		const deDesarrollo = usa.filter((d) => d in dev && !(d in deps));
		if (deDesarrollo.length) {
			for (const linea of npm) expect(linea, `${linea} deja afuera ${deDesarrollo.join(", ")}`).not.toMatch(/--omit[= ]dev|--production/);
		}
	});

	it("el control ve lo que pasó: un import sin declarar y un --omit=dev", () => {
		expect(importados('import { build } from "esbuild";\nimport x from "node:fs";\nimport y from "./z.mjs";')).toEqual(["esbuild"]);
		expect(instalaciones("      - run: npm ci --omit=dev\n")).toEqual(["npm ci --omit=dev"]);
	});
});
