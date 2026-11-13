import { ArgsType, Field } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { IntegerField } from '../../../common/validators/field-rules';

@ArgsType()
export class PlaybackLessonArgs {
  @Field(() => BigIntScalar, { name: 'clase_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  clase_id!: number;
}
