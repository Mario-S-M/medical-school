const CLAVE = 'correo_pendiente';

export const leerCorreoPendiente = () => sessionStorage.getItem(CLAVE) ?? '';
export const guardarCorreoPendiente = (correo: string) => sessionStorage.setItem(CLAVE, correo);
export const borrarCorreoPendiente = () => sessionStorage.removeItem(CLAVE);
