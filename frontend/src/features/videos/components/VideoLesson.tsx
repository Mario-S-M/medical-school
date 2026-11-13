import WatchLink from '../../player/components/WatchLink';
import type { Lesson } from '../../courses/schemas/syllabus-schema';
import useVideoStatus from '../hooks/use-video-status';
import VideoButtons from './VideoButtons';
import VideoStatus from './VideoStatus';
import VideoUpload from './VideoUpload';

// Video de una clase en el editor: estado, subir o reemplazar, reintentar y borrar.
export default function VideoLesson({ lesson }: { lesson: Lesson }) {
  const status = useVideoStatus(lesson);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-slate-300 p-3">
      <VideoStatus vigente={status.vigente} nuevo={status.nuevo} />
      {status.vigente?.estado === 'listo' && <div><WatchLink lessonId={lesson.id} title={lesson.titulo} /></div>}
      <VideoButtons lessonId={lesson.id} title={lesson.titulo} status={status} />
      {!status.inProgress && <VideoUpload lessonId={lesson.id} title={lesson.titulo} replaces={!!status.vigente} />}
    </div>
  );
}
