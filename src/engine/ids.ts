/** Short unique ids for user-created records. Impure by nature, kept out of the maths. */
let counter = 0
export function uid(prefix: string): string {
  counter += 1
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rand}${counter.toString(36)}`
}
