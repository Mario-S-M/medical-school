import { ArgsType, Field } from '@nestjs/graphql';
import { IsBoolean } from 'class-validator';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { IntegerField, TextField } from '../../../common/validators/field-rules';

// `enviar_revision(curso_id)`. Regla del workflow `enviar-a-revision`.
@ArgsType()
export class SubmitReviewArgs {
  @Field(() => BigIntScalar, { name: 'curso_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  curso_id!: number;
}

// `resolver_revision(curso_id, aprobar, comentario?)`. Reglas del workflow `resolver-revision`: el comentario solo es
// obligatorio al devolver el curso (lo comprueba el servicio, después de ver el estado, igual que el workflow).
@ArgsType()
export class ResolveReviewArgs {
  @Field(() => BigIntScalar, { name: 'curso_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  curso_id!: number;

  @Field(() => Boolean, { name: 'aprobar', description: 'true publica el curso; false lo devuelve a borrador con comentario.' })
  @IsBoolean({ message: 'Debe ser verdadero o falso.' }) // la lista blanca exige un decorador (GraphQL ya garantiza el tipo)
  aprobar!: boolean;

  @Field(() => String, { name: 'comentario', nullable: true })
  @TextField({ max: 1000, multiline: true })
  comentario?: string | null;
}

// `retirar_curso(curso_id, comentario)`. Reglas del workflow `retirar-curso`.
@ArgsType()
export class RetireCourseArgs {
  @Field(() => BigIntScalar, { name: 'curso_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  curso_id!: number;

  @Field(() => String, { name: 'comentario' })
  @TextField({ required: true, min: 1, max: 1000, multiline: true })
  comentario!: string;
}
