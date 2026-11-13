import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Category } from '../entities/category.entity';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function pgCode(error: unknown): string | undefined {
  return error instanceof QueryFailedError ? (error.driverError as { code?: string }).code : undefined;
}

export type SaveOutcome = { result: 'saved'; id: number } | { result: 'not_found' } | { result: 'duplicate' };
export type DeleteOutcome = 'deleted' | 'not_found' | 'in_use';

// Los nombres y los slugs son únicos en la base (`UNIQUE`): un duplicado se detecta al escribir, sin carreras. Un id
// inexistente gana sobre un duplicado (el UPDATE no toca filas, así que no hay choque de unicidad).
@Injectable()
export class CategoriesRepository {
  constructor(@InjectRepository(Category) private readonly repository: Repository<Category>) {}

  findAll(): Promise<Category[]> {
    return this.repository.find({ order: { position: 'ASC', name: 'ASC' } });
  }

  async save(id: number | null, name: string, slug: string, position: number): Promise<SaveOutcome> {
    try {
      if (id === null) {
        const created = await this.repository.insert({ name, slug, position });
        return { result: 'saved', id: (created.identifiers[0] as { id: number }).id };
      }
      const updated = await this.repository.update({ id }, { name, slug, position });
      return updated.affected ? { result: 'saved', id } : { result: 'not_found' };
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) return { result: 'duplicate' };
      throw error;
    }
  }

  // Borra solo si ningún curso la usa (clave foránea `cursos.categoria_id`).
  async remove(id: number): Promise<DeleteOutcome> {
    try {
      const deleted = await this.repository.delete({ id });
      return deleted.affected ? 'deleted' : 'not_found';
    } catch (error) {
      if (pgCode(error) === FOREIGN_KEY_VIOLATION) return 'in_use';
      throw error;
    }
  }
}
