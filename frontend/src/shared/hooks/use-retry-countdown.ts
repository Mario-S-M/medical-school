import { useEffect } from 'react';
import { ApiError } from '../api/api-error';
import useCountdown from './use-countdown';

// Cuenta regresiva (segundos) que arranca cuando la API pide esperar (`Retry-After` / `reintentar_en_segundos`).
export default function useRetryCountdown(error: unknown) {
  const { remaining, start } = useCountdown();
  useEffect(() => {
    if (error instanceof ApiError && error.retryAfter) start(error.retryAfter);
  }, [error]);
  return { remaining, start };
}
