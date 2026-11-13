import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';

@ObjectType('TarjetaCurso', { description: 'Tarjeta de un curso publicado en el catálogo (sin campos internos).' })
export class CourseCard {
  @Field(() => String, { name: 'slug' })
  slug!: string;

  @Field(() => String, { name: 'titulo' })
  title!: string;

  @Field(() => String, { name: 'subtitulo', nullable: true })
  subtitle!: string | null;

  @Field(() => String, { name: 'nivel', nullable: true })
  level!: string | null;

  @Field(() => String, { name: 'categoria', nullable: true, description: 'Nombre de la categoría.' })
  category!: string | null;

  @Field(() => String, { name: 'categoria_slug', nullable: true })
  categorySlug!: string | null;

  @Field(() => String, { name: 'instructor', description: 'Nombre público del instructor.' })
  instructor!: string;

  @Field(() => String, { name: 'portada_ruta', nullable: true })
  coverPath!: string | null;

  @Field(() => Int, { name: 'secciones', description: 'Cantidad de secciones.' })
  sectionCount!: number;

  @Field(() => Int, { name: 'clases', description: 'Cantidad de clases.' })
  lessonCount!: number;
}

@ObjectType('PaginaCursos', { description: 'Una página del catálogo público.' })
export class CoursePage {
  @Field(() => [CourseCard], { name: 'cursos' })
  courses!: CourseCard[];

  @Field(() => Int, { name: 'total', description: 'Cursos que cumplen los filtros, en todas las páginas.' })
  total!: number;

  @Field(() => Int, { name: 'pagina' })
  page!: number;

  @Field(() => Int, { name: 'paginas', description: 'Cantidad de páginas (12 cursos por página).' })
  pages!: number;
}

@ObjectType('ClaseTemario', { description: 'Clase del temario (sin video ni claves).' })
export class SyllabusLesson {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'titulo' })
  title!: string;

  @Field(() => String, { name: 'descripcion', nullable: true })
  description!: string | null;

  @Field(() => Int, { name: 'duracion_estimada_minutos', nullable: true })
  estimatedMinutes!: number | null;

  @Field(() => Boolean, { name: 'es_muestra' })
  isSample!: boolean;

  @Field(() => Int, { name: 'posicion' })
  position!: number;
}

@ObjectType('SeccionTemario', { description: 'Sección del temario con sus clases.' })
export class SyllabusSection {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'titulo' })
  title!: string;

  @Field(() => Int, { name: 'posicion' })
  position!: number;

  @Field(() => [SyllabusLesson], { name: 'clases' })
  lessons!: SyllabusLesson[];
}

@ObjectType('CategoriaFicha', { description: 'Categoría de un curso.' })
export class CourseCategory {
  @Field(() => String, { name: 'nombre' })
  name!: string;

  @Field(() => String, { name: 'slug' })
  slug!: string;
}

@ObjectType('FichaCurso', { description: 'Ficha pública de un curso publicado (sin campos internos, videos ni claves).' })
export class CourseDetail {
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

  @Field(() => CourseCategory, { name: 'categoria', nullable: true })
  category!: CourseCategory | null;

  @Field(() => String, { name: 'portada_ruta', nullable: true })
  coverPath!: string | null;

  @Field(() => String, { name: 'instructor', description: 'Nombre público del instructor.' })
  instructor!: string;

  @Field(() => String, { name: 'publicado_en', nullable: true, description: 'Fecha ISO 8601.' })
  publishedAt!: string | null;

  @Field(() => [SyllabusSection], { name: 'secciones' })
  sections!: SyllabusSection[];
}
