import { ArgsType, Field } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { IntegerField } from '../../../common/validators/field-rules';

const ID_RULES = { min: 1, max: 9007199254740 } as const;

// Argumentos de las operaciones de video de GraphQL (reglas de los workflows de la SPEC 08).

@ArgsType()
export class VideoLessonArgs {
  @Field(() => BigIntScalar, { name: 'clase_id' })
  @IntegerField({ required: true, ...ID_RULES })
  clase_id!: number;
}

@ArgsType()
export class VideoIdArgs {
  @Field(() => BigIntScalar, { name: 'video_id' })
  @IntegerField({ required: true, ...ID_RULES })
  video_id!: number;
}
