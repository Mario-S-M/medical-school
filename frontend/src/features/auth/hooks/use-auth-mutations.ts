import { useMutation } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/api-error';
import { goTo } from '../../../shared/lib/navigate';
import { login, logout, register } from '../api/auth-api';
import { savePendingEmail } from '../lib/pending-email';
import { useSessionStore } from '../store/session-store';

export const useLogin = () =>
  useMutation({
    mutationFn: login,
    onSuccess: (r) => {
      useSessionStore.getState().setSession({ accessToken: r.token_acceso, user: r.usuario });
      void goTo('/panel');
    },
    onError: (error, vars) => {
      if (!(error instanceof ApiError) || error.code !== 'CORREO_NO_VERIFICADO') return;
      savePendingEmail(vars.correo);
      void goTo('/verificar-correo');
    },
  });

export const useRegister = () =>
  useMutation({
    mutationFn: register,
    onSuccess: (_, vars) => {
      savePendingEmail(vars.correo);
      void goTo('/verificar-correo');
    },
  });

// Cierra la sesión en la API y, pase lo que pase, la descarta en el cliente (y con ella el caché).
export const useLogout = () =>
  useMutation({
    mutationFn: logout,
    onSettled: () => {
      useSessionStore.getState().setSession(null);
      void goTo('/iniciar-sesion');
    },
  });
