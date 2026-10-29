/* =====================================================================
   WebGIS Qualidade das Águas — MS 2024
   ===================================================================== */

/* ---------- Constantes ---------- */
const SEM_FAIXA = "Sem faixa no CSV";
const FAIXAS = [
  { nome: "Ótima",     cor: "#1a9850" },
  { nome: "Boa",       cor: "#66bd63" },
  { nome: "Aceitável", cor: "#fdae61" },
  { nome: "Ruim",      cor: "#d73027" },
  { nome: "Péssima",   cor: "#000000" },
  { nome: SEM_FAIXA,   cor: "#999999" }
];
const CORES = Object.fromEntries(FAIXAS.map(f => [f.nome, f.cor]));

const BASEMAPS = {
  osm:     { tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], attribution: "© OpenStreetMap" },
  satelite:{ tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "© Esri" }
};

/* ---------- Estado ---------- */
let todasEstacoes = [];            // features completas (com histórico)
let estacoesFiltradas = [];
const porCodigo = new Map();       // codigo_imasul -> feature
let colunasCSV = [];               // cabeçalho original do CSV
let map = null;
let tooltip = null;
let codigoSelecionado = null;

/* ---------- Utilidades ---------- */
const $ = id => document.getElementById(id);

/* Texto exato da célula do CSV; vazio = "—" */
const fmt = v => (v === null || v === undefined || v === "") ? "—" : String(v);
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* IQA e faixa de cada estação no trimestre selecionado, lidos do CSV */
function iqaPorCriterio(f, criterio) {
  const med = f.properties.historico.find(h => Number(h.trimestre) === Number(criterio[1]));
  return { iqa: med?.iqa_valor ?? null, faixa: med?.qualidade_faixa || SEM_FAIXA };
}

