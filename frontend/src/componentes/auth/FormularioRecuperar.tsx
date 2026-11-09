import { recuperar } from '../../api/autenticacion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { guardarCorreoPendiente } from '../../sesion/correo_pendiente';
import { validarCorreo } from '../../validacion/correo';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoTexto from '../ui/CampoTexto';

export default function FormularioRecuperar() {
  const correo = useCampo(validarCorreo);
  const { enviar, enviando, error, restante } = useEnvio(
    () => recuperar({ correo: correo.valor.trim() }),
    () => {
      guardarCorreoPendiente(correo.valor.trim());
      window.location.assign('/restablecer');
    },
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (correo.validarYMarcar()) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id="correo" etiqueta="Correo" type="email" autoComplete="email" value={correo.valor} alCambiar={correo.alCambiar} onBlur={correo.alSalir} errores={[...correo.errores, ...detallesDeCampo(error, 'correo')]} />
      <BotonEnvio texto="Enviar código" enviando={enviando} restante={restante} />
    </form>
  );
}
