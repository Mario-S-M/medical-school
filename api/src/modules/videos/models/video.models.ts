import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';
import { EditorNewVideo } from '../../courses/models/course.models';

@ObjectType('VideoVigente', { description: 'El video que se sirve de la clase.' })
export class CurrentVideo {
  @Field(() => BigIntScalar, { name: 'id' })
  id!: number;

  @Field(() => String, { name: 'estado' })
  estado!: string;

  @Field(() => Int, { name: 'duracion_segundos', nullable: true })
  duracion_segundos!: number | null;

  @Field(() => String, { name: 'listo_en', nullable: true, description: 'Fecha ISO 8601.' })
  listo_en!: string | null;
}

@ObjectType('EstadoVideo', { description: 'Estado de los videos de una clase.' })
export class VideoStatusResult {
  @Field(() => CurrentVideo, { name: 'vigente', nullable: true })
  vigente!: CurrentVideo | null;

  // Mismo tipo `VideoNuevo` que usa `curso_edicion`.
  @Field(() => EditorNewVideo, { name: 'nuevo', nullable: true })
  nuevo!: EditorNewVideo | null;
}

@ObjectType('VideoEncolado', { description: 'El video quedó en la cola del transcodificador.' })
export class QueuedVideo {
  @Field(() => String, { name: 'estado' })
  estado!: string;
}

// Respuesta de `POST /api/v1/videos/firmas` (REST). Nunca incluye la clave de cifrado.
export interface VideoSignature {
  video_id: number;
  url_subida: string;
  ruta: string;
}
