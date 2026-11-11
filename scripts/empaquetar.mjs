#!/usr/bin/env node
// El motor en un paquete: PGS sin clonar el repo (de Khadosh/estudio#769).
//
//   node scripts/empaquetar.mjs [<carpeta de salida>]     (por omisión, paquete/)
//
// Deja en la salida `pgs-motor/` y `pgs-motor.tar.gz`. Adentro:
//   bin/pgs, bin/pgs-mcp   los mismos nombres que en el repo, para que quien
//                          apuntaba a <pgs>/bin/pgs-mcp siga igual
//   lib/cli.mjs, lib/mcp.mjs   el CLI y el servidor MCP, cada uno en un solo
//                          archivo con sus dependencias adentro (esbuild): no
//                          piden node_modules, ni tsx, ni npm; sólo Node 20
//   VERSION                el commit del que salió y la fecha
//   LICENSE
// Lo publica el CI en cada push a main (.github/workflows/paquete.yml), como
// recurso de la versión fija «motor»; `instalar.sh taller` del estudio lo baja
// de ahí. Pesa unos 7 MB desarmado, contra los 443 del repo con sus piezas.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// pngjs y el SDK de MCP son CommonJS y hacen require("util"), require("zlib"):
// en un paquete ESM no hay `require` y el motor caía al arrancar.
const BANNER = 'import { createRequire as __pgsRequire } from "node:module"; const require = __pgsRequire(import.meta.url);';

const LANZADOR = (archivo) => `#!/usr/bin/env bash
# PGS empaquetado (scripts/empaquetar.mjs del repo): ${archivo} con Node, en el
# mismo proceso, como bin/pgs del repo (un tope que mata lo lanzado mata todo).
set -euo pipefail
here="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$here/lib/${archivo}" "$@"
`;

function version() {
	let commit = "sin git";
	try {
		commit = execFileSync("git", ["-C", RAIZ, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	} catch {}
	return `${commit}\n${new Date().toISOString().slice(0, 10)}\n`;
}

export async function empaquetar(salida = path.join(RAIZ, "paquete")) {
	const dentro = path.join(salida, "pgs-motor");
	fs.rmSync(dentro, { recursive: true, force: true });
	fs.mkdirSync(path.join(dentro, "bin"), { recursive: true });
	for (const [entrada, archivo] of [["cli.ts", "cli.mjs"], ["mcp.ts", "mcp.mjs"]]) {
		await build({
			entryPoints: [path.join(RAIZ, "src/headless", entrada)],
			outfile: path.join(dentro, "lib", archivo),
			bundle: true,
			platform: "node",
			format: "esm",
			target: "node20",
			banner: { js: BANNER },
			legalComments: "none",
			logLevel: "warning",
		});
	}
	for (const [nombre, archivo] of [["pgs", "cli.mjs"], ["pgs-mcp", "mcp.mjs"]]) {
		fs.writeFileSync(path.join(dentro, "bin", nombre), LANZADOR(archivo), { mode: 0o755 });
	}
	fs.copyFileSync(path.join(RAIZ, "LICENSE"), path.join(dentro, "LICENSE"));
	fs.writeFileSync(path.join(dentro, "VERSION"), version());
	const tar = path.join(salida, "pgs-motor.tar.gz");
	execFileSync("tar", ["-czf", tar, "-C", salida, "pgs-motor"]);
	return { carpeta: dentro, tar };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { carpeta, tar } = await empaquetar(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
	console.log(`${carpeta}\n${tar} (${(fs.statSync(tar).size / 1e6).toFixed(1)} MB)`);
}
