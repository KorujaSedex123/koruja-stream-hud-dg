const MODULE_ID = "koruja-stream-hud-dg";

const DEFAULT_POSITIONS = {
  p1: { x: 20, y: 976 },
  p2: { x: 258, y: 976 },
  p3: { x: 496, y: 976 },
  p4: { x: 734, y: 976 },
  p5: { x: 972, y: 976 },
  p6: { x: 1210, y: 976 },
  chat: { x: 1460, y: 334 },
  combat: { x: 1460, y: 874 }
};

const ROLEPLAY_POSITIONS = {
  p1: { x: 36, y: 334 },
  p2: { x: 498, y: 334 },
  p3: { x: 960, y: 334 },
  p4: { x: 36, y: 690 },
  p5: { x: 498, y: 690 },
  p6: { x: 960, y: 690 },
  chat: { x: 1430, y: 372 },
  combat: { x: 1430, y: 874 }
};

const AGENCY_STATUSES = ["CLASSIFIED", "COMPROMISED", "STABLE", "CODE_RED"];

function t(key, data) {
  if (!game?.i18n) return key;
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getEffectiveOverlayMode() {
  const urlMode = new URLSearchParams(window.location.search).get("mode");
  if (urlMode === "rp" || urlMode === "roleplay") return "builtin-roleplay";
  if (urlMode === "map" || urlMode === "tactical") return "builtin-tactical";
  return game.settings.get(MODULE_ID, "overlayMode") || "builtin-tactical";
}

function isStreamMode() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("streamhud") === "1") return true;
  if (game.view === "stream") return true;

  const streamUsername = (game.settings.get(MODULE_ID, "streamUser") || "Stream").trim().toLowerCase();
  if (game.user?.name?.trim().toLowerCase() === streamUsername) return true;

  return false;
}

function getActorHealth(actor) {
  const health = actor?.system?.health || {};
  const max = Math.max(1, Number(health.max) || 10);
  const value = Math.max(0, Number(health.value) ?? max);
  return { value, max };
}

function getActorSanity(actor) {
  const sanity = actor?.system?.sanity || {};
  const max = Math.max(1, Number(sanity.max) || 99);
  const value = Math.max(0, Number(sanity.value) ?? 0);
  const bp = Math.max(0, Number(sanity.currentBreakingPoint) || 0);
  const adaptedViolence = Boolean(sanity.adaptations?.violence?.isAdapted);
  const adaptedHelplessness = Boolean(sanity.adaptations?.helplessness?.isAdapted);
  return { value, max, bp, adaptedViolence, adaptedHelplessness };
}

function getActorWP(actor) {
  const wp = actor?.system?.wp || {};
  const max = Math.max(1, Number(wp.max) || 10);
  const value = Math.max(0, Number(wp.value) ?? 0);
  return { value, max };
}

function formatTacticalClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatLowerThirdTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd} ${formatTacticalClock()}`;
}

function slugifyName(name) {
  return String(name || "agent")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "agent";
}

function buildVdoLinks(room, actor) {
  const safeRoom = encodeURIComponent(slugifyName(room || "DeltaGreenOp"));
  const streamId = `${slugifyName(actor?.name)}_${String(actor?.id || "").slice(0, 5)}`;
  const label = encodeURIComponent(actor?.name || "Agent");
  return {
    pushUrl: `https://vdo.ninja/?room=${safeRoom}&push=${streamId}&label=${label}&noaudio`,
    viewUrl: `https://vdo.ninja/?room=${safeRoom}&view=${streamId}&cleanoutput&transparent`
  };
}

function getActivePlaylistTrack() {
  const playlists = game?.playlists?.contents || [];
  for (const pl of playlists) {
    if (!pl.playing) continue;
    const sound = pl.sounds?.find(s => s.playing);
    if (sound) {
      return { playlist: pl.name, track: sound.name };
    }
  }
  return null;
}

function analyzeDeltaGreenRoll(message) {
  const roll = message?.rolls?.[0];
  if (!roll) return null;

  const formula = String(roll.formula || "");
  const total = Number(roll.total);
  const dice = Array.isArray(roll.dice) ? roll.dice : [];
  const isD100 = dice.some(d => Number(d?.faces) === 100) || /d100/i.test(formula);

  const temp = document.createElement("div");
  temp.innerHTML = `${message.flavor || ""} ${message.content || ""}`;
  const text = (temp.textContent || "").trim();

  const dgFlags = message.flags?.deltagreen || message.flags?.["delta-green"] || {};
  const flagTarget = Number(dgFlags.target ?? dgFlags.chance ?? dgFlags.skillValue);
  let target = Number.isFinite(flagTarget) && flagTarget > 0 ? flagTarget : null;

  if (target === null) {
    const targetMatch = text.match(/(?:target|alvo|chance|<=?)\s*:?\s*(\d{1,3})/i) || text.match(/\b(\d{1,3})\s*%/);
    if (targetMatch) {
      const parsed = Number(targetMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) target = parsed;
    }
  }

  const isSanCheck = dgFlags.type === "sanity" || /\b(sanity|sanidade|san\s*check|teste\s*de\s*sanidade)\b/i.test(text);
  const isLethality = dgFlags.type === "lethality" || /\b(lethality|letalidade)\b/i.test(text);
  const category = isLethality ? "lethality" : isSanCheck ? "san" : "standard";

  let outcome = null;
  if (roll.isCritical || /critical\s*success|acerto\s*cr[ií]tico|sucesso\s*cr[ií]tico/i.test(text)) {
    outcome = "crit";
  } else if (roll.isFumble || /\bfumble\b|falha\s*cr[ií]tica/i.test(text)) {
    outcome = "fumble";
  } else if (isD100 && Number.isFinite(total)) {
    if (total === 1) {
      outcome = "crit";
    } else if (total === 100) {
      outcome = "fumble";
    } else if (total % 11 === 0 && total < 100 && target !== null) {
      outcome = total <= target ? "crit" : "fumble";
    } else if (/\bsuccess\b|\bsucesso\b/i.test(text)) {
      outcome = "success";
    } else if (/\bfailure\b|\bfail\b|\bfalha\b/i.test(text)) {
      outcome = "failure";
    } else if (target !== null) {
      outcome = total <= target ? "success" : "failure";
    }
  } else if (/\bsuccess\b|\bsucesso\b/i.test(text)) {
    outcome = "success";
  } else if (/\bfailure\b|\bfail\b|\bfalha\b/i.test(text)) {
    outcome = "failure";
  }

  return { isD100, total, formula, outcome, category, target };
}

/**
 * Visual Drag & Drop Configuration App for the GM (Delta Green).
 */
class StreamPartyConfigApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "koruja-stream-hud-config",
    tag: "form",
    window: {
      title: "KORUJA_DG.Config.Title",
      icon: "fa-solid fa-video",
      resizable: true
    },
    position: {
      width: 880,
      height: "auto"
    },
    form: {
      handler: StreamPartyConfigApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  #draftPositions = null;

  async _prepareContext() {
    const selectedIds = game.settings.get(MODULE_ID, "partyActorIds") || [];
    const overlayMode = game.settings.get(MODULE_ID, "overlayMode") || "builtin-tactical";
    const customOverlayImg = game.settings.get(MODULE_ID, "customOverlayImg") || "";
    const showChatFeed = game.settings.get(MODULE_ID, "showChatFeed");
    const showCombatBox = game.settings.get(MODULE_ID, "showCombatBox");
    const autoPanCombat = game.settings.get(MODULE_ID, "autoPanCombat");
    const cinematicHandouts = game.settings.get(MODULE_ID, "cinematicHandouts");
    const bossActorId = game.settings.get(MODULE_ID, "bossActorId") || "";
    const operationName = game.settings.get(MODULE_ID, "operationName") || "";
    const agencyStatus = game.settings.get(MODULE_ID, "agencyStatus") || "CLASSIFIED";
    const showOpClock = game.settings.get(MODULE_ID, "showOpClock");
    const playerSlotConfigs = game.settings.get(MODULE_ID, "playerSlotConfigs") || {};
    const vdoRoomName = game.settings.get(MODULE_ID, "vdoRoomName") || "DeltaGreenOp";
    const defconLevel = game.settings.get(MODULE_ID, "defconLevel") || "3";
    const threatOverlayMode = game.settings.get(MODULE_ID, "threatOverlayMode") || "normal";
    const stalkerGif = game.settings.get(MODULE_ID, "stalkerGif") || "";
    const blindGif = game.settings.get(MODULE_ID, "blindGif") || "";
    const caretakerGif = game.settings.get(MODULE_ID, "caretakerGif") || "";
    const sceneClassification = game.settings.get(MODULE_ID, "sceneClassification") || "EYES ONLY // ACTIVE AO";
    const showSceneLowerThird = game.settings.get(MODULE_ID, "showSceneLowerThird");
    const showNowPlaying = game.settings.get(MODULE_ID, "showNowPlaying");
    const savedPositions = game.settings.get(MODULE_ID, "cardPositions") || {};

    this.#draftPositions = foundry.utils.mergeObject(
      foundry.utils.deepClone(DEFAULT_POSITIONS),
      foundry.utils.deepClone(savedPositions)
    );

    const agents = game.actors
      .filter(a => a.type === "agent")
      .sort((a, b) => a.name.localeCompare(b.name));

    const threats = game.actors
      .filter(a => a.type === "npc" || a.type === "unnatural")
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      agents,
      threats,
      selectedIds,
      overlayMode,
      customOverlayImg,
      showChatFeed,
      showCombatBox,
      autoPanCombat,
      cinematicHandouts,
      bossActorId,
      operationName,
      agencyStatus,
      showOpClock,
      playerSlotConfigs,
      vdoRoomName,
      defconLevel,
      threatOverlayMode,
      stalkerGif,
      blindGif,
      caretakerGif,
      sceneClassification,
      showSceneLowerThird,
      showNowPlaying,
      positions: this.#draftPositions
    };
  }

  async _renderHTML(context) {
    const container = document.createElement("div");
    container.classList.add("koruja-hud-editor-wrap");

    const agentRows = context.agents.map(actor => {
      const idx = context.selectedIds.indexOf(actor.id);
      const checked = idx !== -1 ? "checked" : "";
      const order = idx !== -1 ? idx + 1 : "";
      const hp = getActorHealth(actor);
      const san = getActorSanity(actor);
      const wp = getActorWP(actor);
      const slotCfg = context.playerSlotConfigs[actor.id] || { mode: "transparent", url: "" };
      const slotMode = slotCfg.mode || "transparent";
      const slotUrl = slotCfg.url || "";
      return `
        <div class="koruja-config-card">
          <label class="koruja-config-row">
            <input type="checkbox" name="actor_${actor.id}" value="${actor.id}" ${checked}>
            <img src="${escapeHtml(actor.img)}" alt="${escapeHtml(actor.name)}">
            <div class="koruja-config-info">
              <strong>${escapeHtml(actor.name)}</strong>
              <span>HP ${hp.value}/${hp.max} | SAN ${san.value} (BP ${san.bp}) | WP ${wp.value}/${wp.max}</span>
            </div>
            <input type="number" class="koruja-order-input" name="order_${actor.id}" value="${order}" min="1" max="6" placeholder="#">
          </label>
          <div class="koruja-slot-subconfig">
            <select name="slotMode_${actor.id}" class="koruja-slot-mode" data-actor-id="${actor.id}">
              <option value="transparent" ${slotMode === "transparent" ? "selected" : ""}>${t("KORUJA_DG.Config.SlotModeTransparent")}</option>
              <option value="portrait" ${slotMode === "portrait" ? "selected" : ""}>${t("KORUJA_DG.Config.SlotModePortrait")}</option>
              <option value="iframe" ${slotMode === "iframe" ? "selected" : ""}>${t("KORUJA_DG.Config.SlotModeIframe")}</option>
            </select>
            <div class="koruja-slot-url-row" style="${slotMode === "iframe" ? "" : "display:none;"}">
              <input type="text" name="slotUrl_${actor.id}" class="koruja-slot-url-input" value="${escapeHtml(slotUrl)}" placeholder="${t("KORUJA_DG.Config.SlotUrlPlaceholder")}">
              <button type="button" class="koruja-vdo-gen-btn" data-actor-id="${actor.id}" title="${t("KORUJA_DG.Config.VdoGenTitle")}">
                <i class="fa-solid fa-video"></i> ${t("KORUJA_DG.Config.VdoGenBtn")}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    const threatOptions = context.threats.map(npc => {
      const sel = npc.id === context.bossActorId ? "selected" : "";
      return `<option value="${npc.id}" ${sel}>${escapeHtml(npc.name)}</option>`;
    }).join("");

    const activeTokenBoss = context.bossActorId?.includes(".") ? fromUuidSync(context.bossActorId) : null;
    const activeTokenOption = activeTokenBoss
      ? `<option value="${escapeHtml(context.bossActorId)}" selected>☠ ${escapeHtml(activeTokenBoss.name)}</option>`
      : "";

    const statusOptions = AGENCY_STATUSES.map(st => {
      const sel = context.agencyStatus === st ? "selected" : "";
      return `<option value="${st}" ${sel}>${t(`KORUJA_DG.Status.${st}`)}</option>`;
    }).join("");

    const defconOptions = ["1", "2", "3", "4", "5"].map(lvl => {
      const sel = String(context.defconLevel) === lvl ? "selected" : "";
      return `<option value="${lvl}" ${sel}>${t(`KORUJA_DG.Defcon.D${lvl}`)}</option>`;
    }).join("");

    const streamUrl = `${window.location.origin}/?streamhud=1`;
    const pos = context.positions;
    const SCALE = 800 / 1920;

    container.innerHTML = `
      <div class="koruja-editor-grid">
        <div class="koruja-editor-sidebar">
          <div class="koruja-section-title"><i class="fa-solid fa-user-secret"></i> ${t("KORUJA_DG.Config.AgentsTitle")}</div>
          <div class="koruja-vdo-room-row">
            <label for="koruja-vdo-room">${t("KORUJA_DG.Config.VdoRoomLabel")}</label>
            <input type="text" name="vdoRoomName" id="koruja-vdo-room" value="${escapeHtml(context.vdoRoomName)}" placeholder="${t("KORUJA_DG.Config.VdoRoomPlaceholder")}">
          </div>
          <div class="koruja-config-list">
            ${agentRows || `<p class='notes'>${t("KORUJA_DG.Config.NoAgents")}</p>`}
          </div>

          <div class="koruja-section-title" style="margin-top: 6px;"><i class="fa-solid fa-skull"></i> ${t("KORUJA_DG.Config.ThreatTitle")}</div>
          <div class="form-group stacked">
            <select name="bossActorId">
              <option value="">${t("KORUJA_DG.Config.NoThreat")}</option>
              ${activeTokenOption}
              ${threatOptions}
            </select>
            <p class="notes" style="font-size:10px; opacity:0.75; margin:2px 0 0;">${t("KORUJA_DG.Config.ThreatHint")}</p>
          </div>

          <div class="koruja-section-title" style="margin-top: 6px;"><i class="fa-solid fa-tower-broadcast"></i> ${t("KORUJA_DG.Config.OverlayTitle")}</div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.OpNameLabel")}</label>
            <input type="text" name="operationName" value="${escapeHtml(context.operationName)}" placeholder="OPERAÇÃO: CASA JUNO">
          </div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.AgencyStatusLabel")}</label>
            <select name="agencyStatus">${statusOptions}</select>
          </div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.DefconLabel")}</label>
            <select name="defconLevel">${defconOptions}</select>
          </div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.ThreatOverlayLabel")}</label>
            <select name="threatOverlayMode" id="koruja-threat-overlay-select">
              <option value="normal" ${context.threatOverlayMode === "normal" ? "selected" : ""}>${t("KORUJA_DG.Config.ThreatNormal")}</option>
              <option value="stalker" ${context.threatOverlayMode === "stalker" ? "selected" : ""}>${t("KORUJA_DG.Config.ThreatStalker")}</option>
              <option value="blind" ${context.threatOverlayMode === "blind" ? "selected" : ""}>${t("KORUJA_DG.Config.ThreatBlind")}</option>
            </select>
          </div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.StalkerGifLabel")}</label>
            <div class="koruja-filepicker-row">
              <input type="text" name="stalkerGif" id="koruja-stalker-gif-input" value="${escapeHtml(context.stalkerGif)}" placeholder="${t("KORUJA_DG.Config.GifPlaceholder")}">
              <button type="button" class="koruja-gif-browse-btn" data-target="#koruja-stalker-gif-input" title="${t("KORUJA_DG.Config.BrowseImg")}"><i class="fa-solid fa-file-import"></i></button>
            </div>
          </div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.BlindGifLabel")}</label>
            <div class="koruja-filepicker-row">
              <input type="text" name="blindGif" id="koruja-blind-gif-input" value="${escapeHtml(context.blindGif)}" placeholder="${t("KORUJA_DG.Config.GifPlaceholder")}">
              <button type="button" class="koruja-gif-browse-btn" data-target="#koruja-blind-gif-input" title="${t("KORUJA_DG.Config.BrowseImg")}"><i class="fa-solid fa-file-import"></i></button>
            </div>
          </div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.CaretakerGifLabel")}</label>
            <div class="koruja-filepicker-row">
              <input type="text" name="caretakerGif" id="koruja-caretaker-gif-input" value="${escapeHtml(context.caretakerGif)}" placeholder="${t("KORUJA_DG.Config.GifPlaceholder")}">
              <button type="button" class="koruja-gif-browse-btn" data-target="#koruja-caretaker-gif-input" title="${t("KORUJA_DG.Config.BrowseImg")}"><i class="fa-solid fa-file-import"></i></button>
            </div>
          </div>
          <div class="form-group stacked">
            <label>${t("KORUJA_DG.Config.SceneClassLabel")}</label>
            <input type="text" name="sceneClassification" value="${escapeHtml(context.sceneClassification)}" placeholder="EYES ONLY // ACTIVE AO">
          </div>
          <div class="form-group stacked">
            <select name="overlayMode" id="koruja-overlay-mode-select">
              <option value="builtin-tactical" ${context.overlayMode === "builtin-tactical" ? "selected" : ""}>${t("KORUJA_DG.Config.ModeTactical")}</option>
              <option value="builtin-roleplay" ${context.overlayMode === "builtin-roleplay" ? "selected" : ""}>${t("KORUJA_DG.Config.ModeRoleplay")}</option>
              <option value="custom-image" ${context.overlayMode === "custom-image" ? "selected" : ""}>${t("KORUJA_DG.Config.ModeCustom")}</option>
              <option value="none" ${context.overlayMode === "none" ? "selected" : ""}>${t("KORUJA_DG.Config.ModeNone")}</option>
            </select>
          </div>

          <div class="form-group stacked" id="koruja-custom-img-group" style="${context.overlayMode === "custom-image" ? "" : "display:none;"}">
            <label>${t("KORUJA_DG.Config.CustomImgLabel")}</label>
            <div class="koruja-filepicker-row">
              <input type="text" name="customOverlayImg" id="koruja-custom-img-input" value="${escapeHtml(context.customOverlayImg)}" placeholder="${t("KORUJA_DG.Config.CustomImgPlaceholder")}">
              <button type="button" class="koruja-browse-btn" title="${t("KORUJA_DG.Config.BrowseImg")}"><i class="fa-solid fa-file-import"></i></button>
            </div>
          </div>

          <label class="koruja-check-row">
            <input type="checkbox" name="showOpClock" ${context.showOpClock ? "checked" : ""}>
            <span>${t("KORUJA_DG.Settings.ShowOpClock")}</span>
          </label>
          <label class="koruja-check-row">
            <input type="checkbox" name="showSceneLowerThird" ${context.showSceneLowerThird ? "checked" : ""}>
            <span>${t("KORUJA_DG.Config.ShowLowerThird")}</span>
          </label>
          <label class="koruja-check-row">
            <input type="checkbox" name="showNowPlaying" ${context.showNowPlaying ? "checked" : ""}>
            <span>${t("KORUJA_DG.Config.ShowNowPlaying")}</span>
          </label>
          <label class="koruja-check-row">
            <input type="checkbox" name="showChatFeed" ${context.showChatFeed ? "checked" : ""}>
            <span>${t("KORUJA_DG.Config.ShowChatFeed")}</span>
          </label>
          <label class="koruja-check-row">
            <input type="checkbox" name="showCombatBox" ${context.showCombatBox ? "checked" : ""}>
            <span>${t("KORUJA_DG.Config.ShowCombatBox")}</span>
          </label>
          <label class="koruja-check-row">
            <input type="checkbox" name="autoPanCombat" ${context.autoPanCombat ? "checked" : ""}>
            <span>${t("KORUJA_DG.Config.AutoPanCombat")}</span>
          </label>
          <label class="koruja-check-row">
            <input type="checkbox" name="cinematicHandouts" ${context.cinematicHandouts ? "checked" : ""}>
            <span>${t("KORUJA_DG.Config.CinematicHandouts")}</span>
          </label>

          <button type="button" class="koruja-open-window-btn" id="koruja-open-live-tab">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> ${t("KORUJA_DG.Config.OpenLiveTab")}
          </button>

          <div class="koruja-test-btn-row">
            <button type="button" class="koruja-test-btn test-crit" id="koruja-test-crit">
              <i class="fa-solid fa-star"></i> ${t("KORUJA_DG.Config.TestCrit")}
            </button>
            <button type="button" class="koruja-test-btn test-fumble" id="koruja-test-fumble">
              <i class="fa-solid fa-skull"></i> ${t("KORUJA_DG.Config.TestFumble")}
            </button>
          </div>
          <div class="koruja-test-btn-row">
            <button type="button" class="koruja-test-btn test-bp" id="koruja-test-bp">
              <i class="fa-solid fa-brain"></i> ${t("KORUJA_DG.Config.TestBP")}
            </button>
            <button type="button" class="koruja-test-btn test-san" id="koruja-test-san">
              <i class="fa-solid fa-eye"></i> ${t("KORUJA_DG.Config.TestSanLoss")}
            </button>
          </div>
          <div class="koruja-test-btn-row">
            <button type="button" class="koruja-test-btn test-lt" id="koruja-test-lt">
              <i class="fa-solid fa-location-dot"></i> ${t("KORUJA_DG.Config.TestLowerThird")}
            </button>
            <button type="button" class="koruja-test-btn test-bond" id="koruja-test-bond">
              <i class="fa-solid fa-link-slash"></i> ${t("KORUJA_DG.Config.TestBondDegraded")}
            </button>
          </div>
        </div>

        <div class="koruja-editor-stage-wrap">
          <div class="koruja-stage-header">
            <span><i class="fa-solid fa-up-down-left-right"></i> ${t("KORUJA_DG.Config.DragHint")}</span>
            <button type="button" class="koruja-reset-pos-btn"><i class="fa-solid fa-rotate-left"></i> ${t("KORUJA_DG.Config.ResetPositions")}</button>
          </div>

          <div class="koruja-preview-stage" id="koruja-preview-stage">
            <div class="koruja-stage-bg-builtin" style="${context.overlayMode === "builtin-tactical" ? "" : "display:none;"}">
              <div class="mini-header">DELTA GREEN // BODYCAM OVERLAY</div>
              <div class="mini-slot-foundry">FOUNDRY VTT TACTICAL FEED</div>
              <div class="mini-slot-gm">HANDLER</div>
              <div class="mini-cam p1">AG 1</div>
              <div class="mini-cam p2">AG 2</div>
              <div class="mini-cam p3">AG 3</div>
              <div class="mini-cam p4">AG 4</div>
              <div class="mini-cam p5">AG 5</div>
              <div class="mini-cam p6">AG 6</div>
            </div>
            <img class="koruja-stage-bg-custom" id="koruja-stage-bg-custom" src="${escapeHtml(context.customOverlayImg)}" style="${context.overlayMode === "custom-image" && context.customOverlayImg ? "" : "display:none;"}">

            ${["p1", "p2", "p3", "p4", "p5", "p6"].map((key, i) => `
              <div class="koruja-drag-box drag-player" data-key="${key}" style="left:${Math.round(pos[key].x * SCALE)}px; top:${Math.round(pos[key].y * SCALE)}px;">
                <i class="fa-solid fa-grip-vertical"></i> A${i + 1}
              </div>
            `).join("")}

            <div class="koruja-drag-box drag-chat" data-key="chat" style="left:${Math.round(pos.chat.x * SCALE)}px; top:${Math.round(pos.chat.y * SCALE)}px; ${context.showChatFeed ? "" : "opacity:0.35;"}">
              <i class="fa-solid fa-dice-d20"></i> d100 Feed
            </div>

            <div class="koruja-drag-box drag-combat" data-key="combat" style="left:${Math.round(pos.combat.x * SCALE)}px; top:${Math.round(pos.combat.y * SCALE)}px; ${context.showCombatBox ? "" : "opacity:0.35;"}">
              <i class="fa-solid fa-crosshairs"></i> Turno
            </div>
          </div>

          <div class="koruja-url-box">
            <label><i class="fa-solid fa-link"></i> ${t("KORUJA_DG.Config.ObsLinksLabel")}</label>
            <input type="text" readonly value="${streamUrl}" onclick="this.select(); navigator.clipboard.writeText(this.value); ui.notifications.info('URL copied!');">
            <input type="text" readonly value="${streamUrl}&mode=rp" style="margin-top:3px;" onclick="this.select(); navigator.clipboard.writeText(this.value); ui.notifications.info('Roleplay URL copied!');">
          </div>
        </div>
      </div>

      <input type="hidden" name="positionsJson" id="koruja-positions-json" value='${JSON.stringify(pos)}'>

      <footer class="sheet-footer flexrow" style="margin-top: 10px;">
        <button type="submit" class="koruja-save-btn">
          <i class="fa-solid fa-floppy-disk"></i> ${t("KORUJA_DG.Config.SaveButton")}
        </button>
      </footer>
    `;

    this.#bindEditorEvents(container, SCALE);
    return container;
  }

  #bindEditorEvents(container, SCALE) {
    const modeSelect = container.querySelector("#koruja-overlay-mode-select");
    const customGroup = container.querySelector("#koruja-custom-img-group");
    const customInput = container.querySelector("#koruja-custom-img-input");
    const builtinBg = container.querySelector(".koruja-stage-bg-builtin");
    const customBg = container.querySelector("#koruja-stage-bg-custom");
    const browseBtn = container.querySelector(".koruja-browse-btn");
    const resetBtn = container.querySelector(".koruja-reset-pos-btn");
    const openTabBtn = container.querySelector("#koruja-open-live-tab");
    const hiddenJson = container.querySelector("#koruja-positions-json");
    const stage = container.querySelector("#koruja-preview-stage");

    openTabBtn?.addEventListener("click", () => {
      window.open(`${window.location.origin}/?streamhud=1`, "_blank", "width=1920,height=1080");
    });

    const sendTestBanner = (type, extra = {}) => {
      const selectedIds = game.settings.get(MODULE_ID, "partyActorIds") || [];
      const firstActor = selectedIds.length ? game.actors.get(selectedIds[0]) : game.actors.find(a => a.type === "agent");
      const payload = {
        action: "test-epic-banner",
        type,
        name: firstActor?.name || "Agent Vance",
        img: firstActor?.img || "",
        ...extra
      };
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel(MODULE_ID);
        ch.postMessage(payload);
        ch.close();
      }
      ui.notifications.info(`Test alert (${type}) sent to OBS tab.`);
    };

    container.querySelector("#koruja-test-crit")?.addEventListener("click", () => sendTestBanner("crit"));
    container.querySelector("#koruja-test-fumble")?.addEventListener("click", () => sendTestBanner("fumble"));
    container.querySelector("#koruja-test-bp")?.addEventListener("click", () => sendTestBanner("breaking-point"));
    container.querySelector("#koruja-test-san")?.addEventListener("click", () => sendTestBanner("san-loss"));
    container.querySelector("#koruja-test-bond")?.addEventListener("click", () => sendTestBanner("bond-degraded", { detail: "Spouse: 10 → 8" }));
    container.querySelector("#koruja-test-lt")?.addEventListener("click", () => {
      const sceneName = game.scenes?.active?.name || "CASA JUNO — PORÃO";
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel(MODULE_ID);
        ch.postMessage({ action: "test-lower-third", sceneName });
        ch.close();
      }
      ui.notifications.info(`Test lower-third (${sceneName}) sent to OBS tab.`);
    });

    container.querySelector("#koruja-threat-overlay-select")?.addEventListener("change", (ev) => {
      game.korujaStreamHudDG?.setThreatOverlay(ev.target.value);
    });

    const vdoRoomInput = container.querySelector("#koruja-vdo-room");
    container.querySelectorAll(".koruja-slot-mode").forEach(sel => {
      sel.addEventListener("change", () => {
        const card = sel.closest(".koruja-config-card");
        const urlRow = card?.querySelector(".koruja-slot-url-row");
        if (urlRow) urlRow.style.display = sel.value === "iframe" ? "" : "none";
      });
    });

    container.querySelectorAll(".koruja-vdo-gen-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const actorId = btn.dataset.actorId;
        const actor = game.actors.get(actorId);
        if (!actor) return;
        const room = vdoRoomInput?.value?.trim() || "DeltaGreenOp";
        const { pushUrl, viewUrl } = buildVdoLinks(room, actor);
        const card = btn.closest(".koruja-config-card");
        const urlInput = card?.querySelector(".koruja-slot-url-input");
        if (urlInput) urlInput.value = viewUrl;
        navigator.clipboard?.writeText(pushUrl).catch(() => {});
        ui.notifications.info(t("KORUJA_DG.Config.VdoCopiedNotice", { name: actor.name }));
      });
    });

    modeSelect?.addEventListener("change", () => {
      const val = modeSelect.value;
      customGroup.style.display = val === "custom-image" ? "" : "none";
      builtinBg.style.display = val === "builtin-tactical" ? "" : "none";
      customBg.style.display = val === "custom-image" && customInput.value ? "" : "none";
    });

    customInput?.addEventListener("change", () => {
      customBg.src = customInput.value;
      customBg.style.display = modeSelect.value === "custom-image" && customInput.value ? "" : "none";
    });

    browseBtn?.addEventListener("click", () => {
      const FP = foundry.applications?.apps?.FilePicker?.implementation || FilePicker;
      new FP({
        type: "image",
        current: customInput.value || "",
        callback: (path) => {
          customInput.value = path;
          customBg.src = path;
          customBg.style.display = "block";
        }
      }).browse();
    });

    container.querySelectorAll(".koruja-gif-browse-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetInput = container.querySelector(btn.dataset.target);
        if (!targetInput) return;
        const FP = foundry.applications?.apps?.FilePicker?.implementation || FilePicker;
        new FP({
          type: "image",
          current: targetInput.value || "",
          callback: (path) => {
            targetInput.value = path;
          }
        }).browse();
      });
    });

    resetBtn?.addEventListener("click", () => {
      this.#draftPositions = foundry.utils.deepClone(DEFAULT_POSITIONS);
      hiddenJson.value = JSON.stringify(this.#draftPositions);
      container.querySelectorAll(".koruja-drag-box").forEach(box => {
        const key = box.dataset.key;
        box.style.left = `${Math.round(this.#draftPositions[key].x * SCALE)}px`;
        box.style.top = `${Math.round(this.#draftPositions[key].y * SCALE)}px`;
      });
    });

    container.querySelectorAll(".koruja-drag-box").forEach(box => {
      box.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const key = box.dataset.key;
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = parseFloat(box.style.left) || 0;
        const origTop = parseFloat(box.style.top) || 0;
        const maxLeft = stage.clientWidth - box.offsetWidth;
        const maxTop = stage.clientHeight - box.offsetHeight;

        const onMove = (ev) => {
          const newLeft = Math.max(0, Math.min(maxLeft, origLeft + (ev.clientX - startX)));
          const newTop = Math.max(0, Math.min(maxTop, origTop + (ev.clientY - startY)));
          box.style.left = `${Math.round(newLeft)}px`;
          box.style.top = `${Math.round(newTop)}px`;
          this.#draftPositions[key] = {
            x: Math.round(newLeft / SCALE),
            y: Math.round(newTop / SCALE)
          };
          hiddenJson.value = JSON.stringify(this.#draftPositions);
        };

        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    });
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const selected = [];

    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith("actor_") && val) {
        const actorId = key.replace("actor_", "");
        const orderVal = Number(data[`order_${actorId}`]) || 99;
        selected.push({ id: actorId, order: orderVal });
      }
    }

    selected.sort((a, b) => a.order - b.order);
    const orderedIds = selected.map(s => s.id);

    const playerSlotConfigs = {};
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith("slotMode_")) {
        const actorId = key.replace("slotMode_", "");
        playerSlotConfigs[actorId] = {
          mode: val || "transparent",
          url: String(data[`slotUrl_${actorId}`] || "").trim()
        };
      }
    }

    let parsedPositions = DEFAULT_POSITIONS;
    try {
      if (data.positionsJson) parsedPositions = JSON.parse(data.positionsJson);
    } catch (err) {
      console.warn("Koruja Stream HUD DG: position parse error:", err);
    }

    await game.settings.set(MODULE_ID, "partyActorIds", orderedIds);
    await game.settings.set(MODULE_ID, "playerSlotConfigs", playerSlotConfigs);
    await game.settings.set(MODULE_ID, "vdoRoomName", String(data.vdoRoomName || "DeltaGreenOp").trim());
    await game.settings.set(MODULE_ID, "bossActorId", data.bossActorId || "");
    await game.settings.set(MODULE_ID, "operationName", data.operationName || "");
    await game.settings.set(MODULE_ID, "agencyStatus", data.agencyStatus || "CLASSIFIED");
    await game.settings.set(MODULE_ID, "defconLevel", data.defconLevel || "3");
    await game.settings.set(MODULE_ID, "threatOverlayMode", data.threatOverlayMode || "normal");
    await game.settings.set(MODULE_ID, "stalkerGif", String(data.stalkerGif || "").trim());
    await game.settings.set(MODULE_ID, "blindGif", String(data.blindGif || "").trim());
    await game.settings.set(MODULE_ID, "caretakerGif", String(data.caretakerGif || "").trim());
    await game.settings.set(MODULE_ID, "sceneClassification", data.sceneClassification || "EYES ONLY // ACTIVE AO");
    await game.settings.set(MODULE_ID, "showSceneLowerThird", Boolean(data.showSceneLowerThird));
    await game.settings.set(MODULE_ID, "showNowPlaying", Boolean(data.showNowPlaying));
    await game.settings.set(MODULE_ID, "showOpClock", Boolean(data.showOpClock));
    await game.settings.set(MODULE_ID, "overlayMode", data.overlayMode || "builtin-tactical");
    await game.settings.set(MODULE_ID, "customOverlayImg", data.customOverlayImg || "");
    await game.settings.set(MODULE_ID, "showChatFeed", Boolean(data.showChatFeed));
    await game.settings.set(MODULE_ID, "showCombatBox", Boolean(data.showCombatBox));
    await game.settings.set(MODULE_ID, "autoPanCombat", Boolean(data.autoPanCombat));
    await game.settings.set(MODULE_ID, "cinematicHandouts", Boolean(data.cinematicHandouts));
    await game.settings.set(MODULE_ID, "cardPositions", parsedPositions);

    ui.notifications.info(t("KORUJA_DG.Config.SavedNotice", { count: orderedIds.length }));
    KorujaStreamHUD.init();
  }
}

