import { useCallback, useEffect, useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { misInvitaciones } from '../api/equipo';
import type { InvitacionRecibida } from '../api/tipos_equipo';

export default function useMisInvitaciones() {
  const [invitaciones, setInvitaciones] = useState<InvitacionRecibida[]>([]);
  const recargar = useCallback(
    () => conSesion(misInvitaciones).then((r) => setInvitaciones(r.invitaciones)).catch(() => setInvitaciones([])),
    [],
  );
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { invitaciones, recargar };
}
