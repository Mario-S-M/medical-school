import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/errores';
import useCuentaRegresiva from './useCuentaRegresiva';

export default function useEnvio<T>(accion: () => Promise<T>, alExito: (resultado: T) => void) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { restante, iniciar } = useCuentaRegresiva();

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      alExito(await accion());
    } catch (e) {
      setError(e);
      if (e instanceof ErrorApi && e.reintentarEn) iniciar(e.reintentarEn);
    } finally {
      setEnviando(false);
    }
  }
  return { enviar, enviando, error, restante };
}
