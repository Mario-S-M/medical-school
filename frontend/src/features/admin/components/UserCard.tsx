import type { SearchedUser } from '../schemas/review-schema';
import RoleSwitch from './RoleSwitch';

type Props = { user: SearchedUser; onChange: (user: SearchedUser) => void };

export default function UserCard({ user, onChange }: Props) {
  return (
    <section aria-label="Cuenta encontrada" className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{user.nombre ?? 'Sin nombre'}</h2>
      <p className="text-sm text-slate-600">{user.correo}{user.verificado ? '' : ' (sin verificar)'}</p>
      <ul className="mt-4 flex flex-col gap-2">
        <RoleSwitch user={user} role="instructor" label="Instructor" onChange={onChange} />
        <RoleSwitch user={user} role="administrador" label="Administrador" onChange={onChange} />
      </ul>
    </section>
  );
}
