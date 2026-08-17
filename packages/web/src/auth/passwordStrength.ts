// Mirrored in packages/server/src/auth/password-strength.ts (no
// shared workspace package exists between the two, so this is
// duplicated deliberately - keep the two in sync). This copy exists
// purely for immediate UI feedback; the server copy is the one that
// actually can't be bypassed.
export const MIN_PASSWORD_LENGTH = 8;

const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];

export function isStrongPassword(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }
  const classesPresent = CHARACTER_CLASSES.filter((pattern) => pattern.test(password)).length;
  return classesPresent >= 3;
}

export const PASSWORD_REQUIREMENTS_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include at least 3 of: uppercase letters, lowercase letters, numbers, and symbols.`;
