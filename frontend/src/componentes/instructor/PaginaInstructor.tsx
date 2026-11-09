import GuardiaRol from '../auth/GuardiaRol';
import ListaMisCursos from './ListaMisCursos';

export default function PaginaInstructor() {
  return (
    <GuardiaRol rol={['instructor', 'equipo_apoyo']}>
      <ListaMisCursos />
    </GuardiaRol>
  );
}
