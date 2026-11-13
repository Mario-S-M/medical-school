import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { OkResult } from '../../../common/models/ok-result.model';
import { Roles } from '../../roles/decorators/roles.decorator';
import { DeleteCategoryArgs } from '../dto/delete-category.args';
import { SaveCategoryArgs } from '../dto/save-category.args';
import { CategoryModel, SavedCategory } from '../models/category.model';
import { CategoriesService } from '../services/categories.service';

@Resolver(() => CategoryModel)
export class CategoriesResolver {
  constructor(private readonly categories: CategoriesService) {}

  // Pública: alimenta el menú de categorías de la cabecera y el filtro del catálogo. Sin token.
  @Query(() => [CategoryModel], { name: 'categorias', description: 'Categorías ordenadas por posición (pública, sin sesión).' })
  list(): Promise<CategoryModel[]> {
    return this.categories.list();
  }

  @Mutation(() => SavedCategory, { name: 'guardar_categoria', description: 'Crea o edita una categoría (administrador).' })
  @Roles('administrador')
  save(@Args() args: SaveCategoryArgs): Promise<SavedCategory> {
    return this.categories.save(args.id ?? null, args.nombre, args.posicion);
  }

  @Mutation(() => OkResult, { name: 'borrar_categoria', description: 'Borra una categoría sin cursos (administrador).' })
  @Roles('administrador')
  async remove(@Args() args: DeleteCategoryArgs): Promise<OkResult> {
    await this.categories.remove(args.id);
    return { ok: true };
  }
}
