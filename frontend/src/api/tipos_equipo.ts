export type Miembro = { miembro_id: string; correo: string | null; desde: string };
export type InvitacionEnviada = { id: number; correo: string; expira_en: string };
export type MiEquipo = { miembros: Miembro[]; invitaciones: InvitacionEnviada[] };
export type InvitacionRecibida = { id: number; instructor: string; creado_en: string; expira_en: string };
