import { conSesion } from '../../api/con_sesion';
import { asignarRol } from '../../api/escuela';
import { mensajeDeError } from '../../api/errores';
import type { RolAsignable, UsuarioBuscado } from '../../api/tipos_escuela';
import useEnvio from '../../hooks/useEnvio';
import AlertaError from '../ui/AlertaError';
import Boton from '../ui/Boton';

type Props = {
  usuario: UsuarioBuscado;
  rol: RolAsignable;
  etiqueta: string;
  alCambiar: (usuario: UsuarioBuscado) => void;
};

export default function InterruptorRol({ usuario, rol, etiqueta, alCambiar }: Props) {
  const tiene = usuario.roles.includes(rol);
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => asignarRol(token, { usuario_id: usuario.id, rol, activo: !tiene })),
    () => {
      const roles = tiene ? usuario.roles.filter((r) => r !== rol) : [...usuario.roles, rol];
      alCambiar({ ...usuario, roles });
    },
  );
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <div className="flex items-center justify-between gap-3">
        <span>{etiqueta}: <strong>{tiene ? 'Sí' : 'No'}</strong></span>
        <Boton variante={tiene ? 'secundario' : 'primario'} disabled={enviando} onClick={() => void enviar()}>
          {tiene ? `Quitar ${etiqueta.toLowerCase()}` : `Dar ${etiqueta.toLowerCase()}`}
        </Boton>
      </div>
    </li>
  );
}