/**
 * Main OBS Stream Overlay Controller for Delta Green.
 */
class KorujaStreamHUD {
  static container = null;
  static mediaLayer = null;
  static lastMediaSig = "";
  static statCache = new Map();
  static bondCache = new Map();
  static rollTimers = new Map();
  static chatHistory = [];
  static epicBannerEl = null;
  static epicBannerTimer = null;
  static lowerThirdEl = null;
  static lowerThirdTimer = null;
  static spotlightEl = null;
  static spotlightTimer = null;
  static broadcastChannel = null;
  static clockInterval = null;
  static lastBossHpPct = null;
  static threatOverlayOverride = null;
  static monsterCardOverride = null;

  static init() {
    if (!this.shouldRender()) {
      this.destroy();
      return;
    }

    if (isStreamMode() && game.settings.get(MODULE_ID, "hideFoundryUI")) {
      document.body.classList.add("koruja-stream-mode-active");
    } else {
      document.body.classList.remove("koruja-stream-mode-active");
    }

    if (!this.mediaLayer) {
      this.mediaLayer = document.createElement("div");
      this.mediaLayer.id = "koruja-media-layer";
      document.body.appendChild(this.mediaLayer);
    }

    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "koruja-stream-hud";
      document.body.appendChild(this.container);
    }

