import { SyllabusSection } from '../models/catalog.models';

export interface SectionRow {
  id: string;
  curso_id: string;
  titulo: string;
  posicion: number;
}

export interface LessonRow {
  id: string;
  seccion_id: string;
  titulo: string;
  descripcion: string | null;
  duracion_estimada_minutos: number | null;
  es_muestra: boolean;
  tiene_video: boolean;
  posicion: number;
}

// Arma `curso -> secciones[] -> clases[]` desde las filas planas de dos consultas por lotes (ya vienen ordenadas por
// posición). Todo curso pedido queda en el mapa, con lista vacía si no tiene secciones.
export function buildTrees(courseIds: number[], sections: SectionRow[], lessons: LessonRow[]): Map<number, SyllabusSection[]> {
  const lessonsBySection = new Map<string, SyllabusSection['lessons']>();
  for (const lesson of lessons) {
    const list = lessonsBySection.get(lesson.seccion_id) ?? [];
    list.push({
      id: Number(lesson.id),
      title: lesson.titulo,
      description: lesson.descripcion,
      estimatedMinutes: lesson.duracion_estimada_minutos,
      isSample: lesson.es_muestra,
      hasVideo: lesson.tiene_video,
      position: lesson.posicion,
    });
    lessonsBySection.set(lesson.seccion_id, list);
  }
  const trees = new Map<number, SyllabusSection[]>(courseIds.map((id) => [id, []]));
  for (const section of sections) {
    trees.get(Number(section.curso_id))?.push({
      id: Number(section.id),
      title: section.titulo,
      position: section.posicion,
      lessons: lessonsBySection.get(section.id) ?? [],
    });
  }
  return trees;
}
