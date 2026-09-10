import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from './errors/app-exception';

/** Aplati l'arbre d'erreurs class-validator en `{ "champ.sous_champ": ["message"] }`. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
  out: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      out[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      flattenValidationErrors(error.children, path, out);
    }
  }
  return out;
}

export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Certaines informations sont invalides.',
        { fields: flattenValidationErrors(errors) },
      ),
  });
}
