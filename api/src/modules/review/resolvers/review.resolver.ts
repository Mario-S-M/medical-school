import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CourseAccessPolicy } from '../../courses/policies/course-access.policy';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { ResolveReviewArgs, RetireCourseArgs, SubmitReviewArgs } from '../dto/review.args';
import { CourseState, CourseUnderReview } from '../models/review.models';
import { ReviewService } from '../services/review.service';

// El rol lo exige `@Roles` (antes de validar); el curso concreto, `CourseAccessPolicy` (después de validar). Las operaciones del
// administrador no pasan por la política: actúan sobre cualquier curso.
@Resolver()
export class ReviewResolver {
  constructor(
    private readonly review: ReviewService,
    private readonly policy: CourseAccessPolicy,
  ) {}

  @Mutation(() => CourseState, { name: 'enviar_revision', description: 'Envía el curso completo a revisión: solo el dueño, desde borrador.' })
  @Roles('instructor')
  async submit(@CurrentUser() user: AuthenticatedUser, @Args() args: SubmitReviewArgs): Promise<CourseState> {
    const { course } = await this.policy.authorize(user.id, { type: 'course', id: args.curso_id }, { mode: 'owner', editable: true });
    return this.review.submit(course.id);
  }

  @Query(() => [CourseUnderReview], { name: 'cursos_en_revision', description: 'Cursos pendientes de revisión con su temario (administrador).' })
  @Roles('administrador')
  pending(): Promise<CourseUnderReview[]> {
    return this.review.listPending();
  }

  @Mutation(() => CourseState, { name: 'resolver_revision', description: 'Aprueba (publica) o devuelve a borrador con comentario un curso en revisión (administrador).' })
  @Roles('administrador')
  resolve(@Args() args: ResolveReviewArgs): Promise<CourseState> {
    // Un comentario en blanco (recortado a "") cuenta como no enviado: devolver un curso exige explicar qué cambiar.
    return this.review.resolve(args.curso_id, args.aprobar, args.comentario || null);
  }

  @Mutation(() => CourseState, { name: 'retirar_curso', description: 'Retira un curso publicado del catálogo y lo devuelve a borrador con comentario (administrador).' })
  @Roles('administrador')
  retire(@Args() args: RetireCourseArgs): Promise<CourseState> {
    return this.review.retire(args.curso_id, args.comentario);
  }
}
