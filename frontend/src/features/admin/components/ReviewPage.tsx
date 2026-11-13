import { withQueryClient } from '../../../shared/lib/with-query-client';
import RoleGuard from '../../auth/components/RoleGuard';
import AdminNavigation from './AdminNavigation';
import ReviewList from './ReviewList';

function ReviewPage() {
  return (
    <RoleGuard role="administrador">
      <div className="flex flex-col gap-6">
        <AdminNavigation current="/admin/revision" />
        <ReviewList />
      </div>
    </RoleGuard>
  );
}

export default withQueryClient(ReviewPage);
