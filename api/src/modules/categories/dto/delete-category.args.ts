import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsInt, Max, Min } from 'class-validator';

// `borrar_categoria(id)`.
@ArgsType()
export class DeleteCategoryArgs {
  @Field(() => Int, { name: 'id' })
  @IsInt({ message: 'Debe ser un número entero.' })
  @Min(1, { message: 'Debe ser al menos 1.' })
  @Max(32000, { message: 'Debe ser como máximo 32000.' })
  id!: number;
}
