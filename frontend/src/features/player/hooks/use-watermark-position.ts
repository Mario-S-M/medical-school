import { useEffect, useState } from 'react';

const MOVE_EVERY_MS = 7000;
const random = () => ({ x: Math.round(Math.random() * 100), y: Math.round(Math.random() * 70) }); // y deja libres los controles

// Porcentajes dentro del contenedor (con `translate` inverso la marca nunca se sale, ni al cambiar de tamaño).
export default function useWatermarkPosition() {
  const [position, setPosition] = useState(random);
  useEffect(() => {
    const timer = setInterval(() => setPosition(random()), MOVE_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return position;
}
