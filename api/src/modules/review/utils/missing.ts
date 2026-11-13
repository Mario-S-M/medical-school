// Faltas de un curso para enviarlo a revisión: reglas y mensajes del workflow `enviar-a-revision` (campo `curso`).
export const MISSING_MESSAGES: Readonly<Record<string, string>> = {
  falta_subtitulo: 'Falta el subtítulo.',
  falta_descripcion: 'Falta la descripción.',
  falta_nivel: 'Falta elegir el nivel.',
  falta_categoria: 'Falta elegir la categoría.',
  falta_portada: 'Falta la portada.',
  falta_secciones: 'El curso necesita al menos una sección.',
  seccion_vacia: 'Hay secciones sin ninguna clase.',
  falta_video: 'Hay clases sin video listo.',
};

export function missingDetails(rules: string[]): { campo: string; regla: string; mensaje: string }[] {
  return rules.map((regla) => ({ campo: 'curso', regla, mensaje: MISSING_MESSAGES[regla] }));
}
