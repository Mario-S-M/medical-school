#!/usr/bin/env bash
# Falla si en api/ o frontend/ hay archivos o carpetas con nombre en español (SPEC 09: código en inglés).
# Uso:  scripts/check-names.sh [api|frontend|todo]      (por defecto: todo)
# Para afinarlo: añade palabras a PALABRAS_ESPANOLAS o rutas/nombres del contrato a EXCEPCIONES.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

# Palabras españolas (sin acentos) que no deben aparecer como parte del nombre de un archivo o carpeta.
PALABRAS_ESPANOLAS="autenticacion sesion sesiones usuario usuarios contrasena contrasenas correo correos codigo codigos escuela curso cursos clase clases seccion secciones proxy_escuela configuracion comun comunes plantilla plantillas migracion migraciones base_datos guardia filtro servicio controlador modulo entidad entidades resolutor politica politicas limite verificacion recuperacion seguridad regla reglas tuberia decorador ayudas pruebas prueba esquema consultas persistidas datos salud transversal solicitud solicitudes inicio registro renovacion cierre"

# Nombres (o rutas relativas a la raíz) que se quedan en español por ser contrato o impuestos por una herramienta.
# Se comparan con el nombre del archivo o con la ruta completa.
EXCEPCIONES=(
  "frontend/src/pages"            # las URL de Astro siguen en español (el nombre del archivo es la URL)
)

objetivo="${1:-todo}"
case "$objetivo" in
  api) carpetas=(api/src api/test api/scripts) ;;
  frontend) carpetas=(frontend/src frontend/tests) ;;
  todo) carpetas=(api/src api/test api/scripts frontend/src frontend/tests) ;;
  *) echo "Uso: $0 [api|frontend|todo]" >&2; exit 2 ;;
esac

# Divide el nombre en palabras (minúsculas; separadores: - _ . y cambios de mayúscula) y compara con la lista.
patron="$(printf '%s' "$PALABRAS_ESPANOLAS" | tr ' ' '|')"
fallos=0
while IFS= read -r ruta; do
  excluida=0
  for e in "${EXCEPCIONES[@]}"; do
    e="${e%% *}"
    [[ "$ruta" == "$e" || "$ruta" == "$e"/* ]] && excluida=1
  done
  [[ $excluida -eq 1 ]] && continue
  nombre="$(basename "$ruta")"
  palabras="$(printf '%s' "${nombre%.*}" | sed -E 's/([a-z0-9])([A-Z])/\1_\2/g' | tr 'A-Z' 'a-z' | tr '.-' '__')"
  # Coincide una palabra completa, o varias unidas con _ (p. ej. proxy_escuela, base_datos).
  if printf '%s' "_${palabras}_" | grep -Eq "_(${patron})_"; then
    echo "Nombre en español: $ruta"
    fallos=$((fallos + 1))
  fi
done < <(for c in "${carpetas[@]}"; do [ -e "$c" ] && find "$c" -mindepth 1 -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.astro/*'; done)

if [ "$fallos" -gt 0 ]; then
  echo "check-names: $fallos nombre(s) en español" >&2
  exit 1
fi
echo "check-names: sin nombres en español ($objetivo)"
