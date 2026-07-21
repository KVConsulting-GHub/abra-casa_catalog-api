import http from "node:http";
import { Pool } from "pg";
import { syncCatalog } from "./sync.js";
import { colorTerms } from "./colorTones.js";

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
function offset(value) { const parsed = Math.floor(Number(value)); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; }

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
    const param = name => url.searchParams.get(name)?.trim() || null;
    const q = param("q") || "";
    const source = param("source");
    const category = param("category");
    const brand = param("brand");
    const color = colorTerms(param("color"));
    const gtin = param("gtin");
    const sku = param("sku_id");
    const skip = offset(url.searchParams.get("offset"));
    // Agrupa SKUs que são variações (cor, acabamento) do mesmo produto em um
    // único resultado, com a lista de variações anexada — ver variantGroup
    // em src/catalog.js. O representante de cada grupo é o SKU de maior
    // score (melhor match textual); os demais campos do topo vêm dele.
    const result = await pool.query(`WITH matched AS (
        SELECT id,source,sku_id,item_group_id,name,description,brand,category,color,gtin,mpn,product_url,image_url,variant_group,
        CASE WHEN $1 <> '' THEN ts_rank_cd(search_vector, websearch_to_tsquery('portuguese',$1)) ELSE 0 END AS score
        FROM catalog_products WHERE active
        AND ($1 = '' OR search_vector @@ websearch_to_tsquery('portuguese',$1) OR unaccent(name) ILIKE '%' || unaccent($1) || '%')
        AND ($2::text IS NULL OR source = $2) AND ($3::text IS NULL OR unaccent(category) ILIKE '%' || unaccent($3) || '%')
        AND ($4::text IS NULL OR unaccent(brand) ILIKE '%' || unaccent($4) || '%')
        AND ($5::text[] IS NULL OR EXISTS (SELECT 1 FROM unnest($5::text[]) AS term WHERE unaccent(color) ILIKE '%' || unaccent(term) || '%'))
        AND ($6::text IS NULL OR gtin = $6) AND ($7::text IS NULL OR sku_id = $7)
      ), groups AS (
        -- COALESCE evita juntar produtos sem variant_group ainda definido
        -- (janela entre um deploy que adiciona a coluna e a próxima sync)
        -- num único grupo, já que GROUP BY trata NULL como um valor igual.
        SELECT COALESCE(variant_group, id) AS group_key, max(score) AS score, count(*)::int AS variation_count,
        (array_agg(id ORDER BY score DESC, name ASC, sku_id ASC))[1] AS representative_id
        FROM matched GROUP BY COALESCE(variant_group, id)
      ), paged AS (
        SELECT *, count(*) OVER()::int AS total FROM groups
        ORDER BY score DESC, representative_id ASC LIMIT $8 OFFSET $9
      )
      SELECT r.source,r.sku_id,r.item_group_id,r.name,r.description,r.brand,r.category,r.color,r.gtin,r.mpn,r.product_url,r.image_url,
      p.variation_count, p.total,
      CASE WHEN p.variation_count > 1 THEN (
        SELECT jsonb_agg(jsonb_build_object(
          'sku_id', m.sku_id, 'name', m.name, 'color', m.color, 'gtin', m.gtin, 'mpn', m.mpn,
          'product_url', m.product_url, 'image_url', m.image_url
        ) ORDER BY m.color NULLS LAST, m.name)
        FROM matched m WHERE COALESCE(m.variant_group, m.id) = p.group_key
      ) END AS variations
      FROM paged p JOIN matched r ON r.id = p.representative_id
      ORDER BY p.score DESC, r.name ASC, r.sku_id ASC`,
      [q,source,category,brand,color,gtin,sku,limit(url.searchParams.get("limit")),skip]);
    const items = result.rows.map(({ total, variation_count, variations, ...item }) => variations ? { ...item, variations } : item);
    const total = result.rows[0]?.total ?? 0;
    return json(response, 200, { count: items.length, total, offset: skip, has_more: skip + items.length < total, items });
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
// Bancos criados antes da adição do unaccent/variant_group ao init.sql não
// têm essas mudanças; init.sql só roda na primeira inicialização do volume.
await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent");
await pool.query("ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS variant_group TEXT");
await pool.query("CREATE INDEX IF NOT EXISTS catalog_products_variant_group_idx ON catalog_products (variant_group) WHERE active");
http.createServer((req, res) => handler(req, res).catch(error => { console.error(error); json(res, 500, { error: "erro interno" }); })).listen(port, () => {
  console.log(`API ouvindo na porta ${port}`);
  syncCatalog(pool).then(x => console.log("Sincronização inicial:", x)).catch(error => console.error("Falha na sincronização inicial:", error.message));
  const hours = Math.max(Number(process.env.SYNC_INTERVAL_HOURS || 6), 1);
  setInterval(() => syncCatalog(pool).then(x => console.log("Sincronização concluída:", x)).catch(error => console.error("Falha na sincronização:", error.message)), hours * 60 * 60 * 1000);
});
