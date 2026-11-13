import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../../../shared/api/error-messages';
import { UploadError, uploadFile } from '../../../shared/api/upload';
import { queryKeys } from '../../../shared/lib/query-keys';
import { confirmCover } from '../api/confirm-cover.mutation';
import { requestCoverUpload } from '../api/cover-api';
import { coverFileSchema } from '../schemas/cover-file-schema';

// Valida el archivo, pide la URL firmada, sube a Storage (sin pasar por la API) y confirma la portada en el curso.
export default function useCoverUpload(courseId: number) {
  const client = useQueryClient();
  const [invalid, setInvalid] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const signature = await requestCoverUpload({ curso_id: courseId, tipo_contenido: file.type, tamano_bytes: file.size });
      await uploadFile(signature.url_subida, file);
      await confirmCover({ curso_id: courseId, ruta: signature.ruta });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.courseEdit }),
  });
  function upload(file: File) {
    const check = coverFileSchema.safeParse(file);
    setInvalid(check.success ? null : check.error.issues[0].message);
    if (check.success) mutation.mutate(file);
  }
  const failed = mutation.error instanceof UploadError ? 'No se pudo subir la imagen. Inténtalo de nuevo.' : mutation.error && errorMessage(mutation.error);
  return { upload, uploading: mutation.isPending, error: invalid ?? failed ?? null };
}
