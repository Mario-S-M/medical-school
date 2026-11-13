import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { idSchema, type CourseData } from '../schemas/course-schema';

const UPDATE_COURSE = graphql(`
  mutation editar_curso(
    $curso_id: EnteroGrande!
    $titulo: String
    $subtitulo: String
    $descripcion: String
    $conocimientos_previos: String
    $lo_que_aprenderas: [String!]
    $nivel: String
    $categoria_id: Int
  ) {
    editar_curso(
      curso_id: $curso_id
      titulo: $titulo
      subtitulo: $subtitulo
      descripcion: $descripcion
      conocimientos_previos: $conocimientos_previos
      lo_que_aprenderas: $lo_que_aprenderas
      nivel: $nivel
      categoria_id: $categoria_id
    ) {
      id
    }
  }
`);

// Solo viajan los campos que declara la mutación (el cuerpo del formulario puede traer más).
export function updateCourse(body: CourseData) {
  const { curso_id, titulo, subtitulo, descripcion, conocimientos_previos, lo_que_aprenderas, nivel, categoria_id } = body;
  return runGraphql(UPDATE_COURSE, { curso_id, titulo, subtitulo, descripcion, conocimientos_previos, lo_que_aprenderas, nivel, categoria_id }, idSchema);
}
