import { conSesion } from '../../api/con_sesion';
import { cancelarInvitacion, quitarMiembro } from '../../api/equipo';
import { mensajeDeError } from '../../api/errores';
import useMiEquipo from '../../hooks/useMiEquipo';
import AlertaError from '../ui/AlertaError';
import BotonBorrar from './BotonBorrar';
import FormularioInvitar from './FormularioInvitar';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

export default function GestionEquipo() {
  const { equipo, error, recargar } = useMiEquipo();
  const fila = 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2';
  return (
    <section className="flex max-w-2xl flex-col gap-5">
      <a className="text-sm text-sky-700 underline" href="/instructor">← Mis cursos</a>
      <h1 className="text-2xl font-bold">Mi equipo de apoyo</h1>
      <p className="text-slate-600">Quien acepte tu invitación podrá armar el temario de tus cursos. Solo se invita a cuentas ya registradas y verificadas.</p>
      <FormularioInvitar alInvitar={() => void recargar()} />
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <h2 className="text-xl font-bold">Miembros</h2>
      {equipo?.miembros.length === 0 && <p className="text-slate-500">Todavía no tienes miembros.</p>}
      <ul className="flex flex-col gap-2">
        {equipo?.miembros.map((m) => (
          <li key={m.miembro_id} className={fila}>
            <span>{m.correo ?? 'Miembro'} <span className="text-sm text-slate-500">desde {fecha(m.desde)}</span></span>
            <BotonBorrar texto="Quitar" nombre={m.correo ?? 'miembro'} accion={() => conSesion((t) => quitarMiembro(t, m.miembro_id))} alBorrar={() => void recargar()} />
          </li>
        ))}
      </ul>
      <h2 className="text-xl font-bold">Invitaciones pendientes</h2>
      {equipo?.invitaciones.length === 0 && <p className="text-slate-500">No hay invitaciones pendientes.</p>}
      <ul className="flex flex-col gap-2">
        {equipo?.invitaciones.map((i) => (
          <li key={i.id} className={fila}>
            <span>{i.correo} <span className="text-sm text-slate-500">vence el {fecha(i.expira_en)}</span></span>
            <BotonBorrar texto="Cancelar" nombre={i.correo} accion={() => conSesion((t) => cancelarInvitacion(t, i.id))} alBorrar={() => void recargar()} />
          </li>
        ))}
      </ul>
    </section>
  );
}
