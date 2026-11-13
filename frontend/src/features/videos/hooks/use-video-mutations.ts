import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/lib/query-keys';
import { deleteVideo } from '../api/delete-video.mutation';
import { retryVideo } from '../api/retry-video.mutation';

function useInvalidateVideos(lessonId?: number) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.courseEdit }),
      lessonId === undefined ? null : client.invalidateQueries({ queryKey: queryKeys.videoStatus(lessonId) }),
    ]);
}

export const useRetryVideo = (lessonId: number) => useMutation({ mutationFn: retryVideo, onSuccess: useInvalidateVideos(lessonId) });

// Devuelve una función lista para `DeleteButton` (que confirma y muestra el error).
export function useDeleteVideo() {
  const client = useQueryClient();
  return (lessonId: number) => () =>
    deleteVideo(lessonId).then(() => client.invalidateQueries({ queryKey: queryKeys.courseEdit }));
}
