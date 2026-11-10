import { useState } from 'react';
import { conSesion } from '../../api/con_sesion';
import type { Seccion } from '../../api/tipos_escuela';
import { borrarSeccion } from '../../api/temario';
import Boton from '../ui/Boton';
import BotonBorrar from './BotonBorrar';
import BotonesOrden from './BotonesOrden';
import FilaClase from './FilaClase';
import FormularioClase from './FormularioClase';
import FormularioSeccion from './FormularioSeccion';

type Props = { seccion: Seccion; cursoId: number; primera: boolean; ultima: boolean; bloqueado: boolean; alCambiar: () => void };

export default function FilaSeccion({ seccion, cursoId, primera, ultima, bloqueado, alCambiar }: Props) {
  const [editando, setEditando] = useState(false);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{seccion.posicion}. {seccion.titulo}</h3>
        {!bloqueado && (
          <span className="flex flex-wrap gap-1">
            <BotonesOrden tipo="seccion" id={seccion.id} nombre={seccion.titulo} primero={primera} ultimo={ultima} alCambiar={alCambiar} />
            <Boton variante="secundario" aria-label={`Renombrar ${seccion.titulo}`} onClick={() => setEditando(!editando)}>Renombrar</Boton>
            <BotonBorrar nombre={seccion.titulo} accion={() => conSesion((t) => borrarSeccion(t, seccion.id))} alBorrar={alCambiar} />
          </span>
        )}
      </div>
      {editando && <FormularioSeccion cursoId={cursoId} seccion={seccion} alGuardar={() => (setEditando(false), alCambiar())} />}
      <ul className="flex flex-col gap-2">
        {seccion.clases.map((c, i) => (
          <FilaClase key={c.id} clase={c} seccionId={seccion.id} primera={i === 0} ultima={i === seccion.clases.length - 1} bloqueado={bloqueado} alCambiar={alCambiar} />
        ))}
      </ul>
      {!bloqueado && <FormularioClase seccionId={seccion.id} alGuardar={alCambiar} />}
    </li>
  );
}
