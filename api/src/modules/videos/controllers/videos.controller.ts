import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CourseAccessPolicy } from '../../courses/policies/course-access.policy';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { VideoSignatureDto } from '../dto/video-signature.dto';
import { VideoSignature } from '../models/video.models';
import { VideosService } from '../services/videos.service';

// Borde REST de la subida de videos: la firma de la subida directa a Storage. `@Roles` exige sesión y rol (antes de validar,
// como el workflow); el curso concreto lo decide `CourseAccessPolicy` (dueño o equipo, y no en revisión) tras validar.
@Controller('api/v1/videos')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly policy: CourseAccessPolicy,
  ) {}

  @Post('firmas')
  @HttpCode(201)
  @Roles('instructor', 'equipo_apoyo')
  async sign(@CurrentUser() user: AuthenticatedUser, @Body() dto: VideoSignatureDto): Promise<VideoSignature> {
    await this.policy.authorize(user.id, { type: 'lesson', id: dto.clase_id }, { mode: 'owner_or_team', editable: true });
    return this.videos.sign(dto.clase_id, dto.nombre_archivo, dto.tipo_contenido, dto.tamano_bytes);
  }
}
