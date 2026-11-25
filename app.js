"use strict";

/* ==========================================
   TRADELEDGER - COMPLETE REPLACEMENT
   V54 - Broker-matched Reports & Analytics toolbar
   Existing IndexedDB data preserved
========================================== */

const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Spreadsheet insert icons are inline SVG. Keep them local to the renderer so
// a stale/missing global icon variable can never stop the database from loading.
function sheetInlineIcon(type) {
  if (type === "row") {
    return `<svg class="sheet-inline-icon" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#f2edf2" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="10" width="40" height="34" rx="2"/><path d="M12 27h40M32 45v9M25 54h14"/><path d="M32 39v12M26 45l6 6 6-6"/></g></svg>`;
  }
  return `<svg class="sheet-inline-icon" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#f2edf2" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="12" width="34" height="40" rx="2"/><path d="M27 12v40M45 32h9M54 25v14"/><path d="M39 32h12M45 26l6 6-6 6"/></g></svg>`;
}

// TradeLedger stable build: existing IndexedDB data preserved.
const TRADELEDGER_BUILD = "20261124-tradebook-v78-settings-otp-ready";

const DB_NAME = "TradeLedgerDB";
const SETTINGS_KEY = "TradeLedgerColumnSettings";
const MODE_SETTINGS_KEY = "TradeLedgerModeFieldSettings";
const DRIVE_CONNECTION_KEY = "TradeLedgerDriveConnection";
const REPORTS_KEY = "TradeLedgerReports";
const REPORT_SETTINGS_KEY = "TradeLedgerReportSettings";
const BROKER_DATA_KEY = "TradeLedgerBrokerTransactions";

const GOOGLE_CLIENT_ID =
  "1085762739616-cbkh2us7v8arnkijb0bbr2dumtqcrn8k.apps.googleusercontent.com";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER_NAME = "TradeLedger Backups";
const DRIVE_BACKUP_NAME = "TradeLedger-Backup.json";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
let gmailTokenClient = null;
let gmailAccessToken = null;
let forgotOtpValue = null;
let forgotOtpExpiresAt = 0;
let forgotOtpTimerHandle = null;
let forgotResetTicket = null;

let db = null;
let trades = [];
let fields = [];
let currentMode = "intraday";
let currentSection = "dashboardSection";
let editingTradeId = null;
let currentAttachments = [];

let currentReportPeriod = "daily";
let selectedReportCell = null;
let selectedReportColumn = null;
let selectedReportRange = null;
let reportData = {};
let reportSettings = {};
let brokerData = {headings:["Date","Amount Paid","Amount Received"],rows:[],widths:[120,150,170],rowHeights:{},cells:{},columnStyles:{},defaultStyle:{}};
let selectedBrokerCell = null;
let selectedBrokerColumn = null;
let selectedBrokerRange = null;

let graphMode = "intraday";
let graphType = "bar";
let graphPeriod = "month";
let graphRange = "";

let driveAccessToken = null;
let driveTokenClient = null;
let driveFolderId = null;
let driveBackupFileId = null;
let drivePendingResolve = null;
let drivePendingReject = null;

let eventsInitialized = false;
let databaseReady = false;
let databaseReadyPromise = null;
let tradeLedgerBooted = false;


const STANDARD_FIELDS = [
  {key:"date",label:"Date",section:"basic",type:"date"},
  {key:"exitDate",label:"Exit Date",section:"basic",type:"date"},
  {key:"voucherNumber",label:"Voucher Number",section:"basic",type:"text"},
  {key:"stockName",label:"Stock Name",section:"basic",type:"text"},
  {key:"capital",label:"Capital",section:"basic",type:"number"},
  {key:"leverage",label:"Leverage",section:"basic",type:"number"},
  {key:"strategy",label:"Strategy",section:"basic",type:"text"},
  {key:"riskReward",label:"Risk / Reward",section:"basic",type:"text"},
  {key:"tradeResult",label:"Trade Result",section:"basic",type:"text"},
  {key:"buyQty",label:"Buy Quantity",section:"buy",type:"number"},
  {key:"buyPrice",label:"Buy Price",section:"buy",type:"number"},
  {key:"buyStockValue",label:"Buy Stock Value",section:"buy",type:"number"},
  {key:"buyCharge",label:"Buy Charges",section:"buy",type:"number"},
  {key:"extraBuyCharge",label:"Extra Buy Charges",section:"buy",type:"number"},
  {key:"totalBuyCharges",label:"Total Buy Charges",section:"buy",type:"number"},
  {key:"totalBuyValue",label:"Total Buy Value",section:"buy",type:"number"},
  {key:"sellQty",label:"Sell Quantity",section:"sell",type:"number"},
  {key:"sellPrice",label:"Sell Price",section:"sell",type:"number"},
  {key:"sellStockValue",label:"Sell Stock Value",section:"sell",type:"number"},
  {key:"sellCharge",label:"Sell Charges",section:"sell",type:"number"},
  {key:"extraSellCharge",label:"Extra Sell Charges",section:"sell",type:"number"},
  {key:"totalSellCharges",label:"Total Sell Charges",section:"sell",type:"number"},
  {key:"totalSellValue",label:"Total Sell Value",section:"sell",type:"number"},
  {key:"priceMovement",label:"Price Movement",section:"pl",type:"number"},
  {key:"grossPL",label:"Gross Profit / Loss",section:"pl",type:"number"},
  {key:"totalCharges",label:"Total Charges",section:"pl",type:"number"},
  {key:"netPL",label:"Net Profit / Loss",section:"pl",type:"number"},
  {key:"notes",label:"Notes",section:"attachments",type:"textarea"}
];

const REPORT_HEADINGS = {
  daily:["Voucher Number","Date","Gross Profit","Charges","Net Profit"],
  weekly:["Voucher Number","Weeks","Gross Profit","Charges","Net Profit"],
  monthly:["Voucher Number","Month","Gross Profit","Charges","Net Profit"],
  yearly:["Voucher Number","Year","Gross Profit","Charges","Net Profit"]
};

const SPREADSHEET_DEFAULT_STYLE = {
  color:"#edf3fc",
  background:"#111c2e",
  fontSize:14,
  fontFamily:"Arial",
  align:"center",
  vertical:"middle",
  wrap:false
};

function cloneSpreadsheetStyle(style) {
  return {...SPREADSHEET_DEFAULT_STYLE,...(style || {})};
}

const SECTION_INFO = {
  basic:{container:"basicFieldsContainer",custom:"customBasicFields"},
  buy:{container:"buyFieldsContainer",custom:"customBuyFields"},
  sell:{container:"sellFieldsContainer",custom:"customSellFields"},
  pl:{container:"plFieldsContainer",custom:"customPLFields"},
  attachments:{container:"attachmentFieldsContainer",custom:"customAttachmentFields"}
};

/* ==========================================
   UTILITIES
========================================== */

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}

function numberValue(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function money(value) {
  return "₹" + numberValue(value).toFixed(2);
}

function makeId() {
  return "TL-" + Date.now().toString(36) +
    "-" + Math.random().toString(36).slice(2,8);
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"),2800);
}

function readJSON(key,fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch(error) {
    console.error("JSON read error:",key,error);
    return fallback;
  }
}

function writeJSON(key,value) {
  localStorage.setItem(key,JSON.stringify(value));
}

function getFormValue(id) {
  return $(id)?.value ?? "";
}

function requireDatabase() {
  if (!db || !databaseReady) throw new Error("Database is not ready.");
}

async function waitForDatabase() {
  if (databaseReady && db) return;
  if (databaseReadyPromise) await databaseReadyPromise;
  requireDatabase();
}

/* ==========================================
   INDEXED DB
   Existing stores are never deleted.
========================================== */

function requestResult(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error || new Error("IndexedDB request failed.")
    );
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve,reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error || new Error("Database transaction failed.")
    );
    transaction.onabort = () => reject(
      transaction.error || new Error("Database transaction aborted.")
    );
  });
}

function createMissingStores(database) {
  if (!database.objectStoreNames.contains("trades")) {
    database.createObjectStore("trades",{keyPath:"id"});
  }
  if (!database.objectStoreNames.contains("fields")) {
    database.createObjectStore("fields",{keyPath:"id"});
  }
  if (!database.objectStoreNames.contains("reports")) {
    database.createObjectStore("reports",{keyPath:"id"});
  }
}

async function openDatabase() {
  databaseReady = false;
  const first = await requestResult(indexedDB.open(DB_NAME));
  const required = ["trades","fields","reports"];
  const missing = required.some(name => !first.objectStoreNames.contains(name));

  if (!missing) {
    db = first;
  } else {
    const oldVersion = first.version;
    first.close();

    db = await new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME,oldVersion + 1);
      request.onupgradeneeded = event => createMissingStores(event.target.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("Database upgrade failed.")
      );
      request.onblocked = () => reject(
        new Error("Database upgrade is blocked. Close other TradeLedger tabs.")
      );
    });
  }

  for (const name of required) {
    if (!db.objectStoreNames.contains(name)) {
      db.close();
      db = null;
      throw new Error("Required database store missing: " + name);
    }
  }

  db.onversionchange = () => {
    databaseReady = false;
    db.close();
    showToast("Database updated. Reload TradeLedger.");
  };

  return db;
}

async function getAllFromStore(storeName) {
  if (!db || !db.objectStoreNames.contains(storeName)) {
    throw new Error("Database store unavailable: " + storeName);
  }
  const transaction = db.transaction(storeName,"readonly");
  return requestResult(transaction.objectStore(storeName).getAll());
}

async function putIntoStore(storeName,value) {
  await waitForDatabase();
  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error("Database store unavailable: " + storeName);
  }
  const transaction = db.transaction(storeName,"readwrite");
  const done = transactionComplete(transaction);
  transaction.objectStore(storeName).put(value);
  await done;
}

async function deleteFromStore(storeName,id) {
  await waitForDatabase();
  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error("Database store unavailable: " + storeName);
  }
  const transaction = db.transaction(storeName,"readwrite");
  const done = transactionComplete(transaction);
  transaction.objectStore(storeName).delete(id);
  await done;
}

async function loadDatabaseData() {
  trades = await getAllFromStore("trades");
  fields = await getAllFromStore("fields");
  ensureModeFieldSettings();
  reportData = readJSON(REPORTS_KEY,{});
  reportSettings = readJSON(REPORT_SETTINGS_KEY,{});

  ["daily","weekly","monthly","yearly"].forEach(period => {
    if (!Array.isArray(reportData[period])) reportData[period] = [];
  });
  loadBrokerData();
}

/* ==========================================
   REPORT STORAGE
========================================== */

function saveReportsLocally() {
  writeJSON(REPORTS_KEY,reportData);
  writeJSON(REPORT_SETTINGS_KEY,reportSettings);
}

async function saveReportToDatabase() {
  await putIntoStore("reports",{
    id:"main-reports",
    data:reportData,
    settings:reportSettings,
    updatedAt:new Date().toISOString()
  });
  saveReportsLocally();
}

async function loadReportsFromDatabase() {
  const records = await getAllFromStore("reports");
  const saved = records.find(item => item.id === "main-reports");

  if (saved) {
    reportData = saved.data || reportData;
    reportSettings = saved.settings || reportSettings;
  }

  ["daily","weekly","monthly","yearly"].forEach(period => {
    if (!Array.isArray(reportData[period])) reportData[period] = [];
  });
  loadBrokerData();
  Object.keys(reportHistory).forEach(period => { reportHistory[period].undo=[]; reportHistory[period].redo=[]; });
  brokerHistory.undo=[];
  brokerHistory.redo=[];

  saveReportsLocally();
}

/* ==========================================
   TRADING MODE / NAVIGATION
========================================== */

function ensureModeFieldManagerSections() {
  const base = $("fieldManagerSection");
  const intraday = $("intradayWorkspace");
  if (!base || !intraday) return;

  const definitions = [
    ["swingWorkspace", "swingFieldManagerSection", "swingFieldManagerList", "swingAddFieldBtn"],
    ["longtermWorkspace", "longtermFieldManagerSection", "longtermFieldManagerList", "longtermAddFieldBtn"]
  ];

  definitions.forEach(([workspaceId, sectionId, listId, buttonId]) => {
    const workspace = $(workspaceId);
    if (!workspace || $(sectionId)) return;
    const clone = base.cloneNode(true);
    clone.id = sectionId;
    const list = clone.querySelector("#fieldManagerList");
    if (list) {
      list.id = listId;
      list.classList.add("mode-field-manager-list");
    }
    const addButton = clone.querySelector("#addFieldBtn");
    if (addButton) {
      addButton.id = buttonId;
      addButton.classList.add("mode-add-field-btn");
    }
    workspace.appendChild(clone);
    const navButton = workspace.querySelector('[data-section="fieldManagerSection"]');
    if (navButton) navButton.dataset.section = sectionId;
  });

  const baseList = base.querySelector("#fieldManagerList");
  if (baseList) baseList.classList.add("mode-field-manager-list");
  const baseButton = base.querySelector("#addFieldBtn");
  if (baseButton) baseButton.classList.add("mode-add-field-btn");
}

function getModeFieldManagerSectionId(mode = currentMode) {
  if (mode === "swing") return "swingFieldManagerSection";
  if (mode === "longterm") return "longtermFieldManagerSection";
  return "fieldManagerSection";
}

function mountSharedTradeSections(workspaceId) {
  const workspace = $(workspaceId);
  const form = $("tradeFormSection");
  const journal = $("tradeJournalSection");
  const period = $("periodOverviewSection");
  const reports = $("reportsSection");
  const fieldManager = $(getModeFieldManagerSectionId());
  const graph = $("graphChartSection");
  if (!workspace || !form || !journal || !period || !reports || !fieldManager || !graph) return;

  // Keep the shared data logic, but always mount the visible sections only
  // inside the active workspace. This prevents Swing/Long Term from showing
  // Add Trade/Journal/Period/Reports/Field Manager underneath Dashboard.
  // Graph / Chart is a top-level page between Long Term Trading and Broker.
  // Do not move or hide it with the mode-specific shared sections.
  [form,journal,period,reports,fieldManager].forEach(section => {
    section.classList.remove("active");
    section.classList.add("hidden");
    section.parentElement?.appendChild(section);
  });

  workspace.appendChild(form);
  workspace.appendChild(journal);
  workspace.appendChild(period);
  workspace.appendChild(reports);
  workspace.appendChild(fieldManager);

  [form,journal,period,reports,fieldManager].forEach(section => {
    section.classList.remove("active");
    section.classList.add("hidden");
  });
  graph.classList.remove("active");
  graph.classList.add("hidden");

  renderStandardFormFields();
  renderCustomFormFields();
  renderJournal();
  renderPeriodOverview();
  renderFieldList();
}

function setModeNav(sectionId) {
  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.section === sectionId || button.dataset.modeDashboard === sectionId);
  });
}

function setWorkspaceTitle(mode) {
  const title = $("workspaceModeTitle");
  const subtitle = $("workspaceModeSubtitle");
  if (!title || !subtitle) return;
  const labels = {
    intraday:["Intraday Trading","Intraday trade journal"],
    swing:["Swing Trading","Swing trade journal"],
    longterm:["Long Term Trading","Long-term investment journal"]
  };
  const value = labels[mode] || labels.intraday;
  title.textContent = value[0];
  subtitle.textContent = value[1];
}

window.showTradeBookHome = showTradeBookHome;
function showTradeBookHome(){
  const home = $("tradeBookHome");
  if(!home) return;
  document.querySelectorAll(".workspace").forEach(w => w.classList.add("hidden"));
  $("graphChartSection")?.classList.add("hidden");
  $("graphChartSection")?.classList.remove("active");
  $("notificationsPage")?.classList.add("hidden");
  home.classList.remove("hidden");
  document.body.classList.add("tradebook-home-active");
  syncTopbarNavigation(true);
  document.body.classList.remove("graph-top-level-active");
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
  currentSection = "tradeBookHome";
  syncAccountUI(tradeBookAuthUser);
}
function hideTradeBookHome(){
  $("tradeBookHome")?.classList.add("hidden");
  document.body.classList.remove("tradebook-home-active");
  syncTopbarNavigation(false);
}

function syncTopbarNavigation(isHome){
  const homeBtn = $("newTradeBtn");
  if(!homeBtn) return;
  homeBtn.textContent = "Home";
  homeBtn.setAttribute("aria-label", "Home");
  homeBtn.title = "Go to Home";
  homeBtn.classList.toggle("hidden", Boolean(isHome));
  $("notificationBtn")?.classList.remove("hidden");
}
function setTradingMode(mode) {
  hideTradeBookHome();
  if (!["intraday","swing","longterm","graph","broker","backup","install","notifications"].includes(mode)) return;

  if (mode === "notifications") {
    document.querySelectorAll(".workspace").forEach(w => w.classList.add("hidden"));
    $("graphChartSection")?.classList.add("hidden");
    $("notificationsPage")?.classList.remove("hidden");
    document.body.classList.remove("tradebook-home-active", "graph-top-level-active");
    currentSection = "notificationsPage";
    return;
  }

  // Graph / Chart is a top-level navigation item, not a fourth trading mode.
  // Keep the currently selected trading workspace so the chart reads from the
  // correct mode, while the chart itself can switch Intraday/Swing/Long Term.
  if (mode === "graph") {
    if (!["intraday","swing","longterm"].includes(currentMode)) currentMode = graphMode || "intraday";

    // Graph / Chart is a completely independent top-level page.
    // Hide every trading workspace and every page-section inside those
    // workspaces before showing the graph. This prevents a previously
    // selected Field Manager / Journal / Reports section from remaining
    // visible underneath the Graph page on mobile.
    document.querySelectorAll(".workspace").forEach(workspace => {
      workspace.classList.add("hidden");
      workspace.querySelectorAll(".page-section").forEach(section => {
        section.classList.remove("active");
        section.classList.add("hidden");
      });
    });

    document.querySelectorAll(".mode-btn").forEach(button => {
      button.classList.toggle("active", button.dataset.mode === "graph");
    });

    // Remove any accidental Graph/Chart button from a workspace navigation.
    document.querySelectorAll(".workspace .nav-btn").forEach(button => {
      if ((button.textContent || "").trim().toLowerCase() === "graph / chart") {
        button.remove();
      }
    });

    const graphSection = $("graphChartSection");
    if (graphSection) {
      // Graph is top-level. Remove any workspace/page visibility state first,
      // then explicitly activate only the graph section.
      document.querySelectorAll(".app-container > .workspace").forEach(ws => {
        ws.classList.add("hidden");
        ws.querySelectorAll(".page-section").forEach(section => {
          section.classList.remove("active");
          section.classList.add("hidden");
        });
      });
      graphSection.classList.remove("hidden");
      graphSection.classList.add("active");
    }

    document.body.classList.add("graph-top-level-active");
    currentSection = "graphChartSection";
    graphMode = ["intraday","swing","longterm"].includes(graphMode) ? graphMode : "intraday";
    syncGraphControls();
    renderGraph();
    return;
  }

  currentMode = mode;
  // Returning from any top-level page (especially Graph / Chart) must always
  // land on the selected trading workspace dashboard. Never reuse the old
  // top-level section id, because that can route Intraday back to Graph.
  if (["intraday","swing","longterm"].includes(mode)) {
    currentSection = mode === "intraday" ? "dashboardSection" :
      (mode === "swing" ? "swingDashboardSection" : "longtermDashboardSection");
  }
  // Leaving the top-level Graph / Chart page hides it before the selected
  // trading workspace is shown again.
  $("graphChartSection")?.classList.add("hidden");
  $("graphChartSection")?.classList.remove("active");
  document.body.classList.remove("graph-top-level-active");
  ensureModeFieldSettings();
  document.querySelectorAll(".mode-btn").forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    if (active) {
      // Keep the selected top-level navigation item reachable on mobile.
      // This also fixes the small navigation bug where Graph/Broker could
      // leave the horizontal nav scrolled away from Intraday.
      try { button.scrollIntoView({behavior:"smooth", block:"nearest", inline:"center"}); } catch(ignore) {}
    }
  });

  ["intradayWorkspace","swingWorkspace","longtermWorkspace","brokerWorkspace","backupWorkspace","installWorkspace"].forEach(id => $(id)?.classList.add("hidden"));

  if (mode === "broker") {
    $("brokerWorkspace")?.classList.remove("hidden");
    currentSection = "brokerWorkspace";
    renderBrokerSheet();
    return;
  }

  if (mode === "install") {
    $("installWorkspace")?.classList.remove("hidden");
    currentSection = "installWorkspace";
    return;
  }

  if (mode === "backup") {
    $("backupWorkspace")?.classList.remove("hidden");
    currentSection = "backupWorkspace";
    updateDriveStatus();
    return;
  }

  // Add Trade and Journal are shared sections. Move the same DOM nodes into
  // the active trading workspace so IndexedDB data, Field Manager, custom
  // fields, attachments and calculations remain one unified implementation.
  const workspaceId = mode === "intraday" ? "intradayWorkspace" : mode === "swing" ? "swingWorkspace" : "longtermWorkspace";
  mountSharedTradeSections(workspaceId);
  $(workspaceId)?.classList.remove("hidden");
  setWorkspaceTitle(mode);

  if (mode === "swing" || mode === "longterm") {
    const dashboardId = mode === "swing" ? "swingDashboardSection" : "longtermDashboardSection";
    currentSection = dashboardId;
    const workspace = $(workspaceId);
    workspace?.querySelectorAll(".page-section").forEach(section => {
      const active = section.id === dashboardId;
      section.classList.toggle("active", active);
      section.classList.toggle("hidden", !active);
    });
    setModeNav(dashboardId);
    renderModeDashboard(mode);
  } else {
    if (["swingDashboardSection","longtermDashboardSection"].includes(currentSection)) currentSection = "dashboardSection";
    showSection(currentSection);
  }

  if (mode !== "backup") {
    renderDashboard();
    renderJournal();
    renderFieldList();
  }
}

function getPerformanceDate(trade) {
  // Intraday keeps the entry/trade date. Swing and Long Term use Exit Date
  // for performance ordering and period-based views, with a safe fallback
  // to the existing trade date for older records.
  if (currentMode === "swing" || currentMode === "longterm") {
    return trade.exitDate ||
      trade.customValues?.exitDate ||
      trade.customValues?.exit_date ||
      trade.date ||
      "";
  }
  return trade.date || "";
}

function getDashboardDate(trade) {
  return getPerformanceDate(trade);
}

function renderModeDashboard(mode) {
  const list = trades.filter(trade => (trade.mode || "intraday") === mode);
  const total = list.length;
  const gross = list.reduce((s,t) => s + numberValue(t.grossPL),0);
  const charges = list.reduce((s,t) => s + numberValue(t.totalCharges),0);
  const net = list.reduce((s,t) => s + numberValue(t.netPL),0);
  const wins = list.filter(t => numberValue(t.netPL) > 0).length;
  const losses = list.filter(t => numberValue(t.netPL) < 0).length;
  const winRate = total ? wins / total * 100 : 0;
  const lossRate = total ? losses / total * 100 : 0;
  const prefix = mode === "swing" ? "swing" : "longterm";
  const values = {
    [`${prefix}DashTotalTrades`]: total,
    [`${prefix}DashWins`]: wins,
    [`${prefix}DashLosses`]: losses,
    [`${prefix}DashWinRate`]: winRate.toFixed(1) + "%",
    [`${prefix}DashLossRate`]: lossRate.toFixed(1) + "%",
    [`${prefix}DashGrossPL`]: money(gross),
    [`${prefix}DashCharges`]: money(charges),
    [`${prefix}DashNetPL`]: money(net)
  };
  Object.entries(values).forEach(([id,value]) => {
    if ($(id)) $(id).textContent = value;
  });
  const netEl = $(`${prefix}DashNetPL`);
  if (netEl) netEl.className = net >= 0 ? "profit" : "loss";
}

function renderModeWorkspace() {
  renderModeDashboard(currentMode);
}

function showSection(sectionId) {
  if (sectionId === "graphChartSection") {
    setTradingMode("graph");
    return;
  }

  const target = $(sectionId);
  if (!target) {
    console.warn("TradeBook section not found:",sectionId);
    return;
  }

  currentSection = sectionId;

  // Workspaces contain mode-specific dashboard sections plus the shared
  // Add Trade / Journal sections. Scope the active-state change to the
  // currently visible workspace so another hidden workspace cannot override
  // the section that was just selected.
  const activeWorkspace = $(
    currentMode === "intraday" ? "intradayWorkspace" :
    currentMode === "swing" ? "swingWorkspace" :
    currentMode === "longterm" ? "longtermWorkspace" :
    "backupWorkspace"
  );

  if (activeWorkspace) {
    activeWorkspace.querySelectorAll(".page-section").forEach(section => {
      const active = section === target;
      section.classList.toggle("active", active);
      section.classList.toggle("hidden", !active);
    });

    activeWorkspace.querySelectorAll(".nav-btn").forEach(button => {
      button.classList.toggle("active",
        button.dataset.section === sectionId ||
        button.dataset.modeDashboard === sectionId
      );
    });
  } else {
    document.querySelectorAll(".page-section").forEach(section => {
      section.classList.toggle("active",section.id === sectionId);
    });
  }

  if (sectionId === "reportsSection") renderReportTable();
  if (sectionId === "fieldManagerSection") {
    renderFieldList();
    // Ensure the active mode's Field Manager content is mounted and visible.
    const activeWorkspace = currentMode === "intraday" ? $("intradayWorkspace") :
      currentMode === "swing" ? $("swingWorkspace") : $("longtermWorkspace");
    const fm = activeWorkspace?.querySelector("#fieldManagerSection");
    if (fm) fm.classList.add("active");
  }
  if (sectionId === "tradeFormSection") {
    renderStandardFormFields();
    renderCustomFormFields();
    calculateTrade();
  }
  if (sectionId === "tradeJournalSection") renderJournal();
  if (sectionId === "periodOverviewSection") renderPeriodOverview();
  if (sectionId === "graphChartSection") {
    graphMode = ["intraday","swing","longterm"].includes(currentMode) ? currentMode : "intraday";
    syncGraphControls();
    renderGraph();
  }
}

/* ==========================================
   TRADE CALCULATIONS
========================================== */

function calculateTrade() {
  const buyQty = numberValue($("buyQty")?.value);
  const buyPrice = numberValue($("buyPrice")?.value);
  const buyCharge = numberValue($("buyCharge")?.value);
  const extraBuyCharge = numberValue($("extraBuyCharge")?.value);
  const sellQty = numberValue($("sellQty")?.value);
  const sellPrice = numberValue($("sellPrice")?.value);
  const sellCharge = numberValue($("sellCharge")?.value);
  const extraSellCharge = numberValue($("extraSellCharge")?.value);

  const buyStockValue = buyQty * buyPrice;
  const sellStockValue = sellQty * sellPrice;
  const totalBuyCharges = buyCharge + extraBuyCharge;
  const totalSellCharges = sellCharge + extraSellCharge;
  const totalBuyValue = buyStockValue + totalBuyCharges;
  const totalSellValue = sellStockValue - totalSellCharges;
  const matchedQty = Math.min(buyQty,sellQty);
  const grossPL = matchedQty * (sellPrice - buyPrice);
  const totalCharges = totalBuyCharges + totalSellCharges;
  const netPL = grossPL - totalCharges;
  const priceMovement = sellPrice - buyPrice;

  const values = {
    buyStockValue,totalBuyCharges,totalBuyValue,
    sellStockValue,totalSellCharges,totalSellValue,
    priceMovement,grossPL,totalCharges,netPL
  };

  Object.entries(values).forEach(([id,value]) => {
    const target = $(
      id === "grossPL" ? "grossPLInput" :
      id === "totalCharges" ? "totalChargesInput" :
      id === "netPL" ? "netPLInput" : id
    );
    if (target) target.value = value.toFixed(2);
  });

  return values;
}

/* ==========================================
   TRADE FORM / CUSTOM FIELD VALUES
========================================== */

function getCustomFieldValues() {
  const existing = editingTradeId
    ? (trades.find(item => item.id === editingTradeId)?.customValues || {})
    : {};
  const values = {...existing};
  fields.filter(field => (field.mode || "intraday") === currentMode).forEach(field => {
    const element = $("custom_" + field.id);
    if (element) values[field.id] = element.value;
  });
  return values;
}

function getStandardFieldSettings(key) {
  return getFieldSettings()[key] || {};
}

function isStandardFieldDeleted(key) {
  return Boolean(getStandardFieldSettings(key).deleted);
}

function isStandardFieldHidden(key) {
  return Boolean(getStandardFieldSettings(key).hidden);
}

function getStandardFieldPosition(key) {
  const saved = getStandardFieldSettings(key);
  const defaultPosition = getModeStandardFields().findIndex(item => item.key === key) + 1;
  return numberValue(saved.position) || defaultPosition;
}

function getStandardFieldsForForm() {
  return getModeStandardFields()
    .filter(field => !isStandardFieldDeleted(field.key))
    .sort((a,b) => getStandardFieldPosition(a.key) - getStandardFieldPosition(b.key));
}

function getAllJournalFields() {
  const settings = getFieldSettings();
  const standard = getModeStandardFields()
    .filter(field => !settings[field.key]?.deleted && !settings[field.key]?.hidden)
    .map(field => ({
      key:field.key,
      label:settings[field.key]?.label || field.label,
      type:field.type,
      standard:true,
      position:getStandardFieldPosition(field.key)
    }));

  const custom = fields
    .filter(field => (field.mode || "intraday") === currentMode && field.inForm !== false && !field.hidden)
    .map(field => ({
      key:"custom:" + field.id,
      customId:String(field.id),
      label:field.label || field.name || "Custom Field",
      type:field.type || "text",
      standard:false,
      position:numberValue(field.position) || 9999
    }));

  return [...standard,...custom].sort((a,b) => a.position - b.position || String(a.key).localeCompare(String(b.key)));
}

function createStandardInput(field) {
  const settings = getStandardFieldSettings(field.key);
  const label = field.key === "date" ? "Entry Date" : (settings.label || field.label);
  const placeholder = settings.placeholder || "";
  const readonly = ["buyStockValue","totalBuyCharges","totalBuyValue","sellStockValue","totalSellCharges","totalSellValue","priceMovement","grossPL","totalCharges","netPL"].includes(field.key);

  const labelElement = document.createElement("label");
  if (field.key === "notes") labelElement.classList.add("full-width");
  labelElement.dataset.standardField = field.key;
  labelElement.appendChild(document.createTextNode(label + (field.type === "number" ? " (₹)" : "")));

  let input;
  if (field.key === "tradeResult") {
    input = document.createElement("select");
    input.innerHTML = '<option value="">Select result</option><option value="Win">Win</option><option value="Loss">Loss</option><option value="Breakeven">Breakeven</option>';
  } else if (field.type === "select") {
    input = document.createElement("select");
    const options = Array.isArray(field.options) ? field.options : [];
    input.innerHTML = '<option value="">Select</option>' + options.map(option => `<option value="${safeText(option)}">${safeText(option)}</option>`).join("");
  } else if (field.type === "textarea") {
    input = document.createElement("textarea");
    input.rows = 3;
  } else {
    input = document.createElement("input");
    input.type = field.type === "number" ? "number" : field.type;
    if (field.type === "number") input.step = "any";
    if (["capital","buyQty","sellQty","buyCharge","extraBuyCharge","sellCharge","extraSellCharge","leverage"].includes(field.key)) input.min = "0";
  }

  input.id = field.key === "date" ? "tradeDate" : field.key === "grossPL" ? "grossPLInput" : field.key === "totalCharges" ? "totalChargesInput" : field.key === "netPL" ? "netPLInput" : field.key;
  const defaultPlaceholders = {
    buyCharge: "eg :- 5",
    extraBuyCharge: "eg :- 2",
    sellCharge: "eg :- 5",
    extraSellCharge: "eg :- 2"
  };
  input.placeholder = placeholder || defaultPlaceholders[field.key] || "";
  input.readOnly = readonly;
  if (!readonly && field.key !== "leverage") input.required = true;
  if (field.key === "tradeDate") input.required = true;
  if (field.key === "exitDate" && currentMode !== "intraday") input.required = true;
  if (field.key === "stockName") input.required = true;
  if (field.key === "leverage" && !input.value) input.value = "1";
  // Charge inputs intentionally start empty. Empty means zero for calculations,
  // but the user can type a charge directly without first deleting a visible 0.
  if (["buyCharge","extraBuyCharge","sellCharge","extraSellCharge"].includes(field.key)) input.value = "";
  labelElement.appendChild(input);
  return labelElement;
}

