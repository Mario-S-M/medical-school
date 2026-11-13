import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** No añade `Authorization` ni reintenta con una sesión renovada (renovación de sesión). */
    skipAuth?: boolean;
    /** Marca interna: la petición ya se reintentó una vez tras renovar el token. */
    retried?: boolean;
  }
}
