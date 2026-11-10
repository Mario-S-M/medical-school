import { conSesion } from '../../api/con_sesion';
import { editarCurso } from '../../api/escuela';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import type { Categoria, CursoEdicion } from '../../api/tipos_escuela';
import useEnvio from '../../hooks/useEnvio';
import useFormularioCurso from '../../hooks/useFormularioCurso';
import AlertaError from '../ui/AlertaError';
import AlertaExito from '../ui/AlertaExito';
import BotonEnvio from '../ui/BotonEnvio';
import CamposCurso from './CamposCurso';
import { useState } from 'react';

type Props = { curso: CursoEdicion; categorias: Categoria[]; alGuardar: () => void };

export default function FormularioDatosCurso({ curso, categorias, alGuardar }: Props) {
  const { campos, validar, cuerpo } = useFormularioCurso(curso);
  const [guardado, setGuardado] = useState(false);
  const bloqueado = !curso.es_dueno || curso.estado === 'en_revision';
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => editarCurso(token, cuerpo())),
    () => (setGuardado(true), alGuardar()),
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    setGuardado(false);
    if (validar()) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex max-w-2xl flex-col gap-4">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      {guardado && <AlertaExito mensaje="Cambios guardados." />}
      <CamposCurso campos={campos} categorias={categorias} bloqueado={bloqueado} detalles={(k) => detallesDeCampo(error, k)} />
      {!bloqueado && <BotonEnvio texto="Guardar cambios" enviando={enviando} />}
    </form>
  );
}