function renderStandardFormFields() {
  Object.values(SECTION_INFO).forEach(info => {
    const container = $(info.container);
    if (container) container.innerHTML = "";
  });

  getStandardFieldsForForm().forEach(field => {
    const info = SECTION_INFO[field.section];
    const container = info ? $(info.container) : null;
    if (!container) return;
    container.appendChild(createStandardInput(field));
  });

  // Attachment controls remain standard UI controls but are not trade-value fields.
  const attachmentContainer = $(SECTION_INFO.attachments.container);
  if (attachmentContainer) {
    const chart = document.createElement("label");
    chart.innerHTML = 'Chart Images<input type="file" id="chartImages" accept="image/*" multiple>';
    attachmentContainer.appendChild(chart);
    const contract = document.createElement("label");
    contract.innerHTML = 'Contract Note<input type="file" id="contractNote" accept="image/*,.pdf">';
    attachmentContainer.appendChild(contract);
    const info = document.createElement("div");
    info.id = "attachmentInfo";
    info.className = "full-width muted-text";
    attachmentContainer.appendChild(info);
  }

  const tradeDate = $("tradeDate");
  if (tradeDate && !tradeDate.value) tradeDate.value = new Date().toISOString().slice(0,10);
  ["buyQty","buyPrice","buyCharge","extraBuyCharge","sellQty","sellPrice","sellCharge","extraSellCharge"].forEach(id => {
    $(id)?.addEventListener("input",calculateTrade);
  });
  $("chartImages")?.addEventListener("change",handleAttachmentChange);
  $("contractNote")?.addEventListener("change",handleAttachmentChange);
}


function renderCustomFormFields() {
  Object.values(SECTION_INFO).forEach(info => {
    const container = $(info.custom);
    if (container) container.innerHTML = "";
  });

  const ordered = [...fields]
    .filter(field => (field.mode || "intraday") === currentMode && field.inForm !== false)
    .sort((a,b) => numberValue(a.position) - numberValue(b.position) || String(a.id).localeCompare(String(b.id)));

  ordered.forEach(field => {
    const info = SECTION_INFO[field.section] || SECTION_INFO.basic;
    const container = $(info.custom);
    if (!container) return;

    const label = document.createElement("label");
    label.dataset.customField = String(field.id);
    if (field.type === "textarea") label.classList.add("full-width");
    label.appendChild(document.createTextNode(field.label || field.name || "Custom Field"));

    let input;
    if (field.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
    } else if (field.type === "select") {
      input = document.createElement("select");
      const options = Array.isArray(field.options) ? field.options : [];
      input.innerHTML = '<option value="">Select</option>' + options.map(option =>
        `<option value="${safeText(option)}">${safeText(option)}</option>`
      ).join("");
    } else {
      input = document.createElement("input");
      input.type = ["number","date","text","email","url","tel"].includes(field.type) ? field.type : "text";
      if (field.type === "number") input.step = "any";
    }

    input.id = "custom_" + field.id;
    input.name = "custom_" + field.id;
    input.placeholder = field.placeholder || "";
    input.required = Boolean(field.required);
    label.appendChild(input);
    container.appendChild(label);
  });
}

function collectTradeData() {
  const calculated = calculateTrade();
  return {
    id:editingTradeId || makeId(),
    mode:currentMode,
    date:getFormValue("tradeDate"),
    exitDate:currentMode === "intraday" ? "" : getFormValue("exitDate"),
    voucherNumber:getFormValue("voucherNumber"),
    stockName:getFormValue("stockName"),
    capital:numberValue(getFormValue("capital")),
    leverage:currentMode === "intraday" ? numberValue(getFormValue("leverage")) : 0,
    strategy:getFormValue("strategy"),
    riskReward:getFormValue("riskReward"),
    tradeResult:getFormValue("tradeResult"),
    buyQty:numberValue(getFormValue("buyQty")),
    buyPrice:numberValue(getFormValue("buyPrice")),
    buyStockValue:calculated.buyStockValue,
    buyCharge:numberValue(getFormValue("buyCharge")),
    extraBuyCharge:numberValue(getFormValue("extraBuyCharge")),
    totalBuyCharges:calculated.totalBuyCharges,
    totalBuyValue:calculated.totalBuyValue,
    sellQty:numberValue(getFormValue("sellQty")),
    sellPrice:numberValue(getFormValue("sellPrice")),
    sellStockValue:calculated.sellStockValue,
    sellCharge:numberValue(getFormValue("sellCharge")),
    extraSellCharge:numberValue(getFormValue("extraSellCharge")),
    totalSellCharges:calculated.totalSellCharges,
    totalSellValue:calculated.totalSellValue,
    priceMovement:calculated.priceMovement,
    grossPL:calculated.grossPL,
    totalCharges:calculated.totalCharges,
    netPL:calculated.netPL,
    notes:getFormValue("notes"),
    customValues:getCustomFieldValues(),
    attachments:currentAttachments,
    updatedAt:new Date().toISOString()
  };
}

function validateTradeFormBeforeSave() {
  const form = $("tradeForm");
  if (!form) return {ok:true};

  const missing = [];
  const controls = form.querySelectorAll("input, select, textarea");

  controls.forEach(control => {
    const type = String(control.type || "").toLowerCase();
    if (control.disabled || type === "hidden" || control.readOnly) return;
    if (type === "file") return;

    const label = control.closest("label");
    const labelText = label?.firstChild?.textContent?.trim() ||
      label?.querySelector(".field-label")?.textContent?.trim() ||
      control.getAttribute("aria-label") ||
      control.id || "Field";

    if (!String(control.value || "").trim()) missing.push(labelText.replace(/\s+\(₹\)$/, ""));
  });

  // Attachments are part of the complete Add Trade form. A saved trade must
  // have at least one attachment, including when editing an existing trade.
  if (!Array.isArray(currentAttachments) || currentAttachments.length === 0) {
    missing.push("Attachments");
  }

  if (missing.length) {
    const unique = [...new Set(missing)];
    showToast(
      "Please fill: " + unique.join(", ") + ". Then fill the missing field(s) and try again.",
      5200
    );
    return {ok:false, missing:unique};
  }

  return {ok:true};
}

async function saveTrade(event) {
  event.preventDefault();

  const validation = validateTradeFormBeforeSave();
  if (!validation.ok) return;

  if (!getFormValue("stockName").trim()) {
    showToast("Please enter stock name.");
    return;
  }

  const trade = collectTradeData();

  if (!trade.date) {
    showToast("Please select trade date.");
    return;
  }
  if (trade.buyQty < 0 || trade.sellQty < 0) {
    showToast("Quantity cannot be negative.");
    return;
  }
  if (trade.sellQty > trade.buyQty) {
    showToast("Sell quantity cannot exceed buy quantity.");
    return;
  }

  try {
    const index = trades.findIndex(item => item.id === trade.id);
    if (index < 0) trade.createdAt = new Date().toISOString();

    await putIntoStore("trades",trade);

    if (index >= 0) trades[index] = trade;
    else trades.push(trade);

    showToast(index >= 0 ? "Trade updated." : "Trade saved.");
    resetForm();
    await renderEverything();
    showSection("tradeJournalSection");
  } catch(error) {
    console.error(error);
    showToast("Unable to save trade: " + error.message);
  }
}

function resetForm() {
  $("tradeForm")?.reset();
  editingTradeId = null;
  currentAttachments = [];

  if ($("tradeId")) $("tradeId").value = "";
  if ($("leverage")) $("leverage").value = "1";

  ["buyCharge","extraBuyCharge","sellCharge","extraSellCharge"].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("tradeFormTitle")) $("tradeFormTitle").textContent = "Add Trade";
  if ($("saveTradeBtn")) $("saveTradeBtn").textContent = "Save Trade";
  if ($("attachmentInfo")) $("attachmentInfo").textContent = "";

  renderCustomFormFields();
  calculateTrade();
}

function editTrade(id) {
  const trade = trades.find(item => item.id === id);
  if (!trade) return;

  editingTradeId = id;
  currentMode = trade.mode || "intraday";
  setTradingMode(currentMode);

  const mapping = {
    tradeDate:trade.date,
    exitDate:trade.exitDate || "",
    voucherNumber:trade.voucherNumber,
    stockName:trade.stockName,
    capital:trade.capital,
    leverage:trade.leverage,
    strategy:trade.strategy,
    riskReward:trade.riskReward,
    tradeResult:trade.tradeResult,
    buyQty:trade.buyQty,
    buyPrice:trade.buyPrice,
    buyCharge:trade.buyCharge || "",
    extraBuyCharge:trade.extraBuyCharge || "",
    sellQty:trade.sellQty,
    sellPrice:trade.sellPrice,
    sellCharge:trade.sellCharge || "",
    extraSellCharge:trade.extraSellCharge || "",
    notes:trade.notes
  };

  Object.entries(mapping).forEach(([key,value]) => {
    if ($(key)) $(key).value = value ?? "";
  });

  if ($("tradeId")) $("tradeId").value = trade.id;

  currentAttachments = Array.isArray(trade.attachments)
    ? [...trade.attachments] : [];

  renderCustomFormFields();

  fields.filter(field => (field.mode || "intraday") === currentMode).forEach(field => {
    const element = $("custom_" + field.id);
    if (element) element.value = trade.customValues?.[field.id] ?? "";
  });

  calculateTrade();
  if ($("tradeFormTitle")) $("tradeFormTitle").textContent = "Edit Trade";
  if ($("saveTradeBtn")) $("saveTradeBtn").textContent = "Update Trade";
  showSection("tradeFormSection");
}

async function removeTrade(id) {
  const trade = trades.find(item => item.id === id);
  if (!trade) return;
  if (!confirm("Delete trade " + (trade.stockName || "") + "?")) return;

  try {
    await deleteFromStore("trades",id);
    trades = trades.filter(item => item.id !== id);
    showToast("Trade deleted.");
    await renderEverything();
  } catch(error) {
    showToast("Delete failed: " + error.message);
  }
}

function attachmentSummary(trade) {
  const list = Array.isArray(trade.attachments) ? trade.attachments : [];
  return list.length ? list.map(item => item.name || item.type || "Attachment").join(", ") : "";
}

function formatJournalValue(field,trade) {
  let value;
  if (field.standard) value = trade[field.key];
  else value = trade.customValues?.[field.customId];
  if (["buyPrice","sellPrice","capital","buyStockValue","buyCharge","extraBuyCharge","totalBuyCharges","totalBuyValue","sellStockValue","sellCharge","extraSellCharge","totalSellCharges","totalSellValue","priceMovement","grossPL","totalCharges","netPL"].includes(field.key)) return money(value);
  if (field.key === "attachments") return attachmentSummary(trade);
  return value ?? "";
}

function getTradeAttachmentsByCategory(trade, category) {
  const list = Array.isArray(trade?.attachments) ? trade.attachments : [];
  return list.filter(item => {
    const itemCategory = String(item?.category || "").toLowerCase();
    const itemType = String(item?.type || "").toLowerCase();
    const itemName = String(item?.name || "").toLowerCase();

    if (category === "chart") {
      return itemCategory === "chart" ||
        itemType.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(itemName);
    }

    if (category === "contract") {
      return itemCategory === "contract" ||
        itemType === "application/pdf" ||
        /\.pdf$/i.test(itemName);
    }

    return false;
  });
}

function renderViewChooser(trade) {
  const content = $("viewTradeContent");
  if (!content) return;

  const chartAttachments = getTradeAttachmentsByCategory(trade, "chart");
  const contractAttachments = getTradeAttachmentsByCategory(trade, "contract");

  const options = [
    `<button type="button" class="view-choice-btn" data-view-choice="details">
      <span class="view-choice-title">Trade Details</span>
      <span class="view-choice-sub">View complete trade information</span>
    </button>`
  ];

  if (contractAttachments.length) {
    options.push(
      `<button type="button" class="view-choice-btn" data-view-choice="contract">
        <span class="view-choice-title">Contact Note</span>
        <span class="view-choice-sub">${contractAttachments.length} file${contractAttachments.length === 1 ? "" : "s"}</span>
      </button>`
    );
  }

  if (chartAttachments.length) {
    options.push(
      `<button type="button" class="view-choice-btn" data-view-choice="chart">
        <span class="view-choice-title">Image / Chart</span>
        <span class="view-choice-sub">${chartAttachments.length} image${chartAttachments.length === 1 ? "" : "s"}</span>
      </button>`
    );
  }

  content.innerHTML = `
    <div class="view-choice-grid">
      ${options.join("")}
    </div>
  `;

  const heading = $("viewModal")?.querySelector(".modal-heading h2");
  if (heading) heading.textContent = "View";
}

function renderTradeDetailsView(trade) {
  const content = $("viewTradeContent");
  if (!content) return;

  const fieldsForView = getAllJournalFields();
  const rows = fieldsForView.map(field => [field.label,formatJournalValue(field,trade)]);
  rows.push(["Chart / Contract Attachments",attachmentSummary(trade)]);

  content.innerHTML = `
    <div class="view-subnav">
      <button type="button" class="secondary-btn view-back-btn" data-view-choice="back">← Back</button>
    </div>
    <div class="table-wrap"><table><tbody>
      ${rows.map(([label,value]) => `<tr><th>${safeText(label)}</th><td>${safeText(value)}</td></tr>`).join("")}
    </tbody></table></div>
  `;

  const heading = $("viewModal")?.querySelector(".modal-heading h2");
  if (heading) heading.textContent = "Trade Details";
}

function dataUrlToBlob(dataUrl) {
  const value = String(dataUrl || "");
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/i);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = /;base64,/i.test(value);
  try {
    if (isBase64) {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], {type:mime});
    }
    return new Blob([decodeURIComponent(match[2])], {type:mime});
  } catch (error) {
    return null;
  }
}

function downloadAttachment(item) {
  const data = String(item?.data || "");
  const name = String(item?.name || "TradeBook-Attachment");
  if (!data) {
    showToast("Attachment data is unavailable.");
    return;
  }

  const blob = dataUrlToBlob(data);
  const url = blob ? URL.createObjectURL(blob) : data;
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (blob) setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function openImageFullScreen(item) {
  const data = String(item?.data || "");
  const name = safeText(item?.name || "Image / Chart");
  if (!data) return;

  const existing = document.getElementById("attachmentImageLightbox");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.id = "attachmentImageLightbox";
  overlay.className = "attachment-image-lightbox";
  overlay.innerHTML = `
    <div class="attachment-image-lightbox-inner">
      <div class="attachment-image-lightbox-head">
        <strong>${name}</strong>
        <button type="button" class="icon-btn" data-close-attachment-lightbox aria-label="Close">×</button>
      </div>
      <div class="attachment-image-lightbox-body">
        <img src="${data}" alt="${name}">
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("[data-close-attachment-lightbox]")?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
}

function renderAttachmentView(trade, category) {
  const content = $("viewTradeContent");
  if (!content) return;

  const list = getTradeAttachmentsByCategory(trade, category);
  const title = category === "contract" ? "Contact Note" : "Image / Chart";

  if (!list.length) {
    renderViewChooser(trade);
    showToast("No attachment found.");
    return;
  }

  const items = list.map((item, index) => {
    const data = String(item?.data || "");
    const name = safeText(item?.name || `${title} ${index + 1}`);
    const rawType = String(item?.type || "").toLowerCase();
    const isPdf = category === "contract" || rawType === "application/pdf" || /\.pdf$/i.test(item?.name || "");

    if (isPdf) {
      return `
        <div class="attachment-preview-card">
          <div class="attachment-preview-head">
            <div class="attachment-preview-name">${name}</div>
            <button type="button" class="secondary-btn attachment-download-btn"
              data-download-attachment="${index}">Download</button>
          </div>
          <div class="attachment-pdf-wrap">
            <iframe class="attachment-pdf-frame" src="${data}" title="${name}"></iframe>
          </div>
          <div class="attachment-open-row">
            <a class="secondary-btn attachment-open-btn" href="${data}" target="_blank" rel="noopener">Open PDF</a>
          </div>
        </div>
      `;
    }

    return `
      <div class="attachment-preview-card">
        <div class="attachment-preview-head">
          <div class="attachment-preview-name">${name}</div>
          <button type="button" class="secondary-btn attachment-download-btn"
            data-download-attachment="${index}">Download</button>
        </div>
        <button type="button" class="attachment-image-button" data-full-image="${index}" aria-label="View full image">
          <img class="attachment-preview-image" src="${data}" alt="${name}">
        </button>
      </div>
    `;
  }).join("");

  content.innerHTML = `
    <div class="view-subnav">
      <button type="button" class="secondary-btn view-back-btn" data-view-choice="back">← Back</button>
    </div>
    <div class="attachment-preview-list">${items}</div>
  `;

  content.querySelectorAll("[data-download-attachment]").forEach(button => {
    button.addEventListener("click", () => {
      const item = list[Number(button.dataset.downloadAttachment)];
      downloadAttachment(item);
    });
  });

  content.querySelectorAll("[data-full-image]").forEach(button => {
    button.addEventListener("click", () => {
      const item = list[Number(button.dataset.fullImage)];
      openImageFullScreen(item);
    });
  });

  const heading = $("viewModal")?.querySelector(".modal-heading h2");
  if (heading) heading.textContent = title;
}

function viewTrade(id) {
  const trade = trades.find(item => item.id === id);
  const content = $("viewTradeContent");
  if (!trade || !content) return;

  content.dataset.viewTradeId = String(id);
  renderViewChooser(trade);
  $("viewModal")?.classList.remove("hidden");
}

/* ==========================================
   JOURNAL
========================================== */

function getVisibleTrades() {
  return trades.filter(trade => (trade.mode || "intraday") === currentMode);
}

function renderJournal() {
  const head = $("journalHead");
  const body = $("journalBody");
  if (!head || !body) return;

  const search = getFormValue("journalSearch").toLowerCase().trim();
  const columns = getAllJournalFields();
  columns.push({key:"attachments",label:"Attachments",standard:true,position:999999});

  head.innerHTML = `<tr>${columns.map(column => `<th>${safeText(column.label)}</th>`).join("")}<th>Actions</th></tr>`;

  const visible = getVisibleTrades().filter(trade => {
    const searchable = [
      trade.stockName,trade.voucherNumber,trade.notes,trade.strategy,
      ...Object.values(trade.customValues || {})
    ].join(" ").toLowerCase();
    return searchable.includes(search);
  }).sort((a,b) => String(getPerformanceDate(b) || "").localeCompare(String(getPerformanceDate(a) || "")));

  if ($("journalTradeCount")) $("journalTradeCount").textContent = visible.length + " trades";
  if (!visible.length) {
    body.innerHTML = `<tr><td colspan="${columns.length + 1}" class="empty-cell">No trades found.</td></tr>`;
    return;
  }

  body.innerHTML = visible.map(trade => `<tr>
    ${columns.map(column => `<td>${safeText(formatJournalValue(column,trade))}</td>`).join("")}
    <td><div class="table-action">
      <button class="small-btn" data-view-trade="${safeText(trade.id)}">View</button>
      <button class="small-btn" data-edit-trade="${safeText(trade.id)}">Edit</button>
      <button class="small-btn" data-delete-trade="${safeText(trade.id)}">Delete</button>
    </div></td>
  </tr>`).join("");
}

/* ==========================================
   DASHBOARD - EXACTLY 8 METRICS
   Eight dashboard metrics only
========================================== */

function renderDashboard() {
  const list = getVisibleTrades();
  const total = list.length;
  const gross = list.reduce((s,t) => s + numberValue(t.grossPL),0);
  const charges = list.reduce((s,t) => s + numberValue(t.totalCharges),0);
  const net = list.reduce((s,t) => s + numberValue(t.netPL),0);
  const wins = list.filter(t => numberValue(t.netPL) > 0).length;
  const losses = list.filter(t => numberValue(t.netPL) < 0).length;
  const winRate = total ? wins / total * 100 : 0;
  const lossRate = total ? losses / total * 100 : 0;

  const values = {
    dashTotalTrades:total,
    dashWins:wins,
    dashLosses:losses,
    dashWinRate:winRate.toFixed(1) + "%",
    dashLossRate:lossRate.toFixed(1) + "%",
    dashGrossPL:money(gross),
    dashCharges:money(charges),
    dashNetPL:money(net)
  };

  Object.entries(values).forEach(([id,value]) => {
    if ($(id)) $(id).textContent = value;
  });

  if ($("dashNetPL")) {
    $("dashNetPL").className = net >= 0 ? "profit" : "loss";
  }
}

/* ==========================================
   PERIOD OVERVIEW
========================================== */

function renderPeriodOverview() {
  const start = getFormValue("periodStartDate");
  const end = getFormValue("periodEndDate");

  const filtered = getVisibleTrades().filter(trade => {
    // Swing + Long Term use Exit Date for period performance. Older records
    // without Exit Date fall back to the stored trade date in
    // getPerformanceDate(), preserving existing data.
    const performanceDate = getPerformanceDate(trade);
    if (start && performanceDate < start) return false;
    if (end && performanceDate > end) return false;
    return true;
  });

  const gross = filtered.reduce((s,t) => s + numberValue(t.grossPL),0);
  const charges = filtered.reduce((s,t) => s + numberValue(t.totalCharges),0);
  const net = filtered.reduce((s,t) => s + numberValue(t.netPL),0);

  if ($("periodGrossPL")) $("periodGrossPL").textContent = money(gross);
  if ($("periodTotalCharges")) $("periodTotalCharges").textContent = money(charges);
  if ($("periodNetPL")) $("periodNetPL").textContent = money(net);
  if ($("periodMessage")) {
    $("periodMessage").textContent =
      filtered.length + " trades in selected period.";
  }
}

/* ==========================================
   BROKER TRANSACTION DETAILS - SHEETS STYLE
========================================== */

function defaultBrokerData(){
  return {headings:["Date","Amount Received","Amount Paid"],rows:[],widths:[120,120,120],rowHeights:{},cells:{},columnStyles:{},merges:[]};
}
function loadBrokerData(){
  const saved=readJSON(BROKER_DATA_KEY,null);
  brokerData=saved && Array.isArray(saved.headings) ? saved : defaultBrokerData();
  // Migrate the previous Broker column order without losing existing values.
  if (brokerData.headings.length >= 3 && brokerData.headings[0] === "Date" && brokerData.headings[1] === "Amount Paid" && brokerData.headings[2] === "Amount Received") {
    brokerData.rows = (brokerData.rows || []).map(row => [row?.[0] ?? "", row?.[2] ?? "", row?.[1] ?? ""]);
    const oldWidths = Array.isArray(brokerData.widths) ? brokerData.widths : [];
    brokerData.widths = [oldWidths[0] || 120, oldWidths[2] || 170, oldWidths[1] || 150];
    const oldCells = brokerData.cells || {};
    const newCells = {};
    Object.entries(oldCells).forEach(([key, value]) => {
      const [row, col] = key.split(":").map(Number);
      if (col === 0) newCells[row + ":0"] = value;
      else if (col === 1) newCells[row + ":2"] = value;
      else if (col === 2) newCells[row + ":1"] = value;
    });
    brokerData.cells = newCells;
    const oldStyles = brokerData.columnStyles || {};
    brokerData.columnStyles = {0: oldStyles[0] || {}, 1: oldStyles[2] || {}, 2: oldStyles[1] || {}};
    saveBrokerData();
  }
  if(brokerData.headings.length===0) brokerData.headings=["Date","Amount Received","Amount Paid"];
  brokerData.widths=Array.isArray(brokerData.widths)?brokerData.widths:[];
  // Compact-sheet migration: normalize the existing Broker columns once.
  if (!brokerData.compactWidthsApplied) {
    brokerData.widths = brokerData.headings.map(() => 120);
    brokerData.compactWidthsApplied = true;
  }
  brokerData.headings.forEach((_,i)=>{ if(!brokerData.widths[i]) brokerData.widths[i]=120; });
  brokerData.rowHeights=brokerData.rowHeights||{};
  // Normalize legacy oversized broker rows so the editable cell itself is the
  // compact row, without blank space above/below it.
  if (brokerData.compactRowHeightsVersion !== 2) {
    Object.keys(brokerData.rowHeights).forEach(key => {
      const h = Number(brokerData.rowHeights[key]);
      if (!Number.isFinite(h) || h > 60 || h < 32) brokerData.rowHeights[key] = 44;
    });
    brokerData.compactRowHeightsApplied = true;
    brokerData.compactRowHeightsVersion = 2;
  }
  brokerData.cells=brokerData.cells||{}; brokerData.columnStyles=brokerData.columnStyles||{}; brokerData.merges=Array.isArray(brokerData.merges)?brokerData.merges:[]; brokerData.defaultStyle=cloneSpreadsheetStyle(SPREADSHEET_DEFAULT_STYLE);
}
function saveBrokerData(){ writeJSON(BROKER_DATA_KEY,brokerData); }
function brokerColumnName(index){let n=index+1,r="";while(n){let rem=(n-1)%26;r=String.fromCharCode(65+rem)+r;n=Math.floor((n-1)/26);}return r;}
function brokerStyle(style){
  return [style.color?`color:${style.color}`:"",style.background?`background:${style.background}`:"",style.fontSize?`font-size:${style.fontSize}px`:"",style.fontFamily?`font-family:${style.fontFamily}`:"",style.bold?"font-weight:bold":"",style.italic?"font-style:italic":"",style.align?`text-align:${style.align}`:"",style.vertical?`vertical-align:${style.vertical}`:"",style.wrap===false?"white-space:nowrap":"white-space:pre-wrap"].filter(Boolean).join(";");
}
function renderBrokerSheet(){
  installSheetSelectionViewportListeners();
  const c=$("brokerTableContainer"); if(!c)return;
  const h=brokerData.headings; brokerData.merges=Array.isArray(brokerData.merges)?brokerData.merges:[];
  const header=h.map((heading,col)=>`<th data-broker-select-column="${col}" style="width:${Number(brokerData.widths[col])||150}px"><div class="sheet-col-letter">${brokerColumnName(col)}</div><div class="report-header-content"><input class="report-heading-input" data-broker-heading="${col}" value="${safeText(heading)}"></div><span class="report-resize-handle" data-broker-resize-column="${col}"></span></th>`).join("");
  const body=brokerData.rows.map((row,r)=>{const height=Number(brokerData.rowHeights[r])||44;const cells=[];for(let col=0;col<h.length;col++){const merge=findMergeAt(brokerData.merges,r,col);if(merge&&(r!==merge.r1||col!==merge.c1))continue;const key=r+":"+col;const merged={...brokerData.defaultStyle,...(brokerData.columnStyles[col]||{}),...(brokerData.cells[key]||{})};const css=brokerStyle(merged);const colspan=merge?merge.c2-merge.c1+1:1;const rowspan=merge?merge.r2-merge.r1+1:1;cells.push(`<td colspan="${colspan}" rowspan="${rowspan}" data-broker-cell="${key}" style="${css};height:${height}px"><textarea class="report-cell-input broker-cell-input" data-broker-input="${key}" style="${css}">${safeText(row[col]||"")}</textarea></td>`);}return `<tr data-broker-row="${r}" style="height:${height}px"><td class="report-row-number"><span>${r+1}</span><span class="report-row-resize" data-broker-resize-row="${r}"></span></td>${cells.join("")}</tr>`}).join("");
  c.innerHTML=`<table class="report-table broker-sheet"><thead><tr><th class="report-row-number sheet-corner">#</th>${header}</tr></thead><tbody>${body||`<tr><td colspan="${h.length+1}" class="empty-cell">No transaction rows. Click Add Row to begin.</td></tr>`}</tbody></table>`;
  attachBrokerEvents(); updateMergeButtonState("broker");
  requestAnimationFrame(() => renderSheetSelectionHandles("broker"));
}
function brokerSelectedCells(){
  const b = sheetRangeBounds(selectedBrokerRange);
  if(b){
    const cells = [];
    for(let row=b.r1; row<=b.r2; row++){
      for(let column=b.c1; column<=b.c2; column++){
        cells.push({row,column});
      }
    }
    return cells;
  }
  if(!selectedBrokerCell) return [];
  const [r,c]=selectedBrokerCell.split(":").map(Number);
  return [{row:r,column:c}];
}
function getBrokerInheritanceStyle() {
  if (selectedBrokerCell) {
    const [row,column] = selectedBrokerCell.split(":").map(Number);
    return cloneSpreadsheetStyle({
      ...(brokerData.columnStyles[column] || {}),
      ...(brokerData.cells[row + ":" + column] || {})
    });
  }
  if (selectedBrokerColumn !== null) {
    return cloneSpreadsheetStyle(brokerData.columnStyles[selectedBrokerColumn] || brokerData.defaultStyle);
  }
  return cloneSpreadsheetStyle(brokerData.defaultStyle);
}
function applyBrokerFormatting(type,value){
  pushBrokerHistory();
  const cells=brokerSelectedCells();
  if(cells.length){cells.forEach(({row,column})=>{const key=row+":"+column;brokerData.cells[key]=brokerData.cells[key]||{};brokerData.cells[key][type]=value;});}
  else if(selectedBrokerColumn!==null){brokerData.columnStyles[selectedBrokerColumn]=brokerData.columnStyles[selectedBrokerColumn]||{};brokerData.columnStyles[selectedBrokerColumn][type]=value;}
  else {showToast("Select a cell or column first.");return;}
  saveBrokerData();renderBrokerSheet();syncBrokerToolbarToSelection();
}
function resetBrokerFormatting(){
  const cells=brokerSelectedCells();
  if(!cells.length && selectedBrokerColumn===null){showToast("Select a cell or column first.");return;}
  pushBrokerHistory();
  if(cells.length){
    cells.forEach(({row,column})=>{
      brokerData.cells[row+":"+column]=cloneSpreadsheetStyle();
    });
  }else if(selectedBrokerColumn!==null){
    delete brokerData.columnStyles[selectedBrokerColumn];
  }
  saveBrokerData();
  renderBrokerSheet();
  syncBrokerToolbarToSelection();
  showToast("Formatting reset to default.");
}

function toggleBrokerFormatting(type){
  pushBrokerHistory();
  brokerData.defaultStyle=cloneSpreadsheetStyle(brokerData.defaultStyle);
  const cells=brokerSelectedCells();
  let value;
  if(cells.length){
    const {row,column}=cells[0];
    const key=row+":"+column;
    const current=brokerData.cells[key]?.[type] ?? brokerData.columnStyles[column]?.[type] ?? SPREADSHEET_DEFAULT_STYLE[type];
    value=!current;
    cells.forEach(({row,column})=>{const k=row+":"+column;brokerData.cells[k]=brokerData.cells[k]||{};brokerData.cells[k][type]=value;});
  } else if(selectedBrokerColumn!==null){
    const st=brokerData.columnStyles[selectedBrokerColumn]||(brokerData.columnStyles[selectedBrokerColumn]={});
    value=!(st[type] ?? SPREADSHEET_DEFAULT_STYLE[type]);
    st[type]=value;
  } else {showToast("Select a cell or column first.");return;}
  saveBrokerData();renderBrokerSheet();
}
async function insertBrokerRowBelowSelected(){
  pushBrokerHistory();
  const insertIndex = selectedBrokerCell ? Math.min(brokerData.rows.length, Number(String(selectedBrokerCell).split(":")[0]) + 1) : brokerData.rows.length;
  brokerData.rows.splice(insertIndex,0,Array(brokerData.headings.length).fill(""));

  const newCells={};
  Object.entries(brokerData.cells||{}).forEach(([key,value])=>{
    const [row,col]=key.split(":").map(Number);
    const nextRow=row>=insertIndex?row+1:row;
    newCells[nextRow+":"+col]=value;
  });
  brokerData.cells=newCells;

  const newHeights={};
  Object.entries(brokerData.rowHeights||{}).forEach(([key,value])=>{
    const row=Number(key);
    newHeights[row>=insertIndex?row+1:row]=value;
  });
  newHeights[insertIndex]=44;
  brokerData.rowHeights=newHeights;
  saveBrokerData();
  selectedBrokerCell=insertIndex+":0";
  selectedBrokerColumn=null;
  renderBrokerSheet();
  showToast("Row inserted below selected row.");
}

async function insertBrokerColumnRightOfSelected(){
  pushBrokerHistory();
  const insertIndex=selectedBrokerColumn!==null?Math.min(brokerData.headings.length,Number(selectedBrokerColumn)+1):brokerData.headings.length;
  brokerData.headings.splice(insertIndex,0,"New Column");
  brokerData.widths.splice(insertIndex,0,120);

  const newStyles={};
  Object.entries(brokerData.columnStyles||{}).forEach(([key,value])=>{
    const col=Number(key);
    newStyles[col>=insertIndex?col+1:col]=value;
  });
  brokerData.columnStyles=newStyles;

  const newCells={};
  Object.entries(brokerData.cells||{}).forEach(([key,value])=>{
    const [row,col]=key.split(":").map(Number);
    newCells[row+":"+(col>=insertIndex?col+1:col)]=value;
  });
  brokerData.cells=newCells;
  brokerData.rows.forEach(row=>row.splice(insertIndex,0,""));
  saveBrokerData();
  selectedBrokerColumn=insertIndex;
  selectedBrokerCell=null;
  renderBrokerSheet();
  showToast("Column inserted to the right of selected column.");
}

function addBrokerRow(){pushBrokerHistory();brokerData.rows.push(Array(brokerData.headings.length).fill(""));saveBrokerData();renderBrokerSheet();}
function deleteBrokerRow(){pushBrokerHistory();if(!selectedBrokerCell){showToast("Select a cell in the row first.");return;}const r=Number(selectedBrokerCell.split(":")[0]);if(!confirm(`Delete transaction row ${r+1}?`))return;brokerData.rows.splice(r,1);const cells={};Object.entries(brokerData.cells).forEach(([k,v])=>{const [row,col]=k.split(":").map(Number);if(row<r)cells[k]=v;else if(row>r)cells[(row-1)+":"+col]=v;});brokerData.cells=cells;saveBrokerData();selectedBrokerCell=null;renderBrokerSheet();}
function addBrokerColumn(){pushBrokerHistory();const name=prompt("Enter new column heading:");if(name===null||!name.trim())return;const newIndex=brokerData.headings.length;brokerData.headings.push(name.trim());brokerData.widths.push(120);brokerData.rows.forEach(r=>r.push(""));saveBrokerData();renderBrokerSheet();}
function editBrokerColumn(){pushBrokerHistory();if(selectedBrokerColumn===null){showToast("Select a column heading first.");return;}const n=prompt("Edit column heading:",brokerData.headings[selectedBrokerColumn]);if(n===null||!n.trim())return;brokerData.headings[selectedBrokerColumn]=n.trim();saveBrokerData();renderBrokerSheet();}
function deleteBrokerColumn(){pushBrokerHistory();if(selectedBrokerColumn===null){showToast("Select a column heading first.");return;}if(brokerData.headings.length<=1){showToast("At least one column must remain.");return;}const i=selectedBrokerColumn;if(!confirm(`Delete column '${brokerData.headings[i]}'?`))return;brokerData.headings.splice(i,1);brokerData.widths.splice(i,1);brokerData.rows.forEach(r=>r.splice(i,1));const cells={};Object.entries(brokerData.cells).forEach(([k,v])=>{const [row,col]=k.split(":").map(Number);if(col<i)cells[k]=v;else if(col>i)cells[row+":"+(col-1)]=v;});brokerData.cells=cells;const styles={};Object.entries(brokerData.columnStyles).forEach(([k,v])=>{const col=Number(k);if(col<i)styles[col]=v;else if(col>i)styles[col-1]=v;});brokerData.columnStyles=styles;selectedBrokerColumn=null;selectedBrokerCell=null;saveBrokerData();renderBrokerSheet();}
function attachBrokerEvents(){
  document.querySelectorAll("[data-broker-input]").forEach(input=>{input.addEventListener("focus",()=>{pushBrokerHistory();selectedBrokerCell=input.dataset.brokerInput;selectedBrokerColumn=Number(String(selectedBrokerCell).split(":")[1]);document.querySelectorAll(".report-selected-cell").forEach(x=>x.classList.remove("report-selected-cell"));input.closest("td")?.classList.add("report-selected-cell"); if(!selectedBrokerRange || !sheetRangeContains(selectedBrokerRange,Number(String(selectedBrokerCell).split(":")[0]),Number(String(selectedBrokerCell).split(":")[1]))) selectedBrokerRange={start:{row:Number(String(selectedBrokerCell).split(":")[0]),column:Number(String(selectedBrokerCell).split(":")[1])},end:{row:Number(String(selectedBrokerCell).split(":")[0]),column:Number(String(selectedBrokerCell).split(":")[1])}}; requestAnimationFrame(()=>renderSheetSelectionHandles("broker")); syncBrokerToolbarToSelection();});input.addEventListener("input",()=>{const [r,c]=input.dataset.brokerInput.split(":").map(Number);while(brokerData.rows.length<=r)brokerData.rows.push(Array(brokerData.headings.length).fill(""));brokerData.rows[r][c]=input.value;saveBrokerData();});input.addEventListener("paste",e=>{const t=e.clipboardData?.getData("text/plain")||"";if(!t.includes("\t")&&!t.includes("\n"))return;e.preventDefault();pushBrokerHistory();const [sr,sc]=input.dataset.brokerInput.split(":").map(Number);t.replace(/\r/g,"").split("\n").forEach((line,ro)=>line.split("\t").forEach((v,co)=>{const r=sr+ro,c=sc+co;while(brokerData.rows.length<=r)brokerData.rows.push(Array(brokerData.headings.length).fill(""));while(brokerData.headings.length<=c){const newCol=brokerData.headings.length;brokerData.headings.push("New Column");brokerData.widths.push(120);brokerData.columnStyles[newCol]=getBrokerInheritanceStyle();}while(brokerData.rows[r].length<=c)brokerData.rows[r].push("");brokerData.rows[r][c]=v;}));saveBrokerData();renderBrokerSheet();});});
  document.querySelectorAll("[data-broker-cell]").forEach(cell=>cell.addEventListener("click",e=>{if(e.target.closest("textarea,input,button"))return;const [row,col]=cell.dataset.brokerCell.split(":").map(Number);if(e.shiftKey&&selectedBrokerCell){const [sr,sc]=selectedBrokerCell.split(":").map(Number);updateBrokerRangeSelection({start:{row:sr,column:sc},end:{row:row,column:col}});}else updateBrokerRangeSelection({start:{row:row,column:col},end:{row:row,column:col}});requestAnimationFrame(()=>syncBrokerToolbarToSelection());}));
  document.querySelectorAll("[data-broker-row]").forEach(rowEl=>rowEl.querySelector(".report-row-number")?.addEventListener("click",()=>{const row=Number(rowEl.dataset.brokerRow);if(!Number.isFinite(row))return;selectedBrokerCell=row+":0";selectedBrokerColumn=0;selectedBrokerRange={start:{row:row,column:0},end:{row:row,column:Math.max(0,brokerData.headings.length-1)}};document.querySelectorAll(".report-selected-cell,.report-selected-range").forEach(x=>x.classList.remove("report-selected-cell","report-selected-range"));rowEl.querySelector("td[data-broker-cell]")?.classList.add("report-selected-cell");syncBrokerToolbarToSelection();showToast("Row selected.");}));
  document.querySelectorAll("[data-broker-select-column]").forEach(h=>h.addEventListener("click",e=>{
    if(e.target.closest("input,.report-resize-handle"))return;
    const col=Number(h.dataset.brokerSelectColumn);
    const maxRow=Math.max(0,brokerData.rows.length-1);
    updateBrokerRangeSelection({start:{row:0,column:col},end:{row:maxRow,column:col}});
    showToast("Column selected. Drag the ↔ handle at the header edge to resize.");
  }));
  enableMobileColumnRangeSelection("[data-broker-select-column]", "broker");
  enableMobileRowRangeSelection("[data-broker-row] .report-row-number", "broker");
    document.querySelectorAll("[data-broker-heading]").forEach(i=>i.addEventListener("change",()=>{pushBrokerHistory();const c=Number(i.dataset.brokerHeading);brokerData.headings[c]=i.value.trim()||brokerData.headings[c];saveBrokerData();}));
  document.querySelectorAll("[data-broker-resize-column]").forEach(handle=>handle.addEventListener("pointerdown",e=>brokerResizeColumn(e,Number(handle.dataset.brokerResizeColumn))));
  document.querySelectorAll("[data-broker-resize-row]").forEach(handle=>handle.addEventListener("pointerdown",e=>brokerResizeRow(e,Number(handle.dataset.brokerResizeRow))));
}
function brokerResizeColumn(e,col){
  pushBrokerHistory();
  e.preventDefault();
  e.stopPropagation();
  const handle=e.currentTarget;
  try{handle.setPointerCapture?.(e.pointerId);}catch(_e){}
  const startX=e.clientX;
  const startW=Number(brokerData.widths[col])||150;
  let raf=0;
  const applyWidth=()=>{
    raf=0;
    const width=Math.max(60,startW+currentClientX-startX);
    brokerData.widths[col]=width;
    const table=document.querySelector("#brokerTableContainer table");
    if(table){
      table.querySelectorAll("tr").forEach(tr=>{
        const cell=tr.children[col+1];
        if(cell) cell.style.width=width+"px";
      });
    }
    handle.closest("th")?.style.setProperty("width",width+"px");
  };
  let currentClientX=startX;
  const move=ev=>{
    currentClientX=ev.clientX;
    if(!raf) raf=requestAnimationFrame(applyWidth);
  };
  const up=()=>{
    if(raf){cancelAnimationFrame(raf);raf=0;applyWidth();}
    document.removeEventListener("pointermove",move);
    document.removeEventListener("pointerup",up);
    document.removeEventListener("pointercancel",up);
    saveBrokerData();
  };
  document.addEventListener("pointermove",move,{passive:false});
  document.addEventListener("pointerup",up,{once:true});
  document.addEventListener("pointercancel",up,{once:true});
}
function brokerResizeRow(e,row){pushBrokerHistory();e.preventDefault();const startY=e.clientY,startH=Number(brokerData.rowHeights[row])||44;const move=ev=>{brokerData.rowHeights[row]=Math.max(24,startH+ev.clientY-startY);renderBrokerSheet();};const up=()=>{document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);saveBrokerData();};document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);}
function setupBrokerToolbar(){
  $("brokerMergeBtn")?.addEventListener("click",()=>mergeRangeIntoModel("broker"));
  $("brokerUndoBtn")?.addEventListener("click", undoBroker);
  $("brokerRedoBtn")?.addEventListener("click", redoBroker);
  $("brokerAddRowBtn")?.addEventListener("click",addBrokerRow);
  $("brokerInsertRowBtn")?.addEventListener("click",insertBrokerRowBelowSelected);
  $("brokerInsertColumnBtn")?.addEventListener("click",insertBrokerColumnRightOfSelected);$("brokerDeleteRowBtn")?.addEventListener("click",deleteBrokerRow);$("brokerSaveBtn")?.addEventListener("click",()=>{saveBrokerData();if($("brokerMessage"))$("brokerMessage").textContent="Transaction details saved successfully.";});$("brokerAddColumnBtn")?.addEventListener("click",addBrokerColumn);$("brokerEditColumnBtn")?.addEventListener("click",editBrokerColumn);$("brokerDeleteColumnBtn")?.addEventListener("click",deleteBrokerColumn);
  $("brokerTextColor")?.addEventListener("input",e=>applyBrokerFormatting("color",e.target.value));$("brokerCellColor")?.addEventListener("input",e=>applyBrokerFormatting("background",e.target.value));$("brokerFontSize")?.addEventListener("change",e=>applyBrokerFormatting("fontSize",e.target.value));$("brokerFontFamily")?.addEventListener("change",e=>applyBrokerFormatting("fontFamily",e.target.value));document.querySelectorAll("[data-broker-halign]").forEach(button=>button.addEventListener("click",()=>{applyBrokerFormatting("align",button.dataset.brokerHalign);document.querySelectorAll("[data-broker-halign]").forEach(x=>x.classList.toggle("active",x===button));}));document.querySelectorAll("[data-broker-valign]").forEach(button=>button.addEventListener("click",()=>{applyBrokerFormatting("vertical",button.dataset.brokerValign);document.querySelectorAll("[data-broker-valign]").forEach(x=>x.classList.toggle("active",x===button));}));$("brokerBoldBtn")?.addEventListener("click",()=>toggleBrokerFormatting("bold"));$("brokerItalicBtn")?.addEventListener("click",()=>toggleBrokerFormatting("italic"));$("brokerWrapBtn")?.addEventListener("click",()=>toggleBrokerFormatting("wrap"));$("brokerResetFormatBtn")?.addEventListener("click",resetBrokerFormatting);
  setupExportMenu("brokerExportBtn", "brokerExportMenu", {
    "broker-csv": exportBrokerCSV,
    "broker-pdf": exportBrokerPDF
  });
}

