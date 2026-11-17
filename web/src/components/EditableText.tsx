import { useEffect, useState } from 'react';

/** Campo di testo che salva quando si esce dal campo. */
export function EditableText({ value, onSave, label, className, placeholder, multiline }: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const next = multiline ? text : text.trim();
    if (!multiline && !next) return setText(value);
    if (next !== value) onSave(next);
  };
  return multiline ? (
    <textarea className={className} aria-label={label} placeholder={placeholder} rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input
      className={className}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
