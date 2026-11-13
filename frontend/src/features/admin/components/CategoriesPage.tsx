import { withQueryClient } from '../../../shared/lib/with-query-client';
import RoleGuard from '../../auth/components/RoleGuard';
import AdminNavigation from './AdminNavigation';
import CategoryManagement from './CategoryManagement';

function CategoriesPage() {
  return (
    <RoleGuard role="administrador">
      <div className="flex flex-col gap-6">
        <AdminNavigation current="/admin/categorias" />
        <CategoryManagement />
      </div>
    </RoleGuard>
  );
}

export default withQueryClient(CategoriesPage);
