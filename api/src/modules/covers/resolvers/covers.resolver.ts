import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CourseAccessPolicy } from '../../courses/policies/course-access.policy';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { ConfirmCoverArgs } from '../dto/confirm-cover.args';
import { ConfirmedCover } from '../models/cover.models';
import { CoversService } from '../services/covers.service';

@Resolver()
export class CoversResolver {
  constructor(
    private readonly covers: CoversService,
    private readonly policy: CourseAccessPolicy,
  ) {}

  @Mutation(() => ConfirmedCover, { name: 'confirmar_portada', description: 'Confirma la portada ya subida con la URL firmada y borra la anterior (solo el dueño, fuera de revisión).' })
  @Roles('instructor')
  async confirm(@CurrentUser() user: AuthenticatedUser, @Args() args: ConfirmCoverArgs): Promise<ConfirmedCover> {
    const { course } = await this.policy.authorize(user.id, { type: 'course', id: args.curso_id }, { mode: 'owner', editable: true });
    return { portada_url: await this.covers.confirm(course.id, args.ruta) };
  }
}
