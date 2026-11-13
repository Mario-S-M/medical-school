import { getParam } from '../../../shared/lib/url-params';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import RoleGuard from '../../auth/components/RoleGuard';
import CourseEditor from './CourseEditor';

function EditorPage() {
  const id = Number(getParam('id'));
  return (
    <RoleGuard role={['instructor', 'equipo_apoyo']}>
      {Number.isInteger(id) && id > 0 ? <CourseEditor id={id} /> : <p role="alert">Falta indicar el curso.</p>}
    </RoleGuard>
  );
}

export default withQueryClient(EditorPage);
