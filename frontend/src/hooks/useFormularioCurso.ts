import type { CursoEdicion, DatosCurso } from '../api/tipos_escuela';
import { lineas, validarAprenderas, validarDescripcion, validarPrevios, validarSubtitulo, validarTitulo } from '../validacion/curso';
import useCampo from './useCampo';

// Estado de los campos del formulario de datos del curso y el cuerpo que se envía a la API.
export default function useFormularioCurso(c: CursoEdicion) {
  const campos = {
    titulo: useCampo(validarTitulo, c.titulo),
    subtitulo: useCampo(validarSubtitulo, c.subtitulo ?? ''),
    descripcion: useCampo(validarDescripcion, c.descripcion ?? ''),
    conocimientos_previos: useCampo(validarPrevios, c.conocimientos_previos ?? ''),
    lo_que_aprenderas: useCampo(validarAprenderas, c.lo_que_aprenderas.join('\n')),
    nivel: useCampo(() => [], c.nivel ?? ''),
    categoria_id: useCampo(() => [], c.categoria_id ? String(c.categoria_id) : ''),
  };
  const validar = () => Object.values(campos).map((x) => x.validarYMarcar()).every(Boolean);
  const cuerpo = (): DatosCurso => ({
    curso_id: c.id,
    titulo: campos.titulo.valor.trim(),
    subtitulo: campos.subtitulo.valor.trim(),
    descripcion: campos.descripcion.valor.trim(),
    conocimientos_previos: campos.conocimientos_previos.valor.trim(),
    lo_que_aprenderas: lineas(campos.lo_que_aprenderas.valor),
    nivel: (campos.nivel.valor || null) as DatosCurso['nivel'],
    categoria_id: campos.categoria_id.valor ? Number(campos.categoria_id.valor) : null,
  });
  return { campos, validar, cuerpo };
}