/* ==========================================
   CSV EXPORT
========================================== */

function csvEscape(value) {
  return '"' + String(value ?? "").replace(/"/g,'""') + '"';
}

function downloadFile(filename,content,type) {
  const blob = new Blob([content],{type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}

function setupExportMenu(triggerId, menuId, actions) {
  const trigger = $(triggerId);
  const menu = $(menuId);
  if (!trigger || !menu) return;
  trigger.onclick = e => {
    e.stopPropagation();
    document.querySelectorAll(".export-menu:not(.hidden)").forEach(other => {
      if (other !== menu) other.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
  };
  menu.querySelectorAll("[data-export-action]").forEach(item => {
    item.onclick = e => {
      e.stopPropagation();
      menu.classList.add("hidden");
      const action = actions[item.dataset.exportAction];
      if (typeof action === "function") action();
    };
  });
}
if (!window.__tradeLedgerExportMenuBound) {
  document.addEventListener("click", () => document.querySelectorAll(".export-menu").forEach(menu => menu.classList.add("hidden")));
  window.__tradeLedgerExportMenuBound = true;
}
function getJournalExportColumns() {
  const columns = getAllJournalFields().map(field => ({label:field.label,key:field.key,field}));
  columns.push({label:"Attachments",key:"attachments",field:{key:"attachments",label:"Attachments"}});
  return columns;
}
function getJournalExportRows() {
  const columns = getJournalExportColumns();
  return getVisibleTrades().map(trade => columns.map(column => column.key === "attachments" ? attachmentSummary(trade) : formatJournalValue(column.field,trade)));
}
function getJournalExportTitle() {
  const modeName = currentMode === "intraday" ? "Intraday Trading" : currentMode === "swing" ? "Swing Trading" : "Long Term Trading";
  return `${modeName} - Trade Journal`;
}
function exportJournalCSV() {
  const columns = getJournalExportColumns();
  const rows = getJournalExportRows();
  const output = [
    columns.map(column => csvEscape(column.label)).join(","),
    ...rows.map(row => columns.map((_, index) => csvEscape(row[index] ?? "")).join(","))
  ];
  const csv = "\uFEFF" + output.join("\r\n") + "\r\n";
  downloadFile(
    getJournalExportTitle().replace(/[^a-z0-9]+/gi,"-").toLowerCase() + ".csv",
    csv,
    "text/csv;charset=utf-8"
  );
  showToast("CSV exported. Columns are preserved for Excel/Google Sheets.");
}
function pdfSafeText(value) {
  return String(value ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildTablePDF(title, headings, rows) {
  // Landscape PDF with content-based column widths. If all columns cannot
  // fit legibly, columns are split across horizontal page groups.
  const pageW = 842, pageH = 595, margin = 26;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - 42;
  const baseFont = 7.5;
  const headerFont = 8;
  const lineH = 10;
  const minColW = 62;
  const maxColW = 165;
  const allRows = [headings, ...rows];

  function textLen(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().length;
  }

  function preferredWidth(col) {
    let maxLen = textLen(headings[col]);
    for (const row of rows) maxLen = Math.max(maxLen, textLen(row[col]));
    return Math.max(minColW, Math.min(maxColW, 10 + maxLen * 4.2));
  }

  const widths = headings.map((_, col) => preferredWidth(col));

  function makeColumnGroups() {
    const groups = [];
    let group = [];
    let total = 0;
    widths.forEach((w, i) => {
      if (group.length && total + w > usableW) {
        groups.push(group);
        group = [];
        total = 0;
      }
      group.push(i);
      total += w;
    });
    if (group.length) groups.push(group);
    return groups.length ? groups : [headings.map((_, i) => i)];
  }

  function wrapText(value, width, fontSize) {
    const raw = String(value ?? "").replace(/\r/g, "").trim();
    if (!raw) return [""];
    const charsPerLine = Math.max(5, Math.floor((width - 8) / (fontSize * 0.52)));
    const words = raw.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      if (word.length > charsPerLine) {
        if (line) { lines.push(line); line = ""; }
        for (let i = 0; i < word.length; i += charsPerLine) {
          lines.push(word.slice(i, i + charsPerLine));
        }
        continue;
      }
      const candidate = line ? line + " " + word : word;
      if (candidate.length <= charsPerLine) line = candidate;
      else { if (line) lines.push(line); line = word; }
    }
    if (line || !lines.length) lines.push(line);
    return lines;
  }

  function pdfSafeText(value) {
    return String(value ?? "")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  const objects = [];
  const pageObjectIds = [];
  const contentObjectIds = [];
  function addObject(body) { objects.push(body); return objects.length; }

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pagesId = addObject(null);
  const catalogId = addObject(null);
  const groups = makeColumnGroups();

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    const groupWidth = group.reduce((sum, col) => sum + widths[col], 0);
    const scale = groupWidth > usableW ? usableW / groupWidth : 1;
    const groupWidths = group.map(col => widths[col] * scale);

    let rowHeights = [];
    for (let r = 0; r < allRows.length; r++) {
      let maxLines = 1;
      group.forEach((col, local) => {
        const font = r === 0 ? headerFont : baseFont;
        maxLines = Math.max(maxLines, wrapText(allRows[r][col], groupWidths[local], font).length);
      });
      rowHeights.push(Math.min(46, Math.max(18, maxLines * lineH + 6)));
    }

    let rowStart = 0;
    while (rowStart < allRows.length) {
      let rowEnd = rowStart;
      let usedH = 0;
      while (rowEnd < allRows.length && usedH + rowHeights[rowEnd] <= usableH) {
        usedH += rowHeights[rowEnd];
        rowEnd++;
      }
      if (rowEnd === rowStart) rowEnd++;

      const content = [];
      const pageTitle = groups.length > 1
        ? `${title} — Columns ${groupIndex + 1}/${groups.length}`
        : title;
      content.push(`BT /F1 15 Tf 1 0 0 1 ${margin} ${pageH-28} Tm (${pdfSafeText(pageTitle)}) Tj ET`);
      content.push(`BT /F1 7 Tf 1 0 0 1 ${margin} ${pageH-40} Tm (TradeBook) Tj ET`);

      let y = pageH - 54;
      for (let r = rowStart; r < rowEnd; r++) {
        const h = rowHeights[r];
        const isHeader = r === 0;
        let x = margin;

        group.forEach((col, local) => {
          const w = groupWidths[local];
          content.push(isHeader ? "0.90 0.93 0.96 rg" : "1 1 1 rg");
          content.push(`${x.toFixed(2)} ${(y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
          content.push("0.45 0.45 0.45 RG 0.45 w");
          content.push(`${x.toFixed(2)} ${(y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);

          const font = isHeader ? headerFont : baseFont;
          const lines = wrapText(allRows[r][col], w, font);
          const lineCount = Math.min(lines.length, Math.floor((h - 5) / lineH));
          for (let li = 0; li < lineCount; li++) {
            const yy = y - 11 - li * lineH;
            content.push(`BT /F1 ${font} Tf 0 0 0 rg 1 0 0 1 ${(x+4).toFixed(2)} ${yy.toFixed(2)} Tm (${pdfSafeText(lines[li])}) Tj ET`);
          }
          x += w;
        });
        y -= h;
      }

      const body = content.join("\n");
      contentObjectIds.push(addObject(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`));
      pageObjectIds.push(addObject(null));
      rowStart = rowEnd;
    }
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageObjectIds.map(id => id + " 0 R").join(" ")}] /Count ${pageObjectIds.length} >>`;
  pageObjectIds.forEach((id, i) => {
    objects[id - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentObjectIds[i]} 0 R >>`;
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let pdf = "%PDF-1.4\n%1234\n";
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i+1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10,"0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], {type:"application/pdf"});
}

function downloadPDF(filename, title, headings, rows) {
  const blob = buildTablePDF(title, headings, rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showToast("PDF exported.");
}

function exportJournalPDF() {
  const columns = getJournalExportColumns(), rows = getJournalExportRows(), title = getJournalExportTitle();
  downloadPDF(title.replace(/[^a-z0-9]+/gi,"-").toLowerCase()+".pdf", title, columns.map(c=>c.label), rows);
}

function exportBrokerCSV() {
  const output=[brokerData.headings.map(csvEscape).join(","),...brokerData.rows.map(row=>brokerData.headings.map((_,i)=>csvEscape(row[i]||"")).join(","))];
  downloadFile("TradeLedger-Broker-Transactions.csv","\uFEFF"+output.join("\r\n"),"text/csv;charset=utf-8"); showToast("CSV exported.");
}
function exportBrokerPDF() {
  const title = "TradeBook - Broker Transactions";
  const rows = brokerData.rows.map(row => brokerData.headings.map((_,i)=>row[i]||""));
  downloadPDF("TradeLedger-Broker-Transactions.pdf", title, brokerData.headings, rows);
}


/* ==========================================
   FIELD MANAGER
========================================== */

function getFieldSettings() {
  const allModes = readJSON(MODE_SETTINGS_KEY,null);
  if (allModes && allModes[currentMode]) return allModes[currentMode];
  return readJSON(SETTINGS_KEY,{});
}
function saveFieldSettings(settings) {
  const allModes = readJSON(MODE_SETTINGS_KEY,{});
  allModes[currentMode] = settings;
  writeJSON(MODE_SETTINGS_KEY,allModes);
}
function ensureModeFieldSettings() {
  const existing = readJSON(MODE_SETTINGS_KEY,null);
  if (existing && existing.intraday && existing.swing && existing.longterm) return;
  const global = readJSON(SETTINGS_KEY,{});
  const modes = existing || {};
  ["intraday","swing","longterm"].forEach(mode => {
    if (!modes[mode]) modes[mode] = JSON.parse(JSON.stringify(global || {}));
  });
  modes.intraday.date = {...(modes.intraday.date||{}), hidden:false, deleted:false, label:"Entry Date"};
  modes.intraday.exitDate = {...(modes.intraday.exitDate||{}), hidden:true};
  modes.intraday.leverage = {...(modes.intraday.leverage||{}), hidden:false, deleted:false};
  ["swing","longterm"].forEach(mode => {
    modes[mode].date = {...(modes[mode].date||{}), hidden:false, deleted:false, label:"Entry Date"};
    modes[mode].exitDate = {...(modes[mode].exitDate||{}), hidden:false, deleted:false, label:"Exit Date"};
    modes[mode].leverage = {...(modes[mode].leverage||{}), hidden:true};
  });
  writeJSON(MODE_SETTINGS_KEY,modes);
}
function isFieldAllowedForMode(key) {
  if (currentMode === "intraday") return key !== "exitDate";
  return key !== "leverage";
}
function getModeStandardFields() {
  const settings = getFieldSettings();
  return STANDARD_FIELDS.filter(field => isFieldAllowedForMode(field.key)).map(field => ({
    ...field,
    label: settings[field.key]?.label || field.label,
    placeholder: settings[field.key]?.placeholder || "",
    type: settings[field.key]?.type || field.type,
    section: settings[field.key]?.section || field.section,
    options: Array.isArray(settings[field.key]?.options) ? settings[field.key].options : []
  }));
}

function normalizeStandardPositions() {
  const settings = getFieldSettings();
  getModeStandardFields().forEach((field,index) => {
    settings[field.key] = {...(settings[field.key] || {}),position:getStandardFieldPosition(field.key)};
  });
  saveFieldSettings(settings);
}

function getUnifiedFieldOrder() {
  const settings = getFieldSettings();
  const standard = getModeStandardFields().map(field => ({
    id: field.key,
    kind: "standard",
    field,
    position: getStandardFieldPosition(field.key),
    label: settings[field.key]?.label || field.label,
    deleted: Boolean(settings[field.key]?.deleted),
    hidden: Boolean(settings[field.key]?.hidden)
  }));
  const custom = fields.filter(field => (field.mode || "intraday") === currentMode).map(field => ({
    id: String(field.id),
    kind: "custom",
    field,
    position: numberValue(field.position) || 9999,
    label: field.label || field.name || "Custom Field",
    deleted: false,
    hidden: Boolean(field.hidden)
  }));
  return [...standard, ...custom].sort((a,b) =>
    a.position - b.position || String(a.id).localeCompare(String(b.id))
  );
}

function getActiveFieldManagerList() {
  const workspaceId = currentMode === "intraday" ? "intradayWorkspace" :
    currentMode === "swing" ? "swingWorkspace" :
    currentMode === "longterm" ? "longtermWorkspace" : "";
  const workspace = workspaceId ? $(workspaceId) : null;
  return workspace?.querySelector(".mode-field-manager-list") || workspace?.querySelector("#fieldManagerList");
}

function renderFieldList() {
  const container = getActiveFieldManagerList();
  if (!container) return;

  const ordered = getUnifiedFieldOrder();
  const html = ordered.map((item,index) => {
    const first = index === 0;
    const last = index === ordered.length - 1;
    const field = item.field;
    const status = item.kind === "standard"
      ? (item.deleted ? " · Deleted from Add Trade" : item.hidden ? " · Hidden from Journal" : "")
      : (item.hidden ? " · Hidden from Journal" : "");

    return `<div class="field-manager-item">
      <div class="field-manager-info">
        <strong>${safeText(item.label)}</strong>
        <small>ID: <code>${safeText(item.id)}</code> · ${item.kind === "standard" ? "Standard" : "Custom"} · ${safeText(field.section || "basic")} · ${safeText(field.type || "text")}${status}</small>
      </div>
      <div class="field-manager-actions">
        <button type="button" class="field-arrow-btn" data-move-unified="${safeText(item.id)}" data-kind="${item.kind}" data-direction="up" ${first ? "disabled" : ""}>↑</button>
        <button type="button" class="field-arrow-btn" data-move-unified="${safeText(item.id)}" data-kind="${item.kind}" data-direction="down" ${last ? "disabled" : ""}>↓</button>
        <button type="button" data-edit-${item.kind}="${safeText(item.id)}">Edit</button>
        <button type="button" class="delete-field-btn" data-delete-${item.kind}="${safeText(item.id)}">${item.kind === "standard" && item.deleted ? "Restore" : "Delete"}</button>
        <button type="button" data-toggle-${item.kind}="${safeText(item.id)}">${item.hidden ? "Show" : "Hide"}</button>
      </div>
    </div>`;
  }).join("");

  container.innerHTML = `<h3>All Fields</h3>
    <p class="muted-text field-manager-note">Field Manager controls the same field definitions used by Add Trade and Journal. Edit changes the field definition, Hide hides it from Journal without deleting saved values, Delete removes the field from the form/Journal while preserving existing trade data, and ↑ / ↓ changes the shared column order.</p>
    ${html || '<p class="muted-text">No fields available.</p>'}`;
}

async function moveUnifiedField(id,kind,direction) {
  const ordered = getUnifiedFieldOrder();
  const index = ordered.findIndex(item => item.kind === kind && String(item.id) === String(id));
  if (index < 0) return;
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= ordered.length) return;

  [ordered[index],ordered[target]] = [ordered[target],ordered[index]];

  try {
    const settings = getFieldSettings();
    for (let i=0; i<ordered.length; i++) {
      const item = ordered[i];
      if (item.kind === "standard") {
        settings[item.id] = {...(settings[item.id] || {}), position:i+1};
      } else {
        const field = {...item.field, position:i+1};
        await putIntoStore("fields",field);
        fields = fields.map(existing => String(existing.id) === String(field.id) ? field : existing);
      }
    }
    saveFieldSettings(settings);
    renderFieldList();
    renderStandardFormFields();
    renderCustomFormFields();
    renderJournal();
    showToast("Field order updated.");
  } catch(error) {
    console.error(error);
    showToast("Unable to change field order: " + error.message);
  }
}

async function toggleStandardField(key) {
  const settings=getFieldSettings();
  const current=settings[key]||{};
  settings[key]={...current,hidden:!current.hidden};
  saveFieldSettings(settings);
  renderFieldList(); renderJournal();
  showToast(settings[key].hidden ? "Field hidden from Journal." : "Field shown in Journal.");
}

async function deleteStandardField(key) {
  const field=getModeStandardFields().find(item=>item.key===key); if(!field)return;
  const settings=getFieldSettings(); const current=settings[key]||{};
  const deleted=!current.deleted;
  if(deleted && !confirm("Delete '"+(current.label||field.label)+"' from Add Trade and Journal? Stored trade values will be preserved.")) return;
  settings[key]={...current,deleted};
  saveFieldSettings(settings);
  renderFieldList(); renderStandardFormFields(); renderCustomFormFields(); renderJournal();
  showToast(deleted ? "Field deleted from form and Journal." : "Field restored.");
}

function openFieldModal(){ $("fieldManagerModal")?.classList.remove("hidden"); }
function closeFieldModal(){
  $("fieldManagerModal")?.classList.add("hidden"); $("fieldForm")?.reset();
  if($("fieldId"))$("fieldId").value=""; if($("fieldCustomId"))$("fieldCustomId").value="";
  if($("fieldModalTitle"))$("fieldModalTitle").textContent="Add Custom Field";
  if($("fieldType"))$("fieldType").disabled=false; if($("fieldSection"))$("fieldSection").disabled=false;
}
function editStandardField(key){
  const field=getModeStandardFields().find(item=>item.key===key); if(!field)return;
  const current=getFieldSettings()[key]||{};
  if($("fieldId"))$("fieldId").value="standard:"+key;
  if($("fieldCustomId"))$("fieldCustomId").value=key;
  if($("fieldName"))$("fieldName").value=current.label||field.label;
  if($("fieldPlaceholder"))$("fieldPlaceholder").value=current.placeholder||"";
  if($("fieldType")){ $("fieldType").value=field.type; $("fieldType").disabled=false; }
  if($("fieldSection")){ $("fieldSection").value=field.section; $("fieldSection").disabled=false; }
  if($("fieldOptions"))$("fieldOptions").value=(current.options||[]).join(", ");
  if($("fieldPosition"))$("fieldPosition").value=current.position||getStandardFieldPosition(key);
  if($("fieldInForm"))$("fieldInForm").checked=true;
  if($("fieldRequired"))$("fieldRequired").checked=false;
  if($("fieldModalTitle"))$("fieldModalTitle").textContent="Edit Standard Field";
  openFieldModal();
}
function editCustomField(id){
  const field=fields.find(item=>String(item.id)===String(id)); if(!field)return;
  if($("fieldId"))$("fieldId").value=field.id; if($("fieldCustomId"))$("fieldCustomId").value=field.id;
  if($("fieldName"))$("fieldName").value=field.label||field.name||""; if($("fieldPlaceholder"))$("fieldPlaceholder").value=field.placeholder||"";
  if($("fieldType")){ $("fieldType").value=field.type||"text"; $("fieldType").disabled=false; }
  if($("fieldSection")){ $("fieldSection").value=field.section||"basic"; $("fieldSection").disabled=false; }
  if($("fieldOptions"))$("fieldOptions").value=(field.options||[]).join(", "); if($("fieldPosition"))$("fieldPosition").value=field.position||1;
  if($("fieldInForm"))$("fieldInForm").checked=field.inForm!==false; if($("fieldRequired"))$("fieldRequired").checked=Boolean(field.required);
  if($("fieldModalTitle"))$("fieldModalTitle").textContent="Edit Custom Field"; openFieldModal();
}

async function saveField(event){
  event.preventDefault();
  const id=$("fieldId")?.value||"", label=$("fieldName")?.value.trim()||"", placeholder=$("fieldPlaceholder")?.value.trim()||"", requestedCustomId=$("fieldCustomId")?.value.trim()||"";
  if(!label){showToast("Enter a field heading.");return;}
  try{
    if(id.startsWith("standard:")){
      const key=id.slice(9); const standard=STANDARD_FIELDS.find(item=>item.key===key); if(!standard)return;
      const settings=getFieldSettings();
      settings[key]={...(settings[key]||{}),label,placeholder,
        type:$("fieldType")?.value || standard.type,
        section:$("fieldSection")?.value || standard.section,
        options:($("fieldOptions")?.value||"").split(",").map(x=>x.trim()).filter(Boolean),
        position:numberValue($("fieldPosition")?.value)||getStandardFieldPosition(key)};
      saveFieldSettings(settings);
      closeFieldModal(); renderFieldList(); renderStandardFormFields(); renderJournal(); showToast("Standard field updated."); return;
    }
    const original=id?fields.find(item=>String(item.id)===String(id)):null;
    if(id&&!original)throw new Error("Custom field was not found.");
    const cleanCustomId=requestedCustomId.replace(/[^A-Za-z0-9_-]/g,"").replace(/^-+/,"").slice(0,80);
    const nextId=cleanCustomId||(original?String(original.id):makeId());
    const duplicate=fields.find(item=>(item.mode || "intraday")===currentMode && String(item.id)===nextId&&String(item.id)!==String(original?.id||"")); if(duplicate)throw new Error("This Field ID is already in use.");
    const maxPosition=fields.reduce((m,f)=>Math.max(m,numberValue(f.position)),0);
    const field={...(original||{}),id:nextId,label,name:label,placeholder,type:$("fieldType")?.value||"text",section:$("fieldSection")?.value||"basic",options:($("fieldOptions")?.value||"").split(",").map(x=>x.trim()).filter(Boolean),position:original?numberValue($("fieldPosition")?.value)||original.position||1:maxPosition+1,inForm:$("fieldInForm")?.checked!==false,required:Boolean($("fieldRequired")?.checked),hidden:original?Boolean(original.hidden):false,mode:original?.mode || currentMode};
    if(original&&String(original.id)!==String(field.id)){
      const tx=db.transaction(["trades","fields"],"readwrite"), ts=tx.objectStore("trades"), fs=tx.objectStore("fields"), req=ts.getAll();
      await new Promise((resolve,reject)=>{req.onsuccess=()=>{(req.result||[]).forEach(trade=>{if(trade.customValues&&Object.prototype.hasOwnProperty.call(trade.customValues,String(original.id))){trade.customValues[field.id]=trade.customValues[String(original.id)];delete trade.customValues[String(original.id)];ts.put(trade);}});fs.delete(original.id);fs.put(field);resolve();};req.onerror=()=>reject(req.error);});
      await transactionComplete(tx);
    } else await putIntoStore("fields",field);
    fields=original?fields.map(item=>String(item.id)===String(id)?field:item):[...fields,field];
    if(original&&String(original.id)!==String(field.id)) trades=trades.map(trade=>{const cv={...(trade.customValues||{})};if(Object.prototype.hasOwnProperty.call(cv,String(original.id))){cv[field.id]=cv[String(original.id)];delete cv[String(original.id)];return {...trade,customValues:cv};}return trade;});
    closeFieldModal(); renderFieldList(); renderStandardFormFields(); renderCustomFormFields(); renderJournal(); showToast(original?"Custom field updated.":"Custom field added.");
  }catch(error){console.error(error);showToast("Unable to save field: "+error.message);}
}

async function toggleCustomField(id){const original=fields.find(item=>String(item.id)===String(id));if(!original)return;const field={...original,hidden:!original.hidden};try{await putIntoStore("fields",field);fields=fields.map(item=>String(item.id)===String(id)?field:item);renderFieldList();renderCustomFormFields();renderJournal();showToast(field.hidden?"Field hidden from Journal.":"Field shown in Journal.");}catch(error){showToast("Unable to update field: "+error.message);}}
async function deleteCustomField(id){const field=fields.find(item=>String(item.id)===String(id));if(!field)return;if(!confirm("Delete custom field "+(field.label||field.name)+"? Existing trade values will be preserved but the field definition will be removed."))return;try{await deleteFromStore("fields",field.id);fields=fields.filter(item=>String(item.id)!==String(id));renderFieldList();renderCustomFormFields();renderJournal();showToast("Custom field deleted.");}catch(error){showToast("Unable to delete field: "+error.message);}}

/* ==========================================
   SPREADSHEET UNDO / REDO HISTORY
========================================== */

const reportHistory = {
  daily:{undo:[],redo:[]},
  weekly:{undo:[],redo:[]},
  monthly:{undo:[],redo:[]},
  yearly:{undo:[],redo:[]}
};
const brokerHistory = {undo:[],redo:[]};
const HISTORY_LIMIT = 80;

function deepClone(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function reportHistorySnapshot(period=currentReportPeriod){
  return {
    period,
    data: deepClone(reportData[period] || []),
    settings: deepClone(reportSettings[period] || getReportConfig(period)),
    selectedCell: selectedReportCell,
    selectedColumn: selectedReportColumn,
    selectedRange: deepClone(selectedReportRange)
  };
}

function brokerHistorySnapshot(){
  return {
    data: deepClone(brokerData),
    selectedCell: selectedBrokerCell,
    selectedColumn: selectedBrokerColumn,
    selectedRange: deepClone(selectedBrokerRange)
  };
}

function pushReportHistory(period=currentReportPeriod){
  const stack = reportHistory[period] || (reportHistory[period]={undo:[],redo:[]});
  stack.undo.push(reportHistorySnapshot(period));
  if(stack.undo.length>HISTORY_LIMIT) stack.undo.shift();
  stack.redo.length=0;
  updateHistoryButtons();
}

function pushBrokerHistory(){
  brokerHistory.undo.push(brokerHistorySnapshot());
  if(brokerHistory.undo.length>HISTORY_LIMIT) brokerHistory.undo.shift();
  brokerHistory.redo.length=0;
  updateHistoryButtons();
}

function restoreReportHistorySnapshot(snapshot){
  const period=snapshot.period || currentReportPeriod;
  reportData[period]=deepClone(snapshot.data || []);
  reportSettings[period]=deepClone(snapshot.settings || {});
  selectedReportCell=snapshot.selectedCell ?? null;
  selectedReportColumn=snapshot.selectedColumn ?? null;
  selectedReportRange=deepClone(snapshot.selectedRange) || null;
  currentReportPeriod=period;
  saveReportToDatabase().then(()=>{
    renderReportTable();
    syncReportToolbarToSelection();
    updateHistoryButtons();
  }).catch(error=>showToast("Undo/Redo save failed: "+error.message));
}

function restoreBrokerHistorySnapshot(snapshot){
  brokerData=deepClone(snapshot.data || defaultBrokerData());
  selectedBrokerCell=snapshot.selectedCell ?? null;
  selectedBrokerColumn=snapshot.selectedColumn ?? null;
  selectedBrokerRange=deepClone(snapshot.selectedRange) || null;
  saveBrokerData();
  renderBrokerSheet();
  syncBrokerToolbarToSelection();
  updateHistoryButtons();
}

function undoReport(){
  const stack=reportHistory[currentReportPeriod];
  if(!stack?.undo.length){showToast("Nothing to undo.");return;}
  const current=reportHistorySnapshot(currentReportPeriod);
  const previous=stack.undo.pop();
  stack.redo.push(current);
  restoreReportHistorySnapshot(previous);
}

function redoReport(){
  const stack=reportHistory[currentReportPeriod];
  if(!stack?.redo.length){showToast("Nothing to redo.");return;}
  const current=reportHistorySnapshot(currentReportPeriod);
  const next=stack.redo.pop();
  stack.undo.push(current);
  restoreReportHistorySnapshot(next);
}

function undoBroker(){
  if(!brokerHistory.undo.length){showToast("Nothing to undo.");return;}
  const current=brokerHistorySnapshot();
  const previous=brokerHistory.undo.pop();
  brokerHistory.redo.push(current);
  restoreBrokerHistorySnapshot(previous);
}

function redoBroker(){
  if(!brokerHistory.redo.length){showToast("Nothing to redo.");return;}
  const current=brokerHistorySnapshot();
  const next=brokerHistory.redo.pop();
  brokerHistory.undo.push(current);
  restoreBrokerHistorySnapshot(next);
}

function updateHistoryButtons(){
  const rh=reportHistory[currentReportPeriod] || {undo:[],redo:[]};
  const ru=$("reportUndoBtn"), rr=$("reportRedoBtn"), bu=$("brokerUndoBtn"), br=$("brokerRedoBtn");
  if(ru) ru.disabled=!rh.undo.length;
  if(rr) rr.disabled=!rh.redo.length;
  if(bu) bu.disabled=!brokerHistory.undo.length;
  if(br) br.disabled=!brokerHistory.redo.length;
}

/* ==========================================
   REPORTS & ANALYTICS
========================================== */

function getReportRows(period = currentReportPeriod) {
  if (!Array.isArray(reportData[period])) reportData[period] = [];
  return reportData[period];
}

function getReportConfig(period = currentReportPeriod) {
  if (!reportSettings[period]) {
    reportSettings[period] = {
      headings:[...REPORT_HEADINGS[period]],
      widths:[120,120,120,120,120],
      rowHeights:{},
      cells:{},
      columnStyles:{},
      defaultStyle:cloneSpreadsheetStyle()
    };
  }

  const config = reportSettings[period];

  if (!Array.isArray(config.headings)) {
    config.headings = [...REPORT_HEADINGS[period]];
  }

  if (!Array.isArray(config.widths)) config.widths = [];

  // Compact-sheet migration: older report sheets used stretched columns.
  // Apply the compact width once, then preserve any manual resizing.
  if (!config.compactWidthsApplied) {
    config.widths = config.widths.map(() => 120);
    config.compactWidthsApplied = true;
  }

  if (!config.rowHeights) config.rowHeights = {};
  // Keep spreadsheet rows compact. Older versions could leave an oversized
  // saved row height, which makes the 44px editable cell appear with large
  // blank areas above and below it. Normalize those legacy oversized rows once.
  if (config.compactRowHeightsVersion !== 5) {
    Object.keys(config.rowHeights).forEach(key => {
      config.rowHeights[key] = 44;
    });
    config.compactRowHeightsApplied = true;
    config.compactRowHeightsVersion = 5;
  }
  if (!config.cells) config.cells = {};
  if (!Array.isArray(config.merges)) config.merges = [];
  if (!config.columnStyles) config.columnStyles = {};
  config.defaultStyle = cloneSpreadsheetStyle(SPREADSHEET_DEFAULT_STYLE);

  while (config.headings.length < 5) {
    config.headings.push(REPORT_HEADINGS[period][config.headings.length]);
  }

  while (config.widths.length < config.headings.length) {
    config.widths.push(150);
  }

  // Ensure old report rows are extended for additional columns.
  getReportRows(period).forEach(row => {
    while (row.length < config.headings.length) row.push("");
  });

  return config;
}

function setReportPeriod(period) {
  if (!REPORT_HEADINGS[period]) return;

  captureReportInputs();
  currentReportPeriod = period;
  selectedReportCell = null;
  selectedReportColumn = null;
  selectedReportRange = null;

  document.querySelectorAll(".report-tab").forEach(button => {
    button.classList.toggle("active",button.dataset.reportPeriod === period);
  });

  renderReportTable();
  updateHistoryButtons();
}

/* Add/Edit/Delete controls are inserted into the existing Reports section. */
function ensureReportColumnToolbar(container) {
  let toolbar = $("reportColumnToolbar");

  /*
   * The Reports toolbar already exists in index.html and contains the full
   * Broker-matching control set. Do NOT replace its innerHTML on every
   * render; doing so used to remove the row/merge/history controls and
   * their handlers. Keep the existing toolbar and only normalize its class
   * and wire the column-specific controls once.
   */
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.id = "reportColumnToolbar";
    toolbar.className = "report-column-toolbar report-toolbar sheet-actions-grid";
    toolbar.innerHTML = `
      <div class="sheet-action-icon-row">
        <span class="history-button-group" aria-label="Undo and Redo controls">
          <button type="button" id="reportUndoBtn" class="sheet-icon-btn history-icon-btn" title="Undo" aria-label="Undo">${sheetInlineIcon("undo")}</button>
          <button type="button" id="reportRedoBtn" class="sheet-icon-btn history-icon-btn" title="Redo" aria-label="Redo">${sheetInlineIcon("redo")}</button>
        </span>
        <button type="button" id="reportInsertColumnBtn" class="sheet-icon-btn" title="Insert column between selected and next column" aria-label="Insert column between selected and next column">${sheetInlineIcon("column")}</button>
        <button type="button" id="reportInsertRowBtn" class="sheet-icon-btn" title="Insert row between selected and next row" aria-label="Insert row between selected and next row">${sheetInlineIcon("row")}</button>
        <button type="button" id="reportMergeBtn" class="sheet-icon-btn" title="Merge selected cells" aria-label="Merge selected cells">${mergeIconSVG(false)}</button>
      </div>
      <div class="sheet-action-row">
        <button type="button" id="reportAddRowBtn" class="primary-btn">+ Add Row</button>
        <button type="button" id="reportDeleteRowBtn" class="secondary-btn">Delete Selected Row</button>
      </div>
      <div class="sheet-action-row">
        <button type="button" id="reportAddColumnBtn" class="primary-btn">+ Add Column</button>
        <button type="button" id="reportEditColumnBtn" class="secondary-btn">Edit Selected Column</button>
      </div>
      <div class="sheet-action-row">
        <button type="button" id="reportDeleteColumnBtn" class="danger-btn">Delete Selected Column</button>
        <div class="export-menu-wrap">
          <button type="button" id="reportExportBtn" class="secondary-btn export-menu-trigger" title="Export" aria-label="Export">Export ▾</button>
          <div id="reportExportMenu" class="export-menu hidden">
            <button type="button" data-export-action="report-csv">Export CSV</button>
            <button type="button" data-export-action="report-pdf">Export PDF</button>
          </div>
        </div>
      </div>
    `;
    container.parentElement?.insertBefore(toolbar, container);
  } else {
    toolbar.classList.add("report-column-toolbar", "report-toolbar", "sheet-actions-grid");
    toolbar.classList.remove("report-sheet-actions");
  }

  /* Column controls are not wired by setupReportToolbar, so wire them once. */
  if (toolbar.dataset.columnControlsWired !== "1") {
    $("reportAddColumnBtn")?.addEventListener("click", addReportColumn);
    $("reportEditColumnBtn")?.addEventListener("click", editReportColumn);
    $("reportDeleteColumnBtn")?.addEventListener("click", deleteReportColumn);
    setupExportMenu("reportExportBtn", "reportExportMenu", {
      "report-csv": exportCurrentReportCSV,
      "report-pdf": exportCurrentReportPDF
    });
    toolbar.dataset.columnControlsWired = "1";
  }
}

function reportColumnName(index) {
  let n = Number(index) + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function normalizeSheetRange(range) {
  if (!range || !range.start || !range.end) return null;
  return {start:{row:Number(range.start.row),column:Number(range.start.column)},end:{row:Number(range.end.row),column:Number(range.end.column)}};
}
function sheetRangeBounds(range) {
  const r=normalizeSheetRange(range); if(!r) return null;
  return {r1:Math.min(r.start.row,r.end.row),r2:Math.max(r.start.row,r.end.row),c1:Math.min(r.start.column,r.end.column),c2:Math.max(r.start.column,r.end.column)};
}
function sheetRangeContains(range,row,column) {
  const b=sheetRangeBounds(range); return !!b && row>=b.r1 && row<=b.r2 && column>=b.c1 && column<=b.c2;
}
function findMergeAt(merges,row,column) { return (merges||[]).find(m=>row>=m.r1&&row<=m.r2&&column>=m.c1&&column<=m.c2) || null; }
function findMergeAnchor(merges,row,column) { const m=findMergeAt(merges,row,column); return m ? {row:m.r1,column:m.c1} : {row,column}; }
let sheetSelectionViewportListenersInstalled = false;

function installSheetSelectionViewportListeners(){
  if (sheetSelectionViewportListenersInstalled) return;
  sheetSelectionViewportListenersInstalled = true;

  ["reportTableContainer","brokerTableContainer"].forEach(id => {
    const container = $(id);
    if (!container) return;

    container.addEventListener("scroll", () => {
      if (id === "reportTableContainer") renderSheetSelectionHandles("report");
      else renderSheetSelectionHandles("broker");
    }, {passive:true});
  });

  window.addEventListener("resize", () => {
    renderSheetSelectionHandles("report");
    renderSheetSelectionHandles("broker");
  }, {passive:true});
}

function clearSheetSelectionHandles(){
  document.querySelectorAll(".sheet-range-handle").forEach(el=>el.remove());
}
function sheetCellAtPoint(kind,x,y){
  const selector=kind==="report"?"[data-report-cell],[data-report-input]":"[data-broker-cell],[data-broker-input]";
  let el=document.elementFromPoint(x,y);
  if(!el) return null;
  el=el.closest(selector);
  if(!el) return null;
  const key=el.dataset[kind==="report"?"reportCell":"brokerCell"] || el.dataset[kind==="report"?"reportInput":"brokerInput"];
  if(!key) return null;
  const [row,column]=key.split(":").map(Number);
  return Number.isFinite(row)&&Number.isFinite(column)?{row,column}:null;
}
function getRenderedSheetCell(kind, row, column) {
  const cellAttr = kind === "report" ? "data-report-cell" : "data-broker-cell";
  let el = document.querySelector(`[${cellAttr}="${row}:${column}"]`);
  if (el) return el;

  const model = kind === "report" ? getReportConfig() : brokerData;
  const merge = findMergeAt(model.merges || [], row, column);
  if (merge) {
    return document.querySelector(
      `[${cellAttr}="${merge.r1}:${merge.c1}"]`
    );
  }
  return null;
}

function renderSheetSelectionHandles(kind){
  clearSheetSelectionHandles();

  const range = kind === "report" ? selectedReportRange : selectedBrokerRange;
  const b = sheetRangeBounds(range);
  if (!b) return;

  const container = $(kind === "report" ? "reportTableContainer" : "brokerTableContainer");
  if (!container) return;

  const first = getRenderedSheetCell(kind, b.r1, b.c1);
  const last  = getRenderedSheetCell(kind, b.r2, b.c2);
  if (!first || !last) return;

  /*
   * The sheet container is horizontally/vertically scrollable.
   * getBoundingClientRect() is viewport-relative, while our handles are
   * absolutely positioned inside the scrollable container. Therefore the
   * current scroll offsets MUST be added to the calculated coordinates.
   * Without this, the handles disappear as soon as the sheet is scrolled.
   */
  const cr = container.getBoundingClientRect();
  const fr = first.getBoundingClientRect();
  const lr = last.getBoundingClientRect();

  const isSingleColumn = b.c1 === b.c2;
  const isSingleRow = b.r1 === b.r2;
  const positions = isSingleColumn
    ? [
        { name: "start", left: fr.right - cr.left + container.scrollLeft, top: fr.top - cr.top + container.scrollTop },
        { name: "end",   left: lr.right - cr.left + container.scrollLeft, top: lr.bottom - cr.top + container.scrollTop }
      ]
    : isSingleRow
      ? [
          { name: "start", left: fr.left - cr.left + container.scrollLeft, top: fr.bottom - cr.top + container.scrollTop },
          { name: "end",   left: lr.right - cr.left + container.scrollLeft, top: lr.bottom - cr.top + container.scrollTop }
        ]
      : [
          { name: "start", left: fr.left - cr.left + container.scrollLeft, top: fr.top - cr.top + container.scrollTop },
          { name: "end",   left: lr.right - cr.left + container.scrollLeft, top: lr.bottom - cr.top + container.scrollTop }
        ];

  positions.forEach(pos => {
    const h = document.createElement("span");
    h.className = "sheet-range-handle sheet-range-handle-" + pos.name;
    h.dataset.sheetHandle = pos.name;
    h.dataset.sheetKind = kind;
    h.style.left = pos.left + "px";
    h.style.top = pos.top + "px";
    container.appendChild(h);

    let pointerId = null;

    h.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();

      pointerId = event.pointerId;
      try { h.setPointerCapture?.(pointerId); } catch (e) {}

      const fixed = pos.name === "start"
        ? {row:b.r2, column:b.c2}
        : {row:b.r1, column:b.c1};

      const move = ev => {
        if (ev.pointerId !== pointerId) return;

        const cell = sheetCellAtPoint(kind, ev.clientX, ev.clientY);
        if (!cell) return;

        const next = pos.name === "start"
          ? {start:cell, end:fixed}
          : {start:fixed, end:cell};

        if (kind === "report") {
          updateReportRangeSelection(next);
        } else {
          updateBrokerRangeSelection(next);
        }

        ev.preventDefault();
      };

      const up = ev => {
        if (ev.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        pointerId = null;
      };

      document.addEventListener("pointermove", move, {passive:false});
      document.addEventListener("pointerup", up, {passive:false});
    }, {passive:false});
  });
}

function updateReportRangeSelection(range){
  selectedReportRange=normalizeSheetRange(range);
  if(selectedReportRange){ const a=findMergeAnchor(getReportConfig().merges,selectedReportRange.start.row,selectedReportRange.start.column); selectedReportCell=a.row+":"+a.column; selectedReportColumn=a.column; }
  document.querySelectorAll(".report-selected-cell,.report-selected-range").forEach(x=>x.classList.remove("report-selected-cell","report-selected-range"));
  const b=sheetRangeBounds(selectedReportRange);
  document.querySelectorAll("[data-report-select-column]").forEach(header=>header.removeAttribute("data-selected-column"));
  if(b) {
    document.querySelectorAll("[data-report-cell]").forEach(cell=>{const [r,c]=cell.dataset.reportCell.split(":").map(Number);if(r>=b.r1&&r<=b.r2&&c>=b.c1&&c<=b.c2)cell.classList.add("report-selected-range");});
    document.querySelectorAll("[data-report-select-column]").forEach(header=>{const c=Number(header.dataset.reportSelectColumn);if(c>=b.c1&&c<=b.c2)header.setAttribute("data-selected-column","true");});
  }
  syncReportToolbarToSelection(); updateMergeButtonState("report");
  requestAnimationFrame(()=>renderSheetSelectionHandles("report"));
}
function updateBrokerRangeSelection(range){
  selectedBrokerRange=normalizeSheetRange(range);
  if(selectedBrokerRange){ const a=findMergeAnchor(brokerData.merges,selectedBrokerRange.start.row,selectedBrokerRange.start.column); selectedBrokerCell=a.row+":"+a.column; selectedBrokerColumn=a.column; }
  document.querySelectorAll(".report-selected-cell,.report-selected-range").forEach(x=>x.classList.remove("report-selected-cell","report-selected-range"));
  const b=sheetRangeBounds(selectedBrokerRange);
  document.querySelectorAll("[data-broker-select-column]").forEach(header=>header.removeAttribute("data-selected-column"));
  if(b) {
    document.querySelectorAll("[data-broker-cell]").forEach(cell=>{const [r,c]=cell.dataset.brokerCell.split(":").map(Number);if(r>=b.r1&&r<=b.r2&&c>=b.c1&&c<=b.c2)cell.classList.add("report-selected-range");});
    document.querySelectorAll("[data-broker-select-column]").forEach(header=>{const c=Number(header.dataset.brokerSelectColumn);if(c>=b.c1&&c<=b.c2)header.setAttribute("data-selected-column","true");});
  }
  syncBrokerToolbarToSelection(); updateMergeButtonState("broker");
  requestAnimationFrame(()=>renderSheetSelectionHandles("broker"));
}
function enableMobileColumnRangeSelection(selector, kind){
  document.querySelectorAll(selector).forEach(header=>{
    let dragging=false, startCol=null, lastCol=null, pointerId=null;
    header.addEventListener("pointerdown", event=>{
      if(event.target.closest("input,button,.report-column-resize,.report-col-resize")) return;
      startCol=Number(header.dataset[kind==="report"?"reportSelectColumn":"brokerSelectColumn"]);
      lastCol=startCol; pointerId=event.pointerId; dragging=false;
      try{header.setPointerCapture?.(pointerId);}catch(e){}
      const move=ev=>{
        if(pointerId!==ev.pointerId) return;
        const el=document.elementFromPoint(ev.clientX,ev.clientY)?.closest(selector);
        if(!el) return;
        const col=Number(el.dataset[kind==="report"?"reportSelectColumn":"brokerSelectColumn"]);
        if(!Number.isFinite(col) || col===lastCol) return;
        dragging=true; lastCol=col;
        const maxRow=Math.max(0,(kind==="report"?getReportRows():brokerData.rows).length-1);
        if(kind==="report") updateReportRangeSelection({start:{row:0,column:startCol},end:{row:maxRow,column:col}});
        else updateBrokerRangeSelection({start:{row:0,column:startCol},end:{row:maxRow,column:col}});
      };
      const up=ev=>{
        if(pointerId!==ev.pointerId) return;
        document.removeEventListener("pointermove",move);
        document.removeEventListener("pointerup",up);
        if(dragging){
          const a=Math.min(startCol,lastCol), b=Math.max(startCol,lastCol);
          const maxRow=Math.max(0,(kind==="report"?getReportRows():brokerData.rows).length-1);
          if(kind==="report") updateReportRangeSelection({start:{row:0,column:a},end:{row:maxRow,column:b}});
          else updateBrokerRangeSelection({start:{row:0,column:a},end:{row:maxRow,column:b}});
          showToast(`${b-a+1} columns selected. Tap Merge to combine them.`);
        }
        startCol=null; lastCol=null; pointerId=null;
      };
      document.addEventListener("pointermove",move);
      document.addEventListener("pointerup",up,{once:false});
    },{passive:true});
  });
}


/* ==========================================
   MOBILE RANGE SELECTION (CELLS + ROWS)
   Google Sheets-like contiguous rectangular
   selection by touch drag in any direction.
========================================== */
function enableMobileCellRangeSelection(selector, kind){
  document.querySelectorAll(selector).forEach(input=>{
    let start=null, dragging=false, pointerId=null;
    const getRangeCell = el => {
      const node=el?.closest?.(selector);
      if(!node) return null;
      const key=node.dataset[kind==='report'?'reportInput':'brokerInput'];
      if(!key) return null;
      const [row,column]=key.split(':').map(Number);
      return {row,column};
    };
    input.addEventListener('pointerdown',event=>{
      if(event.button!==0) return;
      const cell=getRangeCell(input); if(!cell) return;
      start=cell; dragging=false; pointerId=event.pointerId;
      try{input.setPointerCapture?.(pointerId);}catch(e){}
      const move=ev=>{
        if(pointerId!==ev.pointerId || !start) return;
        const cell2=getRangeCell(document.elementFromPoint(ev.clientX,ev.clientY));
        if(!cell2) return;
        if(cell2.row!==start.row || cell2.column!==start.column){
          dragging=true;
          ev.preventDefault();
          const range={start,end:cell2};
          if(kind==='report') updateReportRangeSelection(range);
          else updateBrokerRangeSelection(range);
        }
      };
      const up=ev=>{
        if(pointerId!==ev.pointerId) return;
        document.removeEventListener('pointermove',move);
        document.removeEventListener('pointerup',up);
        if(dragging){
          ev.preventDefault();
          showToast('Range selected. Tap Merge to combine the selected cells.');
        }
        start=null; dragging=false; pointerId=null;
      };
      document.addEventListener('pointermove',move,{passive:false});
      document.addEventListener('pointerup',up,{passive:false});
    },{passive:true});
  });
}

function enableMobileRowRangeSelection(selector, kind){
  document.querySelectorAll(selector).forEach(handle=>{
    let startRow=null, dragging=false, pointerId=null;
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0) return;
      const row=Number(handle.closest('[data-report-row],[data-broker-row]')?.dataset[kind==='report'?'reportRow':'brokerRow']);
      if(!Number.isFinite(row)) return;
      startRow=row; dragging=false; pointerId=event.pointerId;
      try{handle.setPointerCapture?.(pointerId);}catch(e){}
      const move=ev=>{
        if(pointerId!==ev.pointerId || startRow===null) return;
        const el=document.elementFromPoint(ev.clientX,ev.clientY)?.closest(selector);
        if(!el) return;
        const row2=Number(el.closest('[data-report-row],[data-broker-row]')?.dataset[kind==='report'?'reportRow':'brokerRow']);
        if(!Number.isFinite(row2) || row2===startRow) return;
        dragging=true; ev.preventDefault();
        const maxCol=Math.max(0,(kind==='report'?getReportConfig().headings:brokerData.headings).length-1);
        const range={start:{row:startRow,column:0},end:{row:row2,column:maxCol}};
        if(kind==='report') updateReportRangeSelection(range);
        else updateBrokerRangeSelection(range);
      };
      const up=ev=>{
        if(pointerId!==ev.pointerId) return;
        document.removeEventListener('pointermove',move);
        document.removeEventListener('pointerup',up);
        if(dragging){ev.preventDefault();showToast('Rows selected. Tap Merge to combine the selected cells.');}
        startRow=null;dragging=false;pointerId=null;
      };
      document.addEventListener('pointermove',move,{passive:false});
      document.addEventListener('pointerup',up,{passive:false});
    },{passive:true});
  });
}

function mergeIconSVG(unmerge=false){
  if(unmerge){
    return `<svg class="sheet-inline-icon" viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke="#f2edf2" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 20h16M40 20h16M8 44h16M40 44h16"/>
        <path d="M16 32h32"/>
        <path d="M28 26l10 6-10 6M36 26l-10 6 10 6"/>
      </g>
    </svg>`;
  }
  return `<svg class="sheet-inline-icon" viewBox="0 0 64 64" aria-hidden="true">
    <g fill="none" stroke="#f2edf2" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 20h16M40 20h16M8 44h16M40 44h16"/>
      <path d="M16 32h32"/>
      <path d="M26 26l-10 6 10 6M38 26l10 6-10 6"/>
    </g>
  </svg>`;
}

function updateMergeButtonState(kind){
  const btn = $(kind === "report" ? "reportMergeBtn" : "brokerMergeBtn");
  if (!btn) return;

  const range = kind === "report" ? selectedReportRange : selectedBrokerRange;
  const b = sheetRangeBounds(range);
  const merges = kind === "report"
    ? (getReportConfig().merges || [])
    : (brokerData.merges || []);

  const exact = b && merges.find(m =>
    m.r1 === b.r1 && m.r2 === b.r2 &&
    m.c1 === b.c1 && m.c2 === b.c2
  );

  btn.innerHTML = mergeIconSVG(!!exact);
  btn.title = exact ? "Unmerge selected cells" : "Merge selected cells";
  btn.setAttribute("aria-label", btn.title);
  btn.dataset.mergeState = exact ? "unmerge" : "merge";
}

function mergeRangeIntoModel(kind){
  const isReport=kind==="report", range=isReport?selectedReportRange:selectedBrokerRange, b=sheetRangeBounds(range);
  if(!b || (b.r1===b.r2&&b.c1===b.c2)){showToast("Select two or more cells to merge.");return;}
  const model=isReport?getReportConfig():brokerData; if(!Array.isArray(model.merges))model.merges=[];
  const exact=model.merges.find(m=>m.r1===b.r1&&m.r2===b.r2&&m.c1===b.c1&&m.c2===b.c2);
  if(exact){ if(isReport)pushReportHistory(currentReportPeriod);else pushBrokerHistory(); model.merges=model.merges.filter(m=>m!==exact); if(isReport)saveReportToDatabase().then(renderReportTable);else{saveBrokerData();renderBrokerSheet();} showToast("Cells unmerged."); return; }
  if(model.merges.some(m=>!(b.r2<m.r1||b.r1>m.r2||b.c2<m.c1||b.c1>m.c2))){showToast("Selected range overlaps an existing merged range.");return;}
  if(isReport)pushReportHistory(currentReportPeriod);else pushBrokerHistory();
  const rows=isReport?getReportRows():brokerData.rows;
  for(let r=b.r1;r<=b.r2;r++)for(let c=b.c1;c<=b.c2;c++)if(!(r===b.r1&&c===b.c1)&&rows[r])rows[r][c]="";
  model.merges.push({r1:b.r1,r2:b.r2,c1:b.c1,c2:b.c2});
  if(isReport)saveReportToDatabase().then(renderReportTable).catch(e=>showToast("Merge save failed: "+e.message));else{saveBrokerData();renderBrokerSheet();}
  showToast("Cells merged.");
}
function renderReportTable() {
  installSheetSelectionViewportListeners();
  const container = $("reportTableContainer");
  if (!container) return;

  ensureReportColumnToolbar(container);

  const rows = getReportRows();
  const config = getReportConfig();
  const count = config.headings.length;

  const headerHTML = config.headings.map((heading,column) => `
    <th data-report-select-column="${column}"
      style="width:${numberValue(config.widths[column]) || 150}px">
      <div class="sheet-col-letter">${reportColumnName(column)}</div>
      <div class="report-header-content">
        <input class="report-heading-input"
          data-report-heading="${column}"
          value="${safeText(heading)}"
          aria-label="Column heading ${column + 1}">
      </div>
      <span class="report-resize-handle" data-resize-column="${column}"></span>
    </th>
  `).join("");

  const merges=config.merges||[];
  const bodyHTML = rows.map((row,rowIndex) => {
    const height = numberValue(config.rowHeights[rowIndex]) || 44;
    const cells = [];
    for(let column=0;column<count;column++){
      const heading=config.headings[column];
      const merge=findMergeAt(merges,rowIndex,column);
      if(merge && (rowIndex!==merge.r1 || column!==merge.c1)) continue;
      const key = rowIndex + ":" + column;
      const colspan=merge?merge.c2-merge.c1+1:1;
      const rowspan=merge?merge.r2-merge.r1+1:1;
      const style = config.cells[key] || {};
      const columnStyle = config.columnStyles[column] || {};
      const merged = {...config.defaultStyle,...columnStyle,...style};
      const css = [
        merged.color ? "color:" + merged.color : "",
        merged.background ? "background:" + merged.background : "",
        merged.fontSize ? "font-size:" + merged.fontSize + "px" : "",
        merged.fontFamily ? "font-family:" + merged.fontFamily : "",
        merged.bold ? "font-weight:bold" : "",
        merged.italic ? "font-style:italic" : "",
        merged.align ? "text-align:" + merged.align : "",
        merged.vertical ? "vertical-align:" + merged.vertical : "",
        merged.wrap === false ? "white-space:nowrap" : "white-space:pre-wrap"
      ].filter(Boolean).join(";");

      cells.push(`<td colspan="${colspan}" rowspan="${rowspan}" style="${css};height:${height}px" data-report-cell="${rowIndex}:${column}">
        <textarea class="report-cell-input" data-report-input="${rowIndex}:${column}"
          aria-label="${safeText(heading)} row ${rowIndex + 1}" style="${css}">${safeText(row[column] || "")}</textarea>
      </td>`);
    }
    const cellHTML=cells.join("");

    return `<tr data-report-row="${rowIndex}" style="height:${height}px">
      <td class="report-row-number"><span>${rowIndex + 1}</span><span class="report-row-resize" data-resize-row="${rowIndex}"></span></td>
      ${cellHTML}
    </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="report-table">
      <thead><tr>
        <th class="report-row-number sheet-corner">#</th>
        ${headerHTML}
      </tr></thead>
      <tbody>
        ${bodyHTML || `<tr><td colspan="${count + 1}" class="empty-cell">No report rows. Click Add Row to begin.</td></tr>`}
      </tbody>
    </table>
  `;

  attachReportCellEvents();
}

/* ==========================================
   REPORT EXPORT
========================================== */

function getCurrentReportExportTitle() {
  const modeName = currentMode === "intraday" ? "Intraday Trading" : currentMode === "swing" ? "Swing Trading" : "Long Term Trading";
  const periodName = String(currentReportPeriod || "daily").charAt(0).toUpperCase() + String(currentReportPeriod || "daily").slice(1);
  return `${modeName} - ${periodName} Report`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCurrentReportCSV() {
  captureReportInputs();
  const rows = getReportRows();
  const config = getReportConfig();
  const output = [config.headings.map(csvEscape).join(",")];
  rows.forEach(row => {
    output.push(config.headings.map((_, i) => csvEscape(row[i] || "")).join(","));
  });
  const blob = new Blob(["\ufeff" + output.join("\r\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getCurrentReportExportTitle().replace(/[^a-z0-9]+/gi,"-").toLowerCase() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("CSV exported.");
}

function exportCurrentReportPDF() {
  captureReportInputs();
  const rows = getReportRows();
  const config = getReportConfig();
  const title = getCurrentReportExportTitle();
  downloadPDF(title.replace(/[^a-z0-9]+/gi,"-").toLowerCase()+".pdf", title, config.headings, rows);
}


/* ==========================================
   REPORT COLUMN MANAGEMENT
========================================== */

async function addReportColumn() {
  pushReportHistory(currentReportPeriod);
  const heading = prompt("Enter new column heading:");
  if (heading === null) return;

  const name = heading.trim();
  if (!name) {
    showToast("Column heading cannot be empty.");
    return;
  }

  captureReportInputs();

  const config = getReportConfig();
  const rows = getReportRows();

  const newColumnIndex = config.headings.length;
  config.headings.push(name);
  config.widths.push(120);
  rows.forEach(row => row.push(""));

  try {
    await saveReportToDatabase();
    renderReportTable();
    showToast("New column added.");
  } catch(error) {
    config.headings.pop();
    config.widths.pop();
    rows.forEach(row => row.pop());
    showToast("Column add failed: " + error.message);
  }
}

async function editReportColumn() {
  pushReportHistory(currentReportPeriod);
  if (selectedReportColumn === null) {
    showToast("Select a column heading first.");
    return;
  }

  const config = getReportConfig();
  const index = selectedReportColumn;

  if (index < 0 || index >= config.headings.length) return;

  const updated = prompt("Edit column heading:",config.headings[index]);
  if (updated === null) return;

  if (!updated.trim()) {
    showToast("Column heading cannot be empty.");
    return;
  }

  captureReportInputs();
  config.headings[index] = updated.trim();

  try {
    await saveReportToDatabase();
    renderReportTable();
    selectedReportColumn = index;
    showToast("Column heading updated.");
  } catch(error) {
    showToast("Column edit failed: " + error.message);
  }
}

async function deleteReportColumn() {
  pushReportHistory(currentReportPeriod);
  if (selectedReportColumn === null) {
    showToast("Select a column heading first.");
    return;
  }

  const config = getReportConfig();
  const index = selectedReportColumn;

  if (config.headings.length <= 1) {
    showToast("At least one report column must remain.");
    return;
  }

  if (!confirm("Delete column '" + config.headings[index] +
      "' and all its values from this report period?")) return;

  captureReportInputs();

  config.headings.splice(index,1);
  config.widths.splice(index,1);

  getReportRows().forEach(row => row.splice(index,1));

  const remapped = {};
  Object.entries(config.cells).forEach(([key,value]) => {
    const [row,column] = key.split(":").map(Number);
    if (column < index) remapped[key] = value;
    if (column > index) remapped[row + ":" + (column - 1)] = value;
  });
  config.cells = remapped;

  const newStyles = {};
  Object.entries(config.columnStyles).forEach(([key,value]) => {
    const column = Number(key);
    if (column < index) newStyles[column] = value;
    if (column > index) newStyles[column - 1] = value;
  });
  config.columnStyles = newStyles;

  selectedReportColumn = null;
  selectedReportCell = null;

  try {
    await saveReportToDatabase();
    renderReportTable();
    showToast("Column deleted.");
  } catch(error) {
    showToast("Column delete failed: " + error.message);
  }
}

/* ==========================================
   REPORT DATA SAVING
========================================== */

function saveReportCell(rowIndex,column,value) {
  const rows = getReportRows();
  const config = getReportConfig();

  while (rows.length <= rowIndex) {
    rows.push(Array(config.headings.length).fill(""));
  }

  while (rows[rowIndex].length < config.headings.length) {
    rows[rowIndex].push("");
  }

  rows[rowIndex][column] = value;
}

function captureReportInputs() {
  document.querySelectorAll("[data-report-input]").forEach(input => {
    const [row,column] = input.dataset.reportInput.split(":").map(Number);
    saveReportCell(row,column,input.value);
  });

  document.querySelectorAll("[data-report-cell]").forEach(cell => {
    cell.addEventListener("click", event => {
      if (event.target.closest("textarea,input,button")) return;
      const [row,column] = cell.dataset.reportCell.split(":").map(Number);
      selectedReportCell = row + ":" + column;
      selectedReportColumn = column;
      document.querySelectorAll(".report-selected-cell").forEach(x => x.classList.remove("report-selected-cell"));
      cell.classList.add("report-selected-cell");
      syncReportToolbarToSelection();
      requestAnimationFrame(() => syncReportToolbarToSelection());
    });
  });

  document.querySelectorAll("[data-report-row]").forEach(rowEl => {
    rowEl.querySelector(".report-row-number")?.addEventListener("click", () => {
      const row = Number(rowEl.dataset.reportRow);
      if (!Number.isFinite(row)) return;
      selectedReportCell = row + ":0";
      selectedReportColumn = 0;
      document.querySelectorAll(".report-selected-cell").forEach(x => x.classList.remove("report-selected-cell"));
      rowEl.querySelector("td[data-report-cell]")?.classList.add("report-selected-cell");
      syncReportToolbarToSelection();
      showToast("Row selected.");
    });
  });

  enableMobileColumnRangeSelection("[data-report-select-column]", "report");

  document.querySelectorAll("[data-report-heading]").forEach(input => {
    const column = Number(input.dataset.reportHeading);
    const config = getReportConfig();
    if (column < 5) {
      config.headings[column] =
        input.value.trim() || REPORT_HEADINGS[currentReportPeriod][column];
    } else {
      config.headings[column] = input.value.trim() || "New Column";
    }
  });
}

async function addReportRow() {
  pushReportHistory(currentReportPeriod);
  captureReportInputs();
  const rows = getReportRows();
  const config = getReportConfig();
  const oldLength = rows.length;

  rows.push(Array(config.headings.length).fill(""));

  try {
    await saveReportToDatabase();
    renderReportTable();
    showToast("Report row added.");
  } catch(error) {
    rows.splice(oldLength,1);
    renderReportTable();
    showToast("Save failed: " + error.message);
  }
}

async function insertReportRowBelowSelected() {
  pushReportHistory(currentReportPeriod);
  captureReportInputs();
  const rows = getReportRows();
  const config = getReportConfig();
  let insertIndex = rows.length;

  if (selectedReportCell) {
    const selectedRow = Number(String(selectedReportCell).split(":")[0]);
    if (Number.isFinite(selectedRow)) insertIndex = Math.min(rows.length, selectedRow + 1);
  }

  rows.splice(insertIndex, 0, Array(config.headings.length).fill(""));

  const newCells = {};
  Object.entries(config.cells).forEach(([key,value]) => {
    const [row,column] = key.split(":").map(Number);
    const nextRow = row >= insertIndex ? row + 1 : row;
    newCells[nextRow + ":" + column] = value;
  });
  config.cells = newCells;

  const newHeights = {};
  Object.entries(config.rowHeights).forEach(([key,value]) => {
    const row = Number(key);
    const nextRow = row >= insertIndex ? row + 1 : row;
    newHeights[nextRow] = value;
  });
  newHeights[insertIndex] = 44;
  config.rowHeights = newHeights;

  try {
    await saveReportToDatabase();
    selectedReportCell = insertIndex + ":0";
    selectedReportColumn = null;
    renderReportTable();
    showToast("Row inserted below selected row.");
  } catch(error) {
    rows.splice(insertIndex,1);
    showToast("Row insert failed: " + error.message);
  }
}

async function insertReportColumnRightOfSelected() {
  pushReportHistory(currentReportPeriod);
  captureReportInputs();
  const config = getReportConfig();
  const rows = getReportRows();
  let insertIndex = config.headings.length;

  if (selectedReportColumn !== null) {
    insertIndex = Math.min(config.headings.length, Number(selectedReportColumn) + 1);
  }

  config.headings.splice(insertIndex, 0, "New Column");
  config.widths.splice(insertIndex, 0, 120);

  const newStyles = {};
  Object.entries(config.columnStyles).forEach(([key,value]) => {
    const column = Number(key);
    const nextColumn = column >= insertIndex ? column + 1 : column;
    newStyles[nextColumn] = value;
  });
  config.columnStyles = newStyles;

  const newCells = {};
  Object.entries(config.cells).forEach(([key,value]) => {
    const [row,column] = key.split(":").map(Number);
    const nextColumn = column >= insertIndex ? column + 1 : column;
    newCells[row + ":" + nextColumn] = value;
  });
  config.cells = newCells;

  rows.forEach(row => row.splice(insertIndex, 0, ""));

  try {
    await saveReportToDatabase();
    selectedReportColumn = insertIndex;
    selectedReportCell = null;
    renderReportTable();
    showToast("Column inserted to the right of selected column.");
  } catch(error) {
    config.headings.splice(insertIndex,1);
    config.widths.splice(insertIndex,1);
    rows.forEach(row => row.splice(insertIndex,1));
    showToast("Column insert failed: " + error.message);
  }
}

async function deleteReportRow(index) {
  if (!confirm("Delete report row " + (index + 1) + "?")) return;
  pushReportHistory(currentReportPeriod);

  captureReportInputs();
  getReportRows().splice(index,1);

  const config = getReportConfig();
  const newCells = {};

  Object.entries(config.cells).forEach(([key,value]) => {
    const [row,column] = key.split(":").map(Number);
    if (row < index) newCells[key] = value;
    if (row > index) newCells[(row - 1) + ":" + column] = value;
  });
  config.cells = newCells;

  const newHeights = {};
  Object.entries(config.rowHeights).forEach(([key,value]) => {
    const row = Number(key);
    if (row < index) newHeights[row] = value;
    if (row > index) newHeights[row - 1] = value;
  });
  config.rowHeights = newHeights;

  await saveReportToDatabase();
  renderReportTable();
}

async function saveReportColumn(column) {
  captureReportInputs();
  await saveReportToDatabase();
  showToast("Column saved.");
}

async function saveAllReportData() {
  captureReportInputs();
  await saveReportToDatabase();

  if ($("reportMessage")) {
    $("reportMessage").textContent = "Report saved successfully.";
  }
  showToast("Report saved.");
}

/* ==========================================
   REPORT CELL EVENTS
========================================== */

function attachReportCellEvents() {
  document.querySelectorAll("[data-report-input]").forEach(input => {
    input.addEventListener("focus",() => {
      pushReportHistory(currentReportPeriod);
      selectedReportCell = input.dataset.reportInput;
      selectedReportColumn = Number(String(selectedReportCell).split(":")[1]);
      const [fr,fc]=selectedReportCell.split(":").map(Number);
      if(!selectedReportRange || !sheetRangeContains(selectedReportRange,fr,fc)) selectedReportRange={start:{row:fr,column:fc},end:{row:fr,column:fc}}; requestAnimationFrame(()=>renderSheetSelectionHandles("report"));

      document.querySelectorAll(".report-selected-cell,.report-selected-range").forEach(cell => {
        cell.classList.remove("report-selected-cell");
      });

      input.closest("td")?.classList.add("report-selected-cell");
      // Keep every toolbar control synchronized with the formatting of the
      // newly selected cell. The cell may use the fixed default style even
      // when the toolbar was previously showing the formatting of another
      // cell/column.
      syncReportToolbarToSelection();
    });

    input.addEventListener("input",() => {
      const [row,column] = input.dataset.reportInput.split(":").map(Number);
      saveReportCell(row,column,input.value);
    });
  });

  document.querySelectorAll("[data-report-input]").forEach(input => {
    input.addEventListener("paste", event => {
      const text = event.clipboardData?.getData("text/plain") || "";
      if (!text.includes("\t") && !text.includes("\n")) return;
      event.preventDefault();
      pushReportHistory(currentReportPeriod);
      const [startRow,startCol] = input.dataset.reportInput.split(":").map(Number);
      const matrix = text.replace(/\r/g, "").split("\n").map(line => line.split("\t"));
      const rows = getReportRows();
      const config = getReportConfig();
      matrix.forEach((values,rOffset) => {
        const r = startRow + rOffset;
        while (rows.length <= r) rows.push(Array(config.headings.length).fill(""));
        values.forEach((value,cOffset) => {
          const c = startCol + cOffset;
          while (config.headings.length <= c) {
            const newCol = config.headings.length;
            config.headings.push("New Column");
            config.widths.push(150);
            delete config.columnStyles[newCol];
          }
          while (rows[r].length <= c) rows[r].push("");
          rows[r][c] = value;
        });
      });
      saveReportToDatabase().then(renderReportTable).catch(error => showToast("Paste save failed: " + error.message));
    });
  });

  document.querySelectorAll("[data-report-select-column]").forEach(header => {
    header.addEventListener("click",event => {
      if (event.target.closest("button,input,.report-resize-handle")) return;

      const col=Number(header.dataset.reportSelectColumn);
      const maxRow=Math.max(0,getReportRows().length-1);
      if(event.shiftKey&&selectedReportColumn!==null){
        updateReportRangeSelection({start:{row:0,column:selectedReportColumn},end:{row:maxRow,column:col}});
      } else {
        updateReportRangeSelection({start:{row:0,column:col},end:{row:maxRow,column:col}});
      }
      showToast("Column selected. Drag the ↔ handle at the header edge to resize.");
    });
  });

  document.querySelectorAll("[data-report-heading]").forEach(input => {
    input.addEventListener("focus",() => {
      pushReportHistory(currentReportPeriod);
      selectedReportColumn = Number(input.dataset.reportHeading);
      selectedReportCell = null;
      syncReportToolbarToSelection();
    });

    input.addEventListener("change",async () => {
      const column = Number(input.dataset.reportHeading);
      const config = getReportConfig();

      config.headings[column] = input.value.trim() ||
        (column < 5
          ? REPORT_HEADINGS[currentReportPeriod][column]
          : "New Column");

      try {
        await saveReportToDatabase();
      } catch(error) {
        showToast("Heading save failed: " + error.message);
      }
    });
  });

  document.querySelectorAll("[data-delete-report-row]").forEach(button => {
    button.addEventListener("click",() => {
      deleteReportRow(Number(button.dataset.deleteReportRow))
        .catch(error => showToast("Row delete failed: " + error.message));
    });
  });

  enableMobileRowRangeSelection("[data-report-row] .report-row-number", "report");
  attachColumnResizeEvents();
  attachRowResizeEvents();
}

/* ==========================================
   REPORT RESIZING
========================================== */

document.addEventListener("keydown", event => {
  const active = document.activeElement?.closest?.("[data-report-input]");
  if (!active) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    const text = active.value || "";
    navigator.clipboard?.writeText(text).catch(() => {});
  }
});

function attachColumnResizeEvents() {
  document.querySelectorAll("[data-resize-column]").forEach(handle => {
    handle.addEventListener("pointerdown",event => {
      pushReportHistory(currentReportPeriod);
      event.preventDefault();
      event.stopPropagation();
      try { handle.setPointerCapture?.(event.pointerId); } catch (e) {}

      const column = Number(handle.dataset.resizeColumn);
      const config = getReportConfig();
      const startX = event.clientX;
      const startWidth = numberValue(config.widths[column]) || 150;

      let raf = 0;
      let currentClientX = startX;
      const applyWidth = () => {
        raf = 0;
        config.widths[column] = Math.max(80,startWidth + currentClientX - startX);
        const table = $("reportTableContainer")?.querySelector("table");
        if (table) {
          table.querySelectorAll("tr").forEach(row => {
            const cell = row.children[column + 1];
            if (cell) cell.style.width = config.widths[column] + "px";
          });
        }
      };
      const move = moveEvent => {
        currentClientX = moveEvent.clientX;
        if (!raf) raf = requestAnimationFrame(applyWidth);
      };

      const end = async () => {
        if (raf) { cancelAnimationFrame(raf); applyWidth(); }
        document.removeEventListener("pointermove",move);
        document.removeEventListener("pointerup",end);
        document.removeEventListener("pointercancel",end);
        try {
          await saveReportToDatabase();
        } catch(error) {
          showToast("Column width save failed: " + error.message);
        }
      };

      document.addEventListener("pointermove",move,{passive:false});
      document.addEventListener("pointerup",end,{once:true});
      document.addEventListener("pointercancel",end,{once:true});
    });
  });
}

function attachRowResizeEvents() {
  document.querySelectorAll("[data-resize-row]").forEach(handle => {
    handle.addEventListener("pointerdown",event => {
      pushReportHistory(currentReportPeriod);
      event.preventDefault();

      const rowIndex = Number(handle.dataset.resizeRow);
      const row = handle.closest("tr");
      const startY = event.clientY;
      const startHeight = row?.getBoundingClientRect().height || 44;
      const config = getReportConfig();

      const move = moveEvent => {
        const height = Math.max(32,startHeight + moveEvent.clientY - startY);
        config.rowHeights[rowIndex] = height;
        if (row) row.style.height = height + "px";
      };

      const end = async () => {
        document.removeEventListener("pointermove",move);
        document.removeEventListener("pointerup",end);
        try {
          await saveReportToDatabase();
        } catch(error) {
          showToast("Row height save failed: " + error.message);
        }
      };

      document.addEventListener("pointermove",move);
      document.addEventListener("pointerup",end);
    });
  });
}

/* ==========================================
   REPORT FORMATTING
========================================== */

function getSelectedReportCells() {
  if (!selectedReportCell) return [];
  const [row,column] = selectedReportCell.split(":").map(Number);
  return [{row,column}];
}

function getReportInheritanceStyle() {
  const config = getReportConfig();
  if (selectedReportCell) {
    const [row,column] = selectedReportCell.split(":").map(Number);
    return cloneSpreadsheetStyle({
      ...(config.columnStyles[column] || {}),
      ...(config.cells[row + ":" + column] || {})
    });
  }
  if (selectedReportColumn !== null) {
    return cloneSpreadsheetStyle(config.columnStyles[selectedReportColumn] || config.defaultStyle);
  }
  return cloneSpreadsheetStyle(config.defaultStyle);
}

function readRenderedSpreadsheetStyle(target, fallback) {
  const style = cloneSpreadsheetStyle(fallback);
  if (!target) return style;
  const computed = getComputedStyle(target);
  const inline = target.style || {};
  const rgbToHex = rgb => {
    const m = String(rgb).match(/\d+(?:\.\d+)?/g);
    if (!m || m.length < 3) return null;
    return "#" + m.slice(0,3).map(v => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2,"0")).join("");
  };
  const fontSize = parseFloat(inline.fontSize) || parseFloat(computed.fontSize);
  if (Number.isFinite(fontSize)) style.fontSize = Math.round(fontSize);
  const family = inline.fontFamily || computed.fontFamily;
  if (family) style.fontFamily = String(family).split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  const color = inline.color || computed.color;
  const background = inline.backgroundColor || computed.backgroundColor;
  style.color = rgbToHex(color) || style.color;
  style.background = rgbToHex(background) || style.background;
  style.align = inline.textAlign || computed.textAlign || style.align;
  style.vertical = inline.verticalAlign || computed.verticalAlign || style.vertical;
  const whiteSpace = inline.whiteSpace || computed.whiteSpace;
  style.wrap = whiteSpace !== "nowrap";
  style.bold = inline.fontWeight ? Number(inline.fontWeight) >= 600 || inline.fontWeight === "bold" : (Number(computed.fontWeight) >= 600 || computed.fontWeight === "bold");
  style.italic = inline.fontStyle ? inline.fontStyle === "italic" : computed.fontStyle === "italic";
  return style;
}

function syncReportToolbarToSelection() {
  const config = getReportConfig();
  let style = cloneSpreadsheetStyle(config.defaultStyle);

  if (selectedReportCell) {
    const [row, column] = selectedReportCell.split(":").map(Number);
    const stored = {
      ...(config.columnStyles[column] || {}),
      ...(config.cells[row + ":" + column] || {})
    };
    style = cloneSpreadsheetStyle(stored);
    const input = document.querySelector(`[data-report-input="${row}:${column}"]`);
    const target = input || document.querySelector(`[data-report-cell="${row}:${column}"]`);
    style = readRenderedSpreadsheetStyle(target, style);
  } else if (selectedReportColumn !== null) {
    style = cloneSpreadsheetStyle(config.columnStyles[selectedReportColumn] || config.defaultStyle);
    // When a column is selected, use the first existing cell in that column
    // only if the column itself has no explicit style. This prevents an old
    // toolbar value from leaking into a newly selected column.
    if (!config.columnStyles[selectedReportColumn] && getReportRows().length) {
      const target = document.querySelector(`[data-report-input="0:${selectedReportColumn}"]`);
      if (target) style = readRenderedSpreadsheetStyle(target, style);
    }
  }

  const size = $("reportFontSize"), family = $("reportFontFamily"), textColor = $("reportTextColor"), cellColor = $("reportCellColor");
  if (size) size.value = String(style.fontSize);
  if (family) family.value = style.fontFamily;
  if (textColor && /^#[0-9a-f]{6}$/i.test(style.color)) textColor.value = style.color;
  if (cellColor && /^#[0-9a-f]{6}$/i.test(style.background)) cellColor.value = style.background;
  updateSpreadsheetColorSwatch("reportText", style.color);
  updateSpreadsheetColorSwatch("reportBackground", style.background);
  document.querySelectorAll("[data-report-halign]").forEach(btn => btn.classList.toggle("active", btn.dataset.reportHalign === style.align));
  document.querySelectorAll("[data-report-valign]").forEach(btn => btn.classList.toggle("active", btn.dataset.reportValign === style.vertical));
  $("reportBoldBtn")?.classList.toggle("active", !!style.bold);
  $("reportItalicBtn")?.classList.toggle("active", !!style.italic);
  $("reportWrapBtn")?.classList.toggle("active", style.wrap !== false);
}

function syncBrokerToolbarToSelection() {
  let style = cloneSpreadsheetStyle(brokerData.defaultStyle);

  if (selectedBrokerCell) {
    const [row, column] = selectedBrokerCell.split(":").map(Number);
    const stored = {
      ...(brokerData.columnStyles[column] || {}),
      ...(brokerData.cells[row + ":" + column] || {})
    };
    style = cloneSpreadsheetStyle(stored);
    const input = document.querySelector(`[data-broker-input="${row}:${column}"]`);
    const target = input || document.querySelector(`[data-broker-cell="${row}:${column}"]`);
    style = readRenderedSpreadsheetStyle(target, style);
  } else if (selectedBrokerColumn !== null) {
    style = cloneSpreadsheetStyle(brokerData.columnStyles[selectedBrokerColumn] || brokerData.defaultStyle);
    if (!brokerData.columnStyles[selectedBrokerColumn] && brokerData.rows.length) {
      const target = document.querySelector(`[data-broker-input="0:${selectedBrokerColumn}"]`);
      if (target) style = readRenderedSpreadsheetStyle(target, style);
    }
  }

  const size = $("brokerFontSize"), family = $("brokerFontFamily"), textColor = $("brokerTextColor"), cellColor = $("brokerCellColor");
  if (size) size.value = String(style.fontSize);
  if (family) family.value = style.fontFamily;
  if (textColor && /^#[0-9a-f]{6}$/i.test(style.color)) textColor.value = style.color;
  if (cellColor && /^#[0-9a-f]{6}$/i.test(style.background)) cellColor.value = style.background;
  updateSpreadsheetColorSwatch("brokerText", style.color);
  updateSpreadsheetColorSwatch("brokerBackground", style.background);
  document.querySelectorAll("[data-broker-halign]").forEach(btn => btn.classList.toggle("active", btn.dataset.brokerHalign === style.align));
  document.querySelectorAll("[data-broker-valign]").forEach(btn => btn.classList.toggle("active", btn.dataset.brokerValign === style.vertical));
  $("brokerBoldBtn")?.classList.toggle("active", !!style.bold);
  $("brokerItalicBtn")?.classList.toggle("active", !!style.italic);
  $("brokerWrapBtn")?.classList.toggle("active", style.wrap !== false);
}

function applyReportFormatting(property,value) {
  pushReportHistory(currentReportPeriod);
  const config = getReportConfig();
  const selected = getSelectedReportCells();

  if (selected.length) {
    selected.forEach(({row,column}) => {
      const key = row + ":" + column;
      config.cells[key] = config.cells[key] || {};
      config.cells[key][property] = value;
    });
  } else if (selectedReportColumn !== null) {
    const column = selectedReportColumn;
    config.columnStyles[column] = config.columnStyles[column] || {};
    config.columnStyles[column][property] = value;
  } else {
    showToast("Select a cell or column first.");
    return;
  }

  saveReportToDatabase()
    .then(() => { renderReportTable(); syncReportToolbarToSelection(); })
    .catch(error => showToast("Formatting save failed: " + error.message));
}

function resetReportFormatting(){
  const config=getReportConfig();
  const selected=getSelectedReportCells();
  if(!selected.length && selectedReportColumn===null){showToast("Select a cell or column first.");return;}
  pushReportHistory(currentReportPeriod);
  if(selected.length){
    selected.forEach(({row,column})=>{
      config.cells[row+":"+column]=cloneSpreadsheetStyle();
    });
  }else if(selectedReportColumn!==null){
    delete config.columnStyles[selectedReportColumn];
  }
  saveReportToDatabase().then(()=>{renderReportTable();syncReportToolbarToSelection();showToast("Formatting reset to default.");}).catch(error=>showToast("Formatting reset failed: "+error.message));
}

function toggleReportFormatting(property) {
  pushReportHistory(currentReportPeriod);
  const config = getReportConfig();
  const selected = getSelectedReportCells();
  let value;

  if (selected.length) {
    const {row,column} = selected[0];
    const key = row + ":" + column;
    const current = config.cells[key]?.[property] ?? config.columnStyles[column]?.[property] ?? SPREADSHEET_DEFAULT_STYLE[property];
    value = !current;
    selected.forEach(({row,column}) => {
      const k = row + ":" + column;
      config.cells[k] = config.cells[k] || {};
      config.cells[k][property] = value;
    });
  } else if (selectedReportColumn !== null) {
    const column = selectedReportColumn;
    const st = config.columnStyles[column] || (config.columnStyles[column] = {});
    value = !(st[property] ?? SPREADSHEET_DEFAULT_STYLE[property]);
    st[property] = value;
  } else {
    showToast("Select a cell or column first.");
    return;
  }

  saveReportToDatabase()
    .then(() => { renderReportTable(); syncReportToolbarToSelection(); })
    .catch(error => showToast(error.message));
}

/* ==========================================
   GOOGLE DRIVE CONNECTION
========================================== */


function getDriveConnection() {
  return readJSON(DRIVE_CONNECTION_KEY,null);
}

function saveDriveConnection(data) {
  writeJSON(DRIVE_CONNECTION_KEY,data);
}

function updateDriveStatus() {
  const saved = getDriveConnection();
  const connected = Boolean(saved?.connected);

  if ($("driveStatus")) {
    $("driveStatus").textContent = connected
      ? "Connected to Google Drive"
      : "Not connected";
  }

  if ($("connectDriveBtn")) {
    $("connectDriveBtn").disabled = false;
    $("connectDriveBtn").textContent = connected
      ? "Reconnect Google Drive"
      : "Connect Google Drive";
  }

  if ($("disconnectDriveBtn")) {
    $("disconnectDriveBtn").disabled = !connected;
  }
  if ($("driveBackupBtn")) {
    $("driveBackupBtn").disabled = !connected;
  }
  if ($("restoreDriveBackupBtn")) {
    $("restoreDriveBackupBtn").disabled = !connected;
  }

  driveFolderId = connected ? saved.folderId || null : null;
  driveBackupFileId = connected ? saved.backupFileId || null : null;
}

function showDriveMessage(message,isError = false) {
  const element = $("driveMessage");
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#ef4444" : "#22c55e";
}

/* ==========================================
   GOOGLE OAUTH - GIS TOKEN CLIENT
========================================== */

function initializeDriveTokenClient() {
  if (!window.google?.accounts?.oauth2) {
    showDriveMessage("Google Identity Services is unavailable.",true);
    return false;
  }

  if (driveTokenClient) return true;

  driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id:GOOGLE_CLIENT_ID,
    scope:DRIVE_SCOPE,

    callback:response => {
      if (response.error || !response.access_token) {
        const error = new Error(
          response.error || "Google authorization failed."
        );

        drivePendingReject?.(error);
        drivePendingResolve = null;
        drivePendingReject = null;
        const detail = response.error_description || response.error || "Google authorization failed.";
        showDriveMessage("Google authorization failed: " + detail,true);
        return;
      }

      driveAccessToken = response.access_token;
      drivePendingResolve?.(driveAccessToken);
      drivePendingResolve = null;
      drivePendingReject = null;
    }
  });

  return true;
}

function requestDriveToken(promptValue) {
  if (!initializeDriveTokenClient()) {
    return Promise.reject(
      new Error("Google Identity Services unavailable.")
    );
  }

  return new Promise((resolve,reject) => {
    drivePendingResolve = resolve;
    drivePendingReject = reject;

    try {
      driveTokenClient.requestAccessToken({prompt:promptValue});
    } catch(error) {
      drivePendingResolve = null;
      drivePendingReject = null;
      reject(error);
    }
  });
}

async function connectGoogleDrive() {
  try {
    showDriveMessage("Opening Google authorization...");
    await requestDriveToken("consent");
    await finishDriveConnection();
  } catch(error) {
    showDriveMessage("Google Drive connection failed: " + error.message,true);
  }
}

async function refreshDriveToken() {
  if (driveAccessToken) return driveAccessToken;

  try {
    return await requestDriveToken("");
  } catch(error) {
    throw new Error(
      "Drive session expired. Tap Reconnect Google Drive and authorize again."
    );
  }
}

function getDriveHeaders() {
  if (!driveAccessToken) {
    throw new Error("Google Drive session expired. Reconnect Google Drive.");
  }
  return {Authorization:"Bearer " + driveAccessToken};
}

/* ==========================================
   DRIVE API REQUESTS
========================================== */

async function driveRequest(url,options = {}) {
  const response = await fetch(url,{
    ...options,
    headers:{
      ...getDriveHeaders(),
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    driveAccessToken = null;
    throw new Error("Google Drive session expired. Reconnect Google Drive.");
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Google Drive error " + response.status + ": " + detail);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function findDriveFolder() {
  const query = encodeURIComponent(
    "name='" + DRIVE_FOLDER_NAME +
    "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  );

  const result = await driveRequest(
    "https://www.googleapis.com/drive/v3/files?q=" +
    query + "&fields=files(id,name,mimeType)"
  );

  return result.files?.[0] || null;
}

async function createDriveFolder() {
  return driveRequest("https://www.googleapis.com/drive/v3/files",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      name:DRIVE_FOLDER_NAME,
      mimeType:"application/vnd.google-apps.folder"
    })
  });
}

async function findDriveBackupFile(folderId) {
  const query = encodeURIComponent(
    "'" + folderId + "' in parents and name='" +
    DRIVE_BACKUP_NAME + "' and trashed=false"
  );

  const result = await driveRequest(
    "https://www.googleapis.com/drive/v3/files?q=" +
    query + "&fields=files(id,name,mimeType,modifiedTime)"
  );

  return result.files?.[0] || null;
}

async function ensureDriveFolder() {
  let folder = driveFolderId ? {id:driveFolderId} : null;
  if (!folder) folder = await findDriveFolder();
  if (!folder) folder = await createDriveFolder();

  driveFolderId = folder.id;
  return folder.id;
}

async function ensureDriveBackupFile() {
  const folderId = await ensureDriveFolder();
  const file = await findDriveBackupFile(folderId);
  driveBackupFileId = file?.id || null;
  return file;
}

async function finishDriveConnection() {
  showDriveMessage("Checking Google Drive...");

  const folderId = await ensureDriveFolder();
  const file = await findDriveBackupFile(folderId);

  driveFolderId = folderId;
  driveBackupFileId = file?.id || null;

  saveDriveConnection({
    connected:true,
    folderId,
    backupFileId:driveBackupFileId,
    connectedAt:new Date().toISOString()
  });

  updateDriveStatus();
  showDriveMessage("Google Drive connected successfully.");
}

/* ==========================================
   DISCONNECT GOOGLE DRIVE
========================================== */

function disconnectGoogleDrive() {
  if (!confirm("Disconnect Google Drive from this browser?")) return;

  const token = driveAccessToken;

  driveAccessToken = null;
  driveFolderId = null;
  driveBackupFileId = null;
  driveTokenClient = null;
  drivePendingResolve = null;
  drivePendingReject = null;

  localStorage.removeItem(DRIVE_CONNECTION_KEY);

  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token,() => {});
  }

  updateDriveStatus();
  showDriveMessage("Google Drive disconnected.");
}

/* ==========================================
   BACKUP DATA
========================================== */

async function createDriveBackupData() {
  captureReportInputs();
  await saveReportToDatabase();

  return {
    app:"TradeBook",
    version:7,
    backupDate:new Date().toISOString(),
    trades,
    fields,
    columnSettings:getFieldSettings(),
    reports:reportData,
    reportSettings,
    brokerData,
    metadata:{
      reportStorage:"IndexedDB + localStorage",
      tradeModes:["intraday","swing","longterm"]
    }
  };
}

function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid backup file.");
  }
  if (!Array.isArray(data.trades)) {
    throw new Error("Backup does not contain a valid trades list.");
  }
  if (!Array.isArray(data.fields)) {
    throw new Error("Backup does not contain a valid fields list.");
  }
  if (data.reports !== undefined &&
      (!data.reports || typeof data.reports !== "object" ||
       Array.isArray(data.reports))) {
    throw new Error("Invalid reports data.");
  }
  if (data.brokerData !== undefined &&
      (!data.brokerData || typeof data.brokerData !== "object" || Array.isArray(data.brokerData))) {
    throw new Error("Invalid broker transaction data.");
  }
  if (data.reportSettings !== undefined &&
      (!data.reportSettings || typeof data.reportSettings !== "object" ||
       Array.isArray(data.reportSettings))) {
    throw new Error("Invalid report settings.");
  }

  data.trades.forEach((trade,index) => {
    if (!trade || typeof trade !== "object" || trade.id == null) {
      throw new Error("Invalid trade record at row " + (index + 1));
    }
  });

  data.fields.forEach((field,index) => {
    if (!field || typeof field !== "object" || field.id == null) {
      throw new Error("Invalid custom field at row " + (index + 1));
    }
  });

  return true;
}

/* ==========================================
   RESUMABLE DRIVE UPLOAD
========================================== */

async function startDriveResumableUpload(fileId,folderId,jsonText) {
  const metadata = fileId
    ? {name:DRIVE_BACKUP_NAME}
    : {name:DRIVE_BACKUP_NAME,parents:[folderId]};

  const startUrl = fileId
    ? "https://www.googleapis.com/upload/drive/v3/files/" +
      fileId + "?uploadType=resumable"
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

  const startResponse = await fetch(startUrl,{
    method:fileId ? "PATCH" : "POST",
    headers:{
      ...getDriveHeaders(),
      "Content-Type":"application/json; charset=UTF-8",
      "X-Upload-Content-Type":"application/json"
    },
    body:JSON.stringify(metadata)
  });

  if (startResponse.status === 401) {
    driveAccessToken = null;
    throw new Error("Drive session expired. Reconnect Google Drive.");
  }

  if (!startResponse.ok) {
    throw new Error(
      "Could not start Google Drive upload: " +
      await startResponse.text()
    );
  }

  const uploadUrl = startResponse.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("Google Drive upload session URL is missing.");
  }

  const uploadResponse = await fetch(uploadUrl,{
    method:"PUT",
    headers:{
      Authorization:"Bearer " + driveAccessToken,
      "Content-Type":"application/json"
    },
    body:new Blob([jsonText],{type:"application/json"})
  });

  if (uploadResponse.status === 401) {
    driveAccessToken = null;
    throw new Error("Drive session expired. Reconnect Google Drive.");
  }

  if (!uploadResponse.ok) {
    throw new Error(
      "Backup upload failed: HTTP " +
      uploadResponse.status + " " +
      await uploadResponse.text()
    );
  }

  return uploadResponse.json();
}

/* ==========================================
   BACKUP TO GOOGLE DRIVE
========================================== */

async function backupToGoogleDrive() {
  try {
    showDriveMessage("Preparing backup...");
    await refreshDriveToken();

    const folderId = await ensureDriveFolder();
    const existingFile = await findDriveBackupFile(folderId);
    const backup = await createDriveBackupData();
    const jsonText = JSON.stringify(backup,null,2);

    const result = await startDriveResumableUpload(
      existingFile?.id || null,
      folderId,
      jsonText
    );

    driveBackupFileId = result.id;
    const oldConnection = getDriveConnection();

    saveDriveConnection({
      connected:true,
      folderId,
      backupFileId:driveBackupFileId,
      connectedAt:oldConnection?.connectedAt || new Date().toISOString()
    });

    if ($("driveBackupInfo")) {
      $("driveBackupInfo").textContent =
        "Last backup: " + new Date().toLocaleString();
    }

    updateDriveStatus();
    showDriveMessage("Backup completed successfully.");
    showToast("Google Drive backup completed.");

  } catch(error) {
    console.error(error);
    showDriveMessage(error.message,true);
  }
}

/* ==========================================
   DOWNLOAD DRIVE BACKUP
========================================== */

async function downloadDriveBackup() {
  await refreshDriveToken();

  const file = await ensureDriveBackupFile();
  if (!file) {
    throw new Error("TradeBook-Backup.json was not found in Google Drive.");
  }

  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files/" +
    file.id + "?alt=media",
    {headers:getDriveHeaders()}
  );

  if (response.status === 401) {
    driveAccessToken = null;
    throw new Error("Google Drive session expired. Reconnect Google Drive.");
  }

  if (!response.ok) {
    throw new Error("Could not download backup from Google Drive.");
  }

  return {file,data:await response.json()};
}

/* ==========================================
   RESTORE VALIDATION
========================================== */

function validateStoreRecords(store,records,storeName) {
  const keyPath = store.keyPath;

  records.forEach((record,index) => {
    if (!record || typeof record !== "object") {
      throw new Error(
        "Invalid " + storeName + " record at row " + (index + 1)
      );
    }

    if (typeof keyPath === "string") {
      if (record[keyPath] === undefined || record[keyPath] === null) {
        throw new Error(storeName + " record is missing key: " + keyPath);
      }
    } else if (Array.isArray(keyPath)) {
      if (keyPath.some(key =>
        record[key] === undefined || record[key] === null
      )) {
        throw new Error(storeName + " record does not match database key structure.");
      }
    } else if (record.id === undefined || record.id === null) {
      throw new Error(storeName + " record is missing its ID.");
    }
  });
}

function putRestoreRecord(store,record) {
  if (store.keyPath === null) store.put(record,record.id);
  else store.put(record);
}

/* ==========================================
   FULL RESTORE
========================================== */

async function applyFullBackupToDatabase(data) {
  validateBackup(data);
  await waitForDatabase();

  const requiredStores = ["trades","fields","reports"];

  for (const name of requiredStores) {
    if (!db.objectStoreNames.contains(name)) {
      throw new Error("Required database store is missing: " + name);
    }
  }

  const backupTrades = data.trades;
  const backupFields = data.fields;

  const restoredReports = data.reports || {
    daily:[],weekly:[],monthly:[],yearly:[]
  };

  const restoredSettings = data.reportSettings || {};
  const restoredColumnSettings = data.columnSettings || {};
  const restoredBroker = data.brokerData || {headings:["Date","Amount Received","Amount Paid"],rows:[],widths:[120,170,150],rowHeights:{},cells:{},columnStyles:{},defaultStyle:{},merges:[]};
  restoredBroker.merges=Array.isArray(restoredBroker.merges)?restoredBroker.merges:[];

  const checkTransaction = db.transaction(requiredStores,"readonly");
  const checkDone = transactionComplete(checkTransaction);

  try {
    validateStoreRecords(
      checkTransaction.objectStore("trades"),backupTrades,"trades"
    );
    validateStoreRecords(
      checkTransaction.objectStore("fields"),backupFields,"fields"
    );
    validateStoreRecords(
      checkTransaction.objectStore("reports"),
      [{id:"main-reports",data:restoredReports,settings:restoredSettings}],
      "reports"
    );
    await checkDone;
  } catch(error) {
    try { checkTransaction.abort(); } catch(ignore) {}
    await checkDone.catch(() => {});
    throw error;
  }

  const transaction = db.transaction(requiredStores,"readwrite");
  const done = transactionComplete(transaction);

  const tradeStore = transaction.objectStore("trades");
  const fieldStore = transaction.objectStore("fields");
  const reportStore = transaction.objectStore("reports");

  tradeStore.clear();
  fieldStore.clear();
  reportStore.clear();

  backupTrades.forEach(record => putRestoreRecord(tradeStore,record));
  backupFields.forEach(record => putRestoreRecord(fieldStore,record));

  putRestoreRecord(reportStore,{
    id:"main-reports",
    data:restoredReports,
    settings:restoredSettings,
    updatedAt:new Date().toISOString()
  });

  await done;

  trades = backupTrades;
  fields = backupFields;
  reportData = restoredReports;
  reportSettings = restoredSettings;
  brokerData = restoredBroker;
  brokerData.defaultStyle = cloneSpreadsheetStyle(brokerData.defaultStyle);
  if (brokerData.headings?.[0] === "Date" && brokerData.headings?.[1] === "Amount Paid" && brokerData.headings?.[2] === "Amount Received") {
    brokerData.rows = (brokerData.rows || []).map(row => [row?.[0] ?? "", row?.[2] ?? "", row?.[1] ?? ""]);
    const ow = Array.isArray(brokerData.widths) ? brokerData.widths : [];
    brokerData.widths = [ow[0] || 120, ow[2] || 170, ow[1] || 150];
    const oc = brokerData.cells || {}, nc = {};
    Object.entries(oc).forEach(([key, value]) => { const [r,c] = key.split(":").map(Number); if(c===0) nc[r+":0"]=value; else if(c===1) nc[r+":2"]=value; else if(c===2) nc[r+":1"]=value; });
    brokerData.cells = nc;
    const os = brokerData.columnStyles || {};
    brokerData.columnStyles = {0:os[0]||{},1:os[2]||{},2:os[1]||{}};
  }
  writeJSON(BROKER_DATA_KEY, brokerData);

  saveFieldSettings(restoredColumnSettings);
  saveReportsLocally();

  await renderEverything();
}

async function restoreFromGoogleDrive() {
  if (!confirm(
    "Full Restore will replace current Trades, Fields and Reports " +
    "with the Google Drive backup. Continue?"
  )) return;

  try {
    showDriveMessage("Downloading backup...");
    const {data} = await downloadDriveBackup();

    validateBackup(data);
    showDriveMessage("Validating backup...");

    await applyFullBackupToDatabase(data);

    showDriveMessage("Full Restore completed successfully.");
    showToast("TradeBook restored from Google Drive.");
  } catch(error) {
    console.error(error);
    showDriveMessage(error.message,true);
  }
}

/* ==========================================
   ATTACHMENTS
========================================== */

function readFileAsDataURL(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve({
      name:file.name,
      type:file.type,
      data:reader.result
    });

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleAttachmentChange() {
  try {
    const chartFiles = Array.from($("chartImages")?.files || []);
    const contractFiles = Array.from($("contractNote")?.files || []);

    const files = [
      ...chartFiles.map(file => ({file,category:"chart"})),
      ...contractFiles.map(file => ({file,category:"contract"}))
    ];

    const loaded = await Promise.all(files.map(async item => ({
      ...(await readFileAsDataURL(item.file)),
      category:item.category
    })));

    currentAttachments = [
      ...currentAttachments.filter(item =>
        !files.some(file => file.category === item.category)
      ),
      ...loaded
    ];

    if ($("attachmentInfo")) {
      $("attachmentInfo").textContent =
        currentAttachments.length + " attachment(s) ready.";
    }
  } catch(error) {
    showToast("Could not read attachment: " + error.message);
  }
}

/* ==========================================
   CUSTOM SPREADSHEET COLOUR CHOOSER
========================================== */

const SPREADSHEET_COLOR_PRESETS = [
  "#ef4444", "#22d3ee", "#3b82f6", "#22c55e",
  "#e600e6", "#facc15", "#000000", "#ffffff"
];
let activeSpreadsheetColorTarget = null;
let activeSpreadsheetColorValue = "#edf3fc";
let activeSpreadsheetColorDefault = "#edf3fc";

function ensureSpreadsheetColorModal() {
  if ($("spreadsheetColorModal")) return;
  const modal = document.createElement("div");
  modal.id = "spreadsheetColorModal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="color-modal-card" role="dialog" aria-modal="true" aria-labelledby="spreadsheetColorTitle">
      <div class="modal-heading"><h2 id="spreadsheetColorTitle">Select colour</h2><button type="button" class="icon-btn" id="spreadsheetColorClose" aria-label="Close">×</button></div>
      <div class="color-palette" id="spreadsheetColorPalette"></div>
      <div class="color-custom-row">
        <button type="button" id="spreadsheetCustomColorBtn">Customised</button>
        <input type="color" id="spreadsheetCustomColorInput" value="#edf3fc" aria-label="Custom colour">
      </div>
      <div class="color-chosen">Chosen colour<div class="color-chosen-swatch" id="spreadsheetChosenColor"></div></div>
      <button type="button" class="color-reset-btn" id="spreadsheetColorResetBtn">Reset</button>
      <div class="color-modal-actions"><button type="button" class="color-cancel-btn" id="spreadsheetColorCancelBtn">Cancel</button><button type="button" class="color-set-btn" id="spreadsheetColorSetBtn">Set</button></div>
    </div>`;
  document.body.appendChild(modal);

  SPREADSHEET_COLOR_PRESETS.forEach(color => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-preset";
    b.style.background = color;
    b.dataset.color = color;
    b.title = color;
    b.addEventListener("click", () => chooseSpreadsheetColor(color));
    $("spreadsheetColorPalette").appendChild(b);
  });

  $("spreadsheetCustomColorBtn").addEventListener("click", () => $("spreadsheetCustomColorInput").click());
  $("spreadsheetCustomColorInput").addEventListener("input", e => chooseSpreadsheetColor(e.target.value));
  $("spreadsheetColorClose").addEventListener("click", closeSpreadsheetColorModal);
  $("spreadsheetColorCancelBtn").addEventListener("click", closeSpreadsheetColorModal);
  $("spreadsheetColorSetBtn").addEventListener("click", () => {
    if (!activeSpreadsheetColorTarget) return;
    if (activeSpreadsheetColorTarget === "reportText") applyReportFormatting("color", activeSpreadsheetColorValue);
    if (activeSpreadsheetColorTarget === "reportBackground") applyReportFormatting("background", activeSpreadsheetColorValue);
    if (activeSpreadsheetColorTarget === "brokerText") applyBrokerFormatting("color", activeSpreadsheetColorValue);
    if (activeSpreadsheetColorTarget === "brokerBackground") applyBrokerFormatting("background", activeSpreadsheetColorValue);
    updateSpreadsheetColorSwatch(activeSpreadsheetColorTarget, activeSpreadsheetColorValue);
    closeSpreadsheetColorModal();
  });
  $("spreadsheetColorResetBtn").addEventListener("click", resetSpreadsheetColorOnly);
}

function chooseSpreadsheetColor(color) {
  activeSpreadsheetColorValue = String(color).toLowerCase();
  const chosen = $("spreadsheetChosenColor");
  if (chosen) chosen.style.background = activeSpreadsheetColorValue;
  const custom = $("spreadsheetCustomColorInput");
  if (custom) custom.value = /^#[0-9a-f]{6}$/i.test(activeSpreadsheetColorValue) ? activeSpreadsheetColorValue : "#000000";
  document.querySelectorAll("#spreadsheetColorPalette .color-preset").forEach(btn => btn.classList.toggle("active", btn.dataset.color.toLowerCase() === activeSpreadsheetColorValue));
}

function updateSpreadsheetColorSwatch(target, color) {
  const map = {
    reportText: "reportTextColorSwatch",
    reportBackground: "reportCellColorSwatch",
    brokerText: "brokerTextColorSwatch",
    brokerBackground: "brokerCellColorSwatch"
  };
  const swatch = $(map[target]);
  if (swatch) swatch.style.background = color;
  const inputMap = {
    reportText: "reportTextColor", reportBackground: "reportCellColor",
    brokerText: "brokerTextColor", brokerBackground: "brokerCellColor"
  };
  const input = $(inputMap[target]);
  if (input && /^#[0-9a-f]{6}$/i.test(color)) input.value = color;
}

function getSpreadsheetColorCurrent(target) {
  const inputMap = {
    reportText: "reportTextColor", reportBackground: "reportCellColor",
    brokerText: "brokerTextColor", brokerBackground: "brokerCellColor"
  };
  return $(inputMap[target])?.value || (target.includes("Background") ? "#111c2e" : "#edf3fc");
}

function getSpreadsheetColorDefault(target) {
  return target.includes("Background") ? SPREADSHEET_DEFAULT_STYLE.background : SPREADSHEET_DEFAULT_STYLE.color;
}

function openSpreadsheetColorModal(target) {
  ensureSpreadsheetColorModal();
  activeSpreadsheetColorTarget = target;
  activeSpreadsheetColorDefault = getSpreadsheetColorDefault(target);
  activeSpreadsheetColorValue = getSpreadsheetColorCurrent(target);
  $("spreadsheetColorModal").classList.remove("hidden");
  chooseSpreadsheetColor(activeSpreadsheetColorValue);
}

function closeSpreadsheetColorModal() {
  $("spreadsheetColorModal")?.classList.add("hidden");
  activeSpreadsheetColorTarget = null;
}

function resetSpreadsheetColorOnly() {
  if (!activeSpreadsheetColorTarget) return;
  const target = activeSpreadsheetColorTarget;
  const defaultColor = activeSpreadsheetColorDefault;
  if (target === "reportText") applyReportFormatting("color", defaultColor);
  if (target === "reportBackground") applyReportFormatting("background", defaultColor);
  if (target === "brokerText") applyBrokerFormatting("color", defaultColor);
  if (target === "brokerBackground") applyBrokerFormatting("background", defaultColor);
  updateSpreadsheetColorSwatch(target, defaultColor);
  chooseSpreadsheetColor(defaultColor);
  closeSpreadsheetColorModal();
  showToast("Colour reset to default.");
}

function setupSpreadsheetColorChoosers() {
  ensureSpreadsheetColorModal();
  $("reportTextColorBtn")?.addEventListener("click", () => openSpreadsheetColorModal("reportText"));
  $("reportCellColorBtn")?.addEventListener("click", () => openSpreadsheetColorModal("reportBackground"));
  $("brokerTextColorBtn")?.addEventListener("click", () => openSpreadsheetColorModal("brokerText"));
  $("brokerCellColorBtn")?.addEventListener("click", () => openSpreadsheetColorModal("brokerBackground"));
  [
    ["reportTextColorSwatch","reportTextColor"],["reportCellColorSwatch","reportCellColor"],
    ["brokerTextColorSwatch","brokerTextColor"],["brokerCellColorSwatch","brokerCellColor"]
  ].forEach(([swatchId,inputId]) => {
    const input = $(inputId), swatch = $(swatchId);
    if (input && swatch) swatch.style.background = input.value;
  });
}

/* ==========================================
   REPORT TOOLBAR
========================================== */

function setupReportToolbar() {
  $("reportMergeBtn")?.addEventListener("click",()=>mergeRangeIntoModel("report"));
  $("reportUndoBtn")?.addEventListener("click", undoReport);
  $("reportRedoBtn")?.addEventListener("click", redoReport);
  $("reportTextColor")?.addEventListener("change",event => {
    applyReportFormatting("color",event.target.value);
  });

  $("reportCellColor")?.addEventListener("change",event => {
    applyReportFormatting("background",event.target.value);
  });

  $("reportFontSize")?.addEventListener("change",event => {
    applyReportFormatting("fontSize",event.target.value);
  });

  $("reportFontFamily")?.addEventListener("change",event => {
    applyReportFormatting("fontFamily",event.target.value);
  });

  document.querySelectorAll("[data-report-halign]").forEach(button => {
    button.addEventListener("click", () => {
      applyReportFormatting("align", button.dataset.reportHalign);
      document.querySelectorAll("[data-report-halign]").forEach(x => x.classList.toggle("active", x === button));
    });
  });

  document.querySelectorAll("[data-report-valign]").forEach(button => {
    button.addEventListener("click", () => {
      applyReportFormatting("vertical", button.dataset.reportValign);
      document.querySelectorAll("[data-report-valign]").forEach(x => x.classList.toggle("active", x === button));
    });
  });

  $("reportBoldBtn")?.addEventListener("click",() => {
    toggleReportFormatting("bold");
  });

  $("reportItalicBtn")?.addEventListener("click",() => {
    toggleReportFormatting("italic");
  });

  $("reportWrapBtn")?.addEventListener("click",() => {
    const config = getReportConfig();
    const selected = getSelectedReportCells();

    if (selected.length) {
      const {row,column} = selected[0];
      const key = row + ":" + column;
      config.cells[key] = config.cells[key] || {};
      config.cells[key].wrap = config.cells[key].wrap === false;
    } else if (selectedReportColumn !== null) {
      const column = selectedReportColumn;
      config.columnStyles[column] = config.columnStyles[column] || {};
      config.columnStyles[column].wrap =
        config.columnStyles[column].wrap === false;
    } else {
      showToast("Select a cell or column first.");
      return;
    }

    saveReportToDatabase()
      .then(renderReportTable)
      .catch(error => showToast(error.message));
  });
  $("reportResetFormatBtn")?.addEventListener("click", resetReportFormatting);
}

/* ==========================================
   PERIOD OVERVIEW EVENTS
========================================== */

function setupPeriodOverview() {
  $("periodApplyBtn")?.addEventListener("click",renderPeriodOverview);

  $("periodResetBtn")?.addEventListener("click",() => {
    if ($("periodStartDate")) $("periodStartDate").value = "";
    if ($("periodEndDate")) $("periodEndDate").value = "";
    renderPeriodOverview();
  });
}


/* ==========================================
   GRAPH / CHART
   Uses TradeLedger IndexedDB trade data.
   Bar Chart behavior is preserved. Line Chart uses
   its own automatic Year/Month filters and Net Profit data.
========================================== */

function graphPerformanceDate(trade, mode) {
  if (mode === "swing" || mode === "longterm") {
    return trade.exitDate ||
      trade.customValues?.exitDate ||
      trade.customValues?.exit_date ||
      trade.date ||
      "";
  }
  return trade.date || "";
}

function graphYearOptions() {
  const years = new Set();
  // Keep a predictable range selector while also retaining years found in
  // existing trade data. This never changes or deletes stored trade data.
  for (let y = 2026; y <= 2106; y += 1) years.add(y);
  trades.forEach(trade => {
    const date = graphPerformanceDate(trade, graphMode);
    const y = Number(String(date).slice(0, 4));
    if (y >= 2000 && y <= 2106) years.add(y);
  });
  return Array.from(years).sort((a,b)=>a-b);
}

function graphRangeOptions() {
  if (graphPeriod === "month") {
    // Monthly view: choose the calendar year whose Jan–Dec values are shown.
    return graphYearOptions().map(y => ({value:String(y), label:String(y)}));
  }
  // Yearly view: choose a continuous 10-year range.
  const options = [];
  for (let y = 2026; y <= 2096; y += 10) {
    options.push({value:`${y}-${y+10}`,label:`${y} – ${y+10}`});
  }
  return options;
}

function syncGraphControls() {
  document.querySelectorAll("#graphModeTabs [data-graph-mode]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.graphMode===graphMode);
  });
  document.querySelectorAll("#graphChartSection [data-chart-type]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.chartType===graphType);
  });
  document.querySelectorAll("#graphChartSection [data-graph-period]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.graphPeriod===graphPeriod);
  });

  const barRangeBlock=$("graphBarRangeBlock");
  const lineYearBlock=$("graphLineYearBlock");
  const lineMonthBlock=$("graphLineMonthBlock");
  const generateBtn=$("generateGraphBtn");

  if(graphType==="line"){
    barRangeBlock?.classList.add("hidden");
    lineYearBlock?.classList.remove("hidden");
    lineMonthBlock?.classList.toggle("hidden",graphPeriod!=="month");
    generateBtn?.classList.add("hidden");
    syncGraphLineControls();
    return;
  }

  barRangeBlock?.classList.remove("hidden");
  lineYearBlock?.classList.add("hidden");
  lineMonthBlock?.classList.add("hidden");
  generateBtn?.classList.remove("hidden");

  const select=$("graphRangeSelect");
  if(!select) return;
  const options=graphRangeOptions();
  const current=graphRange||options[0]?.value||"";
  select.innerHTML=options.map(item=>`<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("");
  select.value=options.some(item=>item.value===current)?current:(options[0]?.value||"");
  graphRange=select.value;
  $("graphRangeLabel").textContent="Select Range";
}

function graphFilteredTrades() {
  return trades.filter(trade => (trade.mode || "intraday") === graphMode);
}

function graphMonthlyData(year) {
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const data = months.map(label=>({label,gross:0,net:0}));
  graphFilteredTrades().forEach(trade => {
    const date = graphPerformanceDate(trade, graphMode);
    if (String(date).slice(0,4) !== String(year)) return;
    const month = Number(String(date).slice(5,7));
    if (month >= 1 && month <= 12) {
      data[month-1].gross += numberValue(trade.grossPL);
      data[month-1].net += numberValue(trade.netPL);
    }
  });
  return data;
}

function graphYearlyData(range) {
  const match = String(range).match(/^(\d{4})-(\d{4})$/);
  if (!match) return [];
  const start=Number(match[1]), end=Number(match[2]);
  const data=[];
  for(let year=start;year<=end;year++){
    let gross=0,net=0;
    graphFilteredTrades().forEach(trade=>{
      const date=graphPerformanceDate(trade,graphMode);
      if(String(date).slice(0,4)===String(year)){
        gross+=numberValue(trade.grossPL);
        net+=numberValue(trade.netPL);
      }
    });
    data.push({label:String(year),gross,net});
  }
  return data;
}

function graphNiceMax(maxAbs){
  if(!maxAbs || maxAbs<=0) return 100;
  const raw=maxAbs*1.12;
  const pow=Math.pow(10,Math.floor(Math.log10(raw)));
  const n=raw/pow;
  const nice=n<=1?1:n<=2?2:n<=5?5:10;
  return nice*pow;
}

function graphMoney(value){
  return "₹ " + (Number(value)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function renderGraphBarChart(data,title,subtitle){
  const W=900,H=390,left=70,right=24,top=34,bottom=72;
  const plotW=W-left-right,plotH=H-top-bottom;
  const maxAbs=Math.max(...data.flatMap(d=>[Math.abs(d.gross),Math.abs(d.net)]),0);
  const max=graphNiceMax(maxAbs);
  const zeroY=top+plotH/2,scale=plotH/(2*max),slot=plotW/Math.max(data.length,1);
  const groupW=Math.min(46,slot*.72),gap=5,barW=Math.max(3,(groupW-gap)/2);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(title)}">`;
  for(let i=0;i<=4;i++){
    const val=max-(max*2*i/4),y=top+(plotH*i/4);
    svg+=`<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#293950" stroke-width="1"/>`;
    svg+=`<text x="${left-9}" y="${y+4}" text-anchor="end" fill="#91a2b9" font-size="11">${escapeHtml(Math.round(val).toLocaleString("en-IN"))}</text>`;
  }
  svg+=`<line x1="${left}" y1="${zeroY}" x2="${W-right}" y2="${zeroY}" stroke="#64748b" stroke-width="1.2"/>`;
  svg+=`<text transform="translate(15 ${top+plotH/2}) rotate(-90)" text-anchor="middle" fill="#edf3fc" font-size="11">Amount (₹)</text>`;
  data.forEach((d,i)=>{
    const cx=left+slot*i+slot/2,gx=cx-groupW/2;
    [["gross","#2196f3","Gross Profit & Loss"],["net","#22c55e","Net Profit & Loss"]].forEach(([key,color,barType],j)=>{
      const v=Number(d[key])||0,h=Math.abs(v)*scale,y=v>=0?zeroY-h:zeroY;
      const month=String(d.label||"");
      svg+=`<rect class="graph-bar" data-month="${escapeHtml(month)}" data-bar-type="${escapeHtml(barType)}" data-value="${escapeHtml(String(v))}" x="${gx+j*(barW+gap)}" y="${y}" width="${barW}" height="${Math.max(h,1)}" rx="2" fill="${color}" tabindex="0" role="button" aria-label="${escapeHtml(`${month} ${barType} ${graphMoney(v)}`)}"/>`;
    });
    svg+=`<text x="${cx}" y="${H-45}" text-anchor="middle" fill="#edf3fc" font-size="11">${escapeHtml(d.label)}</text>`;
  });
  svg+=`</svg>`;
  return `<div class="graph-title">${escapeHtml(title)}</div>
    <div class="graph-subtitle">${escapeHtml(subtitle)}</div>
    <div class="graph-svg-wrap">${svg}</div>
    <div class="graph-bar-popup" id="graphBarPopup" role="status" aria-live="polite" hidden></div>
    <div class="graph-legend"><span><i class="gross"></i>Gross Profit &amp; Loss</span><span><i class="net"></i>Net Profit &amp; Loss</span></div>`;
}

function setupGraphBarInteractions(){
  const result=$("graphResult");
  const popup=$("graphBarPopup");
  if(!result || !popup) return;

  const closePopup=()=>{
    popup.hidden=true;
    popup.classList.remove("visible");
  };

  const showPopup=(bar)=>{
    const month=bar.dataset.month || "";
    const barType=bar.dataset.barType || "";
    const value=Number(bar.dataset.value || 0);
    popup.innerHTML=`<div class="graph-bar-popup-month">${escapeHtml(month)}</div>
      <div class="graph-bar-popup-type">${escapeHtml(barType)}</div>
      <div class="graph-bar-popup-value">${escapeHtml(graphMoney(value))}</div>`;
    popup.hidden=false;
    popup.classList.add("visible");

    // Position the tooltip from the bar's actual viewport coordinates.
    // This keeps it directly above the tapped bar instead of centering it
    // inside the chart/result panel.
    popup.style.width="max-content";
    popup.style.maxWidth="150px";
    popup.style.position="fixed";

    const barRect=bar.getBoundingClientRect();
    const popupWidth=popup.offsetWidth;
    const popupHeight=popup.offsetHeight;
    const viewportGap=7;
    const edgeGap=6;

    let left=barRect.left+(barRect.width/2)-(popupWidth/2);
    let top=barRect.top-popupHeight-viewportGap;

    // Keep the compact tooltip fully visible on narrow mobile screens.
    left=Math.max(edgeGap,Math.min(left,window.innerWidth-popupWidth-edgeGap));

    // If there is not enough room above the bar, place it immediately below.
    if(top<edgeGap) top=barRect.bottom+viewportGap;

    popup.style.left=`${Math.round(left)}px`;
    popup.style.top=`${Math.round(top)}px`;
  };

  result.querySelectorAll(".graph-bar").forEach(bar=>{
    bar.addEventListener("click",event=>{
      event.stopPropagation();
      if(!popup.hidden && popup.dataset.activeBar === bar) { closePopup(); return; }
      popup.dataset.activeBar=bar;
      popup.dataset.activeMonth=bar.dataset.month || "";
      popup.dataset.activeType=bar.dataset.barType || "";
      showPopup(bar);
    });
    bar.addEventListener("keydown",event=>{
      if(event.key==="Enter" || event.key===" "){
        event.preventDefault();
        bar.click();
      }
    });
  });

  const repositionPopup=()=>{
    if(!popup.hidden && popup.dataset.activeBar){
      const active=result.querySelector(`.graph-bar[data-month="${CSS.escape(popup.dataset.activeMonth || "")}"][data-bar-type="${CSS.escape(popup.dataset.activeType || "")}"]`);
      if(active) showPopup(active);
    }
  };

  result.addEventListener("scroll",repositionPopup,{passive:true});
  window.addEventListener("resize",repositionPopup,{passive:true});
  window.addEventListener("scroll",repositionPopup,{passive:true});

  result.addEventListener("click",event=>{
    if(!event.target.closest(".graph-bar") && !event.target.closest(".graph-bar-popup")) closePopup();
  });
}


const GRAPH_LINE_MONTHS=[["01","January"],["02","February"],["03","March"],["04","April"],["05","May"],["06","June"],["07","July"],["08","August"],["09","September"],["10","October"],["11","November"],["12","December"]];

function graphLineYearOptions(){const years=[];for(let y=2000;y<=2100;y++)years.push(y);return years;}

function graphLineNetByDay(year,month){
  const map=new Map(),ym=`${year}-${String(month).padStart(2,"0")}`;
  graphFilteredTrades().forEach(trade=>{
    const dateText=String(graphPerformanceDate(trade,graphMode)||"").slice(0,10);
    if(!dateText.startsWith(ym))return;
    const day=Number(dateText.slice(8,10));if(!day)return;
    map.set(day,(map.get(day)||0)+numberValue(trade.netPL));
  });
  const days=new Date(Number(year),Number(month),0).getDate();
  return Array.from({length:days},(_,i)=>({label:String(i+1),net:map.get(i+1)||0}));
}

function graphLineNetByMonth(year){
  const data=GRAPH_LINE_MONTHS.map(([value,label])=>({value,label:label.slice(0,3),net:0}));
  graphFilteredTrades().forEach(trade=>{
    const dateText=String(graphPerformanceDate(trade,graphMode)||"");
    if(dateText.slice(0,4)!==String(year))return;
    const month=Number(dateText.slice(5,7));
    if(month>=1&&month<=12)data[month-1].net+=numberValue(trade.netPL);
  });
  return data;
}

function renderGraphLineChart(data,title,subtitle){
  const W=900,H=390,left=70,right=24,top=34,bottom=72,plotW=W-left-right,plotH=H-top-bottom;
  const maxAbs=Math.max(...data.map(d=>Math.abs(Number(d.net)||0)),0),max=graphNiceMax(maxAbs);
  const zeroY=top+plotH/2,scale=plotH/(2*max),step=data.length>1?plotW/(data.length-1):plotW;
  const points=data.map((d,i)=>({x:left+(data.length>1?step*i:plotW/2),y:zeroY-(Number(d.net)||0)*scale}));
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(title)}">`;
  for(let i=0;i<=4;i++){
    const val=max-(max*2*i/4),y=top+(plotH*i/4);
    svg+=`<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#293950" stroke-width="1"/>`;
    svg+=`<text x="${left-9}" y="${y+4}" text-anchor="end" fill="#91a2b9" font-size="11">${escapeHtml(Math.round(val).toLocaleString("en-IN"))}</text>`;
  }
  svg+=`<line x1="${left}" y1="${zeroY}" x2="${W-right}" y2="${zeroY}" stroke="#64748b" stroke-width="1.2"/>`;
  svg+=`<text transform="translate(15 ${top+plotH/2}) rotate(-90)" text-anchor="middle" fill="#edf3fc" font-size="11">Net Profit (₹)</text>`;
  if(points.length>1){
    const path=points.map((p,i)=>`${i?"L":"M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    svg+=`<path d="${path}" fill="none" stroke="#22c55e" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  data.forEach((d,i)=>{
    const p=points[i],value=Number(d.net)||0;
    svg+=`<circle class="graph-line-point" data-label="${escapeHtml(d.label)}" data-value="${escapeHtml(String(value))}" cx="${p.x}" cy="${p.y}" r="4.5" fill="#22c55e" stroke="#0d1727" stroke-width="2"/>`;
    svg+=`<text x="${p.x}" y="${H-45}" text-anchor="middle" fill="#edf3fc" font-size="11">${escapeHtml(d.label)}</text>`;
  });
  svg+=`</svg>`;
  return `<div class="graph-title">${escapeHtml(title)}</div><div class="graph-subtitle">${escapeHtml(subtitle)}</div><div class="graph-svg-wrap graph-line-svg-wrap">${svg}</div><div class="graph-legend"><span><i class="net"></i>Net Profit &amp; Loss</span></div>`;
}

function setupGraphLineInteractions(){
  const result=$("graphResult");if(!result)return;
  result.querySelectorAll(".graph-line-point").forEach(point=>{
    point.addEventListener("click",()=>showToast(`${point.dataset.label||""}: ${graphMoney(Number(point.dataset.value||0))}`));
  });
}

function syncGraphLineControls(){
  const yearSelect=$("graphYearSelect"),monthSelect=$("graphMonthSelect");
  if(!yearSelect||!monthSelect)return;
  const years=graphLineYearOptions(),currentYear=Number(yearSelect.value)||new Date().getFullYear();
  yearSelect.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join("");
  yearSelect.value=years.includes(currentYear)?String(currentYear):String(years[0]);
  monthSelect.innerHTML=GRAPH_LINE_MONTHS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  $("graphLineMonthBlock")?.classList.toggle("hidden",graphPeriod!=="month");
}

function renderGraph(){
  const result=$("graphResult");
  if(!result) return;

  const title=graphMode==="intraday"?"Intraday Trading":graphMode==="swing"?"Swing Trading":"Long Term Trading";

  if(graphType==="line"){
    const year=Number($("graphYearSelect")?.value||new Date().getFullYear());

    if(graphPeriod==="month"){
      const month=Number($("graphMonthSelect")?.value||"01");
      const monthName=GRAPH_LINE_MONTHS.find(([value])=>Number(value)===month)?.[1]||"";
      const data=graphLineNetByDay(year,month);

      result.innerHTML=renderGraphLineChart(
        data,
        `${title} – ${monthName} ${year}`,
        "Net Profit & Loss"
      );
      setupGraphLineInteractions();
      updateGraphSummary([],data.map(d=>d.net));
    }else{
      const data=graphLineNetByMonth(year);

      result.innerHTML=renderGraphLineChart(
        data,
        `${title} – Yearly Performance (${year})`,
        "Net Profit & Loss"
      );
      setupGraphLineInteractions();
      updateGraphSummary([],data.map(d=>d.net));
    }

    $("graphGrossSummary")?.classList.add("hidden");
    return;
  }

  const data=graphPeriod==="month"?graphMonthlyData(Number(graphRange)):graphYearlyData(graphRange);
  const periodText=graphPeriod==="month"?`Monthly Performance (${graphRange})`:`Yearly Performance (${String(graphRange).replace("-", " – ")})`;
  result.innerHTML=renderGraphBarChart(data,`${title} – ${periodText}`,"Gross P/L vs Net P/L");
  setupGraphBarInteractions();
  updateGraphSummary(data.map(d=>d.gross),data.map(d=>d.net));
  $("graphGrossSummary")?.classList.remove("hidden");
}

function updateGraphSummary(grossValues,netValues){
  const gross=grossValues.reduce((a,b)=>a+(Number(b)||0),0);
  const net=netValues.reduce((a,b)=>a+(Number(b)||0),0);
  if($("graphGrossTotal")) $("graphGrossTotal").textContent=graphMoney(gross);
  if($("graphNetTotal")) $("graphNetTotal").textContent=graphMoney(net);
}

function exportGraphPdf(){
  const oldTitle=document.title;
  const modeTitle=graphMode==="intraday"?"Intraday Trading":graphMode==="swing"?"Swing Trading":"Long Term Trading";
  document.title=`TradeBook - ${modeTitle} Graph`;
  window.print();
  document.title=oldTitle;
}

function setupGraphControls(){
  document.querySelectorAll("#graphChartSection [data-graph-mode]").forEach(btn=>btn.addEventListener("click",()=>{
    graphMode=btn.dataset.graphMode;graphRange="";syncGraphControls();renderGraph();
  }));
  document.querySelectorAll("#graphChartSection [data-chart-type]").forEach(btn=>btn.addEventListener("click",()=>{
    graphType=btn.dataset.chartType;syncGraphControls();renderGraph();
  }));
  document.querySelectorAll("#graphChartSection [data-graph-period]").forEach(btn=>btn.addEventListener("click",()=>{
    graphPeriod=btn.dataset.graphPeriod;graphRange="";syncGraphControls();renderGraph();
  }));
  $("graphRangeSelect")?.addEventListener("change",()=>{graphRange=$("graphRangeSelect").value;renderGraph();});
  $("graphYearSelect")?.addEventListener("change",renderGraph);
  $("graphMonthSelect")?.addEventListener("change",renderGraph);
  $("generateGraphBtn")?.addEventListener("click",renderGraph);
  $("exportGraphPdfBtn")?.addEventListener("click",exportGraphPdf);
  syncGraphControls();
}

/* ==========================================
   EVENT BINDINGS
========================================== */

function setupEventListeners() {
  if (eventsInitialized) return;

  // Bind the primary navigation first. If any optional setup below fails
  // (Graph/PWA/etc.), the app must still be navigable between workspaces.

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click",() => {
      // Dashboard buttons use data-mode-dashboard while the other
      // navigation buttons use data-section. Both must route through
      // showSection() so returning to Dashboard hides Add Trade, Journal,
      // Period Overview, Reports and Field Manager.
      const sectionId = button.dataset.section || button.dataset.modeDashboard;
      if (sectionId) showSection(sectionId);
    });
  });

  setupPWAInstall();
  setupGraphControls();

  document.querySelectorAll(".report-tab").forEach(button => {
    button.addEventListener("click",() => {
      setReportPeriod(button.dataset.reportPeriod);
    });
  });

  document.querySelectorAll("[data-open-trade]").forEach(button => {
    button.addEventListener("click",() => {
      resetForm();
      showSection("tradeFormSection");
    });
  });

  $("tradeForm")?.addEventListener("submit",saveTrade);
  $("tradeForm")?.addEventListener("input",event => {
    if (["buyQty","buyPrice","buyCharge","extraBuyCharge","sellQty","sellPrice","sellCharge","extraSellCharge"].includes(event.target.id)) calculateTrade();
  });
  $("resetTradeBtn")?.addEventListener("click",resetForm);

  [
    "buyQty","buyPrice","buyCharge","extraBuyCharge",
    "sellQty","sellPrice","sellCharge","extraSellCharge"
  ].forEach(id => {
    $(id)?.addEventListener("input",calculateTrade);
  });

  $("journalSearch")?.addEventListener("input",renderJournal);
  setupExportMenu("exportJournalBtn", "exportJournalMenu", {
    "journal-csv": exportJournalCSV,
    "journal-pdf": exportJournalPDF
  });

  document.querySelectorAll(".mode-add-field-btn, #addFieldBtn").forEach(button => {
    button.addEventListener("click",() => {
      closeFieldModal();
      if ($("fieldModalTitle")) {
        $("fieldModalTitle").textContent = "Add Custom Field";
      }
      openFieldModal();
    });
  });

  $("fieldForm")?.addEventListener("submit",saveField);
  $("closeFieldManagerModal")?.addEventListener("click",closeFieldModal);
  $("cancelFieldEdit")?.addEventListener("click",closeFieldModal);

  $("closeViewBtn")?.addEventListener("click",() => {
    $("viewModal")?.classList.add("hidden");
  });

  $("chartImages")?.addEventListener("change",handleAttachmentChange);
  $("contractNote")?.addEventListener("change",handleAttachmentChange);

  $("connectDriveBtn")?.addEventListener("click",connectGoogleDrive);
  $("disconnectDriveBtn")?.addEventListener("click",disconnectGoogleDrive);
  $("driveBackupBtn")?.addEventListener("click",backupToGoogleDrive);
  $("restoreDriveBackupBtn")?.addEventListener("click",restoreFromGoogleDrive);

  $("reportAddRowBtn")?.addEventListener("click",addReportRow);
  $("reportInsertRowBtn")?.addEventListener("click",() => {
    insertReportRowBelowSelected().catch(error => showToast("Row insert failed: " + error.message));
  });

  $("reportSaveAllBtn")?.addEventListener("click",() => {
    saveAllReportData().catch(error => {
      showToast("Report save failed: " + error.message);
    });
  });

  $("reportDeleteRowBtn")?.addEventListener("click",() => {
    if (!selectedReportCell) {
      showToast("Select a cell in the row first.");
      return;
    }
    const rowIndex = Number(selectedReportCell.split(":")[0]);
    deleteReportRow(rowIndex).catch(error => {
      showToast("Row delete failed: " + error.message);
    });
  });

  setupSpreadsheetColorChoosers();
  setupReportToolbar();
  setupBrokerToolbar();
  updateHistoryButtons();
  setupPeriodOverview();

  // Delegated actions: remain active after dynamic HTML rendering.
  document.addEventListener("click",event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const viewButton = target.closest("[data-view-trade]");
    if (viewButton) {
      viewTrade(viewButton.dataset.viewTrade);
      return;
    }

    const viewChoiceButton = target.closest("[data-view-choice]");
    if (viewChoiceButton) {
      const content = $("viewTradeContent");
      const tradeId = content?.dataset.viewTradeId;
      const trade = trades.find(item => String(item.id) === String(tradeId));
      if (!trade) return;

      const choice = viewChoiceButton.dataset.viewChoice;
      if (choice === "back") {
        renderViewChooser(trade);
      } else if (choice === "details") {
        renderTradeDetailsView(trade);
      } else if (choice === "contract") {
        renderAttachmentView(trade, "contract");
      } else if (choice === "chart") {
        renderAttachmentView(trade, "chart");
      }
      return;
    }

    const editButton = target.closest("[data-edit-trade]");
    if (editButton) {
      editTrade(editButton.dataset.editTrade);
      return;
    }

    const deleteButton = target.closest("[data-delete-trade]");
    if (deleteButton) {
      removeTrade(deleteButton.dataset.deleteTrade);
      return;
    }

    const modeDashboardButton = target.closest("[data-mode-dashboard]");
    if (modeDashboardButton) {
      // Use the same section router as every other navigation action.
      // This is important because simply toggling the dashboard section
      // leaves the shared Add Trade/Journal/Reports/Field Manager nodes
      // visible underneath it.
      showSection(modeDashboardButton.dataset.modeDashboard);
      renderModeDashboard(currentMode);
      return;
    }

    const standardEdit = target.closest("[data-edit-standard]");
    if (standardEdit) {
      editStandardField(standardEdit.dataset.editStandard);
      return;
    }

    const standardToggle = target.closest("[data-toggle-standard]");
    if (standardToggle) {
      toggleStandardField(standardToggle.dataset.toggleStandard);
      return;
    }

    const unifiedMove = target.closest("[data-move-unified]");
    if (unifiedMove) {
      moveUnifiedField(unifiedMove.dataset.moveUnified,unifiedMove.dataset.kind,unifiedMove.dataset.direction);
      return;
    }

    const standardDelete = target.closest("[data-delete-standard]");
    if (standardDelete) {
      deleteStandardField(standardDelete.dataset.deleteStandard);
      return;
    }

    const customEdit = target.closest("[data-edit-custom]");
    if (customEdit) {
      editCustomField(customEdit.dataset.editCustom);
      return;
    }

    const moveField = target.closest("[data-move-field]");
    if (moveField) {
      moveCustomField(moveField.dataset.moveField,moveField.dataset.direction);
      return;
    }

    const toggleField = target.closest("[data-toggle-field]");
    if (toggleField) {
      toggleCustomField(toggleField.dataset.toggleField);
      return;
    }

    const deleteField = target.closest("[data-delete-field]");
    if (deleteField) {
      deleteCustomField(deleteField.dataset.deleteField);
    }
  });

  eventsInitialized = true;
}

/* ==========================================
   PWA INSTALL
========================================== */

let deferredInstallPrompt = null;

function setupPWAInstall() {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    showToast("TradeBook installed successfully.");
  });

  $("installAppBtn")?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result?.outcome === "accepted") deferredInstallPrompt = null;
      updateInstallButton();
      return;
    }

    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
      showToast("TradeBook is already installed.");
      return;
    }

    showToast("Your browser has not made the install prompt available yet. Open Chrome menu → Install app / Add to Home screen.");
  });

  updateInstallButton();
}

function updateInstallButton() {
  const button = $("installAppBtn");
  if (!button) return;
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
    button.textContent = "App Installed";
    button.disabled = true;
  } else {
    button.textContent = "Install App";
    button.disabled = false;
  }
}

