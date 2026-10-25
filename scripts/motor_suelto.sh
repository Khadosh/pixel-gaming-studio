#!/usr/bin/env bash
# Lo que del motor quedó sin juntar (Khadosh/pixel-gaming-studio#50).
#
# Recorre las carpetas de trabajo de PGS (`git worktree list`, la principal
# incluida) y sus ramas, y dice:
#   SIN COMMITEAR  una carpeta con cambios en `git status` (lo que no es ignorado)
#   SIN JUNTAR     una rama (o una carpeta con HEAD suelto) con commits que main no tiene
#   SOBRA          una carpeta limpia cuya rama ya está en main: se puede borrar
#
# Sale con 1 si hay algo SIN COMMITEAR o SIN JUNTAR, con 0 si no: el integrador
# lo corre antes de cerrar un ticket que nombra PGS. Lo que SOBRA no cuenta.
# Pasó dos veces (estudio#118, estudio#238): un trabajo dado por hecho que
# vivía sólo en una carpeta de /private/tmp.
#
#   scripts/motor_suelto.sh               la lista
#   scripts/motor_suelto.sh --limpiar     además borra lo que SOBRA (carpeta y rama)
#   scripts/motor_suelto.sh -C <repo>     otro repo (por defecto, el de este script)
#   scripts/motor_suelto.sh --base <rama> contra otra rama (por defecto, main)
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
base=main
limpiar=0
while [ $# -gt 0 ]; do
	case "$1" in
		-C) repo="$2"; shift 2 ;;
		--base) base="$2"; shift 2 ;;
		--limpiar) limpiar=1; shift ;;
		-h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "motor_suelto: no sé qué es «$1» (ver --help)" >&2; exit 2 ;;
	esac
done

g() { git -C "$repo" "$@"; }
g rev-parse --verify -q "$base^{commit}" >/dev/null || { echo "motor_suelto: «${base}» no es una rama de $repo" >&2; exit 2; }

problemas=0
sobran=0
vistas=""   # ramas que ya tienen carpeta, una por renglón

# Cuántos commits tiene `ref` que base no, y el último.
adelante() { g rev-list --count "$base..$1"; }
ultimo() { g log -1 --format='%cs %s' "$1"; }

principal=""
dir="" ; head="" ; rama="" ; prunable=0
procesar() {
	[ -n "$dir" ] || return 0
	if [ -z "$principal" ]; then principal="$dir"; fi
	if [ "$prunable" = 1 ] || [ ! -d "$dir" ]; then
		echo "SIN CARPETA    $dir: ya no está en disco (git worktree prune la olvida)"
		return 0
	fi
	local nombre="${rama:-HEAD suelto}"
	[ -n "$rama" ] && vistas="$vistas$rama"$'\n'
	local sucio
	sucio="$(git -C "$dir" status --porcelain --untracked-files=normal | wc -l | tr -d ' ')"
	local n
	n="$(adelante "$head")"
	local mal=0
	if [ "$sucio" != 0 ]; then
		echo "SIN COMMITEAR  $dir ($nombre): $sucio $( [ "$sucio" = 1 ] && echo archivo || echo archivos)"
		git -C "$dir" status --porcelain --untracked-files=normal | head -5 | sed 's/^/                 /'
		mal=1
	fi
	if [ "$n" != 0 ] && [ "$rama" != "$base" ]; then
		echo "SIN JUNTAR     $dir ($nombre): $n $( [ "$n" = 1 ] && echo commit || echo commits) que $base no tiene; el último, $(ultimo "$head")"
		mal=1
	fi
	if [ "$mal" = 1 ]; then
		problemas=$((problemas + 1))
	elif [ "$dir" != "$principal" ]; then
		sobran=$((sobran + 1))
		if [ "$limpiar" = 1 ]; then
			g worktree remove "$dir"
			if [ -n "$rama" ]; then g branch -d -q "$rama"; fi
			echo "BORRADA        $dir ($nombre): estaba juntada y limpia"
		else
			echo "SOBRA          $dir ($nombre): limpia y juntada en $base"
		fi
	fi
}

while IFS= read -r linea; do
	case "$linea" in
		"worktree "*) procesar; dir="${linea#worktree }"; head=""; rama=""; prunable=0 ;;
		"HEAD "*) head="${linea#HEAD }" ;;
		"branch "*) rama="${linea#branch refs/heads/}" ;;
		prunable*) prunable=1 ;;
	esac
done < <(g worktree list --porcelain)
procesar

# Ramas sin carpeta con commits que base no tiene.
while IFS= read -r r; do
	[ -n "$r" ] && [ "$r" != "$base" ] || continue
	printf '%s' "$vistas" | grep -qxF "$r" && continue
	n="$(adelante "refs/heads/$r")"
	[ "$n" = 0 ] && continue
	echo "SIN JUNTAR     rama $r (sin carpeta): $n $( [ "$n" = 1 ] && echo commit || echo commits) que $base no tiene; el último, $(ultimo "refs/heads/$r")"
	problemas=$((problemas + 1))
done < <(g for-each-ref --format='%(refname:short)' refs/heads)

if [ "$problemas" = 0 ]; then
	echo "Nada suelto: todo lo del motor está en $base.$( [ "$sobran" -gt 0 ] && [ "$limpiar" = 0 ] && echo " $sobran $( [ "$sobran" = 1 ] && echo carpeta sobra || echo carpetas sobran) (--limpiar las borra).")"
	exit 0
fi
if [ "$problemas" = 1 ]; then
	echo "1 cosa suelta: juntala (scripts/juntar_motor.sh <carpeta>) o tirala a propósito antes de cerrar el ticket."
else
	echo "$problemas cosas sueltas: juntalas (scripts/juntar_motor.sh <carpeta>) o tiralas a propósito antes de cerrar el ticket."
fi
exit 1
