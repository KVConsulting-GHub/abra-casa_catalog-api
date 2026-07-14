import http from "node:http";
import { Pool } from "pg";
import { syncCatalog } from "./sync.js";

const port = Number(process.env.PORT || 3000);
const apiKey = process.env.API_KEY;
if (!apiKey) console.warn("API_KEY ausente: endpoints de catálogo permanecerão bloqueados.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
function authorized(request) {
  return apiKey && request.headers.authorization === `Bearer ${apiKey}`;
}
function limit(value) { return Math.min(Math.max(Number(value) || 10, 1), 20); }

async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/health") {
    const result = await pool.query("SELECT count(*)::int AS products, max(updated_at) AS updated_at FROM catalog_products WHERE active");
    return json(response, 200, { status: "ok", ...result.rows[0] });
  }
  if (!authorized(request)) return json(response, 401, { error: "não autorizado" });
  if (request.method === "GET" && url.pathname === "/catalog/categories") {
    const result = await pool.query("SELECT category, count(*)::int AS products FROM catalog_products WHERE active AND category IS NOT NULL GROUP BY category ORDER BY category");
    return json(response, 200, { items: result.rows });
  }
  if (request.method === "GET" && url.pathname === "/catalog/search") {
    const q = url.searchParams.get("q") || "";
    const source = url.searchParams.get("source");
    const category = url.searchParams.get("category");
    const brand = url.searchParams.get("brand");
    const color = url.searchParams.get("color");
    const gtin = url.searchParams.get("gtin");
    const sku = url.searchParams.get("sku_id");
    const result = await pool.query(`SELECT id,source,sku_id,item_group_id,name,description,brand,category,color,gtin,mpn,product_url,image_url,
      CASE WHEN $1 <> '' THEN ts_rank_cd(search_vector, websearch_to_tsquery('portuguese',$1)) ELSE 0 END AS score
      FROM catalog_products WHERE active
      AND ($1 = '' OR search_vector @@ websearch_to_tsquery('portuguese',$1) OR name ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR source = $2) AND ($3::text IS NULL OR category ILIKE '%' || $3 || '%')
      AND ($4::text IS NULL OR brand ILIKE '%' || $4 || '%') AND ($5::text IS NULL OR color ILIKE '%' || $5 || '%')
      AND ($6::text IS NULL OR gtin = $6) AND ($7::text IS NULL OR sku_id = $7)
      ORDER BY score DESC, name ASC LIMIT $8`, [q,source,category,brand,color,gtin,sku,limit(url.searchParams.get("limit"))]);
    return json(response, 200, { count: result.rowCount, items: result.rows });
  }
  const product = url.pathname.match(/^\/catalog\/products\/([^/]+)$/);
  if (request.method === "GET" && product) {
    const result = await pool.query("SELECT id,source,sku_id,item_group_id,name,description,brand,category,color,gtin,mpn,product_url,image_url FROM catalog_products WHERE active AND sku_id=$1", [decodeURIComponent(product[1])]);
    return result.rowCount ? json(response, 200, result.rows[0]) : json(response, 404, { error: "SKU não encontrado" });
  }
  if (request.method === "POST" && url.pathname === "/admin/sync") return json(response, 202, await syncCatalog(pool));
  return json(response, 404, { error: "rota não encontrada" });
}

async function waitForDatabase() {
  for (;;) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      console.log(`Aguardando banco de dados: ${error.code || error.message}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

await waitForDatabase();
http.createServer((req, res) => handler(req, res).catch(error => { console.error(error); json(res, 500, { error: "erro interno" }); })).listen(port, () => {
  console.log(`API ouvindo na porta ${port}`);
  syncCatalog(pool).then(x => console.log("Sincronização inicial:", x)).catch(error => console.error("Falha na sincronização inicial:", error.message));
  const hours = Math.max(Number(process.env.SYNC_INTERVAL_HOURS || 6), 1);
  setInterval(() => syncCatalog(pool).then(x => console.log("Sincronização concluída:", x)).catch(error => console.error("Falha na sincronização:", error.message)), hours * 60 * 60 * 1000);
});
