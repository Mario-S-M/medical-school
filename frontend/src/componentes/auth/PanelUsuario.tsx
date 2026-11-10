import { useEffect, useState } from 'react';
import { quienSoy } from '../../api/autenticacion';
import { ErrorApi } from '../../api/errores';
import type { Usuario } from '../../api/tipos';
import useSesion from '../../hooks/useSesion';
import { guardarSesion } from '../../sesion/almacen_sesion';
import AlertaError from '../ui/AlertaError';
import BotonCerrarSesion from './BotonCerrarSesion';
import ListaInvitaciones from './ListaInvitaciones';

export default function PanelUsuario() {
  const { sesion } = useSesion();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    if (!sesion) return;
    quienSoy(sesion.token_acceso).then(setUsuario).catch((e) => {
      if (e instanceof ErrorApi && e.codigo === 'TOKEN_INVALIDO') guardarSesion(null);
      else setFallo(true);
    });
  }, [sesion?.token_acceso]);
  if (fallo) return <AlertaError mensaje="No pudimos cargar tu perfil. Inténtalo de nuevo." />;
  if (!usuario) return <p role="status">Cargando…</p>;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Hola, {usuario.nombre}</h1>
      <p className="text-slate-600">Sesión iniciada como <strong>{usuario.correo}</strong>.</p>
      <ListaInvitaciones />
      <div><BotonCerrarSesion /></div>
    </section>
  );
}
