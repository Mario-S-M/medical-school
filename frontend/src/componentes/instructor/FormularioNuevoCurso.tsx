import { conSesion } from '../../api/con_sesion';
import { crearCurso } from '../../api/escuela';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { navegar } from '../../sesion/navegar';
import { validarTitulo } from '../../validacion/curso';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoTexto from '../ui/CampoTexto';

export default function FormularioNuevoCurso() {
  const titulo = useCampo(validarTitulo);
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => crearCurso(token, titulo.valor.trim())),
    (r) => void navegar(`/instructor/curso?id=${r.id}`),
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (titulo.validarYMarcar()) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex max-w-xl flex-wrap items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id="titulo_nuevo" etiqueta="Título del curso nuevo" value={titulo.valor} alCambiar={titulo.alCambiar} onBlur={titulo.alSalir} errores={[...titulo.errores, ...detallesDeCampo(error, 'titulo')]} />
      <div className="self-center pt-3"><BotonEnvio texto="Crear curso" enviando={enviando} /></div>
    </form>
  );
}
