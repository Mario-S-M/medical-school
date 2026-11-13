import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Categoria', { description: 'Categoría del catálogo.' })
export class CategoryModel {
  @Field(() => Int, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'nombre' })
  name!: string;

  @Field(() => String, { name: 'slug' })
  slug!: string;

  @Field(() => Int, { name: 'posicion' })
  position!: number;
}

@ObjectType('CategoriaGuardada', { description: 'Identificador de la categoría creada o editada.' })
export class SavedCategory {
  @Field(() => Int, { name: 'id' })
  id!: number;
}
