import { ArgsType, Field, Int } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { IntegerField, OptionField, TextField, TextListField } from '../../../common/validators/field-rules';

export const LEVELS = ['basico', 'intermedio', 'avanzado'] as const;
export type Level = (typeof LEVELS)[number];

// `editar_curso(curso_id, ...campos)`. Reglas del workflow `editar-curso`. Solo se cambian los campos enviados: `undefined`
// es "no enviado" y `null` (o `""`) es "enviado vacío" (borra el valor, salvo el título, que se conserva). El slug no se acepta.
@ArgsType()
export class EditCourseArgs {
  @Field(() => BigIntScalar, { name: 'curso_id' })
  @IntegerField({ required: true, min: 1, max: 9007199254740 })
  curso_id!: number;

  @Field(() => String, { name: 'titulo', nullable: true })
  @TextField({ min: 5, max: 120, alphanumeric: true })
  titulo?: string | null;

  @Field(() => String, { name: 'subtitulo', nullable: true })
  @TextField({ max: 200 })
  subtitulo?: string | null;

  @Field(() => String, { name: 'descripcion', nullable: true })
  @TextField({ max: 5000, multiline: true })
  descripcion?: string | null;

  @Field(() => String, { name: 'conocimientos_previos', nullable: true })
  @TextField({ max: 2000, multiline: true })
  conocimientos_previos?: string | null;

  @Field(() => [String], { name: 'lo_que_aprenderas', nullable: true })
  @TextListField({ maxItems: 10, maxLength: 150 })
  lo_que_aprenderas?: string[] | null;

  @Field(() => String, { name: 'nivel', nullable: true, description: 'basico, intermedio o avanzado.' })
  @OptionField(LEVELS, false)
  nivel?: Level | null;

  @Field(() => Int, { name: 'categoria_id', nullable: true })
  @IntegerField({ min: 1, max: 32000 })
  categoria_id?: number | null;
}
