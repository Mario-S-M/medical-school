import { ArgsType, Field, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

// `guardar_categoria(id?, nombre, posicion)`. Las propiedades llevan el nombre del contrato (`campo` de los detalles de
// VALIDACION_FALLIDA) y las reglas y mensajes son los del workflow `guardar-categoria`.
@ArgsType()
export class SaveCategoryArgs {
  @Field(() => Int, { name: 'id', nullable: true, description: 'Con id se edita; sin id se crea.' })
  @IsOptional()
  @IsInt({ message: 'Debe ser un número entero.' })
  @Min(1, { message: 'Debe ser al menos 1.' })
  @Max(32000, { message: 'Debe ser como máximo 32000.' })
  id?: number | null;

  @Field(() => String, { name: 'nombre' })
  @Transform(trim)
  @MinLength(2, { message: 'Debe tener al menos 2 caracteres.' })
  @MaxLength(60, { message: 'Debe tener como máximo 60 caracteres.' })
  @Matches(/^$|[\p{L}\p{N}]/u, { message: 'Debe incluir al menos una letra o un número.' })
  // eslint-disable-next-line no-control-regex -- precisamente se rechazan los caracteres de control
  @Matches(/^[^\u0000-\u001f\u007f]*$/, { message: 'No puede tener caracteres de control.' })
  nombre!: string;

  @Field(() => Int, { name: 'posicion' })
  @IsInt({ message: 'Debe ser un número entero.' })
  @Min(1, { message: 'Debe ser al menos 1.' })
  @Max(1000, { message: 'Debe ser como máximo 1000.' })
  posicion!: number;
}
