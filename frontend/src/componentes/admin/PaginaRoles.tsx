import GuardiaRol from '../auth/GuardiaRol';
import GestionRoles from './GestionRoles';
import NavegacionAdmin from './NavegacionAdmin';

export default function PaginaRoles() {
  return (
    <GuardiaRol rol="administrador">
      <div className="flex flex-col gap-6">
        <NavegacionAdmin actual="/admin/roles" />
        <GestionRoles />
      </div>
    </GuardiaRol>
  );
}
