import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { OkResult } from '../../../common/models/ok-result.model';
import { AccessOptions, CourseAccessPolicy } from '../../courses/policies/course-access.policy';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { VideoIdArgs, VideoLessonArgs } from '../dto/video.args';
import { QueuedVideo, VideoStatusResult } from '../models/video.models';
import { VideosService } from '../services/videos.service';

// Los videos los suben, reemplazan, reintentan y borran el dueño y su equipo de apoyo, con el curso fuera de revisión;
// el estado también se consulta en revisión.
const WRITE_VIDEOS: AccessOptions = { mode: 'owner_or_team', editable: true };
const READ_VIDEOS: AccessOptions = { mode: 'owner_or_team', editable: false };

@Resolver()
export class VideosResolver {
  constructor(
    private readonly videos: VideosService,
    private readonly policy: CourseAccessPolicy,
  ) {}

  @Query(() => VideoStatusResult, { name: 'estado_video', description: 'El video vigente de la clase y el que se está subiendo o procesando (con su error).' })
  @Roles('instructor', 'equipo_apoyo')
  async status(@CurrentUser() user: AuthenticatedUser, @Args() args: VideoLessonArgs): Promise<VideoStatusResult> {
    await this.policy.authorize(user.id, { type: 'lesson', id: args.clase_id }, READ_VIDEOS);
    return this.videos.status(args.clase_id);
  }

  @Mutation(() => QueuedVideo, { name: 'confirmar_subida_video', description: 'Confirma el video ya subido con la URL firmada y lo pone en la cola del transcodificador.' })
  @Roles('instructor', 'equipo_apoyo')
  async confirm(@CurrentUser() user: AuthenticatedUser, @Args() args: VideoIdArgs): Promise<QueuedVideo> {
    await this.policy.authorize(user.id, { type: 'video', id: args.video_id }, WRITE_VIDEOS);
    await this.videos.confirm(args.video_id);
    return { estado: 'en_cola' };
  }

  @Mutation(() => QueuedVideo, { name: 'reintentar_video', description: 'Vuelve a encolar un video con error cuyo original se conservó.' })
  @Roles('instructor', 'equipo_apoyo')
  async retry(@CurrentUser() user: AuthenticatedUser, @Args() args: VideoIdArgs): Promise<QueuedVideo> {
    await this.policy.authorize(user.id, { type: 'video', id: args.video_id }, WRITE_VIDEOS);
    await this.videos.retry(args.video_id);
    return { estado: 'en_cola' };
  }

  @Mutation(() => OkResult, { name: 'borrar_video', description: 'Borra el video vigente y cualquiera en proceso o con error de la clase, con sus archivos.' })
  @Roles('instructor', 'equipo_apoyo')
  async remove(@CurrentUser() user: AuthenticatedUser, @Args() args: VideoLessonArgs): Promise<OkResult> {
    await this.policy.authorize(user.id, { type: 'lesson', id: args.clase_id }, WRITE_VIDEOS);
    await this.videos.remove(args.clase_id);
    return { ok: true };
  }
}
