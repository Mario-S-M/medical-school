import { useEffect } from 'react';
import { restablecer } from '../../api/autenticacion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { borrarCorreoPendiente, leerCorreoPendiente } from '../../sesion/correo_pendiente';
import { validarCodigo } from '../../validacion/codigo';
import { contrasenaValida, reglasContrasena } from '../../validacion/contrasena';
import { validarCorreo } from '../../validacion/correo';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoCodigo from '../ui/CampoCodigo';
import CampoContrasena from '../ui/CampoContrasena';
import CampoTexto from '../ui/CampoTexto';
import ListaReglas from '../ui/ListaReglas';

export default function FormularioRestablecer() {
  const correo = useCampo(validarCorreo);
  const codigo = useCampo(validarCodigo);
  const contrasena = useCampo();
  useEffect(() => correo.setValor(leerCorreoPendiente()), []);
  const { enviar, enviando, error, restante } = useEnvio(
    () => restablecer({ correo: correo.valor.trim(), codigo: codigo.valor, contrasena_nueva: contrasena.valor }),
    () => {
      borrarCorreoPendiente();
      window.location.assign('/iniciar-sesion');
    },
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    const validos = [correo.validarYMarcar(), codigo.validarYMarcar()];
    if (validos.every(Boolean) && contrasenaValida(contrasena.valor, correo.valor)) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id="correo" etiqueta="Correo" type="email" autoComplete="email" value={correo.valor} alCambiar={correo.alCambiar} onBlur={correo.alSalir} errores={[...correo.errores, ...detallesDeCampo(error, 'correo')]} />
      <CampoCodigo id="codigo" value={codigo.valor} alCambiar={codigo.alCambiar} onBlur={codigo.alSalir} errores={[...codigo.errores, ...detallesDeCampo(error, 'codigo')]} />
      <CampoContrasena id="contrasena" etiqueta="Contraseña nueva" autoComplete="new-password" value={contrasena.valor} alCambiar={contrasena.alCambiar} errores={detallesDeCampo(error, 'contrasena_nueva')} />
      <ListaReglas reglas={reglasContrasena(contrasena.valor, correo.valor)} />
      <BotonEnvio texto="Cambiar contraseña" enviando={enviando} restante={restante} />
    </form>
  );
}
