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
  'Congo': ['CG', 'CGO'],
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

export function buildTeamsMeta() {
  const out = {};
  for (const [name, [iso, code]] of Object.entries(TEAM_ISO)) {
    out[name] = {
      name,
      iso,
      code,
      flag: SUBDIVISION_FLAGS[name] || isoToFlag(iso), // emoji (fallback)
      flagFile: SUBDIVISION_FILE[name] || iso.toLowerCase(), // SVG fiável em todas as plataformas
    };
  }
  return out;
}

export function flagFiles() {
  return Object.values(buildTeamsMeta()).map((t) => t.flagFile);
}
