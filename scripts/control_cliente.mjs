#!/usr/bin/env node
// El control contra un juego real (Khadosh/pixel-gaming-studio#52): dibujar las
// recetas de un juego con el PGS de main y con el de la rama, en dos copias
// aparte, y decir qué dibujos cambiaron. Va antes de juntar: si cambia algo que
// la entrada del CHANGELOG no dice, no se junta.
//
//   node scripts/control_cliente.mjs <juego> --receta <receta.json>… [opciones]
//   node scripts/control_cliente.mjs <juego> --comando "<lo que dibuja>" [opciones]
//
//   --receta <r>    una receta de batch, relativa al juego (con * y ?: todas las
//                   que casen). Se corre `pgs batch recipe=<r> keep_going=true`
//                   parado en la raíz de cada copia. Repetible.
//   --only <p>      el only= de batch: sólo los pasos que lo nombran. Repetible.
//   --comando <c>   en vez de recetas, un comando de shell (./arte.sh): corre en
//                   cada copia con PGS=<el bin/pgs de ese lado> y ese `pgs`
//                   primero en el PATH. Un script que llama a PGS por su ruta
//                   fija no se entera: ese juego tiene que leer PGS=.
//   --cuales <p>    qué archivos se comparan (el only= de `pgs diff`). Repetible.
//   --rama <dir>    el PGS nuevo (por defecto, la carpeta de este script).
//   --base <ref>    el PGS de antes (por defecto main del mismo repo).
//   --excluir <d>   una carpeta del juego que no se copia (además de .git,
//                   .estudio, .godot, .claude, node_modules, build). Repetible.
//   --tope <s>      segundos por lado (por defecto 1800); pasado, se lo mata.
//   --lamina <png>  dónde va la lámina (por defecto en la carpeta del control).
//   --dejar         no borra las copias.
//
// Sin stale ni cache: las huellas y el depósito no saben con qué PGS se dibujó,
// y con ellos un lado tomaría lo que dibujó el otro. Las dos copias salen del
// mismo árbol de trabajo del juego, con lo que ya tenga dibujado: lo que una
// receta no reescribe queda igual de los dos lados.
//
// Sale 0 si ningún archivo cambió, 1 si cambió alguno (y los lista, con la
// lámina), 2 si el control no se pudo hacer (o un lado falló y el otro no).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SIEMPRE_FUERA = [".git", ".estudio", ".godot", ".claude", "node_modules", "build"];

function no(msg) {
	console.error(`control_cliente: ${msg}`);
	process.exit(2);
}

export function leerArgs(argv) {
	const o = { recetas: [], only: [], cuales: [], excluir: [], tope: 1800, dejar: false };
	const lista = { "--receta": "recetas", "--only": "only", "--cuales": "cuales", "--excluir": "excluir" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const valor = () => {
			if (i + 1 >= argv.length) no(`${a} sin valor`);
			return argv[++i];
		};
		if (lista[a]) o[lista[a]].push(valor());
		else if (a === "--comando") o.comando = valor();
		else if (a === "--rama") o.rama = valor();
		else if (a === "--base") o.base = valor();
		else if (a === "--tope") o.tope = Number(valor());
		else if (a === "--lamina") o.lamina = valor();
		else if (a === "--dejar") o.dejar = true;
		else if (a === "-h" || a === "--help") o.ayuda = true;
		else if (a.startsWith("-")) no(`no sé qué es «${a}» (ver --help)`);
		else if (o.juego) no("un juego por vez");
		else o.juego = a;
	}
	return o;
}

/** Las recetas que casan con un patrón, relativas al juego (* no cruza carpetas). */
export function expandir(juego, patron) {
	if (!/[*?]/.test(patron)) return [patron];
	const dir = path.dirname(patron);
	const re = new RegExp(`^${path.basename(patron).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, ".")}$`);
	const donde = path.join(juego, dir);
	if (!fs.existsSync(donde)) return [];
	return fs.readdirSync(donde).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));
}

function git(dir, ...args) {
	return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
}

