import Button from './Button';

type Props = { text: string; submitting: boolean; remaining?: number };

export default function SubmitButton({ text, submitting, remaining = 0 }: Props) {
  const blocked = remaining > 0;
  return (
    <Button type="submit" className="w-full py-2.5" disabled={submitting || blocked}>
      {submitting ? 'Enviando…' : blocked ? `Espera ${remaining} s` : text}
    </Button>
  );
}