/* ==========================================
   RENDER EVERYTHING
========================================== */

async function renderEverything() {
  renderDashboard();
  renderJournal();
  renderPeriodOverview();
  renderFieldList();
  renderStandardFormFields();
  renderCustomFormFields();
  renderReportTable();
  updateDriveStatus();
}

/* ==========================================
   APPLICATION STARTUP
========================================== */

async function initializeDatabaseAndData() {
  await openDatabase();
  await loadDatabaseData();
  await loadReportsFromDatabase();
  databaseReady = true;
}

async function startApp() {
  try {
    ensureModeFieldManagerSections();
    setupEventListeners();

    setTradingMode("intraday");
    showSection("dashboardSection");
    updateDriveStatus();

    // Create the shared promise immediately so button actions can await it.
    databaseReadyPromise = initializeDatabaseAndData();

    await databaseReadyPromise;

    if ($("tradeDate") && !$("tradeDate").value) {
      $("tradeDate").value = new Date().toISOString().slice(0,10);
    }

    updateDriveStatus();
    setTradingMode(currentMode);
    showSection(currentSection);
    calculateTrade();

    await renderEverything();
    showTradeBookHome();

    console.log("TradeBook started successfully.");
    showToast("TradeBook is ready.");

  } catch(error) {
    databaseReady = false;
    console.error("TradeLedger startup error:",error);

    showToast("Database loading failed: " + error.message);

    alert(
      "TradeBook database could not be loaded.\n\n" +
      error.message +
      "\n\nYour existing data has not been intentionally deleted. " +
      "Do not clear browser data or IndexedDB."
    );
  }
}

