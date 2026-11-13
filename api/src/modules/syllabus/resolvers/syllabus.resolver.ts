import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { OkResult } from '../../../common/models/ok-result.model';
import { SavedId } from '../../../common/models/saved-id.model';
import { CourseAccessPolicy, AccessOptions } from '../../courses/policies/course-access.policy';
import { Roles } from '../../roles/decorators/roles.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../security/utils/authenticated-user';
import { DeleteLessonArgs, DeleteSectionArgs, MoveArgs, SaveLessonArgs, SaveSectionArgs } from '../dto/syllabus.args';
import { SyllabusService } from '../services/syllabus.service';

// El temario lo editan el dueño y su equipo de apoyo, con el curso fuera de revisión.
const WRITE_SYLLABUS: AccessOptions = { mode: 'owner_or_team', editable: true };

@Resolver()
export class SyllabusResolver {
  constructor(
    private readonly syllabus: SyllabusService,
    private readonly policy: CourseAccessPolicy,
  ) {}

  @Mutation(() => SavedId, { name: 'guardar_seccion', description: 'Crea (sin seccion_id) o edita una sección del curso.' })
  @Roles('instructor', 'equipo_apoyo')
  async saveSection(@CurrentUser() user: AuthenticatedUser, @Args() args: SaveSectionArgs): Promise<SavedId> {
    const { course } = await this.policy.authorize(user.id, { type: 'course', id: args.curso_id }, WRITE_SYLLABUS);
    return { id: await this.syllabus.saveSection(course.id, args.seccion_id ?? null, args.titulo) };
  }

  @Mutation(() => OkResult, { name: 'borrar_seccion', description: 'Borra una sección con sus clases y renumera las demás.' })
  @Roles('instructor', 'equipo_apoyo')
  async deleteSection(@CurrentUser() user: AuthenticatedUser, @Args() args: DeleteSectionArgs): Promise<OkResult> {
    const { course } = await this.policy.authorize(user.id, { type: 'section', id: args.seccion_id }, WRITE_SYLLABUS);
    await this.syllabus.deleteSection(course.id, args.seccion_id);
    return { ok: true };
  }

  @Mutation(() => SavedId, { name: 'guardar_clase', description: 'Crea (sin clase_id) o edita una clase de la sección.' })
  @Roles('instructor', 'equipo_apoyo')
  async saveLesson(@CurrentUser() user: AuthenticatedUser, @Args() args: SaveLessonArgs): Promise<SavedId> {
    const { course } = await this.policy.authorize(user.id, { type: 'section', id: args.seccion_id }, WRITE_SYLLABUS);
    const id = await this.syllabus.saveLesson(course.id, args.seccion_id, args.clase_id ?? null, {
      title: args.titulo,
      description: args.descripcion ?? null,
      estimatedMinutes: args.duracion_estimada_minutos ?? null,
      isSample: args.es_muestra,
    });
    return { id };
  }

  @Mutation(() => OkResult, { name: 'borrar_clase', description: 'Borra una clase y renumera las demás de su sección.' })
  @Roles('instructor', 'equipo_apoyo')
  async deleteLesson(@CurrentUser() user: AuthenticatedUser, @Args() args: DeleteLessonArgs): Promise<OkResult> {
    const { course } = await this.policy.authorize(user.id, { type: 'lesson', id: args.clase_id }, WRITE_SYLLABUS);
    await this.syllabus.deleteLesson(course.id, args.clase_id);
    return { ok: true };
  }

  @Mutation(() => OkResult, { name: 'mover', description: 'Sube o baja una sección o una clase un lugar (el primero no sube ni el último baja).' })
  @Roles('instructor', 'equipo_apoyo')
  async move(@CurrentUser() user: AuthenticatedUser, @Args() args: MoveArgs): Promise<OkResult> {
    const type = args.tipo === 'seccion' ? 'section' : 'lesson';
    const { course } = await this.policy.authorize(user.id, { type, id: args.id }, WRITE_SYLLABUS);
    await this.syllabus.move(course.id, args.tipo, args.id, args.direccion);
    return { ok: true };
  }
}
