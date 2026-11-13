import { ArgsType, Field } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { IntegerField } from '../../../common/validators/field-rules';

// `curso_edicion(id)`.
@ArgsType()
export class CourseEditingArgs {
  @Field(() => BigIntScalar, { name: 'id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  id!: number;
}
