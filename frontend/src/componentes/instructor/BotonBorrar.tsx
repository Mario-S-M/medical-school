import { mensajeDeError } from '../../api/errores';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';

type Props = { nombre: string; accion: () => Promise<unknown>; alBorrar: () => void; texto?: string };

export default function BotonBorrar({ nombre, accion, alBorrar, texto = 'Borrar' }: Props) {
  const { enviar, enviando, error } = useEnvio(accion, alBorrar);
  const confirmar = () => {
    if (window.confirm(`¿${texto} «${nombre}»? No se puede deshacer.`)) void enviar();
  };
  return (
    <>
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <Boton variante="secundario" aria-label={`${texto} ${nombre}`} disabled={enviando} onClick={confirmar}>{texto}</Boton>
    </>
  );
}
