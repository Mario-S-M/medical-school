import { errorMessage } from '../../../shared/api/error-messages';
import Button from '../../../shared/components/ui/Button';
import DeleteButton from '../../../shared/components/DeleteButton';
import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import { useDeleteVideo, useRetryVideo } from '../hooks/use-video-mutations';
import type { VideoStatus } from '../schemas/video-status-schema';

type Props = { lessonId: number; title: string; status: VideoStatus };

export default function VideoButtons({ lessonId, title, status }: Props) {
  const retry = useRetryVideo(lessonId);
  const deleteVideo = useDeleteVideo();
  const hasVideo = !!status.vigente || !!status.nuevo;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ErrorAlert message={retry.error ? errorMessage(retry.error) : null} />
      {status.nuevo?.estado === 'error' && (
        <Button variant="secondary" aria-label={`Reintentar video de ${title}`} disabled={retry.isPending} onClick={() => retry.mutate(status.nuevo!.id)}>Reintentar</Button>
      )}
      {hasVideo && <DeleteButton text="Borrar video" name={title} action={deleteVideo(lessonId)} />}
    </span>
  );
}
