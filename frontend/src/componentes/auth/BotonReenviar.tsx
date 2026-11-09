import { useEffect } from 'react';
import { reenviarVerificacion } from '../../api/autenticacion';
import useEnvio from '../../hooks/useEnvio';
import useCuentaRegresiva from '../../hooks/useCuentaRegresiva';
import Boton from '../ui/Boton';

const ESPERA_SEGUNDOS = 60;

type Props = { correo: string; alReenviar: (mensaje: string) => void; alFallar: (error: unknown) => void };

export default function BotonReenviar({ correo, alReenviar, alFallar }: Props) {
  const espera = useCuentaRegresiva();
  const { enviar, enviando, error, restante } = useEnvio(
    () => reenviarVerificacion({ correo: correo.trim() }),
    (r) => {
      espera.iniciar(ESPERA_SEGUNDOS);
      alReenviar(r.mensaje);
    },
  );
  useEffect(() => {
    if (error) alFallar(error);
  }, [error]);
  const segundos = Math.max(espera.restante, restante);
  return (
    <Boton variante="secundario" disabled={enviando || segundos > 0 || !correo.trim()} onClick={() => void enviar()}>
      {segundos > 0 ? `Reenviar código (${segundos} s)` : 'Reenviar código'}
    </Boton>
  );
}
