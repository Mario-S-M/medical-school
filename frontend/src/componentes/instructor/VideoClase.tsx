import type { Clase } from '../../api/tipos_escuela';
import useEstadoVideo from '../../hooks/useEstadoVideo';
import BotonesVideo from './BotonesVideo';
import EstadoVideo from './EstadoVideo';
import SubirVideo from './SubirVideo';

type Props = { clase: Clase; alCambiar: () => void };

// Video de una clase en el editor: estado, subir o reemplazar, reintentar y borrar.
export default function VideoClase({ clase, alCambiar }: Props) {
  const estado = useEstadoVideo(clase, alCambiar);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-slate-300 p-3">
      <EstadoVideo vigente={estado.vigente} nuevo={estado.nuevo} />
      <BotonesVideo claseId={clase.id} titulo={clase.titulo} estado={estado} alCambiar={alCambiar} />
      {!estado.enProceso && <SubirVideo claseId={clase.id} titulo={clase.titulo} reemplaza={!!estado.vigente} alTerminar={alCambiar} />}
    </div>
  );
}
