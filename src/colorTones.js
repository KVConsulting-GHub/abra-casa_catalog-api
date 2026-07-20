// Grupos de tons a partir do vocabulário real de cor observado nos feeds
// (Abra Casa e Cadabra). Cada valor é comparado por substring, sem acento,
// contra a coluna "color" — então cobre variações como "louro freijó".
const TONE_GROUPS = {
  claro: ["branco", "branca", "off white", "areia", "bege", "creme", "marfim", "pérola", "cru", "aveia", "papiro", "duna", "nude", "trigo", "granizo", "natural"],
  escuro: ["preto", "grafite", "chumbo", "marrom", "castanho", "azul petróleo", "verde militar", "cimento"],
  metalico: ["dourado", "prateado", "prata", "bronze", "cobre"],
  terroso: ["terracota", "argila", "terra", "deserto", "telha", "tijolo", "ferrugem", "canela", "cognac", "caramelo", "avelã", "mel", "savana", "açafrão"],
  amadeirado: ["madeira", "louro freijó", "freijó", "carvalho", "nozes", "olmo", "bétula", "cinamomo", "caramelo", "cognac", "capuccino", "tammi", "whisky", "macchiato", "savana", "amarula", "avelã", "castanho"],
  pastel: ["rosa", "rosê", "lilás", "menta", "azul sereno", "nude", "salmão", "tiffany", "off white"]
};

// Formas singular/plural/gênero que um termo de tom pode assumir, já sem
// acento — o valor recebido do usuário passa pelo mesmo tratamento antes de
// comparar, então "tons pastéis", "cores pastéis" e "pasteis" caem aqui.
const TONE_ALIASES = {
  claro: "claro", claros: "claro", clara: "claro", claras: "claro",
  escuro: "escuro", escuros: "escuro", escura: "escuro", escuras: "escuro",
  pastel: "pastel", pasteis: "pastel",
  metalico: "metalico", metalicos: "metalico", metalica: "metalico", metalicas: "metalico",
  terroso: "terroso", terrosos: "terroso", terrosa: "terroso", terrosas: "terroso",
  amadeirado: "amadeirado", amadeirados: "amadeirado", amadeirada: "amadeirado", amadeiradas: "amadeirado"
};

function stripAccents(value) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Aceita "tons pastéis", "cores pastéis" ou apenas "pastéis"/"pastel" como
// equivalentes, e color=rosa,lilás,bege como união de cores literais.
export function colorTerms(raw) {
  if (!raw) return null;
  const terms = new Set();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const normalized = stripAccents(trimmed.toLowerCase()).replace(/^(tons|tom|cores|cor)\s+/, "").trim();
    const tone = TONE_ALIASES[normalized];
    if (tone) TONE_GROUPS[tone].forEach(value => terms.add(value));
    else terms.add(trimmed);
  }
  return terms.size ? [...terms] : null;
}
