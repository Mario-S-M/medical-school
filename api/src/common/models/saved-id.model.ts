import { Field, ObjectType } from '@nestjs/graphql';
import { BigIntScalar } from '../scalars/big-int.scalar';

// Respuesta de las mutaciones que antes contestaban `{ id }`.
@ObjectType('Identificador', { description: 'Identificador del elemento creado o editado.' })
export class SavedId {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;
}
