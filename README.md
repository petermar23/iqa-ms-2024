# Qualidade das Águas — Mato Grosso do Sul (2024)   https://www.imasul.ms.gov.br/wp-content/uploads/2025/06/Boletim_Qual_Agua_Sup_2024-1.pdf

WebGIS estático para visualização espacial dos dados públicos de monitoramento da qualidade das águas superficiais do Estado de Mato Grosso do Sul, referentes ao ano de 2024.

> **Aviso Importante / Isenção de Vínculo:**  
> Este é um **projeto pessoal e independente**, sem qualquer vínculo com órgãos governamentais. Não constitui serviço, canal ou posicionamento oficial do Governo do Estado de Mato Grosso do Sul ou do IMASUL. Trata-se de uma iniciativa particular para exploração cartográfica e consulta pública de dados abertos.

## 🎯 Proposta do Projeto
O objetivo central é ser um **retrato fiel dos dados**:
- **Zero distorção ou julgamento:** Não calcula rankings, não inventa médias e não gera alertas analíticos.
- **Transparência analítica:** Exibe os valores brutos das medições físico-químicas e microbiológicas exatamente como constam nos registros públicos.
- **Valores abaixo do limite (<):** Mantém a representação original dos ensaios laboratoriais com valores inferiores ao Limite de Quantificação (LQ).
- **Indicadores Oficiais:** Apresenta a classificação oficial por **IQA** (Índice de Qualidade das Águas - CETESB/NSF) ou por **OD** (Oxigênio Dissolvido, aplicado às UPGs pantaneiras conforme metodologia do IMASUL).

## 🗺️ Funcionalidades
- **Visualização Cartográfica:** Navegação interativa com basemaps de Ruas (OpenStreetMap) e Imagens de Satélite (Esri).
- **Filtros Dinâmicos:** Consulta por Trimestre (1º ao 4º Tri), Região Hidrográfica (Paraná / Paraguai), UPG (Unidade de Planejamento e Gerenciamento), Classe Legal (CONAMA 357/05) e busca textual por rio, município ou código.
- **Ficha Técnica da Estação:** Ao clicar em um ponto, exibe coordenadas geográficas (WGS 84), dados cadastrais e a tabela trimestral completa de parâmetros.
- **Exportação de Dados:** Download direto dos registros filtrados em formato `.csv` e download dos arquivos GeoJSON originais.

## 📂 Fonte dos Dados
- **Origem:** Relatório do Programa de Monitoramento da Qualidade das Águas Superficiais de Mato Grosso do Sul (IMASUL, 2024).
- **Universo monitorado (2024):** 197 estações ativas com coletas no ano, totalizando 788 registros trimestrais.
- **Sistema de Coordenadas:** WGS 84 (CRS84).

## 🛠️ Tecnologias Utilizadas
Aplicação leve e 100% estática (client-side), sem dependência de banco de dados ou backend:
- HTML5 / CSS3 / JavaScript (Vanilla)
- [MapLibre GL JS](https://maplibre.org/) para renderização vetorial e raster de mapas
