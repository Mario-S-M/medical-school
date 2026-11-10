import { useEffect, useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { misRoles } from '../api/escuela';
import type { MisRoles } from '../api/tipos_escuela';
import useSesion from './useSesion';

const VACIO: MisRoles = { roles: [], equipos: [] };
const cache = new Map<string, Promise<MisRoles>>();

// Roles del usuario con sesión. Una sola consulta por usuario y página (se repite al recargar).
export default function useRoles() {
  const id = useSesion().sesion?.usuario.id;
  const [datos, setDatos] = useState<{ id: string; roles: MisRoles } | null>(null);
  useEffect(() => {
    if (!id) return;
    if (!cache.has(id)) {
      cache.set(id, conSesion(misRoles).catch(() => (cache.delete(id), VACIO)));
    }
    void cache.get(id)!.then((roles) => setDatos({ id, roles }));
  }, [id]);
  const listo = !!id && datos?.id === id;
  return { cargando: !!id && !listo, ...(listo ? datos.roles : VACIO) };
}
