import { useState } from 'react';

type Validador = (valor: string) => string[];

export default function useCampo(validar: Validador = () => [], inicial = '') {
  const [valor, setValor] = useState(inicial);
  const [tocado, setTocado] = useState(false);
  return {
    valor,
    setValor,
    alCambiar: setValor,
    alSalir: () => setTocado(true),
    errores: tocado ? validar(valor) : [],
    validarYMarcar: () => {
      setTocado(true);
      return validar(valor).length === 0;
    },
  };
}
