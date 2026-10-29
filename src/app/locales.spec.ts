import {
  Dia,
  Filtros,
  Franja,
  Local,
  SIN_FILTROS,
  Tapa,
  abiertoEntre,
  claveCierre,
  describirEstado,
  diaDe,
  estadoHorario,
  filtrarLocales,
  formatearDistancia,
  formatearDuracion,
  llegadaDesde,
  ordenarBebidas,
  ordenarPor,
  pastillaEstado,
  tipoEstado,
  tiposDeBebida,
} from './locales';

function local(
  name: string,
  tapa: Partial<Tapa> = {},
  horario: Partial<Record<Dia, Franja[]>> = {},
  extra: Partial<Local> = {},
): Local {
  return {
    number: 1,
    name,
    subtitle: null,
    address: 'C/ MAYOR, 1',
    phone: null,
    instagram: null,
    drinks: [{ name: 'Caña', type: 'Cerveza' }],
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
    ...extra,
  };
}

describe('abiertoEntre', () => {
  const franjas: Franja[] = [
    { open: '12:00', close: '16:00' },
    { open: '20:00', close: null },
  ];

  it('sin horas, basta con que sirva tapas ese día', () => {
    expect(abiertoEntre(franjas, '', '')).toBe(true);
    expect(abiertoEntre([], '', '')).toBe(false);
  });

  it('solo con "desde", comprueba esa hora exacta', () => {
    expect(abiertoEntre(franjas, '12:00', '')).toBe(true);
    expect(abiertoEntre(franjas, '16:00', '')).toBe(false);
    expect(abiertoEntre(franjas, '23:30', '')).toBe(true); // "hasta el cierre"
  });

  it('con rango, vale cualquier franja que se solape', () => {
    expect(abiertoEntre(franjas, '17:00', '19:00')).toBe(false);
    expect(abiertoEntre(franjas, '17:00', '20:30')).toBe(true);
    expect(abiertoEntre(franjas, '15:30', '18:00')).toBe(true);
    expect(abiertoEntre(franjas, '16:00', '20:00')).toBe(false); // solo se tocan
    expect(abiertoEntre(franjas, '', '12:30')).toBe(true);
  });

  it('acepta franjas y rangos que pasan de medianoche', () => {
    expect(abiertoEntre([{ open: '21:00', close: '01:00' }], '23:00', '')).toBe(true);
    expect(abiertoEntre([{ open: '21:00', close: '23:00' }], '22:00', '01:00')).toBe(true);
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
      { drinks: [{ name: 'Vermut casero', type: 'Vermut' }] },
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

  it('busca sin distinguir acentos ni mayúsculas, también en las tapas y bebidas', () => {
    expect(nombres({ texto: 'cupula' })).toEqual(['CÚPULA']);
    expect(nombres({ texto: 'Nube' })).toEqual(['CÚPULA']);
    expect(nombres({ texto: 'casero' })).toEqual(['CÚPULA']);
  });

  it('filtra por día y rango de horas', () => {
    expect(nombres({ dia: 'monday' })).toEqual(['CÚPULA', 'ORIGEN']);
    expect(nombres({ dia: 'monday', desde: '13:00' })).toEqual(['ORIGEN']);
    expect(nombres({ dia: 'monday', desde: '15:00', hasta: '20:30' })).toEqual([
      'CÚPULA',
      'ORIGEN',
    ]);
  });

  it('filtra por tapas sin gluten', () => {
    expect(nombres({ sinGluten: 'yes' })).toEqual(['CÚPULA']);
    expect(nombres({ sinGluten: 'optional' })).toEqual(['CÚPULA', 'ORIGEN']);
  });

  it('filtra por tipo de bebida', () => {
    expect(nombres({ bebida: 'Vermut' })).toEqual(['CÚPULA']);
    expect(nombres({ bebida: 'Cerveza' })).toEqual(['ORIGEN', 'DOS EN VERDE']);
  });

  it('filtra por sello Castelló Ruta de Sabor', () => {
    expect(nombres({ rutaDeSabor: true })).toEqual(['ORIGEN']);
  });
});

describe('bebidas', () => {
  const conBebidas = (...drinks: [string, string][]) =>
    local('X', {}, {}, { drinks: drinks.map(([name, type]) => ({ name, type })) });
  const locales = [
    conBebidas(['Caña', 'Cerveza'], ['Copa de vino', 'Vino'], ['Tercio', 'Cerveza']),
    conBebidas(['Agua', 'Agua'], ['Caña', 'Cerveza'], ['Michelada', 'Cóctel']),
    conBebidas(['Agua', 'Agua'], ['Caña', 'Cerveza']),
  ];

  it('cuenta los locales de cada tipo, primero los más habituales', () => {
    expect(tiposDeBebida(locales)).toEqual([
      { tipo: 'Cerveza', locales: 3 },
      { tipo: 'Agua', locales: 2 },
      { tipo: 'Cóctel', locales: 1 },
      { tipo: 'Vino', locales: 1 },
    ]);
  });

  it('ordena las de cada local por cuántos locales las sirven y luego alfabéticamente', () => {
    expect(ordenarBebidas(locales).map((l) => l.drinks.map((b) => b.name))).toEqual([
      ['Caña', 'Copa de vino', 'Tercio'],
      ['Caña', 'Agua', 'Michelada'],
      ['Caña', 'Agua'],
    ]);
  });
});

describe('estadoHorario', () => {
  // Miércoles 28 de octubre de 2026.
  const a = (hora: string) => new Date(`2026-10-28T${hora}`);
  const horario = local(
    'X',
    {},
    {
      wednesday: [
        { open: '12:00', close: '16:00' },
        { open: '20:00', close: null },
      ],
      friday: [{ open: '13:00', close: '15:00' }],
    },
  ).schedule;
  const ruta = { startDate: '2026-10-15', endDate: '2026-11-07' };

  it('si está abierto, cuenta hasta el cierre de la franja', () => {
    expect(estadoHorario(horario, a('14:40'), ruta)).toEqual({
      abierto: true,
      minutos: 80,
      hastaElCierre: false,
    });
    expect(estadoHorario(horario, a('22:00'), ruta)).toEqual({
      abierto: true,
      minutos: 120,
      hastaElCierre: true,
    });
  });

  it('si está cerrado, cuenta hasta la próxima apertura', () => {
    expect(estadoHorario(horario, a('17:00'), ruta)).toEqual({ abierto: false, minutos: 180 });
    expect(estadoHorario(horario, a('09:15'), ruta)).toEqual({ abierto: false, minutos: 165 });
    // Jueves sin tapas: el viernes a las 13:00.
    expect(estadoHorario({ ...horario, wednesday: [] }, a('10:00'), ruta)).toEqual({
      abierto: false,
      minutos: 2 * 24 * 60 + 180,
    });
  });

  it('respeta las fechas de la ruta', () => {
    expect(estadoHorario(horario, a('14:00'), { ...ruta, endDate: '2026-10-27' })).toEqual({
      abierto: false,
      minutos: null,
    });
    expect(estadoHorario(horario, a('14:00'), { ...ruta, startDate: '2026-10-30' })).toEqual({
      abierto: false,
      minutos: 2 * 24 * 60 - 60,
    });
  });
});

describe('tipoEstado', () => {
  it('distingue abierto, a punto de cerrar y cerrado', () => {
    expect(tipoEstado({ abierto: true, minutos: 90 })).toBe('abierto');
    expect(tipoEstado({ abierto: true, minutos: 30 })).toBe('pronto');
    expect(tipoEstado({ abierto: true, minutos: 10, hastaElCierre: true })).toBe('abierto');
    expect(tipoEstado({ abierto: false, minutos: 10 })).toBe('cerrado');
  });

  it('avisa si cierra antes de que dé tiempo a llegar', () => {
    const llegada = { metros: 2000, minutos: 33, modo: 'pie' as const };
    expect(tipoEstado({ abierto: true, minutos: 90 }, llegada)).toBe('abierto');
    expect(tipoEstado({ abierto: true, minutos: 32 }, llegada)).toBe('tarde');
    expect(tipoEstado({ abierto: true, minutos: 20, hastaElCierre: true }, llegada)).toBe(
      'abierto',
    );
    expect(tipoEstado({ abierto: false, minutos: 10 }, llegada)).toBe('cerrado');
    expect(pastillaEstado({ abierto: true, minutos: 20 }, new Date(), llegada)).toEqual({
      texto: 'cierra en 20 min',
      tipo: 'tarde',
      aviso: 'Cierra antes de que llegues: tardas 33 min',
    });
  });
});

describe('describirEstado', () => {
  const ahora = new Date('2026-10-28T10:00');

  it('describe cuánto falta para cerrar o abrir', () => {
    expect(describirEstado({ abierto: true, minutos: 80 }, ahora)).toBe('cierra en 1 h 20 min');
    expect(describirEstado({ abierto: true, minutos: 120, hastaElCierre: true }, ahora)).toBe(
      'hasta el cierre',
    );
    expect(describirEstado({ abierto: false, minutos: 45 }, ahora)).toBe('abre en 45 min');
    expect(describirEstado({ abierto: false, minutos: null }, ahora)).toBe('no hay más tapas');
  });

  it('para aperturas lejanas, dice el día y la hora', () => {
    expect(describirEstado({ abierto: false, minutos: 13 * 60 }, ahora)).toBe(
      'abre hoy a las 23:00',
    );
    expect(describirEstado({ abierto: false, minutos: 26 * 60 }, ahora)).toBe(
      'abre mañana a las 12:00',
    );
    expect(describirEstado({ abierto: false, minutos: 51 * 60 }, ahora)).toBe(
      'abre el viernes a las 13:00',
    );
  });
});

describe('ordenarPor', () => {
  const conNumero = (number: number) => local(`L${number}`, {}, {}, { number });

  it('ordena por la clave y, si empatan, por número', () => {
    const claves: Record<number, number> = { 1: 30, 2: 10, 3: 30, 4: Infinity, 5: Infinity };
    expect(
      ordenarPor([5, 4, 3, 2, 1].map(conNumero), (l) => claves[l.number]).map((l) => l.number),
    ).toEqual([2, 1, 3, 4, 5]);
  });

  it('por cierre, primero los abiertos y después los que abren antes', () => {
    const estados = [
      { abierto: false, minutos: 10 },
      { abierto: true, minutos: 90 },
      { abierto: false, minutos: null },
      { abierto: true, minutos: 15 },
    ];
    expect(estados.map(claveCierre).sort((a, b) => a - b)).toEqual(
      [3, 1, 0, 2].map((i) => claveCierre(estados[i])),
    );
  });
});

describe('llegadaDesde', () => {
  const plaza = { lat: 39.986, lng: -0.037 };

  it('estima el tiempo a pie para distancias cortas', () => {
    const llegada = llegadaDesde(plaza, { lat: 39.995, lng: -0.037 }); // ~1 km al norte
    expect(llegada.modo).toBe('pie');
    expect(Math.round(llegada.metros / 100)).toBe(10);
    expect(llegada.minutos).toBe(16);
  });

  it('y en coche para las largas', () => {
    expect(llegadaDesde(plaza, { lat: 39.94, lng: -0.1 }).modo).toBe('coche');
  });

  it('o con el medio que se elija', () => {
    const llegada = llegadaDesde(plaza, { lat: 39.995, lng: -0.037 }, 'coche');
    expect(llegada.modo).toBe('coche');
    expect(llegada.minutos).toBe(3);
    expect(llegadaDesde(plaza, { lat: 39.94, lng: -0.1 }, 'pie').modo).toBe('pie');
  });
});

describe('formatos', () => {
  it('formatea duraciones y distancias', () => {
    expect(formatearDuracion(5)).toBe('5 min');
    expect(formatearDuracion(60)).toBe('1 h');
    expect(formatearDuracion(135)).toBe('2 h 15 min');
    expect(formatearDistancia(847)).toBe('850 m');
    expect(formatearDistancia(1234)).toBe('1,2 km');
  });
});
