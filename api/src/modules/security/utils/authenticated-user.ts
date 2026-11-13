// Quién hace la petición, según el token de acceso ya verificado por `JwtGuard`.
export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null; // `user_metadata.nombre` del token (la cuenta lo guarda al registrarse)
  role: string | null;
  sessionId: string | null;
  token: string; // el JWT original (sirve para llamar a Supabase Auth en nombre del usuario)
}

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUser?: AuthenticatedUser;
  }
}