/* ==========================================
   TRADEBOOK ACCOUNT + APPLICATION BOOT
========================================== */
let tradeBookAuthUser = null;
let auth = null;
let tradeBookAppStarted = false;
const PROFILE_PHOTO_KEY = 'TradeBookProfilePhoto';

function authConfigReady(){
  const c = window.TRADEBOOK_FIREBASE_CONFIG || {};
  return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
}
function showAuthView(id){
  document.querySelectorAll('#authGate .auth-view').forEach(v=>v.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  ['authLoginError','authSignupError','authOtpError','authResetMessage'].forEach(k=>{if($(k)) $(k).textContent='';});
}
function authError(id,msg){ if($(id)) $(id).textContent=msg || ''; }
function authName(user){ return user?.displayName || (user?.email||'User').split('@')[0]; }
function getProfilePhoto(){
  try{return localStorage.getItem(PROFILE_PHOTO_KEY)||'';}catch(e){return '';}
}
function setProfilePhoto(photo){
  try{ if(photo) localStorage.setItem(PROFILE_PHOTO_KEY,photo); else localStorage.removeItem(PROFILE_PHOTO_KEY); }catch(e){ console.warn('Could not save profile photo locally.',e); }
}
function applyAvatarElement(el, name, photo){
  if(!el) return;
  if(photo){
    el.textContent='';
    el.style.backgroundImage=`url(\"${photo}\")`;
    el.style.backgroundSize='cover';
    el.style.backgroundPosition='center';
    el.classList.add('has-photo');
  }else{
    el.style.backgroundImage='';
    el.classList.remove('has-photo');
    el.textContent=(name||'U').slice(0,1).toUpperCase();
  }
}
function syncAccountUI(user){
  if(!user) return;
  const name=authName(user), email=user.email||'', photo=getProfilePhoto() || user.photoURL || '';
  ['drawerName','settingsName'].forEach(id=>{if($(id)) $(id).textContent=name;});
  ['drawerEmail','settingsEmail','settingsUsername'].forEach(id=>{if($(id)) $(id).textContent=email;});
  ['drawerAvatar','settingsAvatar'].forEach(id=>applyAvatarElement($(id),name,photo));
  if($('profileEditAvatar')) applyAvatarElement($('profileEditAvatar'),name,photo);
  if($('homeUserName')) $('homeUserName').textContent=name;
}
function openProfileEdit(){
  const user=tradeBookAuthUser; if(!user) return;
  $('profileNameInput').value=authName(user);
  $('profileEditError').textContent='';
  applyAvatarElement($('profileEditAvatar'),authName(user),getProfilePhoto()||user.photoURL||'');
  $('profileEditPage')?.classList.remove('hidden');
}
function closeProfileEdit(){ $('profileEditPage')?.classList.add('hidden'); }
function resizeProfileImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const size=256, canvas=document.createElement('canvas'); canvas.width=size; canvas.height=size;
        const ctx=canvas.getContext('2d');
        const scale=Math.max(size/img.width,size/img.height), w=img.width*scale, h=img.height*scale;
        ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
        resolve(canvas.toDataURL('image/jpeg',0.82));
      };
      img.onerror=reject; img.src=reader.result;
    };
    reader.onerror=reject; reader.readAsDataURL(file);
  });
}
function openAuthGate(view='authLoginView'){ $('authGate')?.classList.remove('hidden'); showAuthView(view); }
function closeAuthGate(){ $('authGate')?.classList.add('hidden'); }
function openDrawer(){ syncAccountUI(tradeBookAuthUser); $('sideDrawer')?.classList.remove('hidden'); $('drawerBackdrop')?.classList.remove('hidden'); }
function closeDrawer(){ $('sideDrawer')?.classList.add('hidden'); $('drawerBackdrop')?.classList.add('hidden'); }
window.openSettings = openSettings;
function openSettings(){ closeDrawer(); syncAccountUI(tradeBookAuthUser); $('accountSettingsModal')?.classList.remove('hidden'); }
function closeSettings(){ $('accountSettingsModal')?.classList.add('hidden'); $('passwordOptions')?.classList.add('hidden'); }
function passwordRulesState(p){ return { length:p.length>=8, upper:/[A-Z]/.test(p), lower:/[a-z]/.test(p), number:/\d/.test(p), special:/[^A-Za-z0-9]/.test(p) }; }
function passwordRuleValid(p){ const r=passwordRulesState(p); return Object.values(r).every(Boolean); }
function updatePasswordRules(inputId){
  const input=$(inputId); const wrap=document.querySelector(`[data-rules-for="${inputId}"]`); if(!input||!wrap) return;
  const r=passwordRulesState(input.value);
  wrap.querySelectorAll('[data-rule]').forEach(el=>{
    const key=el.dataset.rule; const ok=Boolean(r[key]);
    el.classList.toggle('rule-valid',ok); el.classList.toggle('rule-invalid',!ok); el.classList.toggle('valid',ok);
    el.textContent=(ok?'✓ ':'○ ')+(key==='length'?'Minimum 8 characters':key==='upper'?'1 uppercase letter':key==='lower'?'1 lowercase letter':key==='number'?'1 number':'1 special character');
  });
}
let pendingPasswordChange = null;
let pendingDeleteAfterEmailVerification = false;

