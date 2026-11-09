import { conSesion } from '../../api/con_sesion';
import { buscarUsuario } from '../../api/escuela';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import type { UsuarioBuscado } from '../../api/tipos_escuela';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { validarCorreo } from '../../validacion/correo';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoTexto from '../ui/CampoTexto';

type Props = { alEncontrar: (usuario: UsuarioBuscado) => void };

export default function BuscadorUsuario({ alEncontrar }: Props) {
  const correo = useCampo(validarCorreo);
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => buscarUsuario(token, correo.valor.trim())),
    alEncontrar,
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (correo.validarYMarcar()) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex max-w-md flex-col gap-3">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id="correo_usuario" etiqueta="Correo de la cuenta" type="email" value={correo.valor} alCambiar={correo.alCambiar} onBlur={correo.alSalir} errores={[...correo.errores, ...detallesDeCampo(error, 'correo')]} />
      <BotonEnvio texto="Buscar cuenta" enviando={enviando} />
    </form>
  );
}
