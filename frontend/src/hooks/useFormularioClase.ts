import { useState } from 'react';
import type { Clase } from '../api/tipos_escuela';
import type { DatosClase } from '../api/temario';
import { validarDescripcionClase, validarDuracion, validarTituloTemario } from '../validacion/temario';
import useCampo from './useCampo';

// Campos del formulario de una clase y el cuerpo que se envía a la API.
export default function useFormularioClase(seccionId: number, clase?: Clase) {
  const titulo = useCampo(validarTituloTemario, clase?.titulo ?? '');
  const descripcion = useCampo(validarDescripcionClase, clase?.descripcion ?? '');
  const duracion = useCampo(validarDuracion, clase?.duracion_estimada_minutos?.toString() ?? '');
  const [muestra, setMuestra] = useState(clase?.es_muestra ?? false);
  const validar = () => [titulo, descripcion, duracion].map((c) => c.validarYMarcar()).every(Boolean);
  const cuerpo = (): DatosClase => ({
    seccion_id: seccionId,
    clase_id: clase?.id,
    titulo: titulo.valor.trim(),
    descripcion: descripcion.valor.trim() || null,
    duracion_estimada_minutos: duracion.valor.trim() ? Number(duracion.valor) : null,
    es_muestra: muestra,
  });
  const vaciar = () => [titulo, descripcion, duracion].forEach((c) => c.setValor(''));
  return { titulo, descripcion, duracion, muestra, setMuestra, validar, cuerpo, vaciar };
}
