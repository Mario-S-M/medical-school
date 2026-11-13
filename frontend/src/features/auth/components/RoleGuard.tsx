import type { ReactNode } from 'react';
import useRoles from '../hooks/use-roles';
import SessionGuard from './SessionGuard';

type Props = { role: string | string[]; children: ReactNode };

function Content({ role, children }: Props) {
  const { loading, roles } = useRoles();
  if (loading) return <p role="status" className="text-center text-slate-500">Cargando…</p>;
  if (!([] as string[]).concat(role).some((r) => roles.includes(r))) {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-800">No tienes permiso para ver esta página.</p>
        <a className="mt-3 inline-block text-sm text-sky-700 underline" href="/panel">Volver al panel</a>
      </div>
    );
  }
  return <>{children}</>;
}

// Como SessionGuard, pero además exige un rol de la escuela (o uno de varios).
export default function RoleGuard(props: Props) {
  return (
    <SessionGuard>
      <Content {...props} />
    </SessionGuard>
  );
}
