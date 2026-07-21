import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  removeNSPrefix: true,
  cdataPropName: "__cdata"
});

function text(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return text(value.__cdata ?? value["#text"] ?? null);
  const cleaned = String(value)
    .replace(/<\/?[A-Za-z][^>\s]*>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function cleanUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function productUrl(value, siteUrl) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (siteUrl) {
      const site = new URL(siteUrl);
      url.protocol = site.protocol;
      url.host = site.host;
    }
    const idsku = url.searchParams.get("idsku");
    url.search = "";
    url.hash = "";
    if (idsku) url.searchParams.set("idsku", idsku);
    return url.toString();
  } catch {
    return value;
  }
}

function documentFor(product) {
  return [
    ["Produto", product.name], ["Descrição", product.description],
    ["Categoria", product.category], ["Marca", product.brand],
    ["Cor", product.color], ["Código EAN/GTIN", product.gtin],
    ["Código MPN", product.mpn]
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n");
}

export function parseFeed(xml, source, siteUrl) {
  const parsed = parser.parse(xml);
  // Feeds da VTEX chegam em dois formatos: Atom (<feed><item>) e RSS 2.0
  // (<rss><channel><Item>, com Item maiúsculo). Sem os dois caminhos, feeds
  // no segundo formato são silenciosamente ignorados (nenhum produto).
  const raw = parsed?.feed?.item ?? parsed?.rss?.channel?.Item ?? parsed?.rss?.channel?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  const ids = new Set();
  const products = [];
  for (const item of items) {
    const skuId = text(item.id);
    const name = text(item.title);
    if (!skuId || !name) continue;
    const product = {
      id: `${source}:${skuId}`, source, sku_id: skuId,
      item_group_id: text(item.item_group_id), name,
      description: text(item.description), brand: text(item.brand),
      category: text(item.google_product_category), color: text(item.color),
      gtin: text(item.gtin), mpn: text(item.mpn),
      product_url: productUrl(text(item.link), siteUrl), image_url: cleanUrl(text(item.image_link))
    };
    if (ids.has(product.id)) continue;
    ids.add(product.id);
    product.search_document = documentFor(product);
    products.push(product);
  }
  if (products.length === 0) throw new Error(`${source}: nenhum item válido no XML`);
  return products;
}
