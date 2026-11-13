import ErrorAlert from '../../../shared/components/ui/ErrorAlert';
import useCoverUpload from '../hooks/use-cover-upload';
import { COVER_TYPES } from '../schemas/cover-file-schema';
import CoverImage from './CoverImage';

type Props = { courseId: number; path?: string | null };

export default function CoverUpload({ courseId, path }: Props) {
  const { upload, uploading, error } = useCoverUpload(courseId);
  return (
    <section aria-label="Portada" className="flex max-w-2xl flex-col gap-3">
      <h2 className="text-xl font-bold">Portada</h2>
      <CoverImage
        path={path}
        alt="Portada del curso"
        className="h-48 w-full rounded-xl object-cover"
        fallback={<p className="text-slate-500">{path ? 'No se pudo cargar la portada.' : 'Todavía no hay portada.'}</p>}
      />
      <ErrorAlert message={error} />
      <label htmlFor="portada" className="text-sm font-medium">Elegir imagen (JPG, PNG o WebP, hasta 2 MB)</label>
      <input
        id="portada"
        type="file"
        accept={COVER_TYPES.join(',')}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = '';
        }}
      />
      {uploading && <p role="status" className="text-sm text-slate-500">Subiendo…</p>}
    </section>
  );
}
