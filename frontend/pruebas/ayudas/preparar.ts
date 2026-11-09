import { borrarUsuariosE2E, limpiarLimites } from './base_datos';

export default function preparar() {
  borrarUsuariosE2E();
  limpiarLimites();
}
