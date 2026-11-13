import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Lesson } from '../../syllabus/entities/lesson.entity';
import { Section } from '../../syllabus/entities/section.entity';
import { LessonVideo } from '../../videos/entities/lesson-video.entity';
import { Course } from '../entities/course.entity';

export interface CourseListRow {
  id: string;
  slug: string;
  titulo: string;
  estado: string;
  comentario_revision: string | null;
  portada_ruta: string | null;
  actualizado_en: Date;
  es_mio: boolean;
  instructor: string;
}

export interface EditingTree {
  course: Course;
  sections: Section[];
  lessons: Lesson[];
  videos: LessonVideo[];
}

export interface CourseChanges {
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  prerequisites?: string | null;
  learningOutcomes?: string[];
  level?: Course['level'];
  categoryId?: number | null;
}

@Injectable()
export class CoursesRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Section) private readonly sections: Repository<Section>,
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    @InjectRepository(LessonVideo) private readonly videos: Repository<LessonVideo>,
  ) {}

  // Slugs ocupados que se parecen a `base` (`base`, `base-2`, `base-3`...). `base` solo lleva `a-z`, `0-9` y `-`.
  async findTakenSlugs(base: string): Promise<Set<string>> {
    const rows = await this.dataSource.query<{ slug: string }[]>(`SELECT slug FROM escuela.cursos WHERE slug = $1 OR slug LIKE $1 || '-%'`, [base]);
    return new Set(rows.map((row) => row.slug));
  }

  // `null` si otro curso tomó el slug entre la consulta y el insert (índice único).
  async insert(slug: string, instructorId: string, title: string): Promise<{ id: number; slug: string } | null> {
    const rows = await this.dataSource.query<{ id: string; slug: string }[]>(
      `INSERT INTO escuela.cursos (slug, instructor_id, titulo) VALUES ($1, $2::uuid, $3) ON CONFLICT (slug) DO NOTHING RETURNING id, slug`,
      [slug, instructorId, title],
    );
    return rows[0] ? { id: Number(rows[0].id), slug: rows[0].slug } : null;
  }

  async categoryExists(id: number): Promise<boolean> {
    const rows = await this.dataSource.query<unknown[]>('SELECT 1 FROM escuela.categorias WHERE id = $1::int', [id]);
    return rows.length > 0;
  }

  // Cambia solo los campos dados y toca `actualizado_en`. `false` si el curso ya no existe.
  async update(id: number, changes: CourseChanges): Promise<boolean> {
    const result = await this.courses.update({ id: String(id) }, { ...changes, updatedAt: () => 'now()' } as never);
    return (result.affected ?? 0) > 0;
  }

  // Cursos del usuario y de los instructores cuyo equipo integra, del más reciente al más viejo.
  listForUser(userId: string): Promise<CourseListRow[]> {
    return this.dataSource.query<CourseListRow[]>(
      `SELECT c.id, c.slug, c.titulo, c.estado, c.comentario_revision, c.portada_ruta, c.actualizado_en,
              (c.instructor_id = $1::uuid) AS es_mio, coalesce(p.nombre_publico, 'Instructor') AS instructor
       FROM escuela.cursos c LEFT JOIN escuela.perfiles_instructor p ON p.usuario_id = c.instructor_id
       WHERE c.instructor_id = $1::uuid
          OR c.instructor_id IN (SELECT instructor_id FROM escuela.equipos_apoyo WHERE miembro_id = $1::uuid)
       ORDER BY c.actualizado_en DESC, c.id DESC`,
      [userId],
    );
  }

  // El curso con su temario y los videos de sus clases, en cuatro consultas (sin claves: `claves_video` no se toca).
  async findEditingTree(id: number): Promise<EditingTree | null> {
    const course = await this.courses.findOne({ where: { id: String(id) } });
    if (!course) return null;
    const sections = await this.sections.find({ where: { courseId: String(id) }, order: { position: 'ASC' } });
    const lessons = sections.length > 0 ? await this.lessons.find({ where: { sectionId: In(sections.map((s) => s.id)) }, order: { position: 'ASC' } }) : [];
    const videos =
      lessons.length > 0
        ? await this.videos.find({
            select: { id: true, lessonId: true, status: true, isCurrent: true, durationSeconds: true, error: true },
            where: { lessonId: In(lessons.map((l) => l.id)) },
            order: { id: 'DESC' },
          })
        : [];
    return { course, sections, lessons, videos };
  }
}
