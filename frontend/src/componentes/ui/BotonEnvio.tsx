import Boton from './Boton';

type Props = { texto: string; enviando: boolean; restante?: number };

export default function BotonEnvio({ texto, enviando, restante = 0 }: Props) {
  const bloqueado = restante > 0;
  return (
    <Boton type="submit" className="w-full py-2.5" disabled={enviando || bloqueado}>
      {enviando ? 'Enviando…' : bloqueado ? `Espera ${restante} s` : texto}
    </Boton>
  );
}
