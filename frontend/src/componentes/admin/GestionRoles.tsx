import { useState } from 'react';
import type { UsuarioBuscado } from '../../api/tipos_escuela';
import BuscadorUsuario from './BuscadorUsuario';
import TarjetaUsuario from './TarjetaUsuario';

export default function GestionRoles() {
  const [usuario, setUsuario] = useState<UsuarioBuscado | null>(null);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Roles</h1>
      <p className="text-slate-600">Busca una cuenta por su correo para darle o quitarle un rol.</p>
      <BuscadorUsuario alEncontrar={setUsuario} />
      {usuario && <TarjetaUsuario key={usuario.id} usuario={usuario} alCambiar={setUsuario} />}
    </section>
  );
}
