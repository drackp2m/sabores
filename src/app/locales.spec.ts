import {
  Dia,
  Filtros,
  Franja,
  Local,
  SIN_FILTROS,
  Tapa,
  abiertoA,
  diaDe,
  filtrarLocales,
} from './locales';

function local(
  name: string,
  tapa: Partial<Tapa> = {},
  horario: Partial<Record<Dia, Franja[]>> = {},
): Local {
  return {
    number: 1,
    name,
    subtitle: null,
    address: 'C/ MAYOR, 1',
    phone: null,
    instagram: null,
    drinks: ['CAÑA'],
    notes: [],
    schedule: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
      ...horario,
    },
    tapas: [
      {
        number: 1,
        name: 'TAPA',
        description: '',
        photo: '',
        glutenFree: 'no',
        castelloRutaDeSabor: false,
        ...tapa,
      },
    ],
    location: null,
  };
}

describe('abiertoA', () => {
  const franjas: Franja[] = [
    { open: '12:00', close: '16:00' },
    { open: '20:00', close: null },
  ];

  it('sin hora, basta con que sirva tapas ese día', () => {
    expect(abiertoA(franjas, '')).toBe(true);
    expect(abiertoA([], '')).toBe(false);
  });

  it('comprueba si la hora cae en alguna franja', () => {
    expect(abiertoA(franjas, '12:00')).toBe(true);
    expect(abiertoA(franjas, '16:00')).toBe(false);
    expect(abiertoA(franjas, '23:30')).toBe(true); // "hasta el cierre"
  });

  it('acepta franjas que pasan de medianoche', () => {
    expect(abiertoA([{ open: '21:00', close: '01:00' }], '23:00')).toBe(true);
  });
});

describe('diaDe', () => {
  it('devuelve el día de la semana', () => {
    expect(diaDe(new Date(2026, 9, 28))).toBe('wednesday');
    expect(diaDe(new Date(2026, 10, 1))).toBe('sunday');
  });
});

describe('filtrarLocales', () => {
  const locales = [
    local(
      'CÚPULA',
      { name: 'NUBE MARINA', glutenFree: 'yes' },
      { monday: [{ open: '20:00', close: '21:30' }] },
    ),
    local(
      'ORIGEN',
      { glutenFree: 'optional', castelloRutaDeSabor: true },
      { monday: [{ open: '12:00', close: '16:00' }] },
    ),
    local('DOS EN VERDE', {}, { friday: [{ open: '17:00', close: '20:00' }] }),
  ];
  const nombres = (filtros: Partial<Filtros>) =>
    filtrarLocales(locales, { ...SIN_FILTROS, ...filtros }).map((l) => l.name);

  it('sin filtros devuelve todos', () => {
    expect(nombres({})).toEqual(['CÚPULA', 'ORIGEN', 'DOS EN VERDE']);
  });

  it('busca sin distinguir acentos ni mayúsculas, también en las tapas', () => {
    expect(nombres({ texto: 'cupula' })).toEqual(['CÚPULA']);
    expect(nombres({ texto: 'Nube' })).toEqual(['CÚPULA']);
  });

  it('filtra por día y hora', () => {
    expect(nombres({ dia: 'monday' })).toEqual(['CÚPULA', 'ORIGEN']);
    expect(nombres({ dia: 'monday', hora: '13:00' })).toEqual(['ORIGEN']);
  });

  it('filtra por tapas sin gluten', () => {
    expect(nombres({ sinGluten: 'yes' })).toEqual(['CÚPULA']);
    expect(nombres({ sinGluten: 'optional' })).toEqual(['CÚPULA', 'ORIGEN']);
  });

  it('filtra por sello Castelló Ruta de Sabor', () => {
    expect(nombres({ rutaDeSabor: true })).toEqual(['ORIGEN']);
  });
});
