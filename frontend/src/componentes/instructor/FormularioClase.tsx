import { conSesion } from '../../api/con_sesion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import type { Clase } from '../../api/tipos_escuela';
import { guardarClase } from '../../api/temario';
import useEnvio from '../../hooks/useEnvio';
import useFormularioClase from '../../hooks/useFormularioClase';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoAreaTexto from '../ui/CampoAreaTexto';
import CampoCasilla from '../ui/CampoCasilla';
import CampoTexto from '../ui/CampoTexto';

type Props = { seccionId: number; clase?: Clase; alGuardar: () => void };

export default function FormularioClase({ seccionId, clase, alGuardar }: Props) {
  const f = useFormularioClase(seccionId, clase);
  const sufijo = clase?.id ?? `nueva_${seccionId}`;
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => guardarClase(token, f.cuerpo())),
    () => (clase ? null : f.vaciar(), alGuardar()),
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.validar()) void enviar();
  };
  const err = (c: typeof f.titulo, k: string) => [...c.errores, ...detallesDeCampo(error, k)];
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id={`clase_titulo_${sufijo}`} etiqueta="Título de la clase" value={f.titulo.valor} alCambiar={f.titulo.alCambiar} onBlur={f.titulo.alSalir} errores={err(f.titulo, 'titulo')} />
      <CampoAreaTexto id={`clase_desc_${sufijo}`} etiqueta="Descripción de la clase" rows={2} value={f.descripcion.valor} alCambiar={f.descripcion.alCambiar} onBlur={f.descripcion.alSalir} errores={err(f.descripcion, 'descripcion')} />
      <CampoTexto id={`clase_min_${sufijo}`} etiqueta="Duración estimada (minutos)" type="number" value={f.duracion.valor} alCambiar={f.duracion.alCambiar} onBlur={f.duracion.alSalir} errores={err(f.duracion, 'duracion_estimada_minutos')} />
      <CampoCasilla id={`clase_muestra_${sufijo}`} etiqueta="Clase muestra (la verá cualquier visitante)" marcado={f.muestra} alCambiar={f.setMuestra} />
      <BotonEnvio texto={clase ? 'Guardar clase' : 'Añadir clase'} enviando={enviando} />
    </form>
  );
}
