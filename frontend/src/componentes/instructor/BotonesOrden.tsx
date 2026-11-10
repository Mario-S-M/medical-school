import { conSesion } from '../../api/con_sesion';
import { mensajeDeError } from '../../api/errores';
import { mover, type Movimiento } from '../../api/temario';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';

type Props = { tipo: Movimiento['tipo']; id: number; nombre: string; primero: boolean; ultimo: boolean; alCambiar: () => void };

export default function BotonesOrden({ tipo, id, nombre, primero, ultimo, alCambiar }: Props) {
  const llamar = (direccion: Movimiento['direccion']) => () => conSesion((t) => mover(t, { tipo, id, direccion }));
  const subir = useEnvio(llamar('subir'), alCambiar);
  const bajar = useEnvio(llamar('bajar'), alCambiar);
  const error = subir.error ?? bajar.error;
  return (
    <span className="flex gap-1">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <Boton variante="secundario" aria-label={`Subir ${nombre}`} disabled={primero || subir.enviando} onClick={() => void subir.enviar()}>↑</Boton>
      <Boton variante="secundario" aria-label={`Bajar ${nombre}`} disabled={ultimo || bajar.enviando} onClick={() => void bajar.enviar()}>↓</Boton>
    </span>
  );
}
