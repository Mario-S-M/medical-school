import { mensajeDeError } from '../../api/errores';
import useCategorias from '../../hooks/useCategorias';
import useCursoEdicion from '../../hooks/useCursoEdicion';
import AlertaError from '../ui/AlertaError';
import BannerEstado from './BannerEstado';
import FormularioDatosCurso from './FormularioDatosCurso';

export default function EditorCurso({ id }: { id: number }) {
  const { curso, error, recargar } = useCursoEdicion(id);
  const { lista } = useCategorias();
  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <AlertaError mensaje={mensajeDeError(error)} />
        <a className="text-sm text-sky-700 underline" href="/instructor">Volver a mis cursos</a>
      </div>
    );
  }
  if (!curso || !lista) return <p role="status" className="text-slate-500">Cargando…</p>;
  return (
    <section className="flex flex-col gap-5">
      <a className="text-sm text-sky-700 underline" href="/instructor">← Mis cursos</a>
      <h1 className="text-2xl font-bold">{curso.titulo}</h1>
      <BannerEstado estado={curso.estado} comentario={curso.comentario_revision} />
      {!curso.es_dueno && <p className="text-sm text-slate-600">Eres parte del equipo de apoyo: los datos del curso solo los cambia su instructor.</p>}
      <FormularioDatosCurso curso={curso} categorias={lista} alGuardar={() => void recargar()} />
    </section>
  );
}
