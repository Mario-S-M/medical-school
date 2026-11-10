#!/usr/bin/env bash
# Crea en n8n la credencial "SMTP Mailpit" (mailpit:1025, sin usuario ni TLS) para los correos de la escuela (SPEC 07).
# Desde la raíz del repo, con el stack levantado:  bash escuela/scripts/crear_credencial_smtp.sh
# No lleva secretos. Para un SMTP real, cambia sus datos en n8n (Credenciales > SMTP Mailpit) y quita Mailpit.
set -euo pipefail

propietario="$(docker compose exec -T -e PGPASSWORD="$(grep -E '^CONTRASENA_BD_N8N=' .env | cut -d= -f2-)" db \
  psql -h localhost -U "$(grep -E '^USUARIO_BD_N8N=' .env | cut -d= -f2-)" -d n8n -tA -c "select id from \"user\" where \"roleSlug\" = 'global:owner' limit 1")"
docker compose cp escuela/credenciales/smtp-mailpit.json n8n:/tmp/credencial_smtp.json > /dev/null
docker compose exec -T -u root n8n chmod 644 /tmp/credencial_smtp.json
docker compose exec -T n8n n8n import:credentials --input=/tmp/credencial_smtp.json --userId="$propietario" > /dev/null
docker compose exec -T -u root n8n rm -f /tmp/credencial_smtp.json
echo "Credencial 'SMTP Mailpit' creada."
