const KEY = 'correo_pendiente';

// Correo que se está verificando o restableciendo; no es estado compartido reactivo, solo un dato entre páginas.
export const readPendingEmail = () => sessionStorage.getItem(KEY) ?? '';
export const savePendingEmail = (email: string) => sessionStorage.setItem(KEY, email);
export const clearPendingEmail = () => sessionStorage.removeItem(KEY);
