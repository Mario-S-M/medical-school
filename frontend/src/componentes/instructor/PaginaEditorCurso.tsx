import { parametro } from '../../sesion/parametros';
import GuardiaRol from '../auth/GuardiaRol';
import EditorCurso from './EditorCurso';

export default function PaginaEditorCurso() {
  const id = Number(parametro('id'));
  return (
    <GuardiaRol rol={['instructor', 'equipo_apoyo']}>
      {Number.isInteger(id) && id > 0 ? <EditorCurso id={id} /> : <p role="alert">Falta indicar el curso.</p>}
    </GuardiaRol>
  );
}
