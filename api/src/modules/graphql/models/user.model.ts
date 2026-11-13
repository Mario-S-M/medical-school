import { Field, ID, ObjectType } from '@nestjs/graphql';

// El tipo y sus campos se llaman como en el contrato GraphQL (`Usuario { id, correo, nombre }`).
@ObjectType('Usuario', { description: 'Persona con la sesión iniciada.' })
export class User {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { name: 'correo' })
  email!: string;

  @Field(() => String, { name: 'nombre' })
  name!: string;
}