/* ---------- Mapa ---------- */
function criarMapa() {
  const sources = {};
  Object.entries(BASEMAPS).forEach(([k, v]) => sources[k] = { type: "raster", tiles: v.tiles, tileSize: 256, attribution: v.attribution });
  map = new maplibregl.Map({
    container: "map",
    style: { version: 8, sources, layers: [{ id: "fundo", type: "raster", source: "osm" }] },
    center: [-55.0, -20.5],
    zoom: 6
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
}

function mudarBasemap(tipo) {
  if (map.getLayer("fundo")) map.removeLayer("fundo");
  const primeiroVetor = ["bacias-fill", "rios-linhas", "estacoes-pontos"].find(id => map.getLayer(id));
  map.addLayer({ id: "fundo", type: "raster", source: tipo }, primeiroVetor);
  document.querySelectorAll("#basemaps button").forEach(b => b.classList.toggle("active", b.dataset.base === tipo));
}

/* ---------- Carregamento de dados ---------- */
function parseCSV(texto) {
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  texto = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

async function buscar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Arquivo não encontrado: ${url}`);
  return r;
}

async function carregarDados() {
  try {
    const [geo, csvText, baciasGeo, riosGeo] = await Promise.all([
      buscar("data/estacoes_imasul_2024.geojson").then(r => r.json()),
      buscar("data/medicoes_imasul_2024.csv").then(r => r.text()),
      buscar("data/bacias_ms.geojson").then(r => r.json()),
      buscar("data/rios_ms.geojson").then(r => r.json())
    ]);

    const tabela = parseCSV(csvText);
    const headers = tabela[0].map(h => h.trim());
    colunasCSV = headers;
    const historico = {};
    tabela.slice(1).forEach(cols => {
      const m = { __raw: {} };
      headers.forEach((h, i) => {
        const val = (cols[i] ?? "").trim();
        m.__raw[h] = val;                       // texto exato da célula (usado na exportação)
        if (val === "") { m[h] = null; return; }
        if (h === "censurados") { m[h] = val.split(";").map(x => x.trim()).filter(Boolean); return; }
        m[h] = val;                             // valor cru, sem conversão
      });
      if (!m.codigo_imasul) return;
      (historico[m.codigo_imasul] ||= []).push(m);
    });

    todasEstacoes = geo.features.map(f => {
      const p = f.properties;
      p.historico = (historico[p.codigo_imasul] || []).sort((a, b) => a.trimestre - b.trimestre);
      porCodigo.set(p.codigo_imasul, f);
      return f;
    });

    preencherProcedencia(geo, tabela.length - 1, historico);
    adicionarBacias(baciasGeo);
    adicionarRios(riosGeo);
    popularFiltros();
    adicionarCamadasEstacoes();
    aplicarFiltros();
  } catch (erro) {
    console.error(erro);
    $("contador").textContent = "Erro ao carregar dados";
    alert("Erro ao carregar dados: " + erro.message + "\n\nAbra o projeto por um servidor local (ex.: python -m http.server).");
  }
}

/* Procedência: totais contados na carga e conferência CSV x GeoJSON (não interrompe o app) */
function preencherProcedencia(geo, nRegistros, historico) {
  try {
    const codigosGeo = new Set(geo.features.map(f => f.properties.codigo_imasul));
    const codigosCsv = new Set(Object.keys(historico));
    $("proc-estacoes").textContent = geo.features.length;
    $("proc-registros").textContent = nRegistros;
    $("proc-crs").textContent = geo.crs?.properties?.name ?? "não declarado no arquivo";

    const soCsv = [...codigosCsv].filter(c => !codigosGeo.has(c));
    const soGeo = [...codigosGeo].filter(c => !codigosCsv.has(c));
    if (soCsv.length || soGeo.length) {
      console.warn("Conferência dos dados: códigos no CSV sem estação no GeoJSON:", soCsv,
                   "| estações do GeoJSON sem registros no CSV:", soGeo);
      const aviso = $("aviso-dados");
      aviso.textContent = `⚠ Conferência: ${soCsv.length} código(s) do CSV sem estação no GeoJSON e ${soGeo.length} estação(ões) sem registros no CSV. Detalhes no console.`;
      aviso.classList.remove("hidden");
    }
  } catch (e) {
    console.warn("Não foi possível montar a ficha de procedência:", e);
  }
}

function adicionarBacias(geo) {
  map.addSource("bacias", { type: "geojson", data: geo });
  map.addLayer({ id: "bacias-fill", type: "fill", source: "bacias", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.05 } });
  map.addLayer({ id: "bacias-line", type: "line", source: "bacias", paint: { "line-color": "#0b5cad", "line-width": 1.5, "line-dasharray": [2, 2] } });
}

function adicionarRios(geo) {
  map.addSource("rios", { type: "geojson", data: geo });
  map.addLayer({
    id: "rios-linhas",
    type: "line",
    source: "rios",
    paint: {
      "line-color": "#1f78b4",
      "line-opacity": 0.7,
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        5, ["case", ["==", ["get", "dominio"], "União"], 1.5, 0.7],
        10, ["case", ["==", ["get", "dominio"], "União"], 3.0, 1.8],
        14, ["case", ["==", ["get", "dominio"], "União"], 5.0, 3.0]
      ]
    }
  });

  /* Tooltip ao passar o mouse sobre o rio */
  map.on("mouseenter", "rios-linhas", e => {
    map.getCanvas().style.cursor = "pointer";
    const props = e.features[0].properties;
    if (props.nome_rio && props.nome_rio !== "sem nome") {
      tooltip.setLngLat(e.lngLat).setHTML(
        `<div class="tip"><b>🌊 ${escapeHtml(props.nome_rio)}</b><span>Domínio: ${escapeHtml(props.dominio || "—")}</span></div>`
      ).addTo(map);
    }
  });
  map.on("mouseleave", "rios-linhas", () => {
    map.getCanvas().style.cursor = "";
    tooltip.remove();
  });
}

function popularFiltros() {
  const preencher = (id, campo) => {
    const sel = $(id);
    [...new Set(todasEstacoes.map(f => f.properties[campo]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR")).forEach(v => sel.add(new Option(v, v)));
  };
  preencher("filtro-regiao", "regiao_hidrografica");
  preencher("filtro-upg", "upg");
  preencher("filtro-classe", "classe_legal");
}

/* ---------- Camadas de estações ---------- */
function adicionarCamadasEstacoes() {
  map.addSource("estacoes", {
    type: "geojson", data: { type: "FeatureCollection", features: [] }
  });

  const corExpr = ["match", ["get", "qualidade"]];
  FAIXAS.slice(0, 5).forEach(f => corExpr.push(f.nome, f.cor));
  corExpr.push(CORES[SEM_FAIXA]);

  map.addLayer({
    id: "estacoes-pontos", type: "circle", source: "estacoes",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, 10],
      "circle-color": corExpr,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2
    }
  });

  map.addLayer({
    id: "estacao-sel", type: "circle", source: "estacoes", filter: ["==", ["get", "codigo"], ""],
    paint: { "circle-radius": 16, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#0b5cad", "circle-stroke-width": 3 }
  });

  map.on("click", "estacoes-pontos", e => abrirFicha(e.features[0].properties.codigo));

  map.on("mouseenter", "estacoes-pontos", e => {
    map.getCanvas().style.cursor = "pointer";
    const f = porCodigo.get(e.features[0].properties.codigo);
    if (!f) return;
    const p = f.properties;
    const iqa = e.features[0].properties.iqa;
    tooltip.setLngLat(f.geometry.coordinates).setHTML(
      `<div class="tip"><b>${escapeHtml(p.corpo_hidrico)}</b><span>${escapeHtml(p.municipio)} · ${escapeHtml(p.codigo_imasul)}</span><br>` +
      `<span>IQA: <b style="display:inline">${iqa === null || iqa === "null" ? "—" : escapeHtml(iqa)}</b> (${escapeHtml(e.features[0].properties.qualidade)})</span></div>`
    ).addTo(map);
  });
  map.on("mouseleave", "estacoes-pontos", () => { map.getCanvas().style.cursor = ""; tooltip.remove(); });
}

/* ---------- Ficha da estação ---------- */
const PARAMETROS = [
  "indicador_qualidade", "iqa_valor", "qualidade_faixa", "data_coleta", "temp_agua_c", "ph", "od_mg_l", "dbo_mg_l",
  "coliformes_term_nmp", "e_coli_nmp", "nitrogenio_total_mg_l", "fosforo_total_mg_l", "solidos_totais_mg_l", "turbidez_unt"
];

function abrirFicha(codigo, voar = false) {
  const f = porCodigo.get(codigo);
  if (!f) return;
  const p = f.properties;
  const hist = p.historico;
  const med = t => hist.find(h => Number(h.trimestre) === t);

  const [lon, lat] = f.geometry.coordinates;   // exatamente como no GeoJSON (ordem lon, lat)
  codigoSelecionado = codigo;
  map.setFilter("estacao-sel", ["==", ["get", "codigo"], codigo]);
  if (voar) map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 10) });

  /* Linha de parâmetro: nome do campo + 4 trimestres. Se for censurado, exibe com '<' na frente como no PDF */
  const linha = campo => {
    let tds = "";
    for (let t = 1; t <= 4; t++) {
      const m = med(t);
      if (campo === "qualidade_faixa") {
        const fx = m?.qualidade_faixa;
        tds += `<td><span class="badge" style="background:${CORES[fx] ?? CORES[SEM_FAIXA]}">${escapeHtml(fmt(fx))}</span></td>`;
      } else {
        const val = m ? m[campo] : null;
        const censurado = !!(m && Array.isArray(m.censurados) && m.censurados.includes(campo));
        const txt = fmt(val);
        const exib = (censurado && txt !== "—") ? `<${txt}` : txt;
        tds += `<td>${escapeHtml(exib)}</td>`;
      }
    }
    return `<tr><td>${escapeHtml(campo)}</td>${tds}</tr>`;
  };

  $("detalhe-conteudo").innerHTML = `
    <div class="ficha-head">
      <h2>${escapeHtml(p.corpo_hidrico)}</h2>
      <div class="cod">${escapeHtml(p.codigo_imasul)}</div>
    </div>
    <div class="ficha-meta">
      <div><span>Município</span><b>${escapeHtml(p.municipio)}</b></div>
      <div><span>Classe legal</span><b>${escapeHtml(p.classe_legal)}</b></div>
      <div><span>UPG</span><b>${escapeHtml(p.upg)}</b></div>
      <div><span>Região hidrográfica</span><b>${escapeHtml(p.regiao_hidrografica)}</b></div>
      <div><span>Latitude</span><b>${escapeHtml(lat)}</b></div>
      <div><span>Longitude</span><b>${escapeHtml(lon)}</b></div>
      <div style="grid-column:1/-1"><span>Sistema de coordenadas</span><b>WGS 84 (CRS84)</b></div>
    </div>
    <div class="ficha-corpo">
      <h4>Medições por trimestre</h4>
      <p class="legenda-tab">&lt; = valor abaixo do limite de quantificação analítica · — = sem valor no CSV</p>
      <table class="dados">
        <tr><th>Parâmetro</th><th>1º Tri</th><th>2º Tri</th><th>3º Tri</th><th>4º Tri</th></tr>
        ${PARAMETROS.map(linha).join("")}
      </table>
    </div>`;

  $("detalhe").classList.remove("hidden");
  $("detalhe").scrollTop = 0;
}

function fecharFicha() {
  $("detalhe").classList.add("hidden");
  codigoSelecionado = null;
  if (map.getLayer("estacao-sel")) map.setFilter("estacao-sel", ["==", ["get", "codigo"], ""]);
}

/* ---------- Filtros ---------- */
function aplicarFiltros() {
  if (!map.getSource("estacoes")) return;
  const criterio = $("filtro-criterio").value;
  const regiao = $("filtro-regiao").value;
  const upg = $("filtro-upg").value;
  const classe = $("filtro-classe").value;
  const qualidade = $("filtro-qualidade").value;
  const busca = $("busca").value.trim().toLowerCase();

  todasEstacoes.forEach(f => {
    const { iqa, faixa } = iqaPorCriterio(f, criterio);
    f.properties.iqa_exibido = iqa;
    f.properties.qualidade_exibicao = faixa;
  });

  const base = todasEstacoes.filter(f => {
    const p = f.properties;
    if (regiao && p.regiao_hidrografica !== regiao) return false;
    if (upg && p.upg !== upg) return false;
    if (classe && p.classe_legal !== classe) return false;
    if (busca && !`${p.codigo_imasul} ${p.corpo_hidrico} ${p.municipio}`.toLowerCase().includes(busca)) return false;
    return true;
  });
  estacoesFiltradas = qualidade ? base.filter(f => f.properties.qualidade_exibicao === qualidade) : base;

  map.getSource("estacoes").setData({
    type: "FeatureCollection",
    features: estacoesFiltradas.map(f => ({
      type: "Feature", geometry: f.geometry,
      properties: {
        codigo: f.properties.codigo_imasul,
        qualidade: f.properties.qualidade_exibicao,
        iqa: f.properties.iqa_exibido
      }
    }))
  });

  if ((upg || regiao) && estacoesFiltradas.length) {
    const b = new maplibregl.LngLatBounds();
    estacoesFiltradas.forEach(f => b.extend(f.geometry.coordinates));
    map.fitBounds(b, { padding: 60, maxZoom: 11 });
  }
  $("contador").textContent = `${estacoesFiltradas.length} de ${todasEstacoes.length} estações`;
}

function limparFiltros() {
  $("filtro-criterio").value = "t1";
  ["filtro-regiao", "filtro-upg", "filtro-classe", "filtro-qualidade", "busca"].forEach(id => $(id).value = "");
  aplicarFiltros();
}

/* ---------- Exportação CSV ---------- */
function baixarCSV() {
  if (!estacoesFiltradas.length) return alert("Nenhum dado visível para exportar.");
  const cols = colunasCSV;   // todas as colunas do CSV original, com o texto exato das células
  const cel = v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [cols.join(",")];
  estacoesFiltradas.forEach(f => f.properties.historico.forEach(h => {
    linhas.push(cols.map(c => cel(h.__raw[c])).join(","));
  }));
  const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "estacoes_ms_2024_filtrado.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Interface ---------- */
function mudarAba(id) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.toggle("active", el.id === `aba-${id}`));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.toggle("active", el.dataset.aba === id));
}

function montarLegenda() {
  $("legenda-itens").innerHTML = FAIXAS.map(f =>
    `<div class="leg-linha"><span class="dot" style="background:${f.cor}"></span>${f.nome}</div>`).join("");
  $("tabela-faixas").innerHTML = FAIXAS.map(f =>
    `<tr><td><span class="dot" style="background:${f.cor}"></span> <b>${f.nome}</b></td></tr>`).join("");
}

function ligarEventos() {
  document.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => mudarAba(b.dataset.aba)));
  document.querySelectorAll("#basemaps button").forEach(b => b.addEventListener("click", () => mudarBasemap(b.dataset.base)));
  ["filtro-criterio", "filtro-regiao", "filtro-upg", "filtro-classe", "filtro-qualidade", "busca"]
    .forEach(id => $(id).addEventListener("input", () => {
      aplicarFiltros();
      if (codigoSelecionado) abrirFicha(codigoSelecionado);
    }));
  $("btn-limpar").addEventListener("click", limparFiltros);
  $("btn-csv").addEventListener("click", baixarCSV);
  $("detalhe-fechar").addEventListener("click", fecharFicha);
  $("toggle-bacias").addEventListener("change", e => {
    const v = e.target.checked ? "visible" : "none";
    ["bacias-fill", "bacias-line"].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, "visibility", v));
  });
  $("toggle-rios").addEventListener("change", e => {
    const v = e.target.checked ? "visible" : "none";
    map.getLayer("rios-linhas") && map.setLayoutProperty("rios-linhas", "visibility", v);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") fecharFicha(); });
}

/* ---------- Boot ---------- */
montarLegenda();
criarMapa();
ligarEventos();
map.on("load", carregarDados);
