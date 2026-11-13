import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../../../shared/api/error-messages';
import { UploadError } from '../../../shared/api/upload';
import { queryKeys } from '../../../shared/lib/query-keys';
import { confirmVideoUpload } from '../api/confirm-video-upload.mutation';
import { putVideo, requestVideoUpload } from '../api/video-api';
import { classifyVideo } from '../schemas/video-file-schema';
import useVideoDuration from './use-video-duration';

type Phase = 'idle' | 'measuring' | 'notice';

// Flujo de subida de una clase: mide, avisa si es larga, pide la firma, sube con progreso y confirma.
export default function useVideoUpload(lessonId: number) {
  const client = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [rejection, setRejection] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; minutes: number } | null>(null);
  const { read } = useVideoDuration();
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0);
      const data = { clase_id: lessonId, nombre_archivo: file.name, tipo_contenido: file.type, tamano_bytes: file.size };
      const signature = await requestVideoUpload(data);
      await putVideo(signature.url_subida, file, setProgress);
      await confirmVideoUpload(signature.video_id);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.courseEdit }),
  });

  async function choose(file: File) {
    setRejection(null);
    mutation.reset();
    setPhase('measuring');
    const verdict = classifyVideo(file, await read(file));
    if (verdict.kind === 'rejected') return (setPhase('idle'), setRejection(verdict.reason));
    if (verdict.kind === 'long') return (setPending({ file, minutes: verdict.minutes ?? 0 }), setPhase('notice'));
    setPhase('idle');
    mutation.mutate(file);
  }
  const confirmNotice = () => pending && (setPending(null), setPhase('idle'), mutation.mutate(pending.file));
  const cancelNotice = () => (setPending(null), setPhase('idle'));
  const failed = mutation.error instanceof UploadError ? 'No se pudo subir el video. Inténtalo de nuevo.' : mutation.error && errorMessage(mutation.error);
  const current = mutation.isPending ? 'uploading' : phase;
  return { phase: current, progress, error: rejection ?? failed ?? null, pending, choose, confirmNotice, cancelNotice };
}
