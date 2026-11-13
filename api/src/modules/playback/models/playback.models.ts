import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BigIntScalar } from '../../../common/scalars/big-int.scalar';

@ObjectType('AutorizacionReproduccion', { description: 'Permiso temporal para ver el video de una clase. El token solo sirve en /api/v1/reproducciones/*.' })
export class PlaybackAuthorization {
  @Field(() => BigIntScalar, { name: 'video_id' })
  video_id!: number;

  @Field(() => String, { name: 'token', description: 'Token de reproducción (audiencia propia); va en la cabecera Authorization.' })
  token!: string;

  @Field(() => Int, { name: 'expira_en', description: 'Segundos de vida de la autorización.' })
  expira_en!: number;

  @Field(() => String, { name: 'lista_url', description: 'Ruta de la lista .m3u8 del video.' })
  lista_url!: string;

  @Field(() => Int, { name: 'duracion_segundos', nullable: true })
  duracion_segundos!: number | null;

  @Field(() => String, { name: 'marca_agua', description: 'Correo de la cuenta que mira, para la marca de agua.' })
  marca_agua!: string;
}
