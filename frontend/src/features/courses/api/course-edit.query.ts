import { runGraphql } from '../../../shared/api/graphql';
import { graphql } from '../../../shared/graphql/generated/gql';
import { courseEditSchema } from '../schemas/course-schema';

const COURSE_EDIT_QUERY = graphql(`
  query curso_edicion($id: EnteroGrande!) {
    curso_edicion(id: $id) {
      id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel categoria_id
      estado comentario_revision portada_ruta actualizado_en es_dueno
      secciones {
        id titulo posicion
        clases {
          id titulo descripcion duracion_estimada_minutos es_muestra posicion
          video { estado duracion_segundos }
          video_nuevo { id estado error }
        }
      }
    }
  }
`);

export const fetchCourseEdit = (id: number) => runGraphql(COURSE_EDIT_QUERY, { id }, courseEditSchema);
