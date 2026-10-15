// What a refused server action carries to the page that posted it (in
// `submission.error`, see useSubmissions): the account and sign-in forms
// read ActionError, the admins' edit forms FormError (src/server/forms.ts
// builds it; src/components/form-fields.tsx shows it).

/** A refused action: why, in the reader's language. */
export interface ActionError {
  message: string;
}

/** A refused save: a message, and the names of the fields at fault. */
export interface FormError extends ActionError {
  fields?: string[];
}
