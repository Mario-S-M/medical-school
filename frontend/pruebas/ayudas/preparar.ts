import { borrarUsuariosE2E, limpiarEscuelaE2E, limpiarLimites } from './base_datos';

export default function preparar() {
  limpiarEscuelaE2E();
  borrarUsuariosE2E();
  limpiarLimites();
}
