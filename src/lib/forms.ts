// The admins' edit forms: what a refused save carries from the server
// (src/server/forms.ts) to the form (src/components/form-fields.tsx).

/** A refused save: a message, and the names of the fields at fault. */
export interface FormError {
  message: string;
  fields?: string[];
}
