// A field's error under it, in the form's error style.
export default function FieldErr({ text }: { text?: string }) {
  return text ? <p className="stu-ferr" role="alert">{text}</p> : null;
}
