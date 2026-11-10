import { useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { mensajeDeError } from '../api/errores';
import { confirmarSubidaVideo, solicitarSubidaVideo, subirVideo } from '../api/videos';
import { clasificarVideo } from '../validacion/video';
import useDuracionVideo from './useDuracionVideo';

type Fase = 'inactivo' | 'midiendo' | 'aviso' | 'subiendo';

// Flujo de subida de una clase: mide, avisa si es larga, pide la firma, sube con progreso y confirma.
export default function useSubirVideo(claseId: number, alTerminar: () => void) {
  const [fase, setFase] = useState<Fase>('inactivo');
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{ archivo: File; minutos: number } | null>(null);
  const { leer } = useDuracionVideo();

  async function subir(archivo: File) {
    setFase('subiendo');
    setProgreso(0);
    try {
      const datos = { clase_id: claseId, nombre_archivo: archivo.name, tipo_contenido: archivo.type, tamano_bytes: archivo.size };
      const firma = await conSesion((t) => solicitarSubidaVideo(t, datos));
      await subirVideo(firma.url_subida, archivo, setProgreso);
      await conSesion((t) => confirmarSubidaVideo(t, firma.video_id));
      alTerminar();
    } catch (e) {
      setError(e instanceof Error && e.message === 'subida' ? 'No se pudo subir el video. Inténtalo de nuevo.' : mensajeDeError(e));
    } finally {
      setFase('inactivo');
    }
  }

  async function elegir(archivo: File) {
    setError(null);
    setFase('midiendo');
    const veredicto = clasificarVideo(archivo, await leer(archivo));
    if (veredicto.tipo === 'rechazado') return (setFase('inactivo'), setError(veredicto.motivo));
    if (veredicto.tipo === 'larga') return (setPendiente({ archivo, minutos: veredicto.minutos ?? 0 }), setFase('aviso'));
    await subir(archivo);
  }
  const confirmarAviso = () => pendiente && (setPendiente(null), subir(pendiente.archivo));
  const cancelarAviso = () => (setPendiente(null), setFase('inactivo'));
  return { fase, progreso, error, pendiente, elegir, confirmarAviso, cancelarAviso };
}
