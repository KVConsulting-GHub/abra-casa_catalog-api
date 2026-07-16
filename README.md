# API de consulta ao catálogo VTEX

Esta stack baixa periodicamente os dois XMLs públicos da VTEX, remove campos comerciais voláteis e disponibiliza uma API de pesquisa. O catálogo serve para descoberta; depois de obter um `sku_id`, o agente deve consultar a VTEX para obter preço e estoque atuais.

## Publicar no Portainer

1. Crie uma pasta na VPS e envie todo o conteúdo deste diretório para ela.
2. No Portainer, crie uma **Stack** apontando para o `docker-compose.yml` dessa pasta (ou cole o conteúdo do compose no editor e mantenha os arquivos como Git repository).
3. Copie `.env.example` para `.env`, defina `POSTGRES_PASSWORD` e `CATALOG_API_KEY` com valores longos e secretos.
4. Faça o deploy. A primeira sincronização começa logo após o banco ficar disponível.
5. Confirme: `GET http://IP-DA-VPS:3000/health`. Espere o campo `products` ser maior que zero.

Para produção, publique `catalog-api:3000` através do seu proxy reverso (Nginx Proxy Manager/Traefik) em HTTPS. Se n8n e esta stack estiverem na mesma rede Docker, use `http://catalog-api:3000` internamente e não exponha a porta 3000.

### Quando o Portainer usa Docker Swarm

Se o log de deploy disser `Ignoring unsupported options: build`, use `docker-stack.yml`, não `docker-compose.yml`. Primeiro, envie também `.github/workflows/publish-image.yml` ao repositório. O GitHub Actions publicará uma imagem em `ghcr.io/SEU_USUARIO/SEU_REPOSITORIO:latest`.

Após a primeira execução bem-sucedida do workflow, abra no GitHub **perfil → Packages → pacote criado → Package settings** e deixe o pacote como **Public**. No Portainer, use:

```text
Compose path: docker-stack.yml
CATALOG_API_IMAGE=ghcr.io/SEU_USUARIO/SEU_REPOSITORIO:latest
```

Mantenha as demais variáveis (`POSTGRES_PASSWORD`, `CATALOG_API_KEY`, `CATALOG_PORT` e `SYNC_INTERVAL_HOURS`).

## Autenticação

Todas as rotas, exceto `/health`, exigem:

```http
Authorization: Bearer VALOR_DE_CATALOG_API_KEY
```

## Rotas

```text
GET  /health
GET  /catalog/categories
GET  /catalog/search?q=cadeira&category=escritório&color=preto&limit=5
GET  /catalog/search?gtin=7898599220281
GET  /catalog/search?sku_id=2000218
GET  /catalog/products/2000218
POST /admin/sync
```

Filtros aceitos na busca: `q`, `source` (`cadabra` ou `abra_casa`), `category`, `brand`, `color`, `gtin`, `sku_id`, `limit` (padrão 10, máximo 20) e `offset` (padrão 0). Os filtros podem ser combinados.

A resposta da busca é paginada: `total` informa quantos produtos casaram com a busca, `count` quantos vieram na página atual e `has_more` se ainda há resultados. Para a próxima página, repita a chamada somando `limit` ao `offset` (ex.: `?q=poltrona&limit=5&offset=5`).

## Uso no n8n

No nó HTTP Request da ferramenta do agente:

```text
GET https://catalogo.seudominio.com/catalog/search?q={{ termo }}&category={{ categoria }}&color={{ cor }}&limit=5
Authorization: Bearer {{ sua_chave }}
```

Instrua o agente: use esta ferramenta para localizar produtos e identifique o `sku_id`; em seguida, consulte a VTEX para informar preço, estoque, prazo ou condições comerciais. Não apresente dados comerciais vindos desta API. Se o cliente pedir mais opções da mesma busca, repita a chamada somando `limit` ao `offset` para trazer produtos ainda não mostrados.

## Links de produto

Os feeds XML trazem links com o domínio interno da VTEX (`*.vtexcommercestable.com.br`) e parâmetros de rastreamento (`utm_*`). Na importação, o link de produto é reescrito para o domínio público da loja, mantendo apenas o parâmetro `idsku`:

```text
https://www.abracasa.com.br/cadeira-de-escritorio-madrid-cromada-alta-giratoria-preta-or-3301-alta/p?idsku=2000237
```

O domínio público é configurado por fonte com `ABRA_CASA_SITE_URL` (padrão: `https://www.abracasa.com.br`) e `CADABRA_SITE_URL` (sem padrão: os links do feed `cadabra` mantêm o domínio original até a variável ser definida). Os links de imagem não são alterados.

## Atualização

O intervalo é configurado por `SYNC_INTERVAL_HOURS` (padrão: 6). A atualização é atômica: se um download ou processamento falhar, os dados ativos anteriores continuam disponíveis. O endpoint `POST /admin/sync` permite disparar uma sincronização manual autenticada.
