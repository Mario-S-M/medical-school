import CampoTexto, { type PropsCampo } from './CampoTexto';

export default function CampoCodigo({ alCambiar, ...props }: Omit<PropsCampo, 'etiqueta'>) {
  return (
    <CampoTexto
      {...props}
      etiqueta="Código de 6 dígitos"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      alCambiar={(valor) => alCambiar(valor.replace(/\D/g, ''))}
    />
  );
}
