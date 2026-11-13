import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IntegerField, OptionField, TextField } from '../../../common/validators/field-rules';
import { LEVELS } from '../../courses/dto/edit-course.args';

// `cursos(q, categoria, nivel, pagina)`. Reglas del workflow `cursos`: todo opcional.
@ArgsType()
export class CatalogArgs {
  @Field(() => String, { name: 'q', nullable: true, description: 'Texto de búsqueda (título, subtítulo, descripción o instructor).' })
  @TextField({ max: 100 })
  q?: string | null;

  @Field(() => String, { name: 'categoria', nullable: true, description: 'Slug de la categoría.' })
  @TextField({ max: 80 })
  categoria?: string | null;

  @Field(() => String, { name: 'nivel', nullable: true, description: 'basico, intermedio o avanzado.' })
  @OptionField(LEVELS, false)
  nivel?: string | null;

  @Field(() => Int, { name: 'pagina', nullable: true, description: 'Desde 1 (por omisión, 1).' })
  @IntegerField({ min: 1, max: 10000 })
  pagina?: number | null;
}

// `curso(slug)`. Regla del workflow `curso-publico`.
@ArgsType()
export class CourseSlugArgs {
  @Field(() => String, { name: 'slug' })
  @TextField({ required: true, min: 1, max: 120 })
  slug!: string;
}
