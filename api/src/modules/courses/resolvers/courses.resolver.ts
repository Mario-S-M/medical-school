import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { SavedId } from '../../../common/models/saved-id.model';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { CourseEditingArgs } from '../dto/course-editing.args';
import { CreateCourseArgs } from '../dto/create-course.args';
import { EditCourseArgs } from '../dto/edit-course.args';
import { CourseForEditing, CourseSummary, CreatedCourse } from '../models/course.models';
import { CourseAccessPolicy } from '../policies/course-access.policy';
import { CoursesService } from '../services/courses.service';

// El rol lo exige `@Roles` (antes de validar); el curso concreto, `CourseAccessPolicy` (después de validar).
@Resolver()
export class CoursesResolver {
  constructor(
    private readonly courses: CoursesService,
    private readonly policy: CourseAccessPolicy,
  ) {}

  @Mutation(() => CreatedCourse, { name: 'crear_curso', description: 'Crea un curso en borrador y fija su slug (instructor).' })
  @Roles('instructor')
  create(@CurrentUser() user: AuthenticatedUser, @Args() args: CreateCourseArgs): Promise<CreatedCourse> {
    return this.courses.create(user.id, args.titulo);
  }

  @Mutation(() => SavedId, { name: 'editar_curso', description: 'Edita los datos del curso: solo el dueño y fuera de revisión.' })
  @Roles('instructor')
  async edit(@CurrentUser() user: AuthenticatedUser, @Args() args: EditCourseArgs): Promise<SavedId> {
    const grant = await this.policy.authorize(user.id, { type: 'course', id: args.curso_id }, { mode: 'owner', editable: true });
    await this.courses.edit(grant.course.id, args);
    return { id: grant.course.id };
  }

  @Query(() => [CourseSummary], { name: 'mis_cursos', description: 'Cursos propios y de los instructores del equipo, en cualquier estado.' })
  @Roles('instructor', 'equipo_apoyo')
  myCourses(@CurrentUser() user: AuthenticatedUser): Promise<CourseSummary[]> {
    return this.courses.listForUser(user.id);
  }

  @Query(() => CourseForEditing, { name: 'curso_edicion', description: 'Curso completo con temario y videos para el editor (dueño y equipo).' })
  @Roles('instructor', 'equipo_apoyo')
  async forEditing(@CurrentUser() user: AuthenticatedUser, @Args() args: CourseEditingArgs): Promise<CourseForEditing> {
    const grant = await this.policy.authorize(user.id, { type: 'course', id: args.id }, { mode: 'owner_or_team', editable: false });
    return this.courses.getForEditing(grant.course.id, grant.isOwner);
  }
}
