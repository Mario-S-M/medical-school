import { Field, ObjectType } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { SyllabusSection } from '../../catalog/models/catalog.models';

@ObjectType('EstadoCurso', { description: 'Estado en el que quedó el curso tras la operación.' })
export class CourseState {
  @Field(() => String, { name: 'estado', description: 'borrador, en_revision o publicado.' })
  status!: string;
}

@ObjectType('CursoEnRevision', { description: 'Curso pendiente de revisión con su temario completo (administrador).' })
export class CourseUnderReview {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'slug' })
  slug!: string;

  @Field(() => String, { name: 'titulo' })
  title!: string;

  @Field(() => String, { name: 'subtitulo', nullable: true })
  subtitle!: string | null;

  @Field(() => String, { name: 'descripcion', nullable: true })
  description!: string | null;

  @Field(() => String, { name: 'conocimientos_previos', nullable: true })
  prerequisites!: string | null;

  @Field(() => [String], { name: 'lo_que_aprenderas' })
  learningOutcomes!: string[];

  @Field(() => String, { name: 'nivel', nullable: true })
  level!: string | null;

  @Field(() => String, { name: 'categoria', nullable: true, description: 'Nombre de la categoría.' })
  category!: string | null;

  @Field(() => String, { name: 'portada_ruta', nullable: true })
  coverPath!: string | null;

  @Field(() => String, { name: 'instructor', description: 'Nombre público del instructor.' })
  instructor!: string;

  @Field(() => String, { name: 'actualizado_en', description: 'Fecha ISO 8601.' })
  updatedAt!: string;

  @Field(() => [SyllabusSection], { name: 'secciones' })
  sections!: SyllabusSection[];
}
