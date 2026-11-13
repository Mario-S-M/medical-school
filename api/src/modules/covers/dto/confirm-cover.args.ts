import { ArgsType, Field } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { IntegerField, TextField } from '../../../common/validators/field-rules';

// `confirmar_portada(curso_id, ruta)`. Reglas del workflow `confirmar-portada`.
@ArgsType()
export class ConfirmCoverArgs {
  @Field(() => BigIntScalar, { name: 'curso_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  curso_id!: number;

  @Field(() => String, { name: 'ruta', description: 'Ruta que devolvió la firma: cursos/<curso_id>/portada-<uuid>.<ext>.' })
  @TextField({ required: true, min: 1, max: 200 })
  ruta!: string;
}