async function ensureTradeBookStarted(){
  if(tradeBookAppStarted) return;
  tradeBookAppStarted = true;
  await startApp();
}

async function refreshVerifiedUser(){
  const user=auth.currentUser;
  if(!user) return null;
  await user.reload();
  tradeBookAuthUser=auth.currentUser;
  return auth.currentUser;
}

/* ==========================================
   FORGOT PASSWORD - CLOUDFLARE WORKER OTP
   Flow:
   Login -> Forgot Password -> Email -> OTP -> Verify -> New Password
   The Cloudflare Worker stores and verifies the OTP server-side.
========================================== */
function getBrevoConfig(){
  const cfg=window.TRADEBOOK_BREVO_CONFIG||{};
  return {
    workerUrl:String(cfg.workerUrl||'https://tradebook-otp.tradebook2009.workers.dev/send-otp').trim()
  };
}

function getOtpWorkerBaseUrl(){
  const configured=getBrevoConfig().workerUrl;
  return configured.replace(/\/send-otp\/?$/,'').replace(/\/+$/,'');
}

async function postOtpWorker(path,payload){
  const url=getOtpWorkerBaseUrl()+path;
  let response;

  try{
    response=await fetch(url,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'accept':'application/json'
      },
      body:JSON.stringify(payload)
    });
  }catch(error){
    throw new Error('OTP service is unavailable. Check your internet connection and try again.');
  }

  let data=null;

  try{
    data=await response.json();
  }catch(_){}

  if(!response.ok || data?.success===false){
    throw new Error(
      data?.message || `OTP request failed (${response.status}).`
    );
  }

  return data||{};
}

