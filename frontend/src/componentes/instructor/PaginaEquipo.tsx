import GuardiaRol from '../auth/GuardiaRol';
import GestionEquipo from './GestionEquipo';

export default function PaginaEquipo() {
  return (
    <GuardiaRol rol="instructor">
      <GestionEquipo />
    </GuardiaRol>
  );
}
