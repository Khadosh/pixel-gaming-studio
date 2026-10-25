#!/usr/bin/env bash
# Juntar en main una carpeta de trabajo del motor (Khadosh/pixel-gaming-studio#50).
#
#   scripts/juntar_motor.sh [-m "<commit>"] [-t "<título>"] [--probar "<comando>"] [--dejar] <carpeta>
#
# En orden, y frena en el primer paso que no sale, sin tocar main:
#   1. La carpeta principal de PGS tiene que estar en main y limpia; la de
#      trabajo, en una rama que no sea main. Uno solo junta a la vez (un candado
#      en el .git): el número del CHANGELOG lo agarraban dos a la vez.
#   2. Si la carpeta tiene cambios sin commitear, los commitea con -m (sin -m
#      frena y los lista). «{N}» en el mensaje es el número de la entrada.
#   3. Si main se movió desde que salió la rama, junta main en la rama. Un
#      choque en el CHANGELOG lo resuelve solo; uno en otro archivo, no.
#   4. Numera la entrada de la rama en el CHANGELOG recién ahora: la que sigue a
#      la de main, con la fecha de hoy (scripts/changelog_entrada.mjs).
#   5. Con --probar, corre ese comando en la carpeta (los tests de la rama,
#      ya con main adentro); rojo, frena.
#   6. `git merge --no-ff` en main: «Merge <rama>: <título> (N, …)», con el
#      título del primer commit de la rama (sin su «tipo(área): ») o el de -t.
#   7. Borra la carpeta y la rama (--dejar las deja).
# Nunca pushea.
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
mensaje=""
titulo=""
probar=""
dejar=0
base=main
dir=""
while [ $# -gt 0 ]; do
	case "$1" in
		-m) mensaje="$2"; shift 2 ;;
		-t) titulo="$2"; shift 2 ;;
		--probar) probar="$2"; shift 2 ;;
		--dejar) dejar=1; shift ;;
		--base) base="$2"; shift 2 ;;
		-h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		-*) echo "juntar_motor: no sé qué es «$1» (ver --help)" >&2; exit 2 ;;
		*) [ -z "$dir" ] || { echo "juntar_motor: una carpeta por vez" >&2; exit 2; }; dir="$1"; shift ;;
	esac
done
no() { echo "juntar_motor: $*" >&2; exit 1; }
[ -n "$dir" ] || no "¿qué carpeta? (ver --help)"
[ -d "$dir" ] || no "$dir no existe"
dir="$(cd "$dir" && pwd -P)"
w() { git -C "$dir" "$@"; }

# 1. Quién es quién.
w rev-parse --git-dir >/dev/null 2>&1 || no "$dir no es una carpeta de git"
principal="$(w worktree list --porcelain | sed -n '1s/^worktree //p')"
principal="$(cd "$principal" && pwd -P)"
p() { git -C "$principal" "$@"; }
[ "$dir" != "$principal" ] || no "$dir es la carpeta principal: se junta una carpeta de trabajo"
rama="$(w symbolic-ref --short -q HEAD || true)"
[ -n "$rama" ] || no "$dir tiene el HEAD suelto: poné el trabajo en una rama (git -C $dir switch -c motor/<qué>)"
[ "$rama" != "$base" ] || no "$dir está en $base"
[ "$(p symbolic-ref --short -q HEAD || true)" = "$base" ] || no "la carpeta principal ($principal) no está en $base"
if [ -n "$(p status --porcelain --untracked-files=normal)" ]; then
	p status --short | head -10 >&2
	no "la carpeta principal ($principal) tiene cambios sin commitear: no se junta encima"
fi

candado="$(p rev-parse --path-format=absolute --git-common-dir)/juntar_motor.lock"
mkdir "$candado" 2>/dev/null || no "otro está juntando ($candado; si no hay nadie, borralo)"
trap 'rmdir "$candado" 2>/dev/null || true' EXIT

tmp="$(mktemp -d)"
trap 'rmdir "$candado" 2>/dev/null || true; rm -rf "$tmp"' EXIT
mb="$(w merge-base "$base" HEAD)"
w show "$mb:CHANGELOG.md" > "$tmp/base" 2>/dev/null || : > "$tmp/base"
w show "$base:CHANGELOG.md" > "$tmp/main" 2>/dev/null || : > "$tmp/main"
cl="$dir/CHANGELOG.md"
[ -f "$cl" ] || no "$dir no tiene CHANGELOG.md"
N="$(node "$aqui/changelog_entrada.mjs" --numero "$tmp/main" "$tmp/base" "$cl")" || no "el CHANGELOG de $rama no se puede numerar (arriba dice por qué)"
[[ "$N" =~ ^[0-9]+$ ]] || no "changelog_entrada.mjs no dio un número («${N}»): no se toca nada"
# El CHANGELOG nuevo de la rama: tiene que tener su entrada con su número y todo lo de main.
numerar() {
	node "$aqui/changelog_entrada.mjs" "$tmp/main" "$tmp/base" "$1" "$(date +%F)" > "$tmp/nuevo" || no "el CHANGELOG de $rama no se puede numerar"
	grep -qxF "## $(date +%F) ($N)" "$tmp/nuevo" && [ "$(wc -c < "$tmp/nuevo")" -gt "$(wc -c < "$tmp/main")" ] \
		|| no "el CHANGELOG numerado no salió como tenía que salir ($tmp/nuevo): no se toca nada"
}

