import { useState } from 'react';
import CampoTexto, { type PropsCampo } from './CampoTexto';

export default function CampoContrasena(props: Omit<PropsCampo, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <CampoTexto {...props} type={visible ? 'text' : 'password'} />
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Mostrar contraseña
      </label>
    </div>
  );
}
