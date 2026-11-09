import { useEffect, useState } from 'react';
import { verificarCorreo } from '../../api/autenticacion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { borrarCorreoPendiente, leerCorreoPendiente } from '../../sesion/correo_pendiente';
import { validarCodigo } from '../../validacion/codigo';
import { validarCorreo } from '../../validacion/correo';
import AlertaError from '../ui/AlertaError';
import AlertaExito from '../ui/AlertaExito';
import BotonEnvio from '../ui/BotonEnvio';
import CampoCodigo from '../ui/CampoCodigo';
import CampoTexto from '../ui/CampoTexto';
import BotonReenviar from './BotonReenviar';

export default function FormularioVerificarCorreo() {
  const correo = useCampo(validarCorreo);
  const codigo = useCampo(validarCodigo);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorReenvio, setErrorReenvio] = useState<unknown>(null);
  const [listo, setListo] = useState(false);
  useEffect(() => correo.setValor(leerCorreoPendiente()), []);
  const { enviar, enviando, error, restante } = useEnvio(
    () => verificarCorreo({ correo: correo.valor.trim(), codigo: codigo.valor }),
    (r) => {
      borrarCorreoPendiente();
      setAviso(r.mensaje);
      setListo(true);
    },
  );
  if (listo) return (<><AlertaExito mensaje={aviso} /><a href="/iniciar-sesion" className="mt-4 inline-block text-sky-700 underline">Iniciar sesión</a></>);
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if ([correo.validarYMarcar(), codigo.validarYMarcar()].every(Boolean)) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-4">
      <AlertaError mensaje={error || errorReenvio ? mensajeDeError(error ?? errorReenvio) : null} />
      <AlertaExito mensaje={aviso} />
      <CampoTexto id="correo" etiqueta="Correo" type="email" autoComplete="email" value={correo.valor} alCambiar={correo.alCambiar} onBlur={correo.alSalir} errores={[...correo.errores, ...detallesDeCampo(error, 'correo')]} />
      <CampoCodigo id="codigo" value={codigo.valor} alCambiar={codigo.alCambiar} onBlur={codigo.alSalir} errores={[...codigo.errores, ...detallesDeCampo(error, 'codigo')]} />
      <BotonEnvio texto="Verificar correo" enviando={enviando} restante={restante} />
      <BotonReenviar correo={correo.valor} alReenviar={(m) => { setErrorReenvio(null); setAviso(m); }} alFallar={setErrorReenvio} />
    </form>
  );
}
