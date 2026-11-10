import { conSesion } from '../../api/con_sesion';
import { responderInvitacion } from '../../api/equipo';
import { mensajeDeError } from '../../api/errores';
import type { InvitacionRecibida } from '../../api/tipos_equipo';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';

type Props = { invitacion: InvitacionRecibida; alResponder: () => void };

export default function TarjetaInvitacion({ invitacion, alResponder }: Props) {
  const aceptar = useEnvio(() => conSesion((t) => responderInvitacion(t, invitacion.id, true)), () => window.location.assign('/instructor'));
  const rechazar = useEnvio(() => conSesion((t) => responderInvitacion(t, invitacion.id, false)), alResponder);
  const error = aceptar.error ?? rechazar.error;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <p><strong>{invitacion.instructor}</strong> te invitó a su equipo de apoyo.</p>
      <p className="text-sm text-slate-500">Vence el {new Date(invitacion.expira_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.</p>
      <div className="flex gap-2">
        <Boton disabled={aceptar.enviando} onClick={() => void aceptar.enviar()}>Aceptar</Boton>
        <Boton variante="secundario" disabled={rechazar.enviando} onClick={() => void rechazar.enviar()}>Rechazar</Boton>
      </div>
    </li>
  );
}