    if (!this.broadcastChannel && typeof BroadcastChannel !== "undefined") {
      this.broadcastChannel = new BroadcastChannel(MODULE_ID);
      this.broadcastChannel.onmessage = (ev) => {
        if (ev.data?.action === "test-epic-banner") {
          this.showEpicBanner(ev.data.type, {
            name: ev.data.name,
            img: ev.data.img,
            detail: ev.data.detail || ""
          });
        } else if (ev.data?.action === "test-lower-third") {
          this.showSceneLowerThird(ev.data.sceneName);
        } else if (ev.data?.action === "set-threat-overlay") {
          this.threatOverlayOverride = ev.data.mode || "normal";
          this.render();
        } else if (ev.data?.action === "set-monster-card") {
          this.monsterCardOverride = ev.data.card || { mode: "none", name: "", img: "" };
          this.render();
        }
      };
    }

    if (!this.clockInterval) {
      this.clockInterval = setInterval(() => {
        const el = this.container?.querySelector(".dg-op-clock");
        if (el) el.textContent = formatTacticalClock();
      }, 1000);
    }

    this.seedBondCache();
    this.loadRecentMessages();
    this.render();
  }

  static shouldRender() {
    return isStreamMode();
  }

  static destroy() {
    document.body.classList.remove("koruja-stream-mode-active", "koruja-stream-roleplay-mode", "dg-threat-stalker", "dg-threat-blind");
    if (this.epicBannerTimer) clearTimeout(this.epicBannerTimer);
    if (this.lowerThirdTimer) clearTimeout(this.lowerThirdTimer);
    if (this.spotlightTimer) clearTimeout(this.spotlightTimer);
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    this.epicBannerEl = null;
    this.lowerThirdEl = null;
    this.spotlightEl = null;
    this.lastMediaSig = "";
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.mediaLayer) {
      this.mediaLayer.remove();
      this.mediaLayer = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  static seedBondCache() {
    const actorIds = game.settings.get(MODULE_ID, "partyActorIds") || [];
    for (const id of actorIds) {
      const actor = game.actors.get(id);
      if (!actor) continue;
      for (const item of actor.items) {
        if (item.type === "bond") {
          this.bondCache.set(item.uuid, Number(item.system?.score) || 0);
        }
      }
    }
  }

  static syncMediaLayer(actors, overlayMode, activeCombatantActorId) {
    if (!this.mediaLayer) return;
    if (overlayMode !== "builtin-tactical" && overlayMode !== "builtin-roleplay") {
      if (this.lastMediaSig !== "") {
        this.mediaLayer.innerHTML = "";
        this.lastMediaSig = "";
      }
      return;
    }

    const slotConfigs = game.settings.get(MODULE_ID, "playerSlotConfigs") || {};
    const prefix = overlayMode === "builtin-roleplay" ? "koruja-rp" : "koruja-cutout";
    const sigPayload = {
      overlayMode,
      slots: actors.map((a, i) => {
        const cfg = slotConfigs[a.id] || { mode: "transparent", url: "" };
        return {
          id: a.id,
          img: a.img,
          slot: i + 1,
          mode: cfg.mode || "transparent",
          url: cfg.url || ""
        };
      })
    };
    const nextSig = JSON.stringify(sigPayload);

    if (nextSig !== this.lastMediaSig) {
      this.lastMediaSig = nextSig;
      this.mediaLayer.innerHTML = sigPayload.slots.map(s => {
        const slotCls = `${prefix}-p${s.slot}`;
        let inner = "";
        if (s.mode === "portrait" && s.img) {
          inner = `<div class="koruja-slot-portrait" style="background-image: url('${escapeHtml(s.img)}')"></div>`;
        } else if (s.mode === "iframe" && s.url) {
          inner = `<iframe class="koruja-slot-iframe" src="${escapeHtml(s.url)}" allow="autoplay; camera; microphone" frameborder="0"></iframe>`;
        }
        return `<div class="koruja-media-slot ${slotCls}" data-actor-id="${s.id}">${inner}</div>`;
      }).join("");
    }

    this.mediaLayer.querySelectorAll(".koruja-media-slot").forEach(el => {
      el.classList.toggle("is-turn", el.dataset.actorId === activeCombatantActorId);
    });
  }

  static showSceneLowerThird(sceneName) {
    if (!this.shouldRender() || !this.container) return;
    if (!game.settings.get(MODULE_ID, "showSceneLowerThird")) return;
    const name = String(sceneName || game.scenes?.active?.name || "").trim();
    if (!name) return;

    if (this.lowerThirdTimer) clearTimeout(this.lowerThirdTimer);
    if (this.lowerThirdEl) this.lowerThirdEl.remove();

    const classification = game.settings.get(MODULE_ID, "sceneClassification") || "EYES ONLY // ACTIVE AO";
    const el = document.createElement("div");
    el.id = "dg-lower-third";
    el.className = "dg-lower-third";
    el.innerHTML = `
      <div class="dg-lt-classification">${escapeHtml(classification.toUpperCase())}</div>
      <div class="dg-lt-scene">${escapeHtml(name.toUpperCase())}</div>
      <div class="dg-lt-timestamp">${formatLowerThirdTimestamp()}</div>
    `;

    this.lowerThirdEl = el;
    this.container.appendChild(el);

    this.lowerThirdTimer = setTimeout(() => {
      if (this.lowerThirdEl === el) {
        el.classList.add("closing");
        setTimeout(() => {
          if (this.lowerThirdEl === el) {
            el.remove();
            this.lowerThirdEl = null;
          }
        }, 450);
      }
      this.lowerThirdTimer = null;
    }, 7000);
  }

  static loadRecentMessages() {
    const publicMsgs = game.messages.contents
      .filter(m => !m.blind && (!m.whisper || m.whisper.length === 0))
      .slice(-5);

    this.chatHistory = publicMsgs.map(m => this.#formatChatMessage(m)).filter(Boolean);
  }

  static #getOutcomeBadgeHtml(analysis) {
    if (!analysis) return "";
    const parts = [];
    if (analysis.category === "san") {
      parts.push(`<span class="dg-roll-outcome outcome-san">${t("KORUJA_DG.Outcomes.SanCheck")}</span>`);
    } else if (analysis.category === "lethality") {
      parts.push(`<span class="dg-roll-outcome outcome-lethality">${t("KORUJA_DG.Outcomes.Lethality")}</span>`);
    }

    if (analysis.outcome === "crit") {
      parts.push(`<span class="dg-roll-outcome outcome-crit">${t("KORUJA_DG.Outcomes.CritSuccess")}</span>`);
    } else if (analysis.outcome === "fumble") {
      parts.push(`<span class="dg-roll-outcome outcome-fumble">${t("KORUJA_DG.Outcomes.Fumble")}</span>`);
    } else if (analysis.outcome === "success") {
      parts.push(`<span class="dg-roll-outcome outcome-success">${t("KORUJA_DG.Outcomes.Success")}</span>`);
    } else if (analysis.outcome === "failure") {
      parts.push(`<span class="dg-roll-outcome outcome-failure">${t("KORUJA_DG.Outcomes.Failure")}</span>`);
    }
    return parts.join(" ");
  }

  static #formatChatMessage(message) {
    const author = escapeHtml(message.speaker?.alias || message.author?.name || "Agent");
    if (message.rolls?.length > 0) {
      const analysis = analyzeDeltaGreenRoll(message);
      const roll = message.rolls[0];
      const totalStr = analysis?.isD100 ? String(analysis.total).padStart(2, "0") : String(roll.total);
      const typeClass = analysis?.outcome === "crit" ? "crit" : analysis?.outcome === "fumble" ? "fumble" : "";
      const outcomeBadges = this.#getOutcomeBadgeHtml(analysis);
      return {
        author,
        text: `🎲 <strong>${escapeHtml(totalStr)}</strong> <span class="roll-sub">(${escapeHtml(roll.formula)})</span> ${outcomeBadges}`,
        type: typeClass
      };
    }

    const temp = document.createElement("div");
    temp.innerHTML = message.content || "";
    const plain = temp.textContent?.trim();
    if (!plain) return null;
    const truncated = plain.length > 90 ? `${plain.slice(0, 87)}...` : plain;
    return { author, text: escapeHtml(truncated), type: "" };
  }

  static render(flashEvents = {}) {
    if (!this.shouldRender()) {
      this.destroy();
      return;
    }
    if (!this.container) this.init();

    const overlayMode = getEffectiveOverlayMode();
    const isRoleplayMode = overlayMode === "builtin-roleplay";
    document.body.classList.toggle("koruja-stream-roleplay-mode", isRoleplayMode);
    this.container.classList.toggle("is-roleplay-mode", isRoleplayMode);

    const customOverlayImg = game.settings.get(MODULE_ID, "customOverlayImg") || "";
    const showHP = game.settings.get(MODULE_ID, "showHP");
    const showSAN = game.settings.get(MODULE_ID, "showSAN");
    const showWP = game.settings.get(MODULE_ID, "showWP");
    const showConditions = game.settings.get(MODULE_ID, "showConditions");
    const showChatFeed = game.settings.get(MODULE_ID, "showChatFeed");
    const showCombatBox = isRoleplayMode ? false : game.settings.get(MODULE_ID, "showCombatBox");
    const bossActorId = game.settings.get(MODULE_ID, "bossActorId") || "";
    const operationName = (game.settings.get(MODULE_ID, "operationName") || game.scenes?.active?.name || "DELTA GREEN").trim();
    const agencyStatus = game.settings.get(MODULE_ID, "agencyStatus") || "CLASSIFIED";
    const statusClass = `status-${agencyStatus.toLowerCase().replace("_", "-")}`;
    const defconLevel = String(game.settings.get(MODULE_ID, "defconLevel") || "3");
    const threatMode = this.threatOverlayOverride || game.settings.get(MODULE_ID, "threatOverlayMode") || "normal";
    document.body.classList.toggle("dg-threat-stalker", threatMode === "stalker");
    document.body.classList.toggle("dg-threat-blind", threatMode === "blind");

    const threatOverlayHtml = (threatMode === "stalker" || threatMode === "blind") ? `
      <div id="dg-threat-overlay" class="dg-threat-${threatMode}">
        <div class="dg-threat-vignette"></div>
        <div class="dg-threat-status-strip">${t(threatMode === "stalker" ? "KORUJA_DG.ThreatMode.StalkerStrip" : "KORUJA_DG.ThreatMode.BlindStrip")}</div>
      </div>
    ` : "";

    const showOpClock = game.settings.get(MODULE_ID, "showOpClock");
    const showNowPlaying = game.settings.get(MODULE_ID, "showNowPlaying");
    const activeTrack = showNowPlaying ? getActivePlaylistTrack() : null;

    const pos = isRoleplayMode
      ? foundry.utils.deepClone(ROLEPLAY_POSITIONS)
      : foundry.utils.mergeObject(
          foundry.utils.deepClone(DEFAULT_POSITIONS),
          foundry.utils.deepClone(game.settings.get(MODULE_ID, "cardPositions") || {})
        );

    const actorIds = game.settings.get(MODULE_ID, "partyActorIds") || [];
    const actors = actorIds.slice(0, 6).map(id => game.actors.get(id)).filter(Boolean);
    const activeCombatant = game.combat?.started ? game.combat.combatant : null;
    const activeCombatantActorId = activeCombatant?.actor?.id || null;

    this.syncMediaLayer(actors, overlayMode, activeCombatantActorId);

    const nowPlayingHtml = activeTrack ? `
      <span class="dg-now-playing" title="${escapeHtml(activeTrack.playlist)}">
        <span class="dg-eq-bars"><span class="dg-eq-bar"></span><span class="dg-eq-bar"></span><span class="dg-eq-bar"></span></span>
        <span class="dg-np-track">${t("KORUJA_DG.HUD.NowPlayingPrefix")} ${escapeHtml(activeTrack.track)}</span>
      </span>
    ` : "";

    const topBarHtml = `
      <div class="koruja-top-bar">
        <div class="top-left">
          <img src="modules/${MODULE_ID}/assets/crest.png" onerror="this.style.display='none'">
          <span>${escapeHtml(operationName.toUpperCase())}${isRoleplayMode ? ` — ${t("KORUJA_DG.HUD.RoleplayTag")}` : ""}</span>
          <span class="dg-status-tag ${statusClass}">${t(`KORUJA_DG.Status.${agencyStatus}`)}</span>
          ${nowPlayingHtml}
        </div>
        <div class="top-right">
          <span class="dg-defcon-pill defcon-${escapeHtml(defconLevel)}">${t(`KORUJA_DG.Defcon.D${defconLevel}`)}</span>
          ${showOpClock ? `<span class="dg-op-clock">${formatTacticalClock()}</span>` : ""}
          <span class="dg-rec-badge"><span class="live-dot"></span> ${t("KORUJA_DG.HUD.LiveRec")}</span>
        </div>
      </div>
    `;

    // 1. Backdrop / Frame Layer
    let backdropHtml = "";
    if (overlayMode === "builtin-tactical") {
      backdropHtml = `
        <div class="koruja-builtin-frame">
          ${topBarHtml}
          <div class="koruja-cutout koruja-cutout-foundry"></div>
          <div class="koruja-cutout koruja-cutout-gm"></div>
          <div class="koruja-cutout koruja-cutout-p1"></div>
          <div class="koruja-cutout koruja-cutout-p2"></div>
          <div class="koruja-cutout koruja-cutout-p3"></div>
          <div class="koruja-cutout koruja-cutout-p4"></div>
          <div class="koruja-cutout koruja-cutout-p5"></div>
          <div class="koruja-cutout koruja-cutout-p6"></div>
        </div>
      `;
    } else if (overlayMode === "builtin-roleplay") {
      const wallpaperPath = `modules/${MODULE_ID}/assets/wallpaper.jpg`;
      backdropHtml = `
        <div class="koruja-builtin-frame koruja-rp-frame">
          <svg class="koruja-rp-bg-svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
            <defs>
              <mask id="koruja-rp-holes">
                <rect width="1920" height="1080" fill="white" />
                <rect x="36" y="90" width="426" height="240" rx="4" fill="black" />
                <rect x="498" y="90" width="426" height="240" rx="4" fill="black" />
                <rect x="960" y="90" width="426" height="240" rx="4" fill="black" />
                <rect x="36" y="446" width="426" height="240" rx="4" fill="black" />
                <rect x="498" y="446" width="426" height="240" rx="4" fill="black" />
                <rect x="960" y="446" width="426" height="240" rx="4" fill="black" />
                <rect x="1430" y="90" width="454" height="255" rx="4" fill="black" />
              </mask>
            </defs>
            <image href="${wallpaperPath}" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" mask="url(#koruja-rp-holes)" />
            <rect width="1920" height="1080" fill="rgba(5, 8, 10, 0.72)" mask="url(#koruja-rp-holes)" />
          </svg>

          ${topBarHtml}

          <div class="koruja-cutout koruja-rp-p1"></div>
          <div class="koruja-cutout koruja-rp-p2"></div>
          <div class="koruja-cutout koruja-rp-p3"></div>
          <div class="koruja-cutout koruja-rp-p4"></div>
          <div class="koruja-cutout koruja-rp-p5"></div>
          <div class="koruja-cutout koruja-rp-p6"></div>
          <div class="koruja-cutout koruja-rp-gm"><div class="cutout-tag">HANDLER</div></div>

          <div class="koruja-rp-lore-banner">
            <img class="rp-lore-crest" src="modules/${MODULE_ID}/assets/crest.png" onerror="this.style.display='none'">
            <div class="rp-lore-text">
              <div class="rp-lore-title">${escapeHtml(operationName.toUpperCase())}</div>
              <div class="rp-lore-sub">${t(`KORUJA_DG.Status.${agencyStatus}`)} // DELTA GREEN FIELD FEED</div>
            </div>
          </div>
        </div>
      `;
    } else if (overlayMode === "custom-image" && customOverlayImg) {
      backdropHtml = `<img class="koruja-custom-overlay-bg" src="${escapeHtml(customOverlayImg)}" alt="Overlay">`;
    }

    // 2. Threat / Boss HP Bar
    let bossHtml = "";
    let bossActor = null;
    if (bossActorId) {
      if (bossActorId.includes(".")) {
        const doc = fromUuidSync(bossActorId);
        bossActor = doc?.actor || doc || null;
      } else {
        const sceneToken = canvas?.tokens?.placeables?.find(tkn => tkn.actor?.id === bossActorId);
        bossActor = sceneToken?.actor || game.actors.get(bossActorId) || null;
      }
    }
    if (bossActor) {
      const bhp = getActorHealth(bossActor);
      const bPct = Math.min(100, Math.round((bhp.value / bhp.max) * 100));
      const trailPct = this.lastBossHpPct !== null && this.lastBossHpPct > bPct ? this.lastBossHpPct : bPct;
      this.lastBossHpPct = bPct;

      bossHtml = `
        <div class="koruja-boss-bar ${bhp.value === 0 ? "boss-defeated" : ""}">
          <div class="boss-portrait-wrap">
            <img src="${escapeHtml(bossActor.img)}" alt="${escapeHtml(bossActor.name)}">
          </div>
          <div class="boss-info-wrap">
            <div class="boss-header-row">
              <span class="boss-name"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(bossActor.name)}</span>
              <span class="boss-hp-num">${bhp.value === 0 ? t("KORUJA_DG.HUD.ThreatEliminated") : `${bhp.value} / ${bhp.max}`}</span>
            </div>
            <div class="boss-bar-outer">
              <div class="boss-bar-trail" style="width: ${trailPct}%"></div>
              <div class="boss-bar-fill" style="width: ${bPct}%"></div>
            </div>
          </div>
        </div>
      `;
    } else {
      this.lastBossHpPct = null;
    }

    // 3. Agent Cards (HP + SAN + Breaking Point + Adaptations + WP)
    const cardsHtml = actors.map((actor, index) => {
      const slotKey = `p${index + 1}`;
      const coords = pos[slotKey] || DEFAULT_POSITIONS[slotKey];

      const hp = getActorHealth(actor);
      const san = getActorSanity(actor);
      const wp = getActorWP(actor);

      this.statCache.set(actor.id, { hp: hp.value, san: san.value, wp: wp.value, bp: san.bp });

      const hpPct = Math.min(100, Math.round((hp.value / hp.max) * 100));
      const sanPct = Math.min(100, Math.round((san.value / san.max) * 100));
      const bpPct = Math.min(100, Math.max(0, Math.round((san.bp / san.max) * 100)));
      const wpPct = Math.min(100, Math.round((wp.value / wp.max) * 100));

      const isTurn = activeCombatantActorId === actor.id;
      const isDown = hp.value === 0;
      const isCriticalWound = hp.value > 0 && hp.value <= 2;
      const isBloodied = hpPct > 0 && hpPct <= 50;
      const isBreakingPoint = san.bp > 0 && san.value <= san.bp;
      const isNearBP = !isBreakingPoint && san.bp > 0 && (san.value - san.bp) <= 5;
      const isWpZero = wp.value === 0;

      const flashClass = flashEvents[actor.id] ? `flash-${flashEvents[actor.id]}` : "";
      const barColorClass = (hpPct <= 25 || isCriticalWound) ? "hp-critical" : hpPct <= 50 ? "hp-bloodied" : "hp-healthy";

      const stateClasses = [
        isTurn ? "is-active-turn" : "",
        isDown ? "is-down" : "",
        isCriticalWound ? "is-critical-wound" : "",
        isBreakingPoint ? "is-breaking-point" : "",
        isNearBP ? "is-near-bp" : "",
        isWpZero ? "is-wp-zero" : "",
        flashClass
      ].filter(Boolean).join(" ");

      let hpHtml = "";
      if (showHP) {
        if (isDown) {
          hpHtml = `
            <div class="koruja-hp-bar-outer">
              <div class="koruja-hp-bar-fill hp-critical" style="width: 0%"></div>
              <div class="koruja-hp-text">${t("KORUJA_DG.HUD.Unconscious")} (0/${hp.max})</div>
            </div>
          `;
        } else {
          hpHtml = `
            <div class="koruja-hp-bar-outer">
              <div class="koruja-hp-bar-fill ${barColorClass}" style="width: ${hpPct}%"></div>
              <div class="koruja-hp-text">HP ${hp.value} / ${hp.max}</div>
            </div>
          `;
        }
      }

      let sanHtml = "";
      if (showSAN) {
        sanHtml = `
          <div class="dg-san-row">
            <div class="dg-san-bar-outer" title="SAN ${san.value}/${san.max} | ${t("KORUJA_DG.HUD.BreakingPoint")}: ${san.bp}">
              <div class="dg-san-bar-fill" style="width: ${sanPct}%"></div>
              ${san.bp > 0 ? `<div class="dg-bp-marker" style="left: ${bpPct}%"></div>` : ""}
              <div class="dg-san-text">SAN ${san.value}${san.bp > 0 ? ` <span class="dg-bp-val">(${t("KORUJA_DG.HUD.BreakingPointShort")} ${san.bp})</span>` : ""}</div>
            </div>
          </div>
        `;
      }

      let wpHtml = "";
      if (showWP) {
        wpHtml = `
          <div class="dg-wp-row">
            <div class="dg-wp-bar-outer">
              <div class="dg-wp-bar-fill" style="width: ${wpPct}%"></div>
              <div class="dg-wp-text">WP ${wp.value}/${wp.max}</div>
            </div>
          </div>
        `;
      }

      let adaptHtml = "";
      if (san.adaptedViolence || san.adaptedHelplessness) {
        adaptHtml = `
          <div class="dg-adapt-badges">
            ${san.adaptedViolence ? `<span class="dg-adapt-pill adapted" title="${t("KORUJA_DG.HUD.AdaptedViolence")}">V</span>` : ""}
            ${san.adaptedHelplessness ? `<span class="dg-adapt-pill adapted" title="${t("KORUJA_DG.HUD.AdaptedHelplessness")}">H</span>` : ""}
          </div>
        `;
      }

      let conditionsHtml = "";
      if (showConditions && actor.statuses?.size > 0) {
        const badges = Array.from(actor.statuses).slice(0, 5).map(statusId => {
          const eff = CONFIG.statusEffects.find(e => e.id === statusId);
          if (!eff) return "";
          const label = game.i18n.localize(eff.name || eff.label || statusId);
          return `<img class="koruja-cond-icon" src="${escapeHtml(eff.img)}" title="${escapeHtml(label)}" alt="${escapeHtml(label)}">`;
        }).join("");
        if (badges) conditionsHtml = `<div class="koruja-card-conditions">${badges}</div>`;
      }

      return `
        <div class="koruja-player-card ${stateClasses}"
             style="left: ${coords.x}px; top: ${coords.y}px;" data-actor-id="${actor.id}">
          <div class="koruja-roll-toast" id="koruja-roll-${actor.id}"></div>
          ${isDown ? `<div class="dg-kia-stamp">${t("KORUJA_DG.Card.KiaStamp")}</div>` : ""}
          <div class="koruja-card-inner">
            <div class="koruja-portrait-wrap">
              <img class="koruja-portrait ${isBloodied ? "bloodied" : ""}" src="${escapeHtml(actor.img)}" alt="${escapeHtml(actor.name)}">
              ${isTurn ? `<div class="koruja-turn-badge">${t("KORUJA_DG.HUD.TurnBadge")}</div>` : ""}
              ${isCriticalWound ? `<div class="dg-crit-wound-tag">${t("KORUJA_DG.HUD.CriticalWound")}</div>` : ""}
            </div>
            <div class="koruja-stats-wrap">
              <div class="koruja-name-row">
                <span class="koruja-char-name">${escapeHtml(actor.name)}</span>
                ${adaptHtml}
              </div>
              ${hpHtml}
              ${sanHtml}
              ${wpHtml}
              ${conditionsHtml}
            </div>
          </div>
        </div>
      `;
    }).join("");

    // 4. Live d100 Roll Feed
    let chatHtml = "";
    if (showChatFeed) {
      const chatCoords = pos.chat || DEFAULT_POSITIONS.chat;
      const msgs = this.chatHistory.slice(-5).map(m => `
        <div class="koruja-feed-msg ${m.type}">
          <div class="feed-author">${m.author}</div>
          <div class="feed-text">${m.text}</div>
        </div>
      `).join("");
      chatHtml = `
        <div class="koruja-chat-feed-box" style="left: ${chatCoords.x}px; top: ${chatCoords.y}px;">
          <div class="feed-header">${t("KORUJA_DG.HUD.RollFeedTitle")}</div>
          <div class="feed-body">${msgs || `<div class="feed-empty">${t("KORUJA_DG.HUD.RollFeedEmpty")}</div>`}</div>
        </div>
      `;
    }

    // 5. Combat / Turn Box (or Active Monster GIF Card when triggered)
    let combatHtml = "";
    const activeMonster = this.monsterCardOverride || game.settings.get(MODULE_ID, "activeMonsterCard") || { mode: "none", name: "", img: "" };
    const combatCoords = pos.combat || DEFAULT_POSITIONS.combat;
    if (activeMonster?.mode && activeMonster.mode !== "none" && activeMonster.img) {
      combatHtml = `
        <div class="koruja-combat-box has-monster-card monster-${escapeHtml(activeMonster.mode)}" style="left: ${combatCoords.x}px; top: ${combatCoords.y}px;">
          <img class="dg-monster-box-gif" src="${escapeHtml(activeMonster.img)}" alt="${escapeHtml(activeMonster.name || "")}">
          <div class="dg-monster-box-overlay">
            <span class="dg-monster-box-tag">${t("KORUJA_DG.HUD.ThreatActive")}</span>
            <span class="dg-monster-box-name">${escapeHtml(activeMonster.name || "")}</span>
          </div>
        </div>
      `;
    } else if (showCombatBox) {
      const roundText = game.combat?.started ? `${t("KORUJA_DG.HUD.Round")} ${String(game.combat.round).padStart(2, "0")}` : t("KORUJA_DG.HUD.Exploration");
      const turnText = game.combat?.started && activeCombatant ? `${t("KORUJA_DG.HUD.TurnOf")}: ${escapeHtml(activeCombatant.name)}` : t("KORUJA_DG.HUD.OutOfCombat");
      combatHtml = `
        <div class="koruja-combat-box" style="left: ${combatCoords.x}px; top: ${combatCoords.y}px;">
          <div class="combat-label">${t("KORUJA_DG.HUD.Initiative")}</div>
          <div class="combat-round">${roundText}</div>
          <div class="combat-turn">${turnText}</div>
        </div>
      `;
    }

    this.container.innerHTML = `${backdropHtml}${threatOverlayHtml}${bossHtml}${cardsHtml}${chatHtml}${combatHtml}`;
    if (this.epicBannerEl) this.container.appendChild(this.epicBannerEl);
    if (this.lowerThirdEl) this.container.appendChild(this.lowerThirdEl);
    if (this.spotlightEl) this.container.appendChild(this.spotlightEl);
  }

  static showEpicBanner(type, { name = "Agent", img = "", detail = "" } = {}) {
    if (!this.shouldRender() || !this.container) return;

    if (this.epicBannerTimer) clearTimeout(this.epicBannerTimer);
    if (this.epicBannerEl) this.epicBannerEl.remove();

    const bannerMap = {
      "crit": { cls: "epic-crit", title: t("KORUJA_DG.Alerts.CritTitle") },
      "fumble": { cls: "epic-fumble", title: t("KORUJA_DG.Alerts.FumbleTitle") },
      "breaking-point": { cls: "epic-breaking-point", title: t("KORUJA_DG.Alerts.BreakingPointTitle") },
      "san-loss": { cls: "epic-san-loss", title: t("KORUJA_DG.Alerts.SanLossTitle") },
      "critical-wound": { cls: "epic-critical-wound", title: t("KORUJA_DG.Alerts.CriticalWoundTitle") },
      "lethality": { cls: "epic-lethality", title: t("KORUJA_DG.Alerts.LethalityTitle") },
      "bond-degraded": { cls: "epic-bond-degraded", title: t("KORUJA_DG.Alerts.BondDegradedTitle") }
    };

    const cfg = bannerMap[type] || bannerMap.crit;
    const banner = document.createElement("div");
    banner.className = `koruja-epic-banner ${cfg.cls}`;
    banner.innerHTML = `
      ${img ? `<img class="epic-banner-portrait" src="${escapeHtml(img)}" alt="${escapeHtml(name)}" onerror="this.style.display='none'">` : ""}
      <div class="epic-content">
        <div class="epic-actor">${escapeHtml(name)}</div>
        <div class="epic-title">${cfg.title}</div>
        ${detail ? `<div class="epic-detail">${escapeHtml(detail)}</div>` : ""}
      </div>
    `;

    this.epicBannerEl = banner;
    this.container.appendChild(banner);

    this.epicBannerTimer = setTimeout(() => {
      if (this.epicBannerEl === banner) {
        banner.remove();
        this.epicBannerEl = null;
      }
      this.epicBannerTimer = null;
    }, 4500);
  }

  static showSpotlight({ src = "", title = "" } = {}) {
    if (!this.shouldRender() || !this.container || !src) return;

    if (this.spotlightTimer) clearTimeout(this.spotlightTimer);
    if (this.spotlightEl) this.spotlightEl.remove();

    const card = document.createElement("div");
    card.className = "koruja-spotlight-card";
    card.innerHTML = `
      <div class="spotlight-img-wrap">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(title)}">
      </div>
      ${title ? `<div class="spotlight-caption">${escapeHtml(title)}</div>` : ""}
    `;

    this.spotlightEl = card;
    this.container.appendChild(card);

    this.spotlightTimer = setTimeout(() => {
      if (this.spotlightEl === card) {
        card.classList.add("closing");
        setTimeout(() => {
          if (this.spotlightEl === card) {
            card.remove();
            this.spotlightEl = null;
          }
        }, 400);
      }
      this.spotlightTimer = null;
    }, 10000);
  }

  static showRollToast(actorId, analysis) {
    if (!this.shouldRender() || !game.settings.get(MODULE_ID, "showRolls") || !analysis) return;
    const toastEl = document.getElementById(`koruja-roll-${actorId}`);
    if (!toastEl) return;

    const badgeClass = analysis.outcome === "crit" ? "roll-crit" : analysis.outcome === "fumble" ? "roll-fumble" : "";
    const totalStr = analysis.isD100 ? String(analysis.total).padStart(2, "0") : String(analysis.total);
    const outcomeHtml = this.#getOutcomeBadgeHtml(analysis);

    toastEl.className = `koruja-roll-toast visible ${badgeClass}`;
    toastEl.innerHTML = `
      <span class="roll-icon">🎲</span>
      <span class="roll-total">${escapeHtml(totalStr)}</span>
      ${outcomeHtml || `<span class="roll-formula">${escapeHtml(analysis.formula || "")}</span>`}
    `;

    if (this.rollTimers.has(actorId)) clearTimeout(this.rollTimers.get(actorId));
    const timer = setTimeout(() => {
      const el = document.getElementById(`koruja-roll-${actorId}`);
      if (el) el.classList.remove("visible");
    }, 6000);
    this.rollTimers.set(actorId, timer);
  }

  static pushChatMessage(message) {
    const formatted = this.#formatChatMessage(message);
    if (!formatted) return;
    this.chatHistory.push(formatted);
    if (this.chatHistory.length > 5) this.chatHistory.shift();
    this.render();
  }
}