async function sendOtpThroughBrevoApi(to,otp,type='reset'){
  return postOtpWorker('/send-otp',{
    to,
    otp,
    type
  });
}

function generateForgotOtp(){
  return String(Math.floor(100000+Math.random()*900000));
}

function clearForgotOtpTimer(){
  if(forgotOtpTimerHandle){
    clearInterval(forgotOtpTimerHandle);
    forgotOtpTimerHandle=null;
  }
}

function startForgotOtpTimer(){
  clearForgotOtpTimer();

  const tick=()=>{
    const remaining=Math.max(
      0,
      forgotOtpExpiresAt-Date.now()
    );

    const seconds=Math.ceil(
      remaining/1000
    );

    const min=String(
      Math.floor(seconds/60)
    ).padStart(2,'0');

    const sec=String(
      seconds%60
    ).padStart(2,'0');

    if($('forgotOtpTimer')){
      $('forgotOtpTimer').textContent=
        `Code expires in ${min}:${sec}`;
    }

    if(remaining<=0){
      clearForgotOtpTimer();

      forgotOtpValue=null;
      forgotOtpExpiresAt=0;
      forgotResetTicket=null;

      if($('forgotOtpTimer')){
        $('forgotOtpTimer').textContent=
          'Code expired. Please resend a new code.';
      }

      const verifyBtn=$(
        'forgotFlowVerifyOtpBtn'
      );

      if(verifyBtn){
        verifyBtn.disabled=true;
      }
    }else{
      const verifyBtn=$(
        'forgotFlowVerifyOtpBtn'
      );

      if(verifyBtn){
        verifyBtn.disabled=false;
      }
    }
  };

  tick();
  forgotOtpTimerHandle=
    setInterval(tick,250);
}

function clearForgotOtpInputs(){
  document
    .querySelectorAll('.forgot-otp-box')
    .forEach(el=>el.value='');
}

function getForgotOtpInputValue(){
  return [
    ...document.querySelectorAll(
      '.forgot-otp-box'
    )
  ].map(el=>el.value).join('');
}

function showForgotFlowView(id){
  document
    .querySelectorAll(
      '#forgotPasswordFlowModal .forgot-flow-view'
    )
    .forEach(v=>v.classList.add('hidden'));

  $(id)?.classList.remove('hidden');
}

function closeForgotPasswordFlow(){
  clearForgotOtpTimer();

  forgotOtpValue=null;
  forgotOtpExpiresAt=0;
  forgotResetTicket=null;

  clearForgotOtpInputs();

  $('forgotPasswordFlowModal')
    ?.classList.add('hidden');

  $('forgotFlowEmailError').textContent='';
  $('forgotFlowOtpError').textContent='';
  $('forgotFlowPasswordError').textContent='';

  $('forgotFlowPasswordMatch').textContent='';
  $('forgotFlowPasswordMatch')
    .classList.remove('match');

  if($('forgotNewPassword')){
    $('forgotNewPassword').value='';
  }

  if($('forgotConfirmPassword')){
    $('forgotConfirmPassword').value='';
  }

  updateForgotPasswordStrength();
}

function openForgotPasswordFlow(prefillEmail=''){
  const currentEmail=
    String(
      prefillEmail ||
      $('authResetEmail')?.value ||
      ''
    ).trim();

  if($('forgotFlowEmail')){
    $('forgotFlowEmail')
      .removeAttribute('readonly');

    $('forgotFlowEmail').value=
      currentEmail;
  }

  $('forgotPasswordFlowModal')
    ?.classList.remove('hidden');

  showForgotFlowView(
    'forgotFlowEmailView'
  );

  $('forgotFlowEmailError').textContent='';
  $('forgotFlowOtpError').textContent='';
  $('forgotFlowPasswordError').textContent='';

  if(currentEmail){
    $('forgotFlowEmail')?.focus();
  }
}

async function sendForgotOtp(){
  const email=
    ($('forgotFlowEmail')?.value||'')
      .trim()
      .toLowerCase();

  $('forgotFlowEmailError')
    .textContent='';

  if(!email){
    return authError(
      'forgotFlowEmailError',
      'Enter your registered email address.'
    );
  }

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    return authError(
      'forgotFlowEmailError',
      'Enter a valid email address.'
    );
  }

  forgotOtpValue=null;
  forgotOtpExpiresAt=0;
  forgotResetTicket=null;
  clearForgotOtpTimer();

  const otp=
    generateForgotOtp();

  const btn=
    $('forgotFlowSendOtpBtn');

  if(btn){
    btn.disabled=true;
    btn.textContent=
      'Sending OTP...';
  }

  try{
    await sendOtpThroughBrevoApi(
      email,
      otp,
      'reset'
    );

    // Never keep the real OTP in browser state.
    forgotOtpValue=true;
    forgotOtpExpiresAt=
      Date.now()+120000;

    clearForgotOtpInputs();

    showForgotFlowView(
      'forgotFlowOtpView'
    );

    $('forgotFlowOtpError')
      .textContent='';

    if($('forgotFlowVerifyOtpBtn')){
      $('forgotFlowVerifyOtpBtn')
        .disabled=false;
    }

    startForgotOtpTimer();

    document
      .querySelector('.forgot-otp-box')
      ?.focus();

  }catch(error){

    authError(
      'forgotFlowEmailError',
      error.message ||
      'Could not send OTP.'
    );

  }finally{

    if(btn){
      btn.disabled=false;
      btn.textContent='Send OTP';
    }
  }
}

