// Metadados das 48 seleções: código ISO alpha-2 (para emoji de bandeira), código de
// 3 letras (display compacto) e a bandeira já resolvida. Nomes em PT, tal como nos dados.
// Bandeiras e nomes de seleções são livres; nenhum branding oficial do torneio é usado.

// England e Scotland usam bandeiras de subdivisão (não têm ISO alpha-2 próprio).
const SUBDIVISION_FLAGS = {
  Inglaterra: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  Escócia: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
};

// nome PT -> [ISO alpha-2, código 3 letras]
const TEAM_ISO = {
  'México': ['MX', 'MEX'],
  'África do Sul': ['ZA', 'RSA'],
  'Coreia do Sul': ['KR', 'KOR'],
  'Chéquia': ['CZ', 'CZE'],
  'Canadá': ['CA', 'CAN'],
  'Bósnia-Herzegovina': ['BA', 'BIH'],
  'Catar': ['QA', 'QAT'],
  'Suíça': ['CH', 'SUI'],
  'Brasil': ['BR', 'BRA'],
  'Marrocos': ['MA', 'MAR'],
  'Haiti': ['HT', 'HAI'],
  'Escócia': ['GB', 'SCO'],
  'EUA': ['US', 'USA'],
  'Paraguai': ['PY', 'PAR'],
  'Austrália': ['AU', 'AUS'],
  'Turquia': ['TR', 'TUR'],
  'Alemanha': ['DE', 'GER'],
  'Curaçao': ['CW', 'CUW'],
  'Costa do Marfim': ['CI', 'CIV'],
  'Equador': ['EC', 'ECU'],
  'Holanda': ['NL', 'NED'],
  'Japão': ['JP', 'JPN'],
  'Suécia': ['SE', 'SWE'],
  'Tunísia': ['TN', 'TUN'],
  'Bélgica': ['BE', 'BEL'],
  'Egito': ['EG', 'EGY'],
  'Irão': ['IR', 'IRN'],
  'Nova Zelândia': ['NZ', 'NZL'],
  'Espanha': ['ES', 'ESP'],
  'Cabo Verde': ['CV', 'CPV'],
  'Arábia Saudita': ['SA', 'KSA'],
  'Uruguai': ['UY', 'URU'],
  'França': ['FR', 'FRA'],
  'Senegal': ['SN', 'SEN'],
  'Iraque': ['IQ', 'IRQ'],
  'Noruega': ['NO', 'NOR'],
  'Argentina': ['AR', 'ARG'],
  'Argélia': ['DZ', 'ALG'],
  'Áustria': ['AT', 'AUT'],
  'Jordânia': ['JO', 'JOR'],
  'Portugal': ['PT', 'POR'],
  'Congo': ['CD', 'COD'], // RD Congo (participante real do Mundial 2026; ESPN: COD)
  'Uzbequistão': ['UZ', 'UZB'],
  'Colômbia': ['CO', 'COL'],
  'Inglaterra': ['GB', 'ENG'],
  'Croácia': ['HR', 'CRO'],
  'Gana': ['GH', 'GHA'],
  'Panamá': ['PA', 'PAN'],
};

function isoToFlag(iso) {
  const A = 0x1f1e6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(...[...iso].map((c) => A + (c.charCodeAt(0) - base)));
}

// Ficheiro do SVG da bandeira (em public/flags/). England/Scotland usam subdivisões.
const SUBDIVISION_FILE = { Inglaterra: 'gb-eng', Escócia: 'gb-sct' };

// Pontos do ranking FIFA (Coca-Cola Men's World Ranking, 2026-06-10). Critério de desempate
// dos 8 melhores 3.os (Art. 13): mais pontos = melhor. Fonte: football-ranking.com.
const FIFA_POINTS = {
  'México': 1687.48, 'África do Sul': 1491, 'Coreia do Sul': 1591.63, 'Chéquia': 1505.74,
  'Canadá': 1559.48, 'Bósnia-Herzegovina': 1524, 'Catar': 1456, 'Suíça': 1650.07,
  'Brasil': 1765.86, 'Marrocos': 1755.44, 'Haiti': 1284, 'Escócia': 1503.34,
  'EUA': 1671.24, 'Paraguai': 1505.35, 'Austrália': 1579.34, 'Turquia': 1530,
  'Alemanha': 1735.77, 'Curaçao': 1370, 'Costa do Marfim': 1540.87, 'Equador': 1598.51,
  'Holanda': 1751.09, 'Japão': 1661.58, 'Suécia': 1509.79, 'Tunísia': 1476.40,
  'Bélgica': 1742.23, 'Egito': 1562.37, 'Irão': 1619.58, 'Nova Zelândia': 1226,
  'Espanha': 1873.02, 'Cabo Verde': 1390, 'Arábia Saudita': 1490, 'Uruguai': 1673.07,
  'França': 1869.43, 'Senegal': 1686.41, 'Iraque': 1483, 'Noruega': 1557.44,
  'Argentina': 1876.11, 'Argélia': 1571.04, 'Áustria': 1597.41, 'Jordânia': 1392,
  'Portugal': 1766.17, 'Congo': 1412, 'Uzbequistão': 1437, 'Colômbia': 1698.35,
  'Inglaterra': 1827.05, 'Croácia': 1714.87, 'Gana': 1482, 'Panamá': 1539.15,
};

export function buildTeamsMeta() {
  const out = {};
  for (const [name, [iso, code]] of Object.entries(TEAM_ISO)) {
    out[name] = {
      name,
      iso,
      code,
      flag: SUBDIVISION_FLAGS[name] || isoToFlag(iso), // emoji (fallback)
      flagFile: SUBDIVISION_FILE[name] || iso.toLowerCase(), // SVG fiável em todas as plataformas
      fifa: FIFA_POINTS[name] ?? 0, // pontos do ranking FIFA (desempate dos 3.os)
    };
  }
  return out;
}

export function flagFiles() {
  return Object.values(buildTeamsMeta()).map((t) => t.flagFile);
}
