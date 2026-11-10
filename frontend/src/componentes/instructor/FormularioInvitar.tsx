import { conSesion } from '../../api/con_sesion';
import { invitarEquipo } from '../../api/equipo';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { validarCorreo } from '../../validacion/correo';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoTexto from '../ui/CampoTexto';

export default function FormularioInvitar({ alInvitar }: { alInvitar: () => void }) {
  const correo = useCampo(validarCorreo);
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => invitarEquipo(token, correo.valor.trim())),
    () => (correo.setValor(''), alInvitar()),
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (correo.validarYMarcar()) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex max-w-xl flex-wrap items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id="correo_invitado" etiqueta="Correo de la persona a invitar" type="email" value={correo.valor} alCambiar={correo.alCambiar} onBlur={correo.alSalir} errores={[...correo.errores, ...detallesDeCampo(error, 'correo')]} />
      <div className="self-center pt-3"><BotonEnvio texto="Invitar" enviando={enviando} /></div>
    </form>
  );
}
