import { withQueryClient } from '../../../shared/lib/with-query-client';
import SessionGuard from './SessionGuard';
import UserPanel from './UserPanel';

function ProtectedPanel() {
  return (
    <SessionGuard>
      <UserPanel />
    </SessionGuard>
  );
}

export default withQueryClient(ProtectedPanel);
