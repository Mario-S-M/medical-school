import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CourseAccessPolicy } from '../../courses/policies/course-access.policy';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { CoverSignatureDto } from '../dto/cover-signature.dto';
import { CoverSignature } from '../models/cover.models';
import { CoversService } from '../services/covers.service';

// Borde REST de las portadas: la firma de subida a Storage. `@Roles('instructor')` exige sesión y rol (como el workflow, antes
// de validar); el curso concreto lo decide `CourseAccessPolicy` (solo el dueño, y no en revisión), después de validar.
@Controller('api/v1/portadas')
export class CoversController {
  constructor(
    private readonly covers: CoversService,
    private readonly policy: CourseAccessPolicy,
  ) {}

  @Post('firmas')
  @HttpCode(201)
  @Roles('instructor')
  async sign(@CurrentUser() user: AuthenticatedUser, @Body() dto: CoverSignatureDto): Promise<CoverSignature> {
    const { course } = await this.policy.authorize(user.id, { type: 'course', id: dto.curso_id }, { mode: 'owner', editable: true });
    return this.covers.sign(course.id, dto.tipo_contenido, dto.tamano_bytes);
  }
}
