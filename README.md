# 🎥 Koruja Stream HUD: Delta Green

[![Foundry Version](https://img.shields.io/badge/Foundry-v14%20(14.369)-orange?style=flat-square)](https://foundryvtt.com)
[![System](https://img.shields.io/badge/System-Delta%20Green-darkgreen?style=flat-square)](https://github.com/deltagreen-foundryvtt/delta-green)
[![License](https://img.shields.io/github/license/korujasedex123/koruja-stream-hud-dg?style=flat-square)](LICENSE)

Overlay tático e **bodycam noir 100% nativo para Foundry VTT v14 (Delta Green)** projetado para exibir a telemetria dos Agentes ao vivo no **OBS Studio / Twitch**, sem precisar de servidores externos, aplicativos Electron ou Chroma Key.

---

## ✨ Recursos Principais

- **Estética Bodycam Noir / Dossiê Tático:** Fundo 100% transparente para OBS com barra superior de operação (`REC`, indicador **DEFCON 1–5**, ticker **Now Playing** automático das playlists do Foundry, relógio da operação, codinome e tag de sigilo como `CLASSIFIED` / `COMPROMISED` / `STABLE`).
- **Molduras por Jogador & Gerador VDO.Ninja (v1.1.0):** Cada slot de agente (`p1`–`p6`) pode ficar **Transparente**, exibir o **Retrato do Agente** automaticamente ou incorporar uma **Webcam via VDO.Ninja (`<iframe>`)** com gerador de links `Push` / `View` em 1 clique no configurador.
- **Zero Servidor Externo:** Funciona perfeitamente em servidores **Foundry hospedados em VPS (HTTPS)** sem problemas de CORS ou Mixed Content.
- **Cards de Agentes em Tempo Real:**
  - **HP (Pontos de Vida):** Barra com pulso ECG, alerta de *Ferimento Crítico / Inconsciente* (`HP <= 2`) e carimbo **`KIA // FILE SEALED`** quando `HP === 0`.
  - **SAN (Sanidade) & Ponto de Ruptura:** Barra em âmbar/ciano fosforescente que entra em modo glitch/estática vermelha ao se aproximar ou atingir o **Ponto de Ruptura** (`currentBreakingPoint`).
  - **WP (Força de Vontade):** Acompanhamento em tempo real de `wp.value / wp.max` e alerta de exaustão.
  - **Adaptações:** Indicadores visuais de adaptação a **Violência** e **Impotência** (incidentes 1–3 e estado *Adaptado*).
  - **Condições & Turno Ativo:** Ícones de status ativos e destaque tático no agente ativo em combate.
- **Entretenimento para Live (OBS):**
  - **Scene / Location Lower-Third:** Barra militar animada exibida automaticamente ao trocar de cena (`canvasReady`) com classificação, nome do local e timestamp.
  - **Ticker de Rolagens d100:** Feed ao vivo com resultados do sistema Delta Green (`CRITICAL SUCCESS`, `SUCCESS`, `FAILURE`, `FUMBLE`, `SAN CHECK`, `LETHALITY`) — *nunca vaza sussurros ou rolagens cegas do Mestre*.
  - **Alertas Dramáticos na Tela:** Banners animados para **Ponto de Ruptura Atingido**, **Degradação de Vínculo (Bond)**, **Perda Grave de Sanidade**, **Ferimento Crítico**, **Sucesso Crítico / Fumble** e **Letalidade**.
  - **Spotlight de Handouts & Barra de Ameaça:** Destaque cinematográfico para documentos confidenciais e barra de alvo prioritário para antagonistas (`npc` / `unnatural`).
- **Configuração Visual (`ApplicationV2`):** Botão **`Stream HUD DG`** na aba de Atores com palco drag-and-drop (`1920x1080`) e disparo de alertas de teste via `BroadcastChannel`.

---

## 📦 Instalação via Manifest URL (Foundry VTT)

No gerenciador de módulos do Foundry VTT, clique em **Instalar Módulo** e cole a URL abaixo em **Manifest URL**:

```text
https://github.com/korujasedex123/koruja-stream-hud-dg/releases/latest/download/module.json
```

---

## 🚀 Como Usar no OBS Studio

1. **Crie um usuário no Foundry** chamado **`Stream`** (com permissão *Observer* nas fichas dos agentes).
2. No Foundry (como Mestre), abra a aba **Atores**, clique em **`Stream HUD DG`** no topo, selecione os agentes, ajuste as posições no palco e clique em **Salvar Configuração**.
3. No **OBS Studio**, adicione uma **Fonte de Navegador (Browser Source)** com resolução **`1920 x 1080`**.
4. Cole a URL do seu servidor com o parâmetro:
   ```text
   https://seu-foundry.com/?streamhud=1
   ```
   *(Use `&mode=rp` para ocultar o canvas do mapa durante cenas puras de investigação/roleplay).*
5. Clique em **Interagir** no OBS apenas na primeira vez para entrar com o usuário `Stream`. *(Dica: ative **Disable Game Canvas** nas configurações do Foundry desse usuário se for usar apenas em modo roleplay para economizar GPU/CPU no OBS).*
