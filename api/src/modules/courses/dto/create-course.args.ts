import { ArgsType, Field } from '@nestjs/graphql';
import { TextField } from '../../../common/validators/field-rules';

// `crear_curso(titulo)`. Reglas del workflow `crear-curso`.
@ArgsType()
export class CreateCourseArgs {
  @Field(() => String, { name: 'titulo' })
  @TextField({ required: true, min: 5, max: 120, alphanumeric: true })
  titulo!: string;
}
