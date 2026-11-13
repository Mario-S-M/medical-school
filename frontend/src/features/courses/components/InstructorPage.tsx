import { withQueryClient } from '../../../shared/lib/with-query-client';
import RoleGuard from '../../auth/components/RoleGuard';
import MyCourseList from './MyCourseList';

function InstructorPage() {
  return (
    <RoleGuard role={['instructor', 'equipo_apoyo']}>
      <MyCourseList />
    </RoleGuard>
  );
}

export default withQueryClient(InstructorPage);
