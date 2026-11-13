import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('EquipoApoyo', { description: 'Equipo de un instructor al que pertenece la persona.' })
export class SupportTeam {
  @Field(() => ID, { name: 'instructor_id' })
  instructorId!: string;

  @Field(() => String, { name: 'nombre_publico', nullable: true })
  publicName!: string | null;
}

@ObjectType('MisRoles', { description: 'Roles extra de la persona (el estudiante es implícito) y sus equipos de apoyo.' })
export class MyRoles {
  @Field(() => [String], { name: 'roles' })
  roles!: string[];

  @Field(() => [SupportTeam], { name: 'equipos' })
  teams!: SupportTeam[];
}
