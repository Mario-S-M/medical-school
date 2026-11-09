#!/usr/bin/env bash
# Falla si algún archivo de src/ pasa del máximo de líneas (por defecto 50).
set -euo pipefail
cd "$(dirname "$0")/.."
maximo="${MAXIMO_LINEAS:-50}"
fallos=0
while IFS= read -r archivo; do
  lineas=$(wc -l < "$archivo")
  if [ "$lineas" -gt "$maximo" ]; then
    echo "✗ $archivo tiene $lineas líneas (máximo $maximo)"
    fallos=1
  fi
done < <(find src -type f \( -name '*.astro' -o -name '*.tsx' -o -name '*.ts' \))
[ "$fallos" -eq 0 ] && echo "✓ Todos los archivos de src/ tienen $maximo líneas o menos"
exit "$fallos"
