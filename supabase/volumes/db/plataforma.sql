-- Rol y base de la plataforma (API NestJS, SPEC 09). Los valores salen del entorno del contenedor db:
-- USUARIO_BD_PLATAFORMA y CONTRASENA_BD_PLATAFORMA (definidos en el .env raíz).
-- Solo se ejecuta cuando supabase/volumes/db/data está vacío; en un volumen ya inicializado
-- usa api/scripts/create-platform-database.sh.
\getenv usuario_plataforma USUARIO_BD_PLATAFORMA
\getenv contrasena_plataforma CONTRASENA_BD_PLATAFORMA

CREATE ROLE :"usuario_plataforma" LOGIN PASSWORD :'contrasena_plataforma' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE plataforma OWNER :"usuario_plataforma";

-- unaccent (SPEC 10): la búsqueda de cursos sin acentos. Requiere superusuario, por eso va aquí y no en las migraciones.
\connect plataforma
CREATE EXTENSION IF NOT EXISTS unaccent;
