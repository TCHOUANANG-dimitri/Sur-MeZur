export const PASSWORD_LENGTH = 6;

export function isValidPassword(password: string): boolean {
  if (password.length !== PASSWORD_LENGTH) return false;
  if (!/[a-zA-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}