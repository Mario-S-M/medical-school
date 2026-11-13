import { withQueryClient } from '../../../shared/lib/with-query-client';
import RoleGuard from '../../auth/components/RoleGuard';
import AdminNavigation from './AdminNavigation';
import RoleManagement from './RoleManagement';

function RolesPage() {
  return (
    <RoleGuard role="administrador">
      <div className="flex flex-col gap-6">
        <AdminNavigation current="/admin/roles" />
        <RoleManagement />
      </div>
    </RoleGuard>
  );
}

export default withQueryClient(RolesPage);
