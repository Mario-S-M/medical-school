import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import useCampo from '../../hooks/useCampo';
import useInicioSesion from '../../hooks/useInicioSesion';
import { validarCorreo } from '../../validacion/correo';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoContrasena from '../ui/CampoContrasena';
import CampoTexto from '../ui/CampoTexto';

export default function FormularioInicioSesion() {
  const correo = useCampo(validarCorreo);
  const contrasena = useCampo((v) => (v ? [] : ['Escribe tu contraseña.']));
  const { enviar, enviando, error, restante } = useInicioSesion(correo.valor, contrasena.valor);
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if ([correo.validarYMarcar(), contrasena.validarYMarcar()].every(Boolean)) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id="correo" etiqueta="Correo" type="email" autoComplete="email" value={correo.valor} alCambiar={correo.alCambiar} onBlur={correo.alSalir} errores={[...correo.errores, ...detallesDeCampo(error, 'correo')]} />
      <CampoContrasena id="contrasena" etiqueta="Contraseña" autoComplete="current-password" value={contrasena.valor} alCambiar={contrasena.alCambiar} onBlur={contrasena.alSalir} errores={contrasena.errores} />
      <BotonEnvio texto="Iniciar sesión" enviando={enviando} restante={restante} />
    </form>
  );
}
