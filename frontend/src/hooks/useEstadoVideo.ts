import { useCallback, useEffect, useRef, useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { estadoVideo } from '../api/videos';
import type { Clase } from '../api/tipos_escuela';
import type { EstadoVideoClase } from '../api/tipos_videos';

const EN_PROCESO = ['esperando_archivo', 'en_cola', 'procesando'];
const desde = (c: Clase): EstadoVideoClase => ({
  vigente: c.video ? { id: 0, estado: c.video.estado, duracion_segundos: c.video.duracion_segundos, listo_en: null } : null,
  nuevo: c.video_nuevo,
});

// Estado del video de una clase. Mientras hay uno en cola o procesando lo consulta cada 3 s; al terminar avisa para recargar el curso.
export default function useEstadoVideo(clase: Clase, alTerminar: () => void) {
  const [estado, setEstado] = useState(() => desde(clase));
  const antes = useRef(clase.video_nuevo?.estado);
  useEffect(() => setEstado(desde(clase)), [clase]);
  const refrescar = useCallback(async () => {
    const nuevo = await conSesion((t) => estadoVideo(t, clase.id));
    setEstado(nuevo);
    if (antes.current && EN_PROCESO.includes(antes.current) && !(nuevo.nuevo && EN_PROCESO.includes(nuevo.nuevo.estado))) alTerminar();
    antes.current = nuevo.nuevo?.estado;
  }, [clase.id, alTerminar]);
  const enProceso = !!estado.nuevo && EN_PROCESO.includes(estado.nuevo.estado);
  useEffect(() => {
    if (!enProceso) return;
    const reloj = setInterval(() => void refrescar().catch(() => null), 3000);
    return () => clearInterval(reloj);
  }, [enProceso, refrescar]);
  return { ...estado, enProceso };
}
