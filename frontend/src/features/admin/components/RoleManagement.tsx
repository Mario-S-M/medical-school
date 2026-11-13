import { useState } from 'react';
import type { SearchedUser } from '../schemas/review-schema';
import UserCard from './UserCard';
import UserSearch from './UserSearch';

export default function RoleManagement() {
  const [user, setUser] = useState<SearchedUser | null>(null);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Roles</h1>
      <p className="text-slate-600">Busca una cuenta por su correo para darle o quitarle un rol.</p>
      <UserSearch onFound={setUser} />
      {user && <UserCard key={user.id} user={user} onChange={setUser} />}
    </section>
  );
}
