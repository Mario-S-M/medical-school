import type { CursoEdicion } from '../../api/tipos_escuela';
import FilaSeccion from './FilaSeccion';
import FormularioSeccion from './FormularioSeccion';

type Props = { curso: CursoEdicion; alCambiar: () => void };

export default function EditorTemario({ curso, alCambiar }: Props) {
  const bloqueado = curso.estado === 'en_revision';
  const { secciones } = curso;
  return (
    <section aria-labelledby="titulo-temario" className="flex max-w-2xl flex-col gap-4">
      <h2 id="titulo-temario" className="text-xl font-bold">Temario</h2>
      {bloqueado && <p className="text-sm text-slate-600">El curso está en revisión: el temario no se puede cambiar.</p>}
      {secciones.length === 0 && <p className="text-slate-500">Todavía no hay secciones.</p>}
      <ul className="flex flex-col gap-4">
        {secciones.map((s, i) => (
          <FilaSeccion key={s.id} seccion={s} cursoId={curso.id} primera={i === 0} ultima={i === secciones.length - 1} bloqueado={bloqueado} alCambiar={alCambiar} />
        ))}
      </ul>
      {!bloqueado && <FormularioSeccion cursoId={curso.id} alGuardar={alCambiar} />}
    </section>
  );
}