# 2. Lo sin commitear.
if [ -n "$(w status --porcelain --untracked-files=normal)" ]; then
	if [ -z "$mensaje" ]; then
		w status --short | head -20 >&2
		no "$dir tiene cambios sin commitear: pasá -m \"tipo(área): qué ({N}, …)\" para commitearlos"
	fi
	# La entrada ya numerada va en el mismo commit.
	numerar "$cl"
	cp "$tmp/nuevo" "$cl"
	w add -A
	w commit -q -m "${mensaje//\{N\}/$N}"
	echo "commiteado en $rama: $(w log -1 --format=%s)"
fi
[ "$(w rev-list --count "$base..HEAD")" != 0 ] || no "$rama no tiene nada que $base no tenga"

# 3 y 4. Main adentro y la entrada numerada.
fecha="$(date +%F)"
w show "HEAD:CHANGELOG.md" > "$tmp/rama"
numerar "$tmp/rama"
if ! w merge-base --is-ancestor "$base" HEAD; then
	if ! w merge --no-ff --no-commit -q "$base" >/dev/null 2>&1; then
		otros="$(w diff --name-only --diff-filter=U | grep -vx CHANGELOG.md || true)"
		if [ -n "$otros" ]; then
			w merge --abort
			no "juntar $base en $rama choca en: $(echo $otros). Eso se resuelve a mano (git -C $dir merge $base) y se corre de nuevo"
		fi
	fi
	cp "$tmp/nuevo" "$cl"
	w add CHANGELOG.md
	w commit -q -m "Merge $base en $rama (entrada $N del CHANGELOG)"
	echo "$base se había movido: juntado en $rama"
elif ! cmp -s "$tmp/nuevo" "$cl"; then
	cp "$tmp/nuevo" "$cl"
	w add CHANGELOG.md
	w commit -q -m "docs(changelog): la entrada de $rama es la $N"
fi
echo "la entrada del CHANGELOG es la $N ($fecha)"

# 5. Las pruebas, con main adentro.
if [ -n "$probar" ]; then
	echo "probando en $dir: $probar"
	(cd "$dir" && eval "$probar") || no "--probar dio rojo: $rama queda con main adentro y sin juntar"
fi

# 6. A main.
w merge-base --is-ancestor "$base" HEAD || no "$base se movió mientras juntaba (alguien juntó a mano): corré de nuevo"
if [ -z "$titulo" ]; then
	titulo="$(w log --reverse --no-merges --format=%s "$base..HEAD" | grep -v '^docs(changelog): la entrada de ' | head -1)"
	titulo="$(printf '%s' "$titulo" | sed -E 's/^[a-z]+(\([^)]*\))?!?: //')"
fi
titulo="${titulo//\{N\}/$N}"
if printf '%s' "$titulo" | grep -qE '\((N|[0-9]+)(,[^()]*)?\)$'; then
	titulo="$(printf '%s' "$titulo" | sed -E "s/\((N|[0-9]+)(,[^()]*)?\)\$/($N\2)/")"
elif printf '%s' "$titulo" | grep -qE '\([^()]*\)$'; then
	titulo="$(printf '%s' "$titulo" | sed -E "s/\(([^()]*)\)\$/($N, \1)/")"
else
	titulo="$titulo ($N)"
fi
p merge -q --no-ff "$rama" -m "Merge $rama: $titulo" || { p merge --abort 2>/dev/null || true; no "el merge en $base no salió; $base quedó como estaba"; }
echo "juntada en $base: $(p log -1 --format='%h %s')"

# 7. Lo que sobra.
if [ "$dejar" = 0 ]; then
	p worktree remove "$dir" && p branch -d -q "$rama" && echo "borradas la carpeta $dir y la rama $rama" \
		|| echo "ojo: la carpeta $dir o la rama $rama no se pudieron borrar (scripts/motor_suelto.sh --limpiar)"
fi
echo "nada pusheado"
