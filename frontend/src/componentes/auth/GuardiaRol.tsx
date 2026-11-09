import type { ReactNode } from 'react';
import useRoles from '../../hooks/useRoles';
import GuardiaSesion from './GuardiaSesion';

type Props = { rol: string | string[]; children: ReactNode };

function Contenido({ rol, children }: Props) {
  const { cargando, roles } = useRoles();
  if (cargando) return <p role="status" className="text-center text-slate-500">Cargando…</p>;
  if (!([] as string[]).concat(rol).some((r) => roles.includes(r))) {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-800">No tienes permiso para ver esta página.</p>
        <a className="mt-3 inline-block text-sm text-sky-700 underline" href="/panel">Volver al panel</a>
      </div>
    );
  }
  return <>{children}</>;
}

// Como GuardiaSesion, pero además exige un rol de la escuela (o uno de varios).
export default function GuardiaRol(props: Props) {
  return (
    <GuardiaSesion>
      <Contenido {...props} />
    </GuardiaSesion>
  );
}
