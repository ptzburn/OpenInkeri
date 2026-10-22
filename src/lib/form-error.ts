// What a refused server action carries to the page that posted it (in
// `submission.error`, see useSubmissions): the account and sign-in forms
// read ActionError, the admins' edit forms FormError (src/server/forms.ts
// builds it; src/components/form-fields.tsx shows it).

/** A refused action: why, in the reader's language. */
export interface ActionError {
  message: string;
}

/**
 * A refused save: a message, and the fields at fault by name, each with why
 * ('' when the server has no reason of its own: the field's hint says it).
 */
export interface FormError extends ActionError {
  fields?: Record<string, string>;
}
