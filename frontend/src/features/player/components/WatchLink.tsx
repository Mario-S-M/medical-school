// Enlace "Ver clase" hacia el reproductor protegido. La página `/clase` exige sesión y la API decide el permiso.
export default function WatchLink({ lessonId, title }: { lessonId: number; title: string }) {
  return (
    <a href={`/clase?id=${lessonId}`} aria-label={`Ver clase ${title}`} className="rounded-md bg-sky-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-sky-800">
      Ver clase
    </a>
  );
}
