import { useEffect, useState } from 'react';

export default function useCuentaRegresiva() {
  const [restante, setRestante] = useState(0);
  useEffect(() => {
    if (restante <= 0) return;
    const temporizador = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(temporizador);
  }, [restante]);
  return { restante, iniciar: setRestante };
}
