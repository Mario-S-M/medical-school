import { useEffect, useState, type ReactNode } from 'react';
import { coverUrl } from '../lib/cover-url';

type Props = { path: string | null | undefined; alt: string; className: string; fallback?: ReactNode };

// Muestra la portada y, si no hay ruta o el archivo no carga (borrado o ruta rota), el contenido alternativo
// en lugar del icono de imagen rota del navegador.
export default function CoverImage({ path, alt, className, fallback = null }: Props) {
  const url = coverUrl(path);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <>{fallback}</>;
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
