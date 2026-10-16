export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_REQUIREMENTS =
  "At least 6 characters, with at least 1 number and 1 special character.";

const NUMBER_RE = /[0-9]/;
const SPECIAL_RE = /[^A-Za-z0-9]/;

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: "Password must be at least 6 characters long." };
  }
  if (!NUMBER_RE.test(password)) {
    return { ok: false, message: "Password must contain at least 1 number." };
  }
  if (!SPECIAL_RE.test(password)) {
    return { ok: false, message: "Password must contain at least 1 special character." };
  }
  return { ok: true };
}
