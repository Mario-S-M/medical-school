import { useState } from 'react';
import { conSesion } from '../../api/con_sesion';
import type { Clase } from '../../api/tipos_escuela';
import { borrarClase } from '../../api/temario';
import Boton from '../ui/Boton';
import BotonBorrar from './BotonBorrar';
import BotonesOrden from './BotonesOrden';
import FormularioClase from './FormularioClase';
import VideoClase from './VideoClase';

type Props = { clase: Clase; seccionId: number; primera: boolean; ultima: boolean; bloqueado: boolean; alCambiar: () => void };

export default function FilaClase({ clase, seccionId, primera, ultima, bloqueado, alCambiar }: Props) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <li className="flex flex-col gap-2">
        <FormularioClase seccionId={seccionId} clase={clase} alGuardar={() => (setEditando(false), alCambiar())} />
        <Boton variante="secundario" onClick={() => setEditando(false)}>Cancelar</Boton>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span>
        {clase.titulo}
        {clase.es_muestra && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Muestra</span>}
        {clase.duracion_estimada_minutos && <span className="ml-2 text-sm text-slate-500">{clase.duracion_estimada_minutos} min</span>}
      </span>
      {!bloqueado && (
        <span className="flex flex-wrap gap-1">
          <BotonesOrden tipo="clase" id={clase.id} nombre={clase.titulo} primero={primera} ultimo={ultima} alCambiar={alCambiar} />
          <Boton variante="secundario" aria-label={`Editar ${clase.titulo}`} onClick={() => setEditando(true)}>Editar</Boton>
          <BotonBorrar nombre={clase.titulo} accion={() => conSesion((t) => borrarClase(t, clase.id))} alBorrar={alCambiar} />
        </span>
      )}
      {!bloqueado && <div className="w-full"><VideoClase clase={clase} alCambiar={alCambiar} /></div>}
    </li>
  );
}
