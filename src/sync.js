import { parseFeed } from "./catalog.js";

const feeds = () => [
  { source: "cadabra", url: process.env.CADABRA_XML_URL, siteUrl: process.env.CADABRA_SITE_URL || null, utm: process.env.CADABRA_UTM || null },
  { source: "abra_casa", url: process.env.ABRA_CASA_XML_URL, siteUrl: process.env.ABRA_CASA_SITE_URL || "https://www.abracasa.com.br", utm: process.env.ABRA_CASA_UTM || null }
];

async function download(feed) {
  const response = await fetch(feed.url, { headers: { Accept: "application/xml,text/xml" }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${feed.source}: HTTP ${response.status}`);
  return parseFeed(await response.text(), feed.source, feed.siteUrl, feed.utm);
}

async function replaceSource(client, source, products) {
  await client.query("UPDATE catalog_products SET active = false WHERE source = $1", [source]);
  for (const p of products) {
    await client.query(`INSERT INTO catalog_products
      (id,source,sku_id,item_group_id,name,description,brand,category,color,gtin,mpn,product_url,image_url,variant_group,search_document,search_vector,active,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,to_tsvector('portuguese',$15),true,NOW())
      ON CONFLICT (id) DO UPDATE SET
      item_group_id=EXCLUDED.item_group_id,name=EXCLUDED.name,description=EXCLUDED.description,brand=EXCLUDED.brand,
      category=EXCLUDED.category,color=EXCLUDED.color,gtin=EXCLUDED.gtin,mpn=EXCLUDED.mpn,product_url=EXCLUDED.product_url,
      image_url=EXCLUDED.image_url,variant_group=EXCLUDED.variant_group,search_document=EXCLUDED.search_document,
      search_vector=EXCLUDED.search_vector,active=true,updated_at=NOW()`,
      [p.id,p.source,p.sku_id,p.item_group_id,p.name,p.description,p.brand,p.category,p.color,p.gtin,p.mpn,p.product_url,p.image_url,p.variant_group,p.search_document]);
  }
}

let running = false;
export async function syncCatalog(pool) {
  if (running) return { skipped: true, reason: "sync já em execução" };
  running = true;
  const run = await pool.query("INSERT INTO sync_runs(status) VALUES ('running') RETURNING id");
  const runId = run.rows[0].id;
  try {
    const results = await Promise.all(feeds().map(async (feed) => ({ ...feed, products: await download(feed) })));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const feed of results) await replaceSource(client, feed.source, feed.products);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    const total = results.reduce((sum, feed) => sum + feed.products.length, 0);
    await pool.query("UPDATE sync_runs SET status='success', finished_at=NOW(), records_imported=$2 WHERE id=$1", [runId, total]);
    return { records_imported: total, sources: Object.fromEntries(results.map(x => [x.source, x.products.length])) };
  } catch (error) {
    await pool.query("UPDATE sync_runs SET status='failed', finished_at=NOW(), detail=$2 WHERE id=$1", [runId, error.message]);
    throw error;
  } finally { running = false; }
}
