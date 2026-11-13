import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsBoolean } from 'class-validator';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { IntegerField, OptionField, TextField } from '../../../common/validators/field-rules';

const ID_RULES = { min: 1, max: 9007199254740 } as const;

// Argumentos de las mutaciones del temario. Las propiedades llevan el nombre del contrato (`campo` de los `detalles`) y
// las reglas son las de los workflows `guardar-seccion`, `borrar-seccion`, `guardar-clase`, `borrar-clase` y `mover`.

@ArgsType()
export class SaveSectionArgs {
  @Field(() => BigIntScalar, { name: 'curso_id' })
  @IntegerField({ required: true, ...ID_RULES })
  curso_id!: number;

  @Field(() => BigIntScalar, { name: 'seccion_id', nullable: true, description: 'Con id se edita; sin id se crea al final.' })
  @IntegerField(ID_RULES)
  seccion_id?: number | null;

  @Field(() => String, { name: 'titulo' })
  @TextField({ required: true, min: 1, max: 120 })
  titulo!: string;
}

@ArgsType()
export class DeleteSectionArgs {
  @Field(() => BigIntScalar, { name: 'seccion_id' })
  @IntegerField({ required: true, ...ID_RULES })
  seccion_id!: number;
}

@ArgsType()
export class SaveLessonArgs {
  @Field(() => BigIntScalar, { name: 'seccion_id' })
  @IntegerField({ required: true, ...ID_RULES })
  seccion_id!: number;

  @Field(() => BigIntScalar, { name: 'clase_id', nullable: true, description: 'Con id se edita; sin id se crea al final.' })
  @IntegerField(ID_RULES)
  clase_id?: number | null;

  @Field(() => String, { name: 'titulo' })
  @TextField({ required: true, min: 1, max: 120 })
  titulo!: string;

  @Field(() => String, { name: 'descripcion', nullable: true })
  @TextField({ max: 2000, multiline: true })
  descripcion?: string | null;

  @Field(() => Int, { name: 'duracion_estimada_minutos', nullable: true })
  @IntegerField({ min: 1, max: 180 })
  duracion_estimada_minutos?: number | null;

  @Field(() => Boolean, { name: 'es_muestra' })
  @IsBoolean({ message: 'Debe ser verdadero o falso.' })
  es_muestra!: boolean;
}

@ArgsType()
export class DeleteLessonArgs {
  @Field(() => BigIntScalar, { name: 'clase_id' })
  @IntegerField({ required: true, ...ID_RULES })
  clase_id!: number;
}

export const MOVE_TYPES = ['seccion', 'clase'] as const;
export const MOVE_DIRECTIONS = ['subir', 'bajar'] as const;

@ArgsType()
export class MoveArgs {
  @Field(() => String, { name: 'tipo', description: 'seccion o clase.' })
  @OptionField(MOVE_TYPES)
  tipo!: (typeof MOVE_TYPES)[number];

  @Field(() => BigIntScalar, { name: 'id' })
  @IntegerField({ required: true, ...ID_RULES })
  id!: number;

  @Field(() => String, { name: 'direccion', description: 'subir o bajar.' })
  @OptionField(MOVE_DIRECTIONS)
  direccion!: (typeof MOVE_DIRECTIONS)[number];
}
