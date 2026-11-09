import { registro } from '../../api/autenticacion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { guardarCorreoPendiente } from '../../sesion/correo_pendiente';
import { validarCorreo } from '../../validacion/correo';
import { contrasenaValida, reglasContrasena } from '../../validacion/contrasena';
import { validarNombre } from '../../validacion/nombre';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoContrasena from '../ui/CampoContrasena';
import CampoTexto from '../ui/CampoTexto';
import ListaReglas from '../ui/ListaReglas';

export default function FormularioRegistro() {
  const nombre = useCampo(validarNombre);
  const correo = useCampo(validarCorreo);
  const contrasena = useCampo();
  const { enviar, enviando, error, restante } = useEnvio(
    () => registro({ correo: correo.valor.trim(), nombre: nombre.valor.trim(), contrasena: contrasena.valor }),
    () => {
      guardarCorreoPendiente(correo.valor.trim());
      window.location.assign('/verificar-correo');
    },
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    const validos = [nombre.validarYMarcar(), correo.validarYMarcar()];
    if (validos.every(Boolean) && contrasenaValida(contrasena.valor, correo.valor)) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id="nombre" etiqueta="Nombre" autoComplete="name" value={nombre.valor} alCambiar={nombre.alCambiar} onBlur={nombre.alSalir} errores={[...nombre.errores, ...detallesDeCampo(error, 'nombre')]} />
      <CampoTexto id="correo" etiqueta="Correo" type="email" autoComplete="email" value={correo.valor} alCambiar={correo.alCambiar} onBlur={correo.alSalir} errores={[...correo.errores, ...detallesDeCampo(error, 'correo')]} />
      <CampoContrasena id="contrasena" etiqueta="Contraseña" autoComplete="new-password" value={contrasena.valor} alCambiar={contrasena.alCambiar} errores={detallesDeCampo(error, 'contrasena')} />
      <ListaReglas reglas={reglasContrasena(contrasena.valor, correo.valor)} />
      <BotonEnvio texto="Crear cuenta" enviando={enviando} restante={restante} />
    </form>
  );
}
