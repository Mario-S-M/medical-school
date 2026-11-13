import { useState } from 'react';
import type { Validator } from '../lib/zod-validator';

export default function useField(validate: Validator = () => [], initial = '') {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  return {
    value,
    setValue,
    onChange: setValue,
    onBlur: () => setTouched(true),
    errors: touched ? validate(value) : [],
    validateAndMark: () => {
      setTouched(true);
      return validate(value).length === 0;
    },
  };
}
