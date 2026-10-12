export default function FieldError({ id, msg }: { id: string; msg?: string | null }) {
  if (!msg) return null;
  return (
    <p className="field-err" id={id} role="alert">
      {msg}
    </p>
  );
}
