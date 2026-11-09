-- Rol y base de n8n. Los valores salen del entorno del contenedor db:
-- USUARIO_BD_N8N y CONTRASENA_BD_N8N (definidos en el .env raíz).
-- Solo se ejecuta cuando supabase/volumes/db/data está vacío.
\getenv usuario_n8n USUARIO_BD_N8N
\getenv contrasena_n8n CONTRASENA_BD_N8N

CREATE ROLE :"usuario_n8n" LOGIN PASSWORD :'contrasena_n8n' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE n8n OWNER :"usuario_n8n";
