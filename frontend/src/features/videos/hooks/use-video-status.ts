import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { queryKeys } from '../../../shared/lib/query-keys';
import type { Lesson } from '../../courses/schemas/syllabus-schema';
import { fetchVideoStatus } from '../api/video-status.query';
import type { VideoStatus } from '../schemas/video-status-schema';

const IN_PROGRESS = ['esperando_archivo', 'en_cola', 'procesando'];
const isInProgress = (status?: VideoStatus) => !!status?.nuevo && IN_PROGRESS.includes(status.nuevo.estado);
const fromLesson = (c: Lesson): VideoStatus => ({
  vigente: c.video ? { id: 0, estado: c.video.estado, duracion_segundos: c.video.duracion_segundos, listo_en: null } : null,
  nuevo: c.video_nuevo,
});

// Estado del video de una clase: parte de lo que trae el curso y, mientras hay uno en cola o procesando, consulta cada 3 s.
// Al terminar invalida el curso del editor para que se recargue.
export default function useVideoStatus(lesson: Lesson) {
  const client = useQueryClient();
  const key = queryKeys.videoStatus(lesson.id);
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => fetchVideoStatus(lesson.id),
    initialData: fromLesson(lesson),
    staleTime: Infinity,
    refetchInterval: (query) => (isInProgress(query.state.data) ? 3000 : false),
  });
  useEffect(() => {
    client.setQueryData(key, fromLesson(lesson));
  }, [lesson]);
  const inProgress = isInProgress(data);
  const was = useRef(inProgress);
  useEffect(() => {
    if (was.current && !inProgress) void client.invalidateQueries({ queryKey: queryKeys.courseEdit });
    was.current = inProgress;
  }, [inProgress]);
  return { vigente: data.vigente, nuevo: data.nuevo, inProgress };
}
