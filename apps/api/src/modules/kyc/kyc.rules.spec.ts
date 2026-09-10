import { ageAt, evaluateRequirements, parseCalendarDate, requiredDocumentTypes, RequirementProfile, sameName } from './kyc.rules';

const complete: RequirementProfile = {
  firstName: 'Awa',
  lastName: 'Ngono',
  birthDate: new Date('1990-05-14T00:00:00Z'),
  idDocumentType: 'CNI',
  idDocumentNumber: 'CM123456',
  idDocumentExpiry: new Date('2030-01-01T00:00:00Z'),
  city: 'Douala',
  district: 'Akwa',
  vehiclePlate: 'LT 123 AB',
  vehicleOwnership: 'OWNER',
};

describe('règles KYC', () => {
  it('exige recto, verso et selfie pour une CNI, une seule face pour un passeport ou un récépissé', () => {
    expect(requiredDocumentTypes('CNI')).toEqual(['ID_FRONT', 'ID_BACK', 'SELFIE']);
    expect(requiredDocumentTypes(null)).toEqual(['ID_FRONT', 'ID_BACK', 'SELFIE']);
    expect(requiredDocumentTypes('PASSPORT')).toEqual(['ID_FRONT', 'SELFIE']);
    expect(requiredDocumentTypes('RECEIPT')).toEqual(['ID_FRONT', 'SELFIE']);
  });

  it('compte le téléphone vérifié dans l’avancement d’un dossier vide', () => {
    const result = evaluateRequirements(null, []);
    expect(result.completion).toBe(20);
    expect(result.missing).toEqual(['IDENTITY', 'LOCATION', 'VEHICLE', 'DOCUMENT:ID_FRONT', 'DOCUMENT:ID_BACK', 'DOCUMENT:SELFIE']);
  });

  it('considère un dossier complet quand toutes les pièces requises sont utilisables', () => {
    const docs = (['ID_FRONT', 'ID_BACK', 'SELFIE'] as const).map((type) => ({ type, status: 'PENDING' as const }));
    const result = evaluateRequirements(complete, docs);
    expect(result).toMatchObject({ identity: true, location: true, vehicle: true, documents: true, completion: 100, missing: [] });
  });

  it('ne compte pas un document refusé', () => {
    const docs = [
      { type: 'ID_FRONT' as const, status: 'ACCEPTED' as const },
      { type: 'ID_BACK' as const, status: 'REJECTED' as const },
      { type: 'SELFIE' as const, status: 'PENDING' as const },
    ];
    expect(evaluateRequirements(complete, docs).missing).toEqual(['DOCUMENT:ID_BACK']);
  });

  it('refuse les dates calendaires inexistantes', () => {
    expect(parseCalendarDate('1990-05-14')?.toISOString()).toBe('1990-05-14T00:00:00.000Z');
    expect(parseCalendarDate('1990-02-30')).toBeNull();
    expect(parseCalendarDate('14/05/1990')).toBeNull();
  });

  it('calcule l’âge à la date d’anniversaire près', () => {
    const birth = new Date('2008-09-10T00:00:00Z');
    expect(ageAt(birth, new Date('2026-09-09T12:00:00Z'))).toBe(17);
    expect(ageAt(birth, new Date('2026-09-10T12:00:00Z'))).toBe(18);
  });

  it('compare les noms sans tenir compte des accents ni de la casse', () => {
    expect(sameName('Éloïse', 'eloise')).toBe(true);
    expect(sameName('Mbala-Ndzana', 'MBALA NDZANA')).toBe(true);
    expect(sameName('Awa', 'Ava')).toBe(false);
  });
});
