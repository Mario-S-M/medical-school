import GuardiaSesion from './GuardiaSesion';
import PanelUsuario from './PanelUsuario';

export default function PanelProtegido() {
  return (
    <GuardiaSesion>
      <PanelUsuario />
    </GuardiaSesion>
  );
}
