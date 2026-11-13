import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/utils/api-exception';
import { Category } from '../entities/category.entity';
import { CategoriesRepository } from '../repositories/categories.repository';
import { slugify } from '../utils/slugify';

@Injectable()
export class CategoriesService {
  constructor(private readonly repository: CategoriesRepository) {}

  list(): Promise<Category[]> {
    return this.repository.findAll();
  }

  // Crea (sin id) o edita (con id). El slug sale del nombre.
  async save(id: number | null, name: string, position: number): Promise<{ id: number }> {
    const outcome = await this.repository.save(id, name, slugify(name), position);
    if (outcome.result === 'duplicate') throw new ApiException(409, 'CATEGORIA_DUPLICADA', 'Ya existe una categoría con ese nombre.');
    if (outcome.result === 'not_found') throw new ApiException(404, 'NO_ENCONTRADO', 'La categoría no existe.');
    return { id: outcome.id };
  }

  async remove(id: number): Promise<void> {
    const outcome = await this.repository.remove(id);
    if (outcome === 'in_use') throw new ApiException(409, 'CATEGORIA_EN_USO', 'La categoría tiene cursos asignados.');
    if (outcome === 'not_found') throw new ApiException(404, 'NO_ENCONTRADO', 'La categoría no existe.');
  }
}
