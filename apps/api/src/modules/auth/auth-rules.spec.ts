import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './dto';
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
  });

  it('refuse un numéro fixe ou étranger', () => {
    expect(validate({ ...valid, phone: '+237222123456' }).errors.map((e) => e.property)).toContain('phone');
    expect(validate({ ...valid, phone: '+33612345678' }).errors.map((e) => e.property)).toContain('phone');
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
