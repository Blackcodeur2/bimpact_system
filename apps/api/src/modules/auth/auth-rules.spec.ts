import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto, RegisterDto } from './dto';
import { maskPhone, normalizeCameroonPhone } from './phone';
import { isWeakPin } from './pin.service';

describe('normalizeCameroonPhone', () => {
  it.each([
    ['6 12 34 56 78', '+237612345678'],
    ['612345678', '+237612345678'],
    ['237612345678', '+237612345678'],
    ['00237 612-345-678', '+237612345678'],
    ['+237 6 12 34 56 78', '+237612345678'],
  ])('normalise %s', (input, expected) => {
    expect(normalizeCameroonPhone(input)).toBe(expected);
  });

  it('laisse passer les valeurs non textuelles pour que la validation les rejette', () => {
    expect(normalizeCameroonPhone(42)).toBe(42);
  });

  it('masque le numéro dans les logs', () => {
    expect(maskPhone('+237612345678')).toBe('+2376****5678');
  });
});

describe('isWeakPin', () => {
  it.each(['000000', '111111', '123456', '654321', '345678', '121212', '123123'])('refuse %s', (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });

  it.each(['408215', '739104', '260917'])('accepte %s', (pin) => {
    expect(isWeakPin(pin)).toBe(false);
  });
});

describe('RegisterDto', () => {
  const valid = {
    phone: '6 99 00 11 22',
    firstName: '  Benjamin ',
    lastName: 'Mbala',
    city: 'Yaoundé',
    email: 'Benjamin.Mbala@gmail.com',
    username: 'benjamin_237',
    password: 'MonSuperMotDePasse2026',
    pin: '408215',
    acceptTerms: true,
    acceptPrivacy: true,
  };

  const validate = (payload: Record<string, unknown>) => {
    const dto = plainToInstance(RegisterDto, payload);
    return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
  };

  it('accepte une inscription valide et normalise les champs', () => {
    const { dto, errors } = validate(valid);
    expect(errors).toHaveLength(0);
    expect(dto.phone).toBe('+237699001122');
    expect(dto.firstName).toBe('Benjamin');
    expect(dto.email).toBe('benjamin.mbala@gmail.com');
    expect(dto.username).toBe('benjamin_237');
  });

  it('refuse un numéro fixe ou étranger', () => {
    expect(validate({ ...valid, phone: '+237222123456' }).errors.map((e) => e.property)).toContain('phone');
    expect(validate({ ...valid, phone: '+33612345678' }).errors.map((e) => e.property)).toContain('phone');
  });

  it('refuse une adresse e-mail invalide', () => {
    expect(validate({ ...valid, email: 'pas-un-email' }).errors.map((e) => e.property)).toContain('email');
  });

  it('refuse un nom d’utilisateur avec des caractères interdits ou trop court', () => {
    expect(validate({ ...valid, username: 'ab' }).errors.map((e) => e.property)).toContain('username');
    expect(validate({ ...valid, username: 'user@name!' }).errors.map((e) => e.property)).toContain('username');
  });

  it('refuse un mot de passe trop court', () => {
    expect(validate({ ...valid, password: 'court' }).errors.map((e) => e.property)).toContain('password');
  });

  it('exige les consentements explicites', () => {
    const { errors } = validate({ ...valid, acceptTerms: false });
    expect(errors.map((e) => e.property)).toContain('acceptTerms');
  });

  it('refuse un PIN qui ne fait pas 6 chiffres', () => {
    expect(validate({ ...valid, pin: '1234' }).errors.map((e) => e.property)).toContain('pin');
  });

  it('refuse les champs inconnus', () => {
    expect(validate({ ...valid, role: 'SUPER_ADMIN' }).errors.length).toBeGreaterThan(0);
  });
});

describe('LoginDto', () => {
  const valid = {
    identifier: 'benjamin_237',
    password: 'MonSuperMotDePasse2026',
    device: {
      installationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      platform: 'android',
    },
  };

  const validate = (payload: Record<string, unknown>) => {
    const dto = plainToInstance(LoginDto, payload);
    return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
  };

  it('accepte des identifiants valides', () => {
    const { errors } = validate(valid);
    expect(errors).toHaveLength(0);
  });

  it('refuse un identifiant trop court ou un mot de passe vide', () => {
    expect(validate({ ...valid, identifier: 'ab' }).errors.map((e) => e.property)).toContain('identifier');
    expect(validate({ ...valid, password: '' }).errors.map((e) => e.property)).toContain('password');
  });
});
