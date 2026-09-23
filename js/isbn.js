// Normalización y validación de códigos EAN-13 / EAN-8 / UPC-A / ISBN-10.

const digits = (s) => String(s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();

function eanChecksumOk(code) {
  // Válido para EAN-8 y EAN-13: pesos 3/1 empezando por la derecha (sin contar el dígito de control)
  const nums = code.split('').map(Number);
  const check = nums.pop();
  let sum = 0;
  for (let i = nums.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += nums[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

function isbn10Ok(code) {
  if (!/^[0-9]{9}[0-9X]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (code[i] === 'X' ? 10 : Number(code[i])) * (10 - i);
  return sum % 11 === 0;
}

function isbn10to13(code) {
  const base = '978' + code.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 ? 3 : 1);
  return base + ((10 - (sum % 10)) % 10);
}

/** Devuelve el código normalizado (solo dígitos, ISBN-10 → EAN-13, UPC-A → EAN-13) o null si no es válido. */
export function normalizeCode(input) {
  const c = digits(input);
  if (c.length === 10 && isbn10Ok(c)) return isbn10to13(c);
  if (/X/.test(c)) return null;
  if (c.length === 12) return normalizeCode('0' + c); // UPC-A
  if ((c.length === 13 || c.length === 8) && eanChecksumOk(c)) return c;
  return null;
}

export const isIsbn = (code) => /^97[89][0-9]{10}$/.test(code ?? '');

/** 9788412345678 → 978-8412345678 (formato legible simple) */
export function formatCode(code) {
  if (!code) return '';
  return isIsbn(code) ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** ¿Parece un código de publicación de la Marca (B19, G0, XR3, CR…)? */
export const isPubCode = (s) => /^[A-Z]{1,3}\d{0,3}$/i.test(String(s ?? '').trim());
