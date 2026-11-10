import { useState } from 'react';
import { conSesion } from '../../api/con_sesion';
import { borrarCategoria } from '../../api/escuela';
import { mensajeDeError } from '../../api/errores';
import type { Categoria } from '../../api/tipos_escuela';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';
import FormularioCategoria from './FormularioCategoria';

type Props = { categoria: Categoria; alCambiar: () => void };

export default function FilaCategoria({ categoria, alCambiar }: Props) {
  const [editando, setEditando] = useState(false);
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => borrarCategoria(token, categoria.id)),
    alCambiar,
  );
  const borrar = () => {
    if (window.confirm(`¿Borrar la categoría "${categoria.nombre}"?`)) void enviar();
  };
  if (editando) {
    return (
      <li className="rounded-lg border border-sky-200 bg-sky-50 p-3">
        <FormularioCategoria inicial={categoria} posicionSugerida={categoria.posicion} alGuardar={() => (setEditando(false), alCambiar())} />
        <Boton variante="secundario" onClick={() => setEditando(false)}>Cancelar</Boton>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <div className="flex items-center justify-between gap-3">
        <span><strong>{categoria.nombre}</strong> <span className="text-sm text-slate-500">· posición {categoria.posicion}</span></span>
        <span className="flex gap-2">
          <Boton variante="secundario" onClick={() => setEditando(true)}>Editar</Boton>
          <Boton variante="secundario" disabled={enviando} onClick={borrar}>Borrar</Boton>
        </span>
      </div>
    </li>
  );
}
