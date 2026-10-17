import { AlertCircle, Info } from 'lucide-react'
import { useId, type ReactNode } from 'react'

interface InputProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

interface FieldProps {
  label: string
  hint?: string
  error?: string
  warn?: string
  children: (props: InputProps) => ReactNode
  className?: string
  hideLabel?: boolean
}

/**
 * Label + control + hint + error beside the field. Errors are linked with
 * aria-describedby so screen readers announce them with the control.
 */
export function Field({ label, hint, error, warn, children, className, hideLabel }: FieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : '', warn ? `${id}-warn` : ''].filter(Boolean).join(' ')
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label className={hideLabel ? 'sr-only' : 'field__label'} htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy || undefined, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-err`} role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      {warn && !error ? (
        <p className="field__warn" id={`${id}-warn`}>
          <Info size={15} aria-hidden="true" />
          <span>{warn}</span>
        </p>
      ) : null}
    </div>
  )
}

/** Inline error for groups of controls that are not a single input. */
export function ErrorText({ children, id }: { children?: string; id?: string }) {
  if (!children) return null
  return (
    <p className="field__error" id={id} role="alert">
      <AlertCircle size={15} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
