import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import useVideoUpload from '../hooks/use-video-upload';
import { MAX_MIN, RECOMMENDED_MIN, WARN_FROM_MIN } from '../schemas/video-file-schema';
import LongLessonNotice from './LongLessonNotice';
import ProgressBar from './ProgressBar';

type Props = { lessonId: number; title: string; replaces: boolean };

export default function VideoUpload({ lessonId, title, replaces }: Props) {
  const s = useVideoUpload(lessonId);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`video_${lessonId}`} className="text-sm font-medium">{replaces ? 'Reemplazar el video' : 'Subir el video'} de «{title}»</label>
      <p className="text-xs text-slate-500">Recomendamos clases de entre {RECOMMENDED_MIN} y {WARN_FROM_MIN} minutos. MP4, MOV o WebM, hasta 1 GB y {MAX_MIN} minutos.</p>
      <input
        id={`video_${lessonId}`}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        disabled={s.phase !== 'idle'}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void s.choose(file);
          e.target.value = '';
        }}
      />
      <ErrorAlert message={s.error} />
      {s.phase === 'measuring' && <p role="status" className="text-sm text-slate-500">Revisando el video…</p>}
      {s.phase === 'uploading' && <ProgressBar percent={s.progress} />}
      {s.phase === 'notice' && s.pending && <LongLessonNotice minutes={s.pending.minutes} onConfirm={s.confirmNotice} onCancel={s.cancelNotice} />}
    </div>
  );
}
