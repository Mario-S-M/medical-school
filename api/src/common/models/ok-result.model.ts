import { Field, ObjectType } from '@nestjs/graphql';

// Respuesta de las mutaciones que antes contestaban `204` (contrato: `{ ok: true }`).
@ObjectType('Confirmacion', { description: 'La operación se hizo.' })
export class OkResult {
  @Field(() => Boolean, { name: 'ok' })
  ok!: boolean;
}