/** Un lado: corre lo que dibuja en su copia, con su PGS, en su propio grupo de procesos. */
function correr(lado, copia, pgsBin, o) {
	const bin = path.join(path.dirname(copia), `bin-${lado}`);
	fs.mkdirSync(bin, { recursive: true });
	fs.writeFileSync(path.join(bin, "pgs"), `#!/usr/bin/env bash\nexec "${pgsBin}" "$@"\n`, { mode: 0o755 });
	const env = { ...process.env, PGS: pgsBin, PATH: `${bin}:${process.env.PATH}` };
	const pasos = o.comando
		? [["bash", ["-c", o.comando]]]
		: o.recetas.map((r) => [pgsBin, ["batch", `recipe=${r}`, "keep_going=true", ...(o.only.length ? [`only=${JSON.stringify(o.only)}`] : [])]]);
	const log = path.join(path.dirname(path.dirname(copia)), `${lado}.log`);
	return new Promise((listo) => {
		const fin = Date.now() + o.tope * 1000;
		let fallos = 0;
		const uno = (k) => {
			if (k >= pasos.length) return listo({ lado, fallos, log, vencido: false });
			const [cmd, args] = pasos[k];
			fs.appendFileSync(log, `$ ${cmd} ${args.join(" ")}\n`);
			const p = spawn(cmd, args, { cwd: copia, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
			p.stdout.on("data", (d) => fs.appendFileSync(log, d));
			p.stderr.on("data", (d) => fs.appendFileSync(log, d));
			let vencido = false;
			const reloj = setTimeout(() => {
				try { process.kill(-p.pid, "SIGKILL"); } catch { /* ya terminó */ }
				vencido = true;
			}, Math.max(0, fin - Date.now()));
			p.on("close", (code) => {
				clearTimeout(reloj);
				if (vencido) return listo({ lado, fallos, log, vencido: true });
				if (code !== 0) fallos++;
				uno(k + 1);
			});
		};
		uno(0);
	});
}

async function main() {
	const o = leerArgs(process.argv.slice(2));
	if (o.ayuda) {
		console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 33).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
		return 0;
	}
	if (!o.juego) no("¿qué juego? (ver --help)");
	const juego = fs.realpathSync(o.juego);
	if (!o.comando && !o.recetas.length) no("falta qué dibujar: --receta <receta.json> o --comando \"<cmd>\"");
	if (o.comando && o.recetas.length) no("--receta o --comando, no los dos");
	if (!(o.tope > 0)) no("--tope en segundos");
	o.recetas = o.recetas.flatMap((r) => {
		const hay = expandir(juego, r);
		if (!hay.length || hay.some((x) => !fs.existsSync(path.join(juego, x)))) no(`no hay receta ${r} en ${juego}`);
		return hay;
	});

	const rama = fs.realpathSync(o.rama ?? path.join(AQUI, ".."));
	if (!fs.existsSync(path.join(rama, "bin", "pgs"))) no(`${rama} no es un PGS (no tiene bin/pgs)`);
	const base = o.base ?? "main";
	const control = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "control-cliente-")));
	const pgsBase = path.join(control, "pgs-base");
	try {
		git(rama, "worktree", "add", "--detach", pgsBase, base);
	} catch (e) {
		no(`no pude sacar ${base} de ${rama}: ${e.message}`);
	}
	const modulos = fs.realpathSync(path.join(rama, "node_modules"));
	fs.symlinkSync(modulos, path.join(pgsBase, "node_modules"));
	const deBase = git(pgsBase, "log", "-1", "--format=%h %s");
	const deRama = `${git(rama, "log", "-1", "--format=%h %s")}${git(rama, "status", "--porcelain") ? " (con cambios sin commitear)" : ""}`;
	console.log(`antes: ${base} = ${deBase}\ndespués: ${rama} = ${deRama}\njuego: ${juego}`);

	const fuera = [...SIEMPRE_FUERA, ...o.excluir];
	const copias = {};
	for (const lado of ["antes", "despues"]) {
		copias[lado] = path.join(control, lado, path.basename(juego));
		fs.mkdirSync(path.dirname(copias[lado]), { recursive: true });
		execFileSync("rsync", ["-a", ...fuera.flatMap((d) => ["--exclude", `/${d}`]), `${juego}/`, `${copias[lado]}/`]);
	}
	const t0 = Date.now();
	const [a, b] = await Promise.all([
		correr("antes", copias.antes, path.join(pgsBase, "bin", "pgs"), o),
		correr("despues", copias.despues, path.join(rama, "bin", "pgs"), o),
	]);
	console.log(`dibujado en ${Math.round((Date.now() - t0) / 1000)} s (los dos lados a la vez)`);

	let salida = 0;
	for (const r of [a, b]) {
		if (r.vencido) { console.log(`${r.lado}: pasó el tope de ${o.tope} s y se lo mató (${r.log})`); salida = 2; }
		else if (r.fallos) console.log(`${r.lado}: ${r.fallos} corrida(s) con pasos que fallaron (${r.log})`);
	}
	if (!a.vencido && !b.vencido && (a.fallos > 0) !== (b.fallos > 0)) {
		console.log("un lado falló y el otro no: mirá los dos logs");
		salida = 2;
	}

	const lamina = path.resolve(o.lamina ?? path.join(control, "lamina.png"));
	const diff = ["diff", `a=${copias.antes}`, `b=${copias.despues}`, `out=${lamina}`, ...(o.cuales.length ? [`only=${JSON.stringify(o.cuales)}`] : [])];
	let texto;
	try {
		texto = execFileSync(path.join(rama, "bin", "pgs"), diff, { encoding: "utf8", maxBuffer: 64 << 20 });
	} catch (e) {
		console.log(String(e.stdout ?? "") + String(e.stderr ?? ""));
		no("pgs diff falló");
	}
	console.log(texto.trimEnd().split("\n").map((l) => l.replace(copias.antes, "antes").replace(copias.despues, "despues")).join("\n"));
	const cambio = !/: \d+ equal, 0 differ, 0 only in a, 0 only in b/.test(texto);
	if (cambio && salida === 0) salida = 1;
	const fallaron = a.fallos || b.fallos ? " (pero hubo pasos que fallaron: lo que no se dibujó no se controló)" : "";
	console.log(cambio ? "CAMBIARON DIBUJOS: que la entrada del CHANGELOG lo diga, o no se junta" : `ningún dibujo cambió${fallaron}`);

	if (!o.dejar) {
		try { git(rama, "worktree", "remove", "--force", pgsBase); } catch { /* lo borra el rm */ }
		for (const lado of ["antes", "despues"]) fs.rmSync(path.join(control, lado), { recursive: true, force: true });
		fs.rmSync(pgsBase, { recursive: true, force: true });
		git(rama, "worktree", "prune");
	}
	console.log(`logs${cambio ? " y lámina" : ""}: ${control}`);
	return salida;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then((c) => process.exit(c), (e) => no(e.stack ?? String(e)));
}
