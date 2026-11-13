import { withQueryClient } from '../../../shared/lib/with-query-client';
import RoleGuard from '../../auth/components/RoleGuard';
import TeamManagement from './TeamManagement';

function TeamPage() {
  return (
    <RoleGuard role="instructor">
      <TeamManagement />
    </RoleGuard>
  );
}

export default withQueryClient(TeamPage);
