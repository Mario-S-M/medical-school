# Reglas del proyecto

## Idioma de los workflows de n8n
- Todos los workflows van en español: nombre del workflow, nombres de nodos, carpetas de `workflows/` y descripciones.
- Todas las variables van en español: campos de datos, alias de SQL, nombres de columnas y tablas nuevas, y variables de `.env` nuevas.
- Los identificadores usan `snake_case`, sin acentos, sin espacios y sin mezclar inglés (por ejemplo `base_de_datos`, `usuario_conectado`, `creado_en`).
- Quedan fuera de la regla los nombres propios que impone n8n o Postgres: tipos de nodo (`n8n-nodes-base.postgres`), claves del JSON exportado, palabras reservadas de SQL y variables existentes como `POSTGRES_USER`.
