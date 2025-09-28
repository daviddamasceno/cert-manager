import { URL } from 'node:url';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const sanitizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const isValidEmail = (value: string): boolean => EMAIL_REGEX.test(value.toLowerCase());

export const assertValidEmail = (value: string, fieldName: string): void => {
  if (!isValidEmail(value)) {
    throw new Error(`O campo ${fieldName} deve ser um e-mail válido.`);
  }
};

export const parseEmailList = (value: string, fieldName = 'owner_email'): string[] => {
  const emails = value
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  emails.forEach((email) => assertValidEmail(email, fieldName));
  return emails;
};

export const normalizeEmailList = (value: string, fieldName = 'owner_email'): string =>
  parseEmailList(value, fieldName).join(', ');

export const isValidPort = (value: string): boolean => {
  if (!/^\d+$/.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 65535;
};

export const assertValidPort = (value: string, fieldName: string): void => {
  if (!isValidPort(value)) {
    throw new Error(`O campo ${fieldName} deve ser uma porta válida (1-65535).`);
  }
};

export const isValidPositiveInteger = (value: string): boolean => /^\d+$/.test(value) && Number(value) > 0;

export const assertValidPositiveInteger = (value: string, fieldName: string): void => {
  if (!isValidPositiveInteger(value)) {
    throw new Error(`O campo ${fieldName} deve ser um número inteiro positivo.`);
  }
};

export const isValidHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

export const assertValidHttpUrl = (value: string, fieldName: string): void => {
  if (!isValidHttpUrl(value)) {
    throw new Error(`O campo ${fieldName} deve ser uma URL HTTP/HTTPS válida.`);
  }
};

export const isValidHostname = (value: string): boolean => {
  if (!value || /\s/.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(`http://${value}`);
    return Boolean(parsed.hostname);
  } catch (error) {
    return false;
  }
};

export const assertValidHostname = (value: string, fieldName: string): void => {
  if (!isValidHostname(value)) {
    throw new Error(`O campo ${fieldName} deve ser um host ou domínio válido.`);
  }
};
