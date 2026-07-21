# Documentação — API de Catálogo VTEX

**CATÁLOGO • VTEX • N8N**

Camada rápida para localizar produtos por nome, categoria, cor, marca, EAN/GTIN ou SKU antes de consultar a VTEX para preço e disponibilidade em tempo real.

[Visão geral](#visão-geral) · [Endereço e autenticação](#endereço-e-autenticação) · [Rotas disponíveis](#rotas-disponíveis) · [Pesquisa de produtos](#pesquisa-de-produtos) · [Cores e tons disponíveis](#cores-e-tons-disponíveis) · [Categorias, SKU e saúde](#categorias-sku-e-saúde) · [Links de produto](#links-de-produto) · [Configuração sugerida no n8n](#configuração-sugerida-no-n8n) · [Configuração (variáveis de ambiente)](#configuração-variáveis-de-ambiente) · [Atualização e operação](#atualização-e-operação)

---

## Visão geral

A API mantém um índice local de dois XMLs públicos da VTEX — um por loja (`abra_casa` e `cadabra`) — e o atualiza automaticamente. O índice contém somente dados estáveis de produto — nome, descrição, categoria, marca, cor, EAN/GTIN, MPN, SKU e URLs. Os links de produto são reescritos para o domínio público da loja durante a importação.

> ⚠️ **Importante:** não use esta API para informar preço, promoção, parcelamento ou estoque ao cliente. Depois de encontrar o `sku_id`, consulte a API da VTEX para confirmar os dados comerciais.

**Fluxo recomendado**

```
Pergunta do cliente → API de catálogo → sku_id encontrado → API VTEX → resposta final
```

## Endereço e autenticação

Substitua `SEU_HOST` pelo IP, domínio ou endereço HTTPS publicado da API.

```
Base URL: http://SEU_HOST:3000
Authorization: Bearer SUA_CATALOG_API_KEY
```

> ℹ️ **Exceção:** `/health` é público. Todas as outras rotas exigem o cabeçalho `Authorization`.

## Rotas disponíveis

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Status da API e total de produtos ativos. Sem autenticação. |
| `GET` | `/catalog/categories` | Lista categorias e quantidade de produtos em cada uma. |
| `GET` | `/catalog/search` | Pesquisa textual e filtros combináveis. |
| `GET` | `/catalog/products/{sku_id}` | Retorna um produto pelo SKU. |
| `POST` | `/admin/sync` | Dispara sincronização manual dos XMLs. |

## Pesquisa de produtos

`GET` `/catalog/search`

| Parâmetro | Uso | Exemplo |
|---|---|---|
| `q` | Nome, descrição e termos de busca. | `cadeira escritório giratória` |
| `category` | Parte do nome da categoria, sem diferenciar maiúsculas nem acentos. | `Cadeiras` |
| `color` | Parte do nome da cor, sem diferenciar maiúsculas nem acentos (`freijo` encontra `freijó`). Aceita múltiplos valores separados por vírgula e busca por tom — veja abaixo. | `preto` |
| `brand` | Parte do nome da marca, sem diferenciar maiúsculas nem acentos. | `Abra Casa` |
| `gtin` | EAN/GTIN exato. | `7898599220281` |
| `sku_id` | SKU exato. | `2000218` |
| `source` | Origem: `abra_casa` ou `cadabra`. | `abra_casa` |
| `limit` | Quantidade de resultados por página, entre 1 e 20 (padrão: 10). | `5` |
| `offset` | Quantos resultados pular — use para paginar (padrão: 0). | `5` |

### Exemplo: cadeiras pretas

```bash
curl -G "http://SEU_HOST:3000/catalog/search" \
  -H "Authorization: Bearer SUA_CATALOG_API_KEY" \
  --data-urlencode "q=cadeira" \
  --data-urlencode "color=preto" \
  --data-urlencode "limit=5"
```

### Exemplo de resposta

```json
{
  "count": 1,
  "total": 1,
  "offset": 0,
  "has_more": false,
  "items": [
    {
      "id": "abra_casa:2000218",
      "source": "abra_casa",
      "sku_id": "2000218",
      "item_group_id": "2000166",
      "name": "Cadeira Eames Eiffel Base Madeira - Preto",
      "description": "...",
      "brand": "Abra Casa",
      "category": "Cadeiras, Bancos e Banquetas",
      "color": "preto",
      "gtin": "7898599220281",
      "mpn": "1569949ki",
      "product_url": "https://www.abracasa.com.br/cadeira-eames-eiffel-base-madeira-preto/p?idsku=2000218",
      "image_url": "https://abracasa.vteximg.com.br/arquivos/ids/180728",
      "score": 0.42
    }
  ]
}
```

> ✅ **Uso do score:** quanto maior, melhor a correspondência textual. Trate-o apenas como ordenação; não o apresente ao cliente.

### Paginação

`total` informa quantos produtos casaram com a busca; `count`, quantos vieram nesta página; `has_more` indica se ainda há resultados. Para ver a próxima página, repita a chamada somando `limit` ao `offset`:

```
GET /catalog/search?q=poltrona&limit=5            → itens 1–5   (offset 0)
GET /catalog/search?q=poltrona&limit=5&offset=5   → itens 6–10
GET /catalog/search?q=poltrona&limit=5&offset=10  → itens 11–15
```

> ℹ️ **No atendimento:** quando o cliente pedir "outras opções", pagine com `offset` em vez de repetir a mesma chamada — assim aparecem produtos ainda não mostrados.

### Filtro de cor: múltiplas cores e busca por tom

`color` aceita mais de um valor separado por vírgula — o resultado é a união (qualquer um deles casa):

```
GET /catalog/search?q=poltrona&color=rosa,lilás,bege
GET /catalog/search?q=sofá&color=cinza,grafite,off white
```

Quando o cliente não sabe o nome exato da cor, `color` também aceita busca por tom. Os tons disponíveis são `claro`, `escuro`, `pastel`, `metalico`, `terroso` e `amadeirado`, em três formas equivalentes — `tons X`, `cores X` ou só `X` (singular, plural ou feminino):

```
GET /catalog/search?q=sofá&color=tons pastéis
GET /catalog/search?q=sofá&color=cores pastéis
GET /catalog/search?q=sofá&color=pastéis          ← as três chamadas acima retornam o mesmo resultado

GET /catalog/search?q=sofá&color=cores claras
GET /catalog/search?q=sofá&color=escuro
GET /catalog/search?q=mesa de centro&color=tons amadeirados
GET /catalog/search?q=almofada&color=tons terrosos
```

> ✅ **No atendimento:** se o cliente disser "quero em tons claros" ou "algo mais escuro", passe isso direto no `color` — não é preciso adivinhar o nome exato da cor antes de buscar.

## Cores e tons disponíveis

Referência completa por trás do filtro `color`, extraída do vocabulário real dos dois feeds XML (Abra Casa e Cadabra). Use esta seção para saber exatamente o que cada tom retorna e quais cores existem no catálogo hoje.

### Combinação de cada tom com as cores do catálogo

Cada tom ajustado em `color` expande para esta lista de cores (correspondência por trecho de texto, sem acento — ver [Pesquisa de produtos](#pesquisa-de-produtos)). A fonte desta tabela é `src/colorTones.js`.

| Tom | Cores incluídas |
|---|---|
| `claro` (Claro) | branco, branca, off white, areia, bege, creme, marfim, pérola, cru, aveia, papiro, duna, nude, trigo, granizo, natural |
| `escuro` (Escuro) | preto, grafite, chumbo, marrom, castanho, azul petróleo, verde militar, cimento |
| `pastel` (Pastel) | rosa, rosê, lilás, menta, azul sereno, nude, salmão, tiffany, off white |
| `metalico` (Metálico) | dourado, prateado, prata, bronze, cobre |
| `terroso` (Terroso) | terracota, argila, terra, deserto, telha, tijolo, ferrugem, canela, cognac, caramelo, avelã, mel, savana, açafrão |
| `amadeirado` (Amadeirado) | madeira, louro freijó, freijó, carvalho, nozes, olmo, bétula, cinamomo, caramelo, cognac, capuccino, tammi, whisky, macchiato, savana, amarula, avelã, castanho |

> ℹ️ **Cores em mais de um tom:** `avelã`, `caramelo`, `cognac` e `savana` aparecem em Amadeirado e Terroso; `castanho` em Amadeirado e Escuro; `nude` e `off white` em Claro e Pastel. Um produto nessas cores aparece nos dois tons.

### Todas as cores do catálogo

As 99 cores distintas encontradas nos dois feeds, com a loja onde aparecem e o(s) tom(ns) a que pertencem (quando aplicável). Cores sem tom associado só podem ser buscadas pelo nome literal (ex.: `color=verde`).

| Cor | Loja(s) | Tom(ns) |
|---|---|---|
| açafrão | Abra Casa | Terroso |
| amarela | Abra Casa | — |
| amarelo | Cadabra | — |
| amarula | Ambas | Amadeirado |
| amêndoa | Ambas | — |
| areia | Ambas | Claro |
| argila | Ambas | Terroso |
| aveia | Ambas | Claro |
| avelã | Ambas | Amadeirado, Terroso |
| azul | Ambas | — |
| azul petróleo | Cadabra | Escuro |
| azul sereno | Ambas | Pastel |
| bege | Ambas | Claro |
| bétula | Ambas | Amadeirado |
| botonê | Ambas | — |
| branca | Abra Casa | Claro |
| branco | Ambas | Claro |
| bronze | Ambas | Metálico |
| cacto | Ambas | — |
| caju | Cadabra | — |
| canela | Ambas | Terroso |
| capuccino | Ambas | Amadeirado |
| caqui | Cadabra | — |
| caramelo | Ambas | Amadeirado, Terroso |
| carvalho | Ambas | Amadeirado |
| castanho | Ambas | Amadeirado, Escuro |
| chumbo | Ambas | Escuro |
| cimento | Ambas | Escuro |
| cinamomo | Ambas | Amadeirado |
| cinza | Ambas | — |
| classic oat | Cadabra | — |
| cobre | Ambas | Metálico |
| cognac | Ambas | Amadeirado, Terroso |
| colorido | Ambas | — |
| concreto | Ambas | — |
| creme | Ambas | Claro |
| cru | Ambas | Claro |
| deserto | Ambas | Terroso |
| dourado | Ambas | Metálico |
| duna | Ambas | Claro |
| estampado | Cadabra | — |
| fendi | Ambas | — |
| ferrugem | Ambas | Terroso |
| floral | Cadabra | — |
| freijó | Ambas | Amadeirado |
| grafite | Ambas | Escuro |
| granizo | Abra Casa | Claro |
| griggio | Ambas | — |
| gris | Ambas | — |
| incolor | Ambas | — |
| laranja | Cadabra | — |
| lilás | Cadabra | Pastel |
| linhão | Ambas | — |
| louro freijó | Ambas | Amadeirado |
| lugano | Ambas | — |
| macchiato | Ambas | Amadeirado |
| madeira | Ambas | Amadeirado |
| mandarina | Ambas | — |
| marfim | Ambas | Claro |
| marrom | Ambas | Escuro |
| mel | Ambas | Terroso |
| melton | Abra Casa | Terroso* |
| menta | Ambas | Pastel |
| musgo | Ambas | — |
| natural | Ambas | Claro |
| nozes | Ambas | Amadeirado |
| nude | Ambas | Claro, Pastel |
| off white | Ambas | Claro, Pastel |
| olmo | Ambas | Amadeirado |
| paçoca | Cadabra | — |
| papiro | Ambas | Claro |
| pérola | Ambas | Claro |
| prata | Cadabra | Metálico |
| prateado | Ambas | Metálico |
| preto | Ambas | Escuro |
| rosa | Ambas | Pastel |
| rosê | Ambas | Pastel |
| safira | Abra Casa | — |
| salmão | Cadabra | Pastel |
| sarja | Cadabra | — |
| saturno | Ambas | — |
| savana | Ambas | Amadeirado, Terroso |
| tammi | Ambas | Amadeirado |
| tan | Abra Casa | — |
| telha | Ambas | Terroso |
| terra | Ambas | Terroso |
| terracota | Ambas | Terroso |
| tiffany | Cadabra | Pastel |
| tijolo | Ambas | Terroso |
| transparente | Ambas | — |
| trellis claro | Ambas | — |
| trigo | Ambas | Claro |
| trufa | Cadabra | — |
| twillic truffle | Cadabra | — |
| verde | Ambas | — |
| verde militar | Ambas | Escuro |
| verde musgo | Ambas | — |
| vermelho | Ambas | Terroso |
| whisky | Ambas | Amadeirado |

> ⚠️ **melton:** cai em Terroso só porque "mel" é um trecho de "melton" — coincidência da correspondência por texto, não uma classificação intencional. Afeta 1 produto na Abra Casa; avise se quiser que eu corrija esse tipo de colisão por substring.

## Categorias, SKU e saúde

**Listar categorias**

```
GET /catalog/categories
```

**Buscar diretamente por SKU**

```
GET /catalog/products/2000218
```

**Verificar a sincronização**

```
GET /health

{
  "status": "ok",
  "products": 1800,
  "updated_at": "2026-07-15T14:42:30.397Z"
}
```

## Links de produto

Os feeds XML da VTEX trazem links com o domínio interno da plataforma (`*.vtexcommercestable.com.br`) e parâmetros de rastreamento (`utm_*`). Durante a importação, o link de produto é reescrito para o domínio público da loja, preservando apenas o parâmetro `idsku`:

```
No feed:  https://novaabracasa.vtexcommercestable.com.br/cadeira-madrid.../p?idsku=2000237&utm_source=criteo&utm_campaign=cpc
Na API:   https://www.abracasa.com.br/cadeira-madrid.../p?idsku=2000237
```

O domínio público é configurado por loja com `ABRA_CASA_SITE_URL` e `CADABRA_SITE_URL` (veja [Configuração](#configuração-variáveis-de-ambiente)). Os links de imagem não são alterados.

> ✅ **Pode apresentar ao cliente:** o `product_url` já sai pronto para compartilhamento, sem domínio interno nem parâmetros de campanha.

## Configuração sugerida no n8n

Crie uma ferramenta HTTP para o agente chamar antes da VTEX.

| | |
|---|---|
| **Método** | `GET` |
| **URL** | `http://SEU_HOST:3000/catalog/search` |
| **Header** | `Authorization: Bearer SUA_CATALOG_API_KEY` |
| **Query parameters** | `q`, `category`, `color`, `brand`, `gtin`, `sku_id`, `source`, `limit`, `offset` |

### Instrução para o agente

```
Ao receber uma pergunta sobre produtos, consulte primeiro a ferramenta de catálogo.
Extraia o tipo de produto, categoria, cor, marca, EAN ou SKU quando disponíveis.
Se o cliente não souber o nome exato da cor, use um tom em color: claro, escuro,
pastel, metalico, terroso ou amadeirado (ex.: color=tons pastéis). Para mais de
uma cor, separe por vírgula (ex.: color=rosa,lilás,bege).
Use o sku_id retornado para consultar a VTEX e obter preço, estoque e prazo atuais.
Não invente produtos, atributos ou dados comerciais. Retorne no máximo cinco opções.
Se o cliente pedir mais opções da mesma busca, repita a chamada somando limit ao offset
(primeira chamada offset=0, depois offset=5, offset=10...) enquanto has_more for true.
```

## Configuração (variáveis de ambiente)

Definidas no `.env` da stack ou na tela *Environment variables* do Portainer. Cada loja tem sua URL de XML e seu domínio público.

| Variável | Uso | Padrão |
|---|---|---|
| `ABRA_CASA_XML_URL` | URL do XML da loja Abra Casa. | `https://novaabracasa.vtexcommercestable.com.br/XMLData/Criteo-default.xml` |
| `CADABRA_XML_URL` | URL do XML da loja Cadabra. | `https://abramais2.vtexcommercestable.com.br/XMLData/xml_Sellbie.xml` |
| `ABRA_CASA_SITE_URL` | Domínio público usado nos links de produto da Abra Casa. | `https://www.abracasa.com.br` |
| `CADABRA_SITE_URL` | Domínio público usado nos links de produto da Cadabra. | Sem padrão — enquanto vazio, os links mantêm o domínio original do feed. |
| `CATALOG_API_KEY` | Chave exigida no cabeçalho `Authorization`. | Obrigatória. |
| `POSTGRES_PASSWORD` | Senha do banco PostgreSQL da stack. | Obrigatória. |
| `CATALOG_PORT` | Porta publicada na VPS. | `3000` |
| `SYNC_INTERVAL_HOURS` | Intervalo entre sincronizações automáticas. | `6` |

> ℹ️ **Após alterar variáveis:** faça o redeploy da stack e dispare `POST /admin/sync` para reprocessar o catálogo imediatamente.

## Atualização e operação

- A sincronização ocorre automaticamente a cada `SYNC_INTERVAL_HOURS` (padrão: 6 horas).
- Para atualizar agora, envie `POST /admin/sync` com o mesmo cabeçalho de autenticação.
- Se uma sincronização falhar, o catálogo ativo anterior continua disponível.
- Para uso externo ou no n8n, publique a API atrás de HTTPS usando seu proxy reverso.

---

*Documentação da API de Catálogo VTEX • Atualizada em 20/07/2026*