/* =========================================================
 * FOUNDRY VTT v14 INITIALIZATION & HOOKS
 * ========================================================= */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "partyActorIds", { scope: "world", config: false, type: Array, default: [], onChange: () => { KorujaStreamHUD.seedBondCache(); KorujaStreamHUD.render(); } });
  game.settings.register(MODULE_ID, "playerSlotConfigs", { scope: "world", config: false, type: Object, default: {}, onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "vdoRoomName", { scope: "world", config: false, type: String, default: "DeltaGreenOp" });
  game.settings.register(MODULE_ID, "bossActorId", { scope: "world", config: false, type: String, default: "", onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "overlayMode", { scope: "world", config: false, type: String, default: "builtin-tactical", onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "customOverlayImg", { scope: "world", config: false, type: String, default: "", onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "showChatFeed", { scope: "world", config: false, type: Boolean, default: true, onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "showCombatBox", { scope: "world", config: false, type: Boolean, default: true, onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "cardPositions", { scope: "world", config: false, type: Object, default: DEFAULT_POSITIONS, onChange: () => KorujaStreamHUD.render() });

  game.settings.register(MODULE_ID, "defconLevel", {
    name: "KORUJA_DG.Settings.DefconLevel",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "1": "KORUJA_DG.Defcon.D1",
      "2": "KORUJA_DG.Defcon.D2",
      "3": "KORUJA_DG.Defcon.D3",
      "4": "KORUJA_DG.Defcon.D4",
      "5": "KORUJA_DG.Defcon.D5"
    },
    default: "3",
    onChange: () => KorujaStreamHUD.render()
  });

  game.settings.register(MODULE_ID, "threatOverlayMode", {
    scope: "world",
    config: false,
    type: String,
    default: "normal",
    onChange: () => {
      KorujaStreamHUD.threatOverlayOverride = null;
      KorujaStreamHUD.render();
    }
  });

  game.settings.register(MODULE_ID, "stalkerGif", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "blindGif", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "caretakerGif", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "activeMonsterCard", {
    scope: "world",
    config: false,
    type: Object,
    default: { mode: "none", name: "", img: "" },
    onChange: () => {
      KorujaStreamHUD.monsterCardOverride = null;
      KorujaStreamHUD.render();
    }
  });

  game.settings.register(MODULE_ID, "showSceneLowerThird", {
    name: "KORUJA_DG.Settings.ShowSceneLowerThird",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "sceneClassification", {
    name: "KORUJA_DG.Settings.SceneClassification",
    scope: "world",
    config: true,
    type: String,
    default: "EYES ONLY // ACTIVE AO"
  });

  game.settings.register(MODULE_ID, "showNowPlaying", {
    name: "KORUJA_DG.Settings.ShowNowPlaying",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => KorujaStreamHUD.render()
  });

  game.settings.register(MODULE_ID, "operationName", {
    name: "KORUJA_DG.Settings.OperationName",
    scope: "world",
    config: true,
    type: String,
    default: "OPERAÇÃO: DELTA GREEN",
    onChange: () => KorujaStreamHUD.render()
  });

  game.settings.register(MODULE_ID, "agencyStatus", {
    name: "KORUJA_DG.Settings.AgencyStatus",
    scope: "world",
    config: true,
    type: String,
    choices: {
      CLASSIFIED: "KORUJA_DG.Status.CLASSIFIED",
      COMPROMISED: "KORUJA_DG.Status.COMPROMISED",
      STABLE: "KORUJA_DG.Status.STABLE",
      CODE_RED: "KORUJA_DG.Status.CODE_RED"
    },
    default: "CLASSIFIED",
    onChange: () => KorujaStreamHUD.render()
  });

  game.settings.register(MODULE_ID, "showOpClock", {
    name: "KORUJA_DG.Settings.ShowOpClock",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => KorujaStreamHUD.render()
  });

  game.settings.register(MODULE_ID, "autoPanCombat", { name: "KORUJA_DG.Settings.AutoPanCombat", scope: "world", config: true, type: Boolean, default: true });
  game.settings.register(MODULE_ID, "cinematicHandouts", { name: "KORUJA_DG.Settings.CinematicHandouts", scope: "world", config: true, type: Boolean, default: true });

  game.settings.register(MODULE_ID, "streamUser", {
    name: "KORUJA_DG.Settings.StreamUserName",
    hint: "KORUJA_DG.Settings.StreamUserHint",
    scope: "world",
    config: true,
    type: String,
    default: "Stream",
    onChange: () => KorujaStreamHUD.init()
  });

  game.settings.register(MODULE_ID, "hideFoundryUI", {
    name: "KORUJA_DG.Settings.HideFoundryUI",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => KorujaStreamHUD.init()
  });

  game.settings.register(MODULE_ID, "showHP", { name: "KORUJA_DG.Settings.ShowHP", scope: "world", config: true, type: Boolean, default: true, onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "showSAN", { name: "KORUJA_DG.Settings.ShowSAN", scope: "world", config: true, type: Boolean, default: true, onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "showWP", { name: "KORUJA_DG.Settings.ShowWP", scope: "world", config: true, type: Boolean, default: true, onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "showConditions", { name: "KORUJA_DG.Settings.ShowConditions", scope: "world", config: true, type: Boolean, default: true, onChange: () => KorujaStreamHUD.render() });
  game.settings.register(MODULE_ID, "showRolls", { name: "KORUJA_DG.Settings.ShowRolls", scope: "world", config: true, type: Boolean, default: true });

  game.settings.registerMenu(MODULE_ID, "partyConfigMenu", {
    name: "KORUJA_DG.Settings.ConfigMenuName",
    label: "KORUJA_DG.Settings.ConfigMenuLabel",
    hint: "KORUJA_DG.Settings.ConfigMenuHint",
    icon: "fa-solid fa-video",
    type: StreamPartyConfigApp,
    restricted: true
  });

  game.korujaStreamHudDG = {
    openConfig: () => new StreamPartyConfigApp().render({ force: true }),
    refresh: () => KorujaStreamHUD.render(),
    setBoss: (actorId) => game.settings.set(MODULE_ID, "bossActorId", actorId || ""),
    setMode: (mode) => game.settings.set(MODULE_ID, "overlayMode", mode || "builtin-tactical"),
    setStatus: (status) => game.settings.set(MODULE_ID, "agencyStatus", status || "CLASSIFIED"),
    setDefcon: (level) => game.settings.set(MODULE_ID, "defconLevel", String(level || "3")),
    setThreatOverlay: async (mode) => {
      const normalized = ["normal", "stalker", "blind"].includes(mode) ? mode : "normal";
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel(MODULE_ID);
        ch.postMessage({ action: "set-threat-overlay", mode: normalized });
        ch.close();
      }
      if (game.user?.isGM) {
        await game.settings.set(MODULE_ID, "threatOverlayMode", normalized);
      }
    },
    setMonsterCard: async (mode = "none", name = "", img = "") => {
      const card = {
        mode: ["none", "stalker", "blind", "caretaker"].includes(mode) ? mode : "none",
        name: String(name || ""),
        img: String(img || "")
      };
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel(MODULE_ID);
        ch.postMessage({ action: "set-monster-card", card });
        ch.close();
      }
      if (game.user?.isGM) {
        await game.settings.set(MODULE_ID, "activeMonsterCard", card);
      }
    },
    triggerLowerThird: (sceneName) => KorujaStreamHUD.showSceneLowerThird(sceneName)
  };
});

Hooks.once("ready", () => KorujaStreamHUD.init());

Hooks.on("canvasReady", () => {
  if (!KorujaStreamHUD.shouldRender()) return;
  KorujaStreamHUD.render();
  KorujaStreamHUD.showSceneLowerThird(game.scenes?.active?.name);
  setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
});

Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user?.isGM) return;
  const headerActions = html.querySelector?.(".header-actions") || html[0]?.querySelector(".header-actions");
  if (!headerActions || headerActions.querySelector(".koruja-stream-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "koruja-stream-btn";
  btn.innerHTML = `<i class="fa-solid fa-video"></i> Stream HUD`;
  btn.title = t("KORUJA_DG.Settings.ConfigMenuLabel");
  btn.addEventListener("click", () => game.korujaStreamHudDG.openConfig());
  headerActions.appendChild(btn);

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "koruja-stream-btn";
  toggleBtn.innerHTML = `<i class="fa-solid fa-masks-theater"></i> RP / Map`;
  toggleBtn.addEventListener("click", async () => {
    const cur = game.settings.get(MODULE_ID, "overlayMode");
    const next = cur === "builtin-roleplay" ? "builtin-tactical" : "builtin-roleplay";
    await game.settings.set(MODULE_ID, "overlayMode", next);
  });
  headerActions.appendChild(toggleBtn);
});

Hooks.on("renderTokenHUD", (hud, html) => {
  if (!game.user?.isGM) return;
  const tokenDoc = hud.object?.document;
  const actorId = hud.object?.actor?.id;
  if (!tokenDoc || !actorId) return;

  const root = html instanceof HTMLElement ? html : html[0];
  const colRight = root?.querySelector(".col.right");
  if (!colRight || colRight.querySelector(".koruja-boss-toggle")) return;

  const currentBoss = game.settings.get(MODULE_ID, "bossActorId");
  const isBoss = currentBoss === tokenDoc.uuid || currentBoss === actorId;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `control-icon koruja-boss-toggle ${isBoss ? "active" : ""}`;
  btn.title = t("KORUJA_DG.Config.ThreatTitle");
  btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
  btn.addEventListener("click", async () => {
    const nextBoss = isBoss ? "" : tokenDoc.uuid;
    await game.settings.set(MODULE_ID, "bossActorId", nextBoss);
    hud.clear();
  });
  colRight.appendChild(btn);
});

Hooks.on("renderImagePopout", (app, html) => {
  if (!KorujaStreamHUD.shouldRender() || !game.settings.get(MODULE_ID, "cinematicHandouts")) return;
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el) return;

  const src = app.options?.src || app.document?.src || el.querySelector("img")?.src || "";
  const title = app.options?.window?.title || app.title || "";
  if (src) {
    el.style.display = "none";
    KorujaStreamHUD.showSpotlight({ src, title });
  }
});

Hooks.on("updateActor", (actor) => {
  const actorIds = game.settings.get(MODULE_ID, "partyActorIds") || [];
  const bossActorId = game.settings.get(MODULE_ID, "bossActorId");
  const isBossMatch = bossActorId && (actor.id === bossActorId || actor.parent?.uuid === bossActorId || actor.uuid === bossActorId);
  if (!actorIds.includes(actor.id) && !isBossMatch) return;

  const newHp = getActorHealth(actor).value;
  const san = getActorSanity(actor);
  const prev = KorujaStreamHUD.statCache.get(actor.id);
  const flash = {};

  if (actorIds.includes(actor.id) && prev) {
    if (newHp < prev.hp) {
      flash[actor.id] = "damage";
      if (newHp <= 2 && prev.hp > 2) {
        KorujaStreamHUD.showEpicBanner("critical-wound", { name: actor.name, img: actor.img });
      }
    } else if (newHp > prev.hp) {
      flash[actor.id] = "heal";
    }

    if (san.value < prev.san) {
      flash[actor.id] = "san-loss";
      if (san.bp > 0 && san.value <= san.bp && prev.san > san.bp) {
        KorujaStreamHUD.showEpicBanner("breaking-point", { name: actor.name, img: actor.img });
      } else if (prev.san - san.value >= 4) {
        KorujaStreamHUD.showEpicBanner("san-loss", { name: actor.name, img: actor.img });
      }
    }
  }
  KorujaStreamHUD.render(flash);
});

Hooks.on("updateToken", (tokenDoc) => {
  const bossActorId = game.settings.get(MODULE_ID, "bossActorId");
  if (!bossActorId) return;
  if (tokenDoc.uuid === bossActorId || tokenDoc.actorId === bossActorId) {
    KorujaStreamHUD.render();
  }
});

Hooks.on("createActiveEffect", (e) => { if (e.parent?.documentName === "Actor") KorujaStreamHUD.render(); });
Hooks.on("deleteActiveEffect", (e) => { if (e.parent?.documentName === "Actor") KorujaStreamHUD.render(); });
Hooks.on("updateActiveEffect", (e) => { if (e.parent?.documentName === "Actor") KorujaStreamHUD.render(); });

Hooks.on("updateCombat", (combat, changed) => {
  KorujaStreamHUD.render();

  if (!KorujaStreamHUD.shouldRender() || !game.settings.get(MODULE_ID, "autoPanCombat")) return;
  if (!combat.started) return;
  if (changed.turn === undefined && changed.round === undefined && changed.active === undefined) return;

  const combatant = combat.combatant;
  const token = combatant?.token?.object;
  if (!token || combatant.hidden || token.document?.hidden) return;

  canvas.animatePan({
    x: token.center.x,
    y: token.center.y,
    duration: 1000
  });
});

Hooks.on("updateItem", (item, changed) => {
  if (item.type !== "bond" || item.parent?.documentName !== "Actor") return;
  const partyActorIds = game.settings.get(MODULE_ID, "partyActorIds") || [];
  if (!partyActorIds.includes(item.parent.id)) return;
  if (changed?.system?.score === undefined) return;

  const newScore = Number(item.system?.score) || 0;
  const oldScore = KorujaStreamHUD.bondCache.get(item.uuid);
  KorujaStreamHUD.bondCache.set(item.uuid, newScore);

  if (oldScore !== undefined && newScore < oldScore) {
    KorujaStreamHUD.showEpicBanner("bond-degraded", {
      name: item.parent.name,
      img: item.parent.img,
      detail: `${item.name}: ${oldScore} → ${newScore}`
    });
  }
});

Hooks.on("updatePlaylistSound", () => {
  if (KorujaStreamHUD.shouldRender()) KorujaStreamHUD.render();
});

Hooks.on("updatePlaylist", () => {
  if (KorujaStreamHUD.shouldRender()) KorujaStreamHUD.render();
});

Hooks.on("deleteCombat", () => KorujaStreamHUD.render());

Hooks.on("createChatMessage", (message) => {
  if (message.whisper?.length > 0 || message.blind) return;
  KorujaStreamHUD.pushChatMessage(message);

  if (message.rolls?.length > 0) {
    const analysis = analyzeDeltaGreenRoll(message);
    const actorId = message.speaker?.actor;
    const actorIds = game.settings.get(MODULE_ID, "partyActorIds") || [];
    if (actorId && actorIds.includes(actorId)) {
      KorujaStreamHUD.showRollToast(actorId, analysis);
    }

    if (analysis?.outcome === "crit" || analysis?.outcome === "fumble" || analysis?.category === "lethality") {
      const actor = actorId ? game.actors.get(actorId) : null;
      const name = message.speaker?.alias || actor?.name || message.author?.name || "Agent";
      const img = actor?.img || message.author?.avatar || "";
      const bannerType = analysis.outcome === "crit" ? "crit" : analysis.outcome === "fumble" ? "fumble" : "lethality";
      KorujaStreamHUD.showEpicBanner(bannerType, { name, img });
    }
  }
});
