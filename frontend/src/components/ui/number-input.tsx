'use client';

import * as React from 'react';

/** `type` is accepted so the tag can replace `<input type="number">` as is; it is always number. */
type NumberInputProps = React.ComponentProps<'input'>;

function toText(v: NumberInputProps['value']): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isNaN(v)) return '';
  return String(v);
}

/**
 * A number field that can be cleared and retyped.
 *
 * Most forms keep numbers in state and convert on every keystroke
 * (`parseInt(e.target.value) || 0`). Bound straight to that state, an
 * emptied field turns back into 0 at once, so it can never be blank and
 * typing after it gives "04". This keeps the text being typed separately
 * from the form's number: while the field has focus, an empty or partly
 * typed value stays as typed; when the form changes the number itself
 * (clamping to a maximum, filling a default), the field follows. On blur
 * it shows the value the form will actually save.
 *
 * Drop-in for `<input type="number">`: same props, same onChange event.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, onFocus, onBlur, type: _type, ...rest },
  ref,
) {
  const [text, setText] = React.useState(() => toText(value));
  const focused = React.useRef(false);
  const textRef = React.useRef(text);
  textRef.current = text;

  React.useEffect(() => {
    const next = toText(value);
    if (!focused.current) {
      setText(next);
      return;
    }
    const typed = textRef.current;
    // Mid-edit states the form cannot represent as a number.
    if (typed === '' || typed === '-' || /[.,eE]$/.test(typed)) return;
    if (Number(typed) !== Number(next)) setText(next);
  }, [value]);

  // Uncontrolled use (defaultValue) passes straight through.
  if (value === undefined) {
    return <input ref={ref} type="number" onChange={onChange} onFocus={onFocus} onBlur={onBlur} {...rest} />;
  }

  return (
    <input
      ref={ref}
      type="number"
      {...rest}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        setText(toText(value));
        onBlur?.(e);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange?.(e);
      }}
    />
  );
});
