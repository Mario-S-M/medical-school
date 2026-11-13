import { useMutation } from '@tanstack/react-query';
import { goTo } from '../../../shared/lib/navigate';
import { recover, resendVerification, resetPassword, verifyEmail } from '../api/auth-api';
import { clearPendingEmail, savePendingEmail } from '../lib/pending-email';

export const useVerifyEmail = () => useMutation({ mutationFn: verifyEmail, onSuccess: clearPendingEmail });

export const useResendVerification = () => useMutation({ mutationFn: resendVerification });

export const useRecover = () =>
  useMutation({
    mutationFn: recover,
    onSuccess: (_, vars) => {
      savePendingEmail(vars.correo);
      void goTo('/restablecer');
    },
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      clearPendingEmail();
      void goTo('/iniciar-sesion');
    },
  });
