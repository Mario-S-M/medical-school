// Mensajes en español de los códigos de error de la API de la escuela (SPEC 07).
export const SCHOOL_ERROR_MESSAGES: Record<string, string> = {
  SIN_PERMISO: 'No tienes permiso para hacer esto.',
  NO_ENCONTRADO: 'No se encontró lo que buscas.',
  ESTADO_INVALIDO: 'Esa acción no está permitida en este momento.',
  CATEGORIA_DUPLICADA: 'Ya existe una categoría con ese nombre.',
  CATEGORIA_EN_USO: 'No se puede borrar: hay cursos en esa categoría.',
  CURSO_EN_REVISION: 'El curso está en revisión y no se puede editar.',
  CURSO_INCOMPLETO: 'Al curso le faltan datos para enviarlo a revisión.',
  USUARIO_NO_REGISTRADO: 'Ese correo no tiene una cuenta registrada.',
  INVITACION_DUPLICADA: 'Ya hay una invitación pendiente para esa persona.',
  YA_ES_MIEMBRO: 'Esa persona ya está en tu equipo.',
  PORTADA_INVALIDA: 'La portada debe ser una imagen JPG, PNG o WebP de hasta 2 MB.',
};
