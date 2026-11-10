import { mensajeDeError } from '../../api/errores';
import { urlPortada } from '../../api/portada';
import useFichaCurso from '../../hooks/useFichaCurso';
import useRoles from '../../hooks/useRoles';
import { parametro } from '../../sesion/parametros';
import AlertaError from '../ui/AlertaError';
import RetirarCurso from '../admin/RetirarCurso';
import TemarioPublico from './TemarioPublico';
import { ETIQUETA_NIVEL } from './TarjetaCurso';

export default function FichaCurso() {
  const slug = parametro('c') ?? '';
  const { curso, error } = useFichaCurso(slug);
  const { roles } = useRoles();
  if (error) return <AlertaError mensaje={`${mensajeDeError(error)} El curso no existe o ya no está disponible.`} />;
  if (!curso) return <p role="status" className="text-slate-500">Cargando…</p>;
  const portada = urlPortada(curso.portada_ruta);
  return (
    <article className="flex max-w-3xl flex-col gap-5">
      {portada && <img src={portada} alt={`Portada de ${curso.titulo}`} className="h-64 w-full rounded-2xl object-cover" />}
      <h1 className="text-3xl font-bold">{curso.titulo}</h1>
      {curso.subtitulo && <p className="text-lg text-slate-700">{curso.subtitulo}</p>}
      <p className="text-sm text-slate-600">{curso.instructor}{curso.categoria ? ` · ${curso.categoria.nombre}` : ''}{curso.nivel ? ` · ${ETIQUETA_NIVEL[curso.nivel]}` : ''}</p>
      {curso.descripcion && <p className="whitespace-pre-line">{curso.descripcion}</p>}
      {curso.lo_que_aprenderas.length > 0 && (
        <section aria-labelledby="aprenderas"><h2 id="aprenderas" className="text-xl font-bold">Lo que aprenderás</h2>
          <ul className="mt-2 list-disc pl-5">{curso.lo_que_aprenderas.map((p) => <li key={p}>{p}</li>)}</ul></section>
      )}
      {curso.conocimientos_previos && <section aria-labelledby="previos"><h2 id="previos" className="text-xl font-bold">Conocimientos previos</h2><p className="mt-2 whitespace-pre-line">{curso.conocimientos_previos}</p></section>}
      <section aria-labelledby="temario"><h2 id="temario" className="mb-2 text-xl font-bold">Temario</h2><TemarioPublico secciones={curso.secciones} /></section>
      {roles.includes('administrador') && <RetirarCurso cursoId={curso.id} />}
    </article>
  );
}
