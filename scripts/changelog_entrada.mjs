// La entrada del CHANGELOG de una rama, numerada recién al juntar
// (Khadosh/pixel-gaming-studio#50). El número lo agarraba el primero que
// juntaba y chocó dos veces (estudio#150, y el 162 repetido): dos ramas que
// salen del mismo main escriben las dos «## <fecha> (N+1)» arriba de todo.
//
// Lo que hace: toma el CHANGELOG de main, el de la rama y el del punto donde
// la rama salió de main; las entradas de la rama que no están ni en ese punto
// ni en main son las suyas, y van arriba de las de main con el número que
// sigue al de main y la fecha de hoy. Así tampoco hay conflicto: lo de main
// queda como está en main. La rama puede escribir su entrada con cualquier
// número, o con «(N)».
//
//   node scripts/changelog_entrada.mjs <main> <base> <rama> <fecha>   escribe el CHANGELOG nuevo a stdout
//   node scripts/changelog_entrada.mjs --numero <main> <base> <rama>   sólo el número que le toca

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const TITULO = /^## (\S+)(?: \((\d+|N|\?)\))?\s*$/;

// { cabeza, entradas: [{ titulo, texto }] }: cada entrada va de su «## » al próximo.
export function partir(texto) {
	const lineas = texto.split("\n");
	let i = lineas.findIndex((l) => l.startsWith("## "));
	if (i < 0) i = lineas.length;
	const cabeza = lineas.slice(0, i).join("\n");
	const entradas = [];
	for (; i < lineas.length; i++) {
		if (lineas[i].startsWith("## ")) entradas.push({ titulo: lineas[i], lineas: [lineas[i]] });
		else entradas[entradas.length - 1].lineas.push(lineas[i]);
	}
	return { cabeza, entradas: entradas.map((e) => ({ titulo: e.titulo, texto: e.lineas.join("\n") })) };
}

// El número más alto que tiene un CHANGELOG (0 si ninguna entrada lleva).
export function ultimoNumero(texto) {
	let n = 0;
	for (const e of partir(texto).entradas) {
		const m = TITULO.exec(e.titulo);
		if (m && /^\d+$/.test(m[2] ?? "")) n = Math.max(n, Number(m[2]));
	}
	return n;
}

const cuerpo = (e) => e.texto.slice(e.titulo.length);

// Las entradas propias de la rama, de arriba abajo. Tienen que estar todas
// arriba: una entrada vieja cambiada en la rama no se sabe juntar sola.
export function propias({ main, base, rama }) {
	const conocidas = new Set([...partir(base).entradas, ...partir(main).entradas].map((e) => e.texto.trimEnd()));
	const deRama = partir(rama).entradas;
	const nuevas = [];
	let arriba = true;
	for (const e of deRama) {
		const vieja = conocidas.has(e.texto.trimEnd());
		if (!vieja && !arriba) {
			throw new Error(`la rama cambia una entrada vieja del CHANGELOG («${e.titulo}»): eso se junta a mano`);
		}
		if (vieja) arriba = false;
		else nuevas.push(e);
	}
	// Una vieja que la rama cambió no está tal cual: falta en la rama (salvo
	// que main también la haya cambiado y la rama ya tenga la de main).
	const enRama = new Set(deRama.map((e) => e.texto.trimEnd()));
	const enMain = new Set(partir(main).entradas.map((e) => e.texto.trimEnd()));
	for (const e of partir(base).entradas) {
		const t = e.texto.trimEnd();
		if (!enRama.has(t) && enMain.has(t)) throw new Error(`la rama cambia una entrada vieja del CHANGELOG («${e.titulo}»): eso se junta a mano`);
	}
	return nuevas;
}

// El número que le toca a la entrada de la rama (a la de más arriba, si son varias).
export function numero({ main, base, rama }) {
	const nuevas = propias({ main, base, rama });
	if (!nuevas.length) throw new Error("la rama no tiene entrada en el CHANGELOG");
	return ultimoNumero(main) + nuevas.length;
}

// El CHANGELOG de main con las entradas de la rama arriba, numeradas.
export function juntar({ main, base, rama, fecha }) {
	const nuevas = propias({ main, base, rama });
	if (!nuevas.length) throw new Error("la rama no tiene entrada en el CHANGELOG");
	const desdeMain = partir(main);
	let n = ultimoNumero(main) + nuevas.length;
	const arriba = nuevas.map((e) => {
		const texto = `## ${fecha} (${n--})${cuerpo(e)}`;
		// Cada entrada termina en un renglón en blanco antes de la que sigue.
		return /\n\s*$/.test(texto) ? texto : `${texto}\n`;
	});
	const entradas = [...arriba, ...desdeMain.entradas.map((e) => e.texto)].join("\n");
	return desdeMain.cabeza ? `${desdeMain.cabeza}\n${entradas}` : entradas;
}

// Corrido como script (también por un camino con enlaces, como /tmp → /private/tmp).
const real = (f) => {
	try {
		return fs.realpathSync(f);
	} catch {
		return f;
	}
};
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) {
	const args = process.argv.slice(2);
	const leer = (f) => fs.readFileSync(f, "utf8");
	try {
		if (args[0] === "--numero") {
			const [main, base, rama] = args.slice(1).map(leer);
			process.stdout.write(`${numero({ main, base, rama })}\n`);
		} else {
			const [main, base, rama] = args.slice(0, 3).map(leer);
			process.stdout.write(juntar({ main, base, rama, fecha: args[3] }));
		}
	} catch (e) {
		process.stderr.write(`changelog_entrada: ${e.message}\n`);
		process.exit(1);
	}
}