async function resendForgotOtp(){
  forgotOtpValue=null;
  forgotOtpExpiresAt=0;
  forgotResetTicket=null;

  clearForgotOtpTimer();
  clearForgotOtpInputs();

  await sendForgotOtp();
}

async function verifyForgotOtp(){
  const email=
    ($('forgotFlowEmail')?.value||'')
      .trim()
      .toLowerCase();

  const entered=
    getForgotOtpInputValue();

  $('forgotFlowOtpError')
    .textContent='';

  if(!email){
    return authError(
      'forgotFlowOtpError',
      'Email address is missing.'
    );
  }

  if(!/^\d{6}$/.test(entered)){
    return authError(
      'forgotFlowOtpError',
      'Enter the 6-digit OTP.'
    );
  }

  if(
    !forgotOtpValue ||
    Date.now()>=forgotOtpExpiresAt
  ){
    return authError(
      'forgotFlowOtpError',
      'OTP expired. Please tap Resend Code.'
    );
  }

  const btn=
    $('forgotFlowVerifyOtpBtn');

  if(btn){
    btn.disabled=true;
    btn.textContent=
      'Verifying...';
  }

  try{
    const data=
      await postOtpWorker(
        '/verify-otp',
        {
          email,
          otp:entered,
          type:'reset'
        }
      );

    if(!data.resetToken){
      throw new Error(
        'OTP verified, but the reset session could not be created.'
      );
    }

    forgotResetTicket=
      data.resetToken;

    clearForgotOtpTimer();

    forgotOtpValue=null;
    forgotOtpExpiresAt=0;

    showForgotFlowView(
      'forgotFlowPasswordView'
    );

    updateForgotPasswordStrength();

    $('forgotNewPassword')
      ?.focus();

  }catch(error){

    authError(
      'forgotFlowOtpError',
      error.message ||
      'Incorrect or expired OTP.'
    );

  }finally{

    if(btn){
      btn.disabled=false;
      btn.textContent=
        'Verify OTP';
    }
  }
}

function updateForgotPasswordStrength(){
  const p=
    $('forgotNewPassword')?.value||'';

  const r=
    passwordRulesState(p);

  const valid=
    Object.values(r)
      .every(Boolean);

  const wrap=
    document.querySelector(
      '[data-rules-for="forgotNewPassword"]'
    );

  wrap?.querySelectorAll(
    '[data-rule]'
  ).forEach(el=>{

    const ok=
      Boolean(
        r[el.dataset.rule]
      );

    el.classList.toggle(
      'rule-valid',
      ok
    );

    el.classList.toggle(
      'rule-invalid',
      !ok
    );

    const label=
      el.dataset.rule==='length'
        ? 'Minimum 8 characters'
        : el.dataset.rule==='upper'
          ? '1 uppercase letter'
          : el.dataset.rule==='lower'
            ? '1 lowercase letter'
            : el.dataset.rule==='number'
              ? '1 number'
              : '1 special character';

    el.textContent=
      (ok?'✓ ':'○ ')+label;
  });

  $('forgotStrengthBars')
    ?.classList.toggle(
      'all-valid',
      valid
    );

  const st=
    $('forgotStrengthText');

  if(st){
    st.textContent=
      valid
        ? 'Password strength: Good'
        : 'Password strength: Bad';

    st.classList.toggle(
      'good',
      valid
    );

    st.classList.toggle(
      'bad',
      !valid
    );
  }

  const cp=
    $('forgotConfirmPassword')
      ?.value||'';

  const match=
    valid &&
    cp &&
    p===cp;

  const matchEl=
    $('forgotFlowPasswordMatch');

  if(matchEl){
    matchEl.textContent=
      cp
        ? (
          p===cp
            ? 'Passwords match.'
            : 'Passwords do not match.'
        )
        : ' ';

    matchEl.classList.toggle(
      'match',
      Boolean(
        p===cp &&
        cp
      )
    );
  }

  const btn=
    $('forgotFlowChangePasswordBtn');

  if(btn){
    btn.disabled=
      !(
        valid &&
        cp &&
        p===cp &&
        forgotResetTicket
      );
  }
}

async function changeForgotPassword(){
  $('forgotFlowPasswordError')
    .textContent='';

  const p=
    $('forgotNewPassword')
      ?.value||'';

  const cp=
    $('forgotConfirmPassword')
      ?.value||'';

  if(!forgotResetTicket){
    return authError(
      'forgotFlowPasswordError',
      'Reset session expired. Please start Forgot Password again.'
    );
  }

  if(!passwordRuleValid(p)){
    return authError(
      'forgotFlowPasswordError',
      'Password does not meet all the required conditions.'
    );
  }

  if(p!==cp){
    return authError(
      'forgotFlowPasswordError',
      'Passwords do not match.'
    );
  }

  const btn=
    $('forgotFlowChangePasswordBtn');

  if(btn){
    btn.disabled=true;
    btn.textContent=
      'Changing Password...';
  }

  try{
    await postOtpWorker(
      '/reset-password',
      {
        resetToken:
          forgotResetTicket,

        email:
          (
            $('forgotFlowEmail')
              ?.value||''
          )
          .trim()
          .toLowerCase(),

        newPassword:p
      }
    );

    forgotResetTicket=null;
    clearForgotOtpTimer();

    showForgotFlowView(
      'forgotFlowSuccessView'
    );

  }catch(error){

    authError(
      'forgotFlowPasswordError',
      error.message ||
      'Password could not be changed.'
    );

    updateForgotPasswordStrength();

  }finally{

    if(
      btn &&
      $('forgotFlowSuccessView')
        ?.classList.contains('hidden')
    ){
      btn.textContent=
        'Change Password';
    }
  }
}

function updateForgotPasswordLoginCopy(){
  if($('authForgotView')){
    const subtitle=
      $('authForgotView')
        .querySelector('.auth-subtitle');

    if(subtitle){
      subtitle.textContent=
        'Enter your registered email to receive a secure 6-digit OTP.';
    }
  }

  if($('authResetBtn')){
    $('authResetBtn')
      .textContent='Send OTP';
  }

  $('forgotFlowEmail')
    ?.removeAttribute('readonly');
}

function setupForgotPasswordFlow(){
  updateForgotPasswordLoginCopy();

  $('forgotFlowSendOtpBtn')
    ?.addEventListener(
      'click',
      sendForgotOtp
    );

  $('forgotFlowVerifyOtpBtn')
    ?.addEventListener(
      'click',
      verifyForgotOtp
    );

  $('forgotFlowResendBtn')
    ?.addEventListener(
      'click',
      resendForgotOtp
    );

  $('forgotFlowChangePasswordBtn')
    ?.addEventListener(
      'click',
      changeForgotPassword
    );

  $('closeForgotFlowBtn')
    ?.addEventListener(
      'click',
      closeForgotPasswordFlow
    );

  $('forgotFlowDoneBtn')
    ?.addEventListener(
      'click',
      closeForgotPasswordFlow
    );

  $('forgotFlowEmail')
    ?.removeAttribute('readonly');

  [
    'forgotNewPassword',
    'forgotConfirmPassword'
  ].forEach(id=>{
    $(id)?.addEventListener(
      'input',
      updateForgotPasswordStrength
    );
  });

  document
    .querySelectorAll(
      '.forgot-otp-box'
    )
    .forEach((input,index)=>{

      input.addEventListener(
        'input',
        ()=>{
          input.value=
            input.value
              .replace(/\D/g,'')
              .slice(0,1);

          if(
            input.value &&
            index<5
          ){
            document
              .querySelector(
                `[data-otp-index="${index+1}"]`
              )
              ?.focus();
          }
        }
      );

      input.addEventListener(
        'keydown',
        e=>{
          if(
            e.key==='Backspace' &&
            !input.value &&
            index>0
          ){
            document
              .querySelector(
                `[data-otp-index="${index-1}"]`
              )
              ?.focus();
          }
        }
      );

      input.addEventListener(
        'paste',
        e=>{
          e.preventDefault();

          const text=
            (
              e.clipboardData
                ?.getData('text')||''
            )
            .replace(/\D/g,'')
            .slice(0,6);

          [
            ...document.querySelectorAll(
              '.forgot-otp-box'
            )
          ].forEach(
            (el,i)=>
              el.value=text[i]||''
          );

          document
            .querySelector(
              `[data-otp-index="${Math.min(text.length,5)}"]`
            )
            ?.focus();
        }
      );
    });

  updateForgotPasswordStrength();
}

/* ==========================================
   FIREBASE EMAIL ACTION FLOWS
   No Cloud Functions / billing required.
========================================== */
const TRADEBOOK_APP_URL = "https://tradebook-collab.github.io/Trade-Book/";
const TRADEBOOK_ACTION_URL = TRADEBOOK_APP_URL + "verify.html";

function firebaseActionSettings(){
  return {
    url: TRADEBOOK_APP_URL,
    handleCodeInApp: false
  };
}

function sendFirebaseVerificationEmail(user){
  return user.sendEmailVerification(firebaseActionSettings());
}

function sendFirebasePasswordResetEmail(email){
  return auth.sendPasswordResetEmail(email, firebaseActionSettings());
}

function showFirebaseResetSent(email){
  $('authResetMessage').textContent = `Password reset email sent to ${email}. Open it and follow the TradeBook reset page.`;
}

function setupTopbarAndAccountNavigation(){
  if(window.__tradeBookTopbarAccountBound) return;
  window.__tradeBookTopbarAccountBound = true;

  $("notificationBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    setTradingMode("notifications");
  });

  $("notificationsBackBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    showTradeBookHome();
  });

  $("newTradeBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    showTradeBookHome();
  });

  $("closeSettingsBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    closeSettings();
  });

  $("editProfileBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    openProfileEdit();
  });

  $("closeProfileEditBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    closeProfileEdit();
  });

  document.addEventListener("click", async (event) => {
    const settingsAction = event.target.closest("[data-settings-action]");
    if(settingsAction){
      event.preventDefault();
      event.stopPropagation();
      const action = settingsAction.dataset.settingsAction;
      if(action === "username") {
        const user = auth?.currentUser || tradeBookAuthUser;
        const username = user?.email || $("settingsUsername")?.textContent || "Not available";
        showToast(`Username: ${username}`);
      } else if(action === "password") {
        $("passwordOptions")?.classList.toggle("hidden");
      } else if(action === "change-password") {
        if(!auth?.currentUser) {
          showToast("Please log in again to change your password.");
          return;
        }
        openPasswordModal(true);
      } else if(action === "forgot-password") {
        closeSettings();
        openForgotPasswordFlow();
      }
      return;
    }

    const logout = event.target.closest("#logoutBtn");
    if(logout){
      event.preventDefault();
      event.stopPropagation();
      try { await auth?.signOut(); } catch(error) { console.error("TradeBook logout error:", error); }
      closeSettings();
      return;
    }

    const deleteBtn = event.target.closest("#deleteAccountBtn");
    if(deleteBtn){
      event.preventDefault();
      event.stopPropagation();
      if(!auth?.currentUser){
        showToast("Please log in again before deleting your account.");
        return;
      }
      $("deleteAccountError").textContent = "";
      $("deleteAccountModal")?.classList.remove("hidden");
      return;
    }
  }, true);
}

function setupTradeBookNavigation(){
  // Bind navigation independently from Firebase/auth initialization. This keeps
  // the app navigable even if an optional startup service fails.
  const bind = (selector, handler) => {
    document.querySelectorAll(selector).forEach(el => {
      if (el.dataset.tbNavBound === "1") return;
      el.dataset.tbNavBound = "1";
      el.addEventListener("click", handler);
    });
  };

  bind("[data-home-mode]", e => {
    e.preventDefault();
    const mode = e.currentTarget.dataset.homeMode;
    if (mode) setTradingMode(mode);
  });

  bind(".nav-btn", e => {
    e.preventDefault();
    const button = e.currentTarget;
    const sectionId = button.dataset.section || button.dataset.modeDashboard;
    if (sectionId) showSection(sectionId);
  });

  bind(".mode-btn", e => {
    e.preventDefault();
    const mode = e.currentTarget.dataset.mode;
    if (mode) setTradingMode(mode);
  });

  const menu = $("openDrawerBtn");
  if (menu && menu.dataset.tbNavBound !== "1") {
    menu.dataset.tbNavBound = "1";
    menu.addEventListener("click", e => { e.preventDefault(); openDrawer(); });
  }
  const close = $("closeDrawerBtn");
  if (close && close.dataset.tbNavBound !== "1") {
    close.dataset.tbNavBound = "1";
    close.addEventListener("click", e => { e.preventDefault(); closeDrawer(); });
  }
  const backdrop = $("drawerBackdrop");
  if (backdrop && backdrop.dataset.tbNavBound !== "1") {
    backdrop.dataset.tbNavBound = "1";
    backdrop.addEventListener("click", e => { e.preventDefault(); closeDrawer(); });
  }
  bind("[data-drawer-action]", e => {
    const action = e.currentTarget.dataset.drawerAction;
    if (action === "settings") openSettings();
    else { closeDrawer(); showTradeBookHome(); }
  });

  // If the user is on the landing page, hide all application navigation below
  // it. It is restored automatically when a trading section is opened.
  if (!$('tradeBookHome')?.classList.contains('hidden')) {
    document.body.classList.add('tradebook-home-active');
  }
}

async function setupTradeBookAuth(){
  // Bind the hamburger and home navigation through delegation so they remain
  // clickable even if other optional startup code fails or DOM sections are
  // remounted later. These controls are static and exist from initial HTML.
  if (!window.__tradeBookPrimaryNavBound) {
    window.__tradeBookPrimaryNavBound = true;
    document.addEventListener('click', event => {
      const menuButton = event.target.closest('#openDrawerBtn');
      if (menuButton) { openDrawer(); return; }
      const drawerClose = event.target.closest('#closeDrawerBtn');
      if (drawerClose) { closeDrawer(); return; }
      const backdrop = event.target.closest('#drawerBackdrop');
      if (backdrop) { closeDrawer(); return; }
      const homeMode = event.target.closest('[data-home-mode]');
      if (homeMode) { setTradingMode(homeMode.dataset.homeMode); return; }
      const modeButton = event.target.closest('.mode-btn');
      if (modeButton) { setTradingMode(modeButton.dataset.mode); return; }
      const drawerAction = event.target.closest('[data-drawer-action]');
      if (drawerAction) {
        if (drawerAction.dataset.drawerAction === 'settings') openSettings();
        else { closeDrawer(); showTradeBookHome(); }
        return;
      }
    }, {passive:true});
  }
  if(!authConfigReady()){
    openAuthGate();
    authError('authLoginError','Firebase configuration is missing.');
    return;
  }
  if(!window.firebase || !firebase.auth){
    openAuthGate();
    authError('authLoginError','Firebase Authentication could not be loaded. Check your internet connection and reload.');
    return;
  }
  try{
    if(!firebase.apps.length) firebase.initializeApp(window.TRADEBOOK_FIREBASE_CONFIG);
    auth=firebase.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    auth.onAuthStateChanged(async user=>{
      tradeBookAuthUser=user||null;
      if(!user){ if(window.__tradeBookAccountDeleted){ closeAuthGate(); return; } openAuthGate('authLoginView'); return; }
      if(!user.emailVerified){
        openAuthGate('authOtpView');
        authError('authOtpError','A verification email was sent to '+(user.email||'')+'. Open the email and click the verification link, then return here and tap “I Verified My Email”.');
        return;
      }
      closeAuthGate(); syncAccountUI(user); await ensureTradeBookStarted();
    });

    $('showSignupBtn')?.addEventListener('click',()=>showAuthView('authSignupView'));
    $('showLoginBtn')?.addEventListener('click',()=>showAuthView('authLoginView'));
    $('authForgotBtn')?.addEventListener('click',()=>showAuthView('authForgotView'));
    $('backToLoginBtn')?.addEventListener('click',()=>showAuthView('authLoginView'));

    $('authLoginBtn')?.addEventListener('click',async()=>{
      authError('authLoginError','');
      const email=$('authLoginEmail').value.trim(), password=$('authLoginPassword').value;
      if(!email) return authError('authLoginError','Enter your email address.');
      if(!password) return authError('authLoginError','Enter your password.');
      try{ await auth.signInWithEmailAndPassword(email,password); }
      catch(e){ authError('authLoginError',friendlyAuthError(e)); }
    });

    $('authSignupBtn')?.addEventListener('click',async()=>{
      const email=$('authSignupEmail').value.trim(), p=$('authSignupPassword').value, cp=$('authSignupConfirm').value;
      authError('authSignupError','');
      if(!email) return authError('authSignupError','Enter your email address.');
      if(!passwordRuleValid(p)) return authError('authSignupError','Password does not meet all the required conditions.');
      if(p!==cp) return authError('authSignupError','Passwords do not match.');
      try{
        const cred=await auth.createUserWithEmailAndPassword(email,p);
        await sendFirebaseVerificationEmail(cred.user);
        showAuthView('authOtpView');
        authError('authOtpError','Verification email sent to '+email+'. Open Gmail, click the verification link, then return here and tap “I Verified My Email”. No OTP is required.');
      }catch(e){ authError('authSignupError',friendlyAuthError(e)); }
    });

    $('authResetBtn')?.addEventListener('click',()=>{
      const email=$('authResetEmail')?.value.trim()||'';
      $('authResetMessage').textContent='';
      openForgotPasswordFlow(email);
    });

    $('authOtpBtn')?.addEventListener('click',async()=>{
      try{
        const user=await refreshVerifiedUser();
        if(!user) return showAuthView('authLoginView');
        if(user.emailVerified){ closeAuthGate(); syncAccountUI(user); await ensureTradeBookStarted(); }
        else authError('authOtpError','Email is not verified yet. Open the verification email and click its verification link first.');
      }catch(e){ authError('authOtpError',friendlyAuthError(e)); }
    });

    document.querySelectorAll('[data-eye-for]').forEach(btn=>btn.addEventListener('click',()=>{
      const el=$(btn.dataset.eyeFor); if(!el) return;
      el.type=el.type==='password'?'text':'password';
      btn.innerHTML = el.type==='password'
        ? '<svg class="eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.8"></circle><path d="M4 4 20 20"></path></svg>'
        : '<svg class="eye-icon eye-open-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg>';
      btn.classList.toggle('eye-open',el.type==='text');
    }));
    ['authSignupPassword','changeNewPassword'].forEach(id=>$(id)?.addEventListener('input',()=>updatePasswordRules(id)));
    updatePasswordRules('authSignupPassword'); updatePasswordRules('changeNewPassword');

    $('profilePhotoInput')?.addEventListener('change',async e=>{
      const file=e.target.files?.[0]; if(!file) return;
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)) return authError('profileEditError','Please choose a PNG, JPG or WebP image.');
      try{
        const photo=await resizeProfileImage(file);
        setProfilePhoto(photo);
        applyAvatarElement($('profileEditAvatar'),$('profileNameInput').value.trim()||authName(tradeBookAuthUser),photo);
        syncAccountUI(tradeBookAuthUser);
      }catch(err){ authError('profileEditError','Could not load that image. Please try another photo.'); }
    });
    $('saveProfileBtn')?.addEventListener('click',async()=>{
      const user=auth.currentUser; const name=$('profileNameInput').value.trim();
      authError('profileEditError','');
      if(!user) return authError('profileEditError','You are not signed in.');
      if(name.length<2) return authError('profileEditError','Enter a name with at least 2 characters.');
      try{
        await user.updateProfile({displayName:name});
        tradeBookAuthUser=auth.currentUser;
        syncAccountUI(tradeBookAuthUser);
        closeProfileEdit();
        showToast('Profile updated successfully.');
      }catch(e){ authError('profileEditError',friendlyAuthError(e)); }
    });
    // CHANGE PASSWORD: verify current password first, then send a separate Brevo OTP page.
    $('changePasswordForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const current=$('changeCurrentPassword').value, np=$('changeNewPassword').value, cp=$('changeConfirmPassword').value;
      authError('changePasswordError','');
      if(!current) return authError('changePasswordError','Enter your current password.');
      if(!passwordRuleValid(np)) return authError('changePasswordError','New password does not meet all the required conditions.');
      if(np!==cp) return authError('changePasswordError','New passwords do not match.');
      if(np===current) return authError('changePasswordError','New password must be different from the current password.');
      const btn=e.submitter||document.querySelector('#changePasswordForm button[type="submit"]');
      if(btn){btn.disabled=true;btn.textContent='Checking...';}
      try{
        const user=auth.currentUser; if(!user) throw new Error('Please log in again to change your password.');
        const credential=firebase.auth.EmailAuthProvider.credential(user.email,current);
        await user.reauthenticateWithCredential(credential);
        pendingPasswordChange={current,np,cp,email:user.email,otp:null,expiresAt:0};
        await sendActionOtp('change',user.email);
        $('passwordModal')?.classList.add('hidden');
        $('changePasswordOtpModal')?.classList.remove('hidden');
        showActionOtpView('change');
      }catch(e){
        const code=e?.code||'';
        authError('changePasswordError',code.includes('invalid-credential')||code.includes('wrong-password')?'Current password is wrong.':(e?.message||'Could not start password change.'));
      }finally{ if(btn){btn.disabled=false;btn.textContent='Update Password';} }
    });

    // DELETE ACCOUNT: separate warning/password page, then a separate OTP page.
    $('closeDeleteAccountModal')?.addEventListener('click',()=>{ $('deleteAccountModal')?.classList.add('hidden'); $('deleteCurrentPassword').value=''; $('deleteAccountError').textContent=''; });
    $('confirmDeleteAccountBtn')?.addEventListener('click',async()=>{
      $('deleteAccountError').textContent='';
      const current=$('deleteCurrentPassword')?.value||'';
      if(!current) return authError('deleteAccountError','Enter your current password.');
      const btn=$('confirmDeleteAccountBtn'); if(btn){btn.disabled=true;btn.textContent='Checking...';}
      try{
        const user=auth.currentUser; if(!user) throw new Error('Please log in again before deleting your account.');
        const credential=firebase.auth.EmailAuthProvider.credential(user.email,current);
        await user.reauthenticateWithCredential(credential);
        window.__tradeBookPendingDelete={email:user.email,otp:null,expiresAt:0};
        await sendActionOtp('delete',user.email);
        $('deleteAccountModal')?.classList.add('hidden');
        $('deleteAccountOtpModal')?.classList.remove('hidden');
        showActionOtpView('delete');
      }catch(e){
        const code=e?.code||'';
        $('deleteAccountError').textContent=code.includes('invalid-credential')||code.includes('wrong-password')?'Current password is wrong.':(e?.message||'Could not start account deletion.');
      }finally{ if(btn){btn.disabled=false;btn.textContent='Continue to Verification';} }
    });

    $('closeChangePasswordOtpBtn')?.addEventListener('click',()=>closeActionOtp('change'));
    $('closeDeleteAccountOtpBtn')?.addEventListener('click',()=>closeActionOtp('delete'));
    $('verifyChangePasswordOtpBtn')?.addEventListener('click',()=>verifyActionOtp('change'));
    $('verifyDeleteAccountOtpBtn')?.addEventListener('click',()=>verifyActionOtp('delete'));
    $('resendChangePasswordOtpBtn')?.addEventListener('click',()=>resendActionOtp('change'));
    $('resendDeleteAccountOtpBtn')?.addEventListener('click',()=>resendActionOtp('delete'));
    $('changePasswordSuccessBtn')?.addEventListener('click',()=>{ $('changePasswordOtpModal')?.classList.add('hidden'); closeSettings(); });
    $('deleteAccountSuccessBtn')?.addEventListener('click',()=>{ window.__tradeBookAccountDeleted=false; $('deleteAccountOtpModal')?.classList.add('hidden'); openAuthGate('authLoginView'); });
    setupActionOtpInputs('change');
    setupActionOtpInputs('delete');
  }catch(e){ openAuthGate(); authError('authLoginError','Authentication initialization failed: '+(e?.message||e)); }
}

let actionOtpState={change:null,delete:null};
function actionOtpElements(type){
  return type==='change'
    ? {modal:'changePasswordOtpModal',view:'changePasswordOtpView',success:'changePasswordSuccessView',timer:'changePasswordOtpTimer',error:'changePasswordOtpError',verify:'verifyChangePasswordOtpBtn',resend:'resendChangePasswordOtpBtn',box:'.action-otp-box[data-action-otp-index]'}
    : {modal:'deleteAccountOtpModal',view:'deleteAccountOtpView',success:'deleteAccountSuccessView',timer:'deleteAccountOtpTimer',error:'deleteAccountOtpError',verify:'verifyDeleteAccountOtpBtn',resend:'resendDeleteAccountOtpBtn',box:'.delete-otp-input[data-delete-otp-index]'};
}
function showActionOtpView(type,success=false){ const e=actionOtpElements(type); $(e.view)?.classList.toggle('hidden',success); $(e.success)?.classList.toggle('hidden',!success); }
function getActionOtpValue(type){ const e=actionOtpElements(type); return [...document.querySelectorAll(e.box)].map(x=>x.value).join(''); }
function clearActionOtpInputs(type){ const e=actionOtpElements(type); document.querySelectorAll(e.box).forEach(x=>x.value=''); }
function clearActionOtpTimer(type){ const s=actionOtpState[type]; if(s?.timerHandle){clearInterval(s.timerHandle);s.timerHandle=null;} }
function startActionOtpTimer(type){
  clearActionOtpTimer(type); const e=actionOtpElements(type); const s=actionOtpState[type]; if(!s)return;
  const tick=()=>{ const rem=Math.max(0,s.expiresAt-Date.now()); const sec=Math.ceil(rem/1000); const mm=String(Math.floor(sec/60)).padStart(2,'0'), ss=String(sec%60).padStart(2,'0'); $(e.timer).textContent=rem>0?`Code expires in ${mm}:${ss}`:'Code expired. Please resend a new code.'; if(rem<=0){s.otp=null;clearActionOtpTimer(type);$(e.verify).disabled=true;}else $(e.verify).disabled=false; };
  tick(); s.timerHandle=setInterval(tick,250);
}
function setupActionOtpInputs(type){
  const e=actionOtpElements(type); document.querySelectorAll(e.box).forEach((input,index)=>{
    input.addEventListener('input',()=>{ input.value=(input.value||'').replace(/\D/g,'').slice(-1); if(input.value) document.querySelector(`${e.box}[data-${type==='change'?'action-otp':'delete-otp'}-index="${Math.min(index+1,5)}"]`)?.focus(); });
    input.addEventListener('keydown',ev=>{ if(ev.key==='Backspace'&&!input.value&&index>0) document.querySelector(`${e.box}[data-${type==='change'?'action-otp':'delete-otp'}-index="${index-1}"]`)?.focus(); });
    input.addEventListener('paste',ev=>{ ev.preventDefault(); const text=(ev.clipboardData?.getData('text')||'').replace(/\D/g,'').slice(0,6); [...document.querySelectorAll(e.box)].forEach((el,i)=>el.value=text[i]||''); document.querySelector(`${e.box}[data-${type==='change'?'action-otp':'delete-otp'}-index="${Math.min(text.length,5)}"]`)?.focus(); });
  });
}
async function sendActionOtp(type,email){
  const otp=generateForgotOtp(); const state={otp,expiresAt:Date.now()+120000,timerHandle:null,email}; actionOtpState[type]=state; clearActionOtpInputs(type);
  const e=actionOtpElements(type); $(e.error).textContent=''; $(e.verify).disabled=true;
  try{ await sendOtpThroughBrevoApi(email,otp,type); startActionOtpTimer(type); document.querySelector(e.box)?.focus(); }catch(err){ state.otp=null;state.expiresAt=0; throw err; }
}
async function resendActionOtp(type){ const state=actionOtpState[type]; const email=state?.email || (type==='change'?auth?.currentUser?.email:window.__tradeBookPendingDelete?.email); if(!email)return; try{await sendActionOtp(type,email);}catch(err){authError(actionOtpElements(type).error,err.message||'Could not resend OTP.');} }
function closeActionOtp(type){ clearActionOtpTimer(type); actionOtpState[type]=null; clearActionOtpInputs(type); $(actionOtpElements(type).modal)?.classList.add('hidden'); if(type==='change'){pendingPasswordChange=null;showPasswordSettingsAgain();} else {window.__tradeBookPendingDelete=null;$('deleteAccountModal')?.classList.add('hidden');} }
function showPasswordSettingsAgain(){ $('passwordModal')?.classList.add('hidden'); }
async function verifyActionOtp(type){
  const e=actionOtpElements(type), state=actionOtpState[type]; const entered=getActionOtpValue(type); $(e.error).textContent='';
  if(!state?.otp || Date.now()>=state.expiresAt) return authError(e.error,'OTP expired. Please tap Resend Code.');
  if(entered.length!==6 || entered!==state.otp) return authError(e.error,'Incorrect OTP. Please try again.');
  clearActionOtpTimer(type); $(e.verify).disabled=true;
  try{
    if(type==='change'){
      const user=auth.currentUser; if(!user||!pendingPasswordChange) throw new Error('Password change session expired. Please start again.');
      await user.updatePassword(pendingPasswordChange.np);
      pendingPasswordChange=null; actionOtpState[type]=null; clearActionOtpInputs(type); showActionOtpView(type,true);
    }else{
      const user=auth.currentUser; if(!user) throw new Error('Your login session expired. Please log in again.');
      await user.delete();
      window.__tradeBookAccountDeleted=true;
      window.__tradeBookPendingDelete=null; actionOtpState[type]=null; clearActionOtpInputs(type); showActionOtpView(type,true);
    }
  }catch(err){ $(e.verify).disabled=false; $(e.error).textContent=friendlyAuthError(err); }
}


async function permanentlyDeleteTradeBookAccount(){
  const user=auth.currentUser;
  if(!user) return;
  await user.delete();
  pendingDeleteAfterEmailVerification=false;
  $('emailActionModal')?.classList.add('hidden');
  $('deleteAccountModal')?.classList.add('hidden');
  closeSettings();
  tradeBookAuthUser=null;
  alert('Your TradeBook account has been permanently deleted.');
  openAuthGate('authLoginView');
}

function friendlyAuthError(e){
  const c=e?.code||'';
  if(c.includes('invalid-credential')||c.includes('wrong-password')) return 'Current password is wrong.';
  if(c.includes('user-not-found')) return 'Account not found.';
  if(c.includes('email-already-in-use')) return 'An account already exists for this email.';
  if(c.includes('weak-password')) return 'Password is too weak.';
  if(c.includes('invalid-email')) return 'Enter a valid email address.';
  if(c.includes('operation-not-allowed')) return 'Email/Password sign-in is not enabled in Firebase Authentication.';
  if(c.includes('unauthorized-domain')) return 'This website domain is not authorized in Firebase Authentication.';
  if(c.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  if(c.includes('requires-recent-login')) return 'For security, please log in again and repeat this action.';
  if(c.includes('user-disabled')) return 'This account has been disabled.';
  return e?.message||'Authentication failed.';
}
function openPasswordModal(change){
  $('passwordModal')?.classList.remove('hidden');
  $('currentPasswordView')?.classList.toggle('hidden',change);
  $('changePasswordForm')?.classList.toggle('hidden',!change);
  if($('passwordModalTitle')) $('passwordModalTitle').textContent=change?'Change Password':'Current Password';
  if(change) updatePasswordRules('changeNewPassword');
}
function closePasswordModal(){ $('passwordModal')?.classList.add('hidden'); $('changePasswordForm')?.reset(); updatePasswordRules('changeNewPassword'); }
$('closePasswordModal')?.addEventListener('click',closePasswordModal);

// Start authentication once. The main TradeBook application starts only after a verified login.
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ setupTopbarAndAccountNavigation(); setupTradeBookNavigation(); setupTradeBookAuth(); setupForgotPasswordFlow(); },{once:true});
else { setupTopbarAndAccountNavigation(); setupTradeBookNavigation(); setupTradeBookAuth(); setupForgotPasswordFlow(); }