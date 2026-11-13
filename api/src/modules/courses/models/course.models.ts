import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';

@ObjectType('CursoCreado', { description: 'Curso recién creado: su id y el slug (fijado al crear).' })
export class CreatedCourse {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'slug' })
  slug!: string;
}

@ObjectType('CursoResumen', { description: 'Curso propio o de un instructor cuyo equipo de apoyo integra la persona.' })
export class CourseSummary {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'slug' })
  slug!: string;

  @Field(() => String, { name: 'titulo' })
  title!: string;

  @Field(() => String, { name: 'estado', description: 'borrador, en_revision o publicado.' })
  status!: string;

  @Field(() => String, { name: 'comentario_revision', nullable: true })
  reviewComment!: string | null;

  @Field(() => String, { name: 'portada_ruta', nullable: true })
  coverPath!: string | null;

  @Field(() => String, { name: 'actualizado_en', description: 'Fecha ISO 8601.' })
  updatedAt!: string;

  @Field(() => Boolean, { name: 'es_mio' })
  isMine!: boolean;

  @Field(() => String, { name: 'instructor', description: 'Nombre público del instructor dueño.' })
  instructor!: string;
}

@ObjectType('VideoClase', { description: 'Video vigente de una clase (el que ven los estudiantes).' })
export class EditorVideo {
  @Field(() => String, { name: 'estado' })
  status!: string;

  @Field(() => Int, { name: 'duracion_segundos', nullable: true })
  durationSeconds!: number | null;
}

@ObjectType('VideoNuevo', { description: 'Último video por reemplazar (aún no vigente).' })
export class EditorNewVideo {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'estado' })
  status!: string;

  @Field(() => String, { name: 'error', nullable: true })
  error!: string | null;
}

@ObjectType('ClaseEdicion', { description: 'Clase de una sección para el editor.' })
export class EditorLesson {
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

  @Field(() => EditorVideo, { name: 'video', nullable: true })
  video!: EditorVideo | null;

  @Field(() => EditorNewVideo, { name: 'video_nuevo', nullable: true })
  newVideo!: EditorNewVideo | null;
}

@ObjectType('SeccionEdicion', { description: 'Sección del temario para el editor.' })
export class EditorSection {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'titulo' })
  title!: string;

  @Field(() => Int, { name: 'posicion' })
  position!: number;

  @Field(() => [EditorLesson], { name: 'clases' })
  lessons!: EditorLesson[];
}

@ObjectType('CursoEdicion', { description: 'Curso completo para el editor (nunca incluye claves de cifrado).' })
export class CourseForEditing {
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

  @Field(() => Int, { name: 'categoria_id', nullable: true })
  categoryId!: number | null;

  @Field(() => String, { name: 'estado' })
  status!: string;

  @Field(() => String, { name: 'comentario_revision', nullable: true })
  reviewComment!: string | null;

  @Field(() => String, { name: 'portada_ruta', nullable: true })
  coverPath!: string | null;

  @Field(() => String, { name: 'actualizado_en', description: 'Fecha ISO 8601.' })
  updatedAt!: string;

  @Field(() => Boolean, { name: 'es_dueno' })
  isOwner!: boolean;

  @Field(() => [EditorSection], { name: 'secciones' })
  sections!: EditorSection[];
}
