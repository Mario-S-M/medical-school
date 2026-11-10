import type { Categoria } from '../../api/tipos_escuela';
import type useFormularioCurso from '../../hooks/useFormularioCurso';
import CampoAreaTexto from '../ui/CampoAreaTexto';
import CampoSelect from '../ui/CampoSelect';
import CampoTexto from '../ui/CampoTexto';

type Props = {
  campos: ReturnType<typeof useFormularioCurso>['campos'];
  categorias: Categoria[];
  bloqueado: boolean;
  detalles: (campo: string) => string[];
};

const NIVELES = [{ valor: 'basico', texto: 'Básico' }, { valor: 'intermedio', texto: 'Intermedio' }, { valor: 'avanzado', texto: 'Avanzado' }];

export default function CamposCurso({ campos: c, categorias, bloqueado, detalles }: Props) {
  const comunes = (k: keyof typeof c) => ({ value: c[k].valor, alCambiar: c[k].alCambiar, onBlur: c[k].alSalir, disabled: bloqueado, errores: [...c[k].errores, ...detalles(k)] });
  return (
    <>
      <CampoTexto id="titulo" etiqueta="Título" {...comunes('titulo')} />
      <CampoTexto id="subtitulo" etiqueta="Subtítulo" {...comunes('subtitulo')} />
      <CampoAreaTexto id="descripcion" etiqueta="Descripción" rows={6} {...comunes('descripcion')} />
      <CampoAreaTexto id="conocimientos_previos" etiqueta="Conocimientos previos" ayuda="Qué conviene saber antes de empezar." {...comunes('conocimientos_previos')} />
      <CampoAreaTexto id="lo_que_aprenderas" etiqueta="Lo que aprenderás" ayuda="Un punto por línea, hasta 10." {...comunes('lo_que_aprenderas')} />
      <CampoSelect id="nivel" etiqueta="Nivel" opciones={NIVELES} {...comunes('nivel')} />
      <CampoSelect id="categoria_id" etiqueta="Categoría" opciones={categorias.map((x) => ({ valor: String(x.id), texto: x.nombre }))} {...comunes('categoria_id')} />
    </>
  );
}
