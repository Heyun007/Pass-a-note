document.addEventListener('DOMContentLoaded', function() {
// 注册 Service Worker（用于后台推送）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function(reg) {
    console.log('Service Worker 注册成功');
  }).catch(function(e) {
    console.log('Service Worker 注册失败：', e);
  });
}
  console.log('小纸条 JS 成功加载并开始运行！');

  // ========== IndexedDB 封装 ==========
  var dbPromise = new Promise(function(resolve, reject) {
    var req = indexedDB.open('PassANoteDB', 3);
    req.onupgradeneeded = function(e) { var db = e.target.result; if (!db.objectStoreNames.contains('stateStore')) db.createObjectStore('stateStore'); };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
  function dbGet(key) { return dbPromise.then(function(db) { return new Promise(function(resolve) { var tx = db.transaction('stateStore', 'readonly'); var req = tx.objectStore('stateStore').get(key); req.onsuccess = function(e) { resolve(e.target.result || null); }; req.onerror = function() { resolve(null); }; }); }); }
  function dbSet(key, val) { return dbPromise.then(function(db) { return new Promise(function(resolve, reject) { var tx = db.transaction('stateStore', 'readwrite'); var req = tx.objectStore('stateStore').put(val, key); req.onsuccess = function() { resolve(true); }; req.onerror = function(e) { console.error('存储失败', e); reject(e); }; }); }); }

  function showToast(msg, isError) {
    var toast = document.createElement('div');
    toast.style.cssText = 'position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); background: ' + (isError ? 'rgba(255,59,48,0.9)' : 'rgba(0,0,0,0.8)') + '; color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 13px; z-index: 9999; transition: opacity 0.3s; pointer-events: none; white-space: nowrap;';
    toast.textContent = msg;
    var phone = document.querySelector('.phone'); if (phone) phone.appendChild(toast); else document.body.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; setTimeout(function(){ toast.remove(); }, 300); }, 2000);
  }

  // ========== 全局状态变量 ==========
  var cardState = { categories: [{ id: 'default', name: '默认', collapsed: false, blocked: false }], cards: [] };
  var statusState = { categories: [{ id: 'default', name: '默认', collapsed: false, blocked: false }], statuses: [] };
  var dreamState = { dreams: [], currentId: null, lastCheckTime: 0 };
  var historyState = {};
  var chatRoundState = {};
  var secretState = { codes: [], lastDrawTime: 0 };
  var pokeState = { categories: [{ id: 'default', name: '默认', collapsed: false }], pokes: [], lastPokeTime: 0 };
  var diaryState = { diaries: [], cover: null };
  var mailState = { mails: [] };
  var state = { profile: { name: '我', avatar: '', status: '在线' } };

  var tarotState = {
  groups: [{ id: 'default', name: '默认', images: [] }],
  mode: 'image',
  rounds: {},
  imageBg: null,
  songBg: null
};

  // ========== 聊天副页面状态 ==========
var chatState = {
  messages: {}, // { dreamId: [ {id, role:'user'|'dream', text, quote, time} ] }
  lastUserTime: {}, // { dreamId: timestamp }
  activeTimer: null
};

var chatSettings = {
  bg: null,
  bubbleCss: '',
  minDelay: 1,
  maxDelay: 3,
  ignoreRead: false,
  quoteEnabled: false,
  cardMin: 1,
  cardMax: 3,
  activeMinutes: 30,
  pushEnabled: false
};
  var isDataReady = false;

  function initSecretSlots() { var newCodes = []; for (var i = 0; i < 10; i++) { var existing = (secretState.codes && secretState.codes[i]) ? secretState.codes[i] : null; newCodes.push({ id: 'secret_' + i, text: existing ? existing.text : '' }); } secretState.codes = newCodes; }

  // ========== 异步加载数据 ==========
  Promise.all([
    dbGet('passANoteCards'), dbGet('passANoteStatuses'), dbGet('passANoteDreams'),
    dbGet('passANoteHistory'), dbGet('passANoteChatRound'), dbGet('passANoteSecrets'),
    dbGet('passANotePokes'), dbGet('passANoteDiaries'), dbGet('passANoteMails'), dbGet('passANoteBeautify'),
dbGet('passANoteChatMessages'), dbGet('passANoteChatSettings'), dbGet('passANoteTarot')
  ]).then(function(results) {
    var savedCards = results[0], savedStatuses = results[1], savedDreams = results[2], savedHistory = results[3], savedRound = results[4], savedSecrets = results[5], savedPokes = results[6], savedDiaries = results[7], savedMails = results[8];
    if (savedCards) { cardState.categories = savedCards.categories || cardState.categories; cardState.cards = savedCards.cards || []; }
    if (savedStatuses) { statusState.categories = savedStatuses.categories || statusState.categories; statusState.statuses = savedStatuses.statuses || []; }
    if (savedDreams) { dreamState.dreams = savedDreams.dreams || []; dreamState.currentId = savedDreams.currentId || null; dreamState.lastCheckTime = savedDreams.lastCheckTime || 0; }
    if (savedHistory) historyState = savedHistory;
    if (savedRound) chatRoundState = savedRound;
    if (savedSecrets) secretState = savedSecrets;
    if (savedPokes) pokeState = savedPokes;
    if (savedDiaries) diaryState = savedDiaries;
    if (savedMails) mailState = savedMails;
    if (results[9]) beautifySettings = results[9]; // 读出美化数据
    applyBeautifyStyles(); // 读取完立刻应用美化
    if (results[10]) chatState.messages = results[10] || {};
    if (results[11]) chatSettings = Object.assign(chatSettings, results[11] || {});
    if (results[12]) {
  tarotState.groups = results[12].groups || tarotState.groups;
  tarotState.mode = results[12].mode || 'image';
  tarotState.rounds = results[12].rounds || {};
  tarotState.imageBg = results[12].imageBg || null;
tarotState.songBg = results[12].songBg || null;
}
    function saveChatMessages() { return dbSet('passANoteChatMessages', chatState.messages); }
    function saveChatSettings() { return dbSet('passANoteChatSettings', chatSettings); }
    function saveChatMessages() { return dbSet('passANoteChatMessages', chatState.messages); }
    
    initSecretSlots(); saveSecretState();
    isDataReady = true; console.log('✅ 数据加载完成');
    window.renderDreamSelector(); window.renderCardManager(); window.renderStatusManager(); renderChatRound(); window.renderPokeManager();
    if (pageHistory && pageHistory.classList.contains('active')) window.initHistoryPage();
  }).catch(function(e) { console.error('数据加载失败', e); showToast('数据加载失败，请刷新重试', true); isDataReady = true; });

  function saveCardState() { return dbSet('passANoteCards', cardState); }
  function saveStatusState() { return dbSet('passANoteStatuses', statusState); }
  function saveDreamState() { return dbSet('passANoteDreams', dreamState); }
  function saveHistoryState() { return dbSet('passANoteHistory', historyState); }
  function saveChatRound() { return dbSet('passANoteChatRound', chatRoundState); }
  function saveSecretState() { return dbSet('passANoteSecrets', secretState); }
  function savePokeState() { return dbSet('passANotePokes', pokeState); }
  function saveDiaryState() { return dbSet('passANoteDiaries', diaryState); }
  function saveMailState() { return dbSet('passANoteMails', mailState); }
  function saveTarotState() { return dbSet('passANoteTarot', tarotState); }

  // ========== 元素绑定 ==========
  function safeBind(id, event, fn) { var el = document.getElementById(id); if (el) el.addEventListener(event, fn); }
  var screenMain = document.getElementById('screenMain'); var screenChat = document.getElementById('screenChat');
  var pageWordCards = document.getElementById('pageWordCards'); var pageDreamRole = document.getElementById('pageDreamRole');
  var pageStatusList = document.getElementById('pageStatusList'); var pageHistory = document.getElementById('pageHistory');
  var pageSecretCode = document.getElementById('pageSecretCode'); var pagePokes = document.getElementById('pagePokes');
  var pageDiary = document.getElementById('pageDiary'); var pageWriteDiary = document.getElementById('pageWriteDiary');
  var pageMailbox = document.getElementById('pageMailbox'); var pageWriteLetter = document.getElementById('pageWriteLetter');
  var pageSettings = document.getElementById('pageSettings');
  var pageSettings = document.getElementById('pageSettings');
  var pageLetterDetail = document.getElementById('pageLetterDetail');
  var modeToggle = document.getElementById('modeToggle'); var switchModeBtn = document.getElementById('switchModeBtn');

  var ICON_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.93" y2="6.93"/><line x1="17.07" y1="17.07" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.93" y2="17.07"/><line x1="17.07" y1="6.93" x2="19.07" y2="4.93"/></svg>';
  var ICON_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var isDark = false; try { isDark = localStorage.getItem('theme') === 'dark'; } catch(e) {}
  if (isDark) { document.body.classList.add('dark'); if (modeToggle) modeToggle.innerHTML = ICON_MOON; } else { if (modeToggle) modeToggle.innerHTML = ICON_SUN; }
  safeBind('modeToggle', 'click', function() { isDark = !isDark; if (isDark) { document.body.classList.add('dark'); if (modeToggle) modeToggle.innerHTML = ICON_MOON; try { localStorage.setItem('theme', 'dark'); } catch(e) {} } else { document.body.classList.remove('dark'); if (modeToggle) modeToggle.innerHTML = ICON_SUN; try { localStorage.setItem('theme', 'light'); } catch(e) {} } });
  safeBind('switchModeBtn', 'click', function() { window.navigateTo('screenChat'); });
  safeBind('chatSwitchBtn', 'click', function() { window.navigateTo('screenMain'); });
  safeBind('chatPlusBtn', 'click', function() { window.openChatPlus(); });
  safeBind('chatSettingsBtn', 'click', function() { window.openChatSettings(); });
  safeBind('chatSendBtn', 'click', function() { window.chatSend(); });

  window.navigateTo = function(pageId) {
    var activeEl = document.querySelector('.screen.active');
if (activeEl && activeEl.id !== pageId) {
  window._previousPage = activeEl.id;
}
    if (screenChat) screenChat.classList.remove('active');
    if (screenMain) screenMain.classList.remove('active'); 
    if (screenChat) screenChat.classList.remove('active');
    if (pageWordCards) pageWordCards.classList.remove('active');
    if (pageDreamRole) pageDreamRole.classList.remove('active');
    if (pageStatusList) pageStatusList.classList.remove('active');
    if (pageHistory) pageHistory.classList.remove('active');
    if (pageSecretCode) pageSecretCode.classList.remove('active'); 
    if (pagePokes) pagePokes.classList.remove('active');
    if (pageDiary) pageDiary.classList.remove('active'); 
    if (pageWriteDiary) pageWriteDiary.classList.remove('active');
    if (pageMailbox) pageMailbox.classList.remove('active'); 
    if (pageWriteLetter) pageWriteLetter.classList.remove('active');
    if (pageLetterDetail) pageLetterDetail.classList.remove('active');
    if (pageBeautify) pageBeautify.classList.remove('active');
    if (pageSettings) pageSettings.classList.remove('active');
    var pageChatSettings = document.getElementById('pageChatSettings');
    if (pageChatSettings) pageChatSettings.classList.remove('active');
    if (pageSettings) pageSettings.classList.remove('active');
    if (screenChat) screenChat.classList.remove('active');
    var pageTarot = document.getElementById('pageTarot');
if (pageTarot) pageTarot.classList.remove('active');
var pageTarotLibrary = document.getElementById('pageTarotLibrary');
if (pageTarotLibrary) pageTarotLibrary.classList.remove('active');
var pageTarotSettings = document.getElementById('pageTarotSettings');
if (pageTarotSettings) pageTarotSettings.classList.remove('active');
    var target = document.getElementById(pageId); if (target) target.classList.add('active');
   if (pageId === 'screenChat') {
  window.renderChatPage();
  window.applyChatBg();
  window.applyBubbleCss();
}
    if (pageId === 'pageWordCards') window.renderCardManager(); if (pageId === 'pageDreamRole') window.renderDreamList();
    if (pageId === 'pageStatusList') window.renderStatusManager(); if (pageId === 'pageHistory') window.initHistoryPage();
    if (pageId === 'pageSecretCode') window.renderSecretCodeManager();
    if (pageId === 'pagePokes') window.renderPokeManager();
    if (pageId === 'pageDiary') window.renderDiaryPage();
    if (pageId === 'pageMailbox') window.renderMailList();
    if (pageId === 'pageTarot') window.renderTarotPage();
    if (pageId === 'pageTarotLibrary') window.renderTarotGroupList();
        if (pageId === 'pageTarot') {
      window.applyTarotBgs();
    }

        if (pageId === 'pageBeautify') {
      window.renderBeautifyPage();
    }
        if (pageId === 'pageSettings') {
      var minEl = document.getElementById('settingMinDelay'); if (minEl) minEl.value = appSettings.minDelay;
      var maxEl = document.getElementById('settingMaxDelay'); if (maxEl) maxEl.value = appSettings.maxDelay;
    }
  };
  window.goBack = function() {
  var target = window._previousPage || 'screenMain';
  window._previousPage = null;
  window.navigateTo(target);
};
  safeBind('openCardPanelBtn', 'click', function() { window.navigateTo('pageWordCards'); });
  safeBind('dreamRoleBtn', 'click', function() { window.navigateTo('pageDreamRole'); });
  safeBind('historyBtn', 'click', function() { window.navigateTo('pageHistory'); });
  safeBind('secretCodeBtn', 'click', function() { window.navigateTo('pageSecretCode'); });
  safeBind('pokeBtn', 'click', function() { window.navigateTo('pagePokes'); });
  safeBind('diaryBtn', 'click', function() { window.navigateTo('pageDiary'); });
  safeBind('mailBtn', 'click', function() { window.navigateTo('pageMailbox'); });
    var callState = { active: false, isIncoming: false, targetId: null, timerInterval: null, startTime: 0, timeout: null };
  safeBind('callBtn', 'click', function() { window.startCall(); });
  safeBind('settingsBtn', 'click', function() { window.navigateTo('pageSettings'); });
    var appSettings = { minDelay: 1.2, maxDelay: 1.2 };
  try { var savedSettings = localStorage.getItem('passANoteSettings'); if (savedSettings) appSettings = JSON.parse(savedSettings); } catch(e) {}
  function saveAppSettings() { try { localStorage.setItem('passANoteSettings', JSON.stringify(appSettings)); } catch(e) {} }
  safeBind('settingsBtn', 'click', function() { window.navigateTo('pageSettings'); });
    var beautifySettings = { homeBg: null, paperBg: null, icons: {}, fontColor: '', fontSize: 14, themeColor: '#007aff' };
  function saveBeautifySettings() { return dbSet('passANoteBeautify', beautifySettings); }
  safeBind('beautifyBtn', 'click', function() { window.navigateTo('pageBeautify'); });
  safeBind('tarotBtn', 'click', function() { window.navigateTo('pageTarot'); });
  safeBind('choiceBtn', 'click', function() { openChoiceModal(); });

    // ========== 设置逻辑 ==========
  var appSettings = { minDelay: 1.2, maxDelay: 1.2 };
  try { var savedSettings = localStorage.getItem('passANoteSettings'); if (savedSettings) appSettings = JSON.parse(savedSettings); } catch(e) {}
  function saveAppSettings() { try { localStorage.setItem('passANoteSettings', JSON.stringify(appSettings)); } catch(e) {} }

  window.saveDelaySetting = function() {
    var minV = parseFloat(document.getElementById('settingMinDelay').value) || 1.2;
    var maxV = parseFloat(document.getElementById('settingMaxDelay').value) || 1.2;
    if (minV < 0.1) minV = 0.1; if (maxV < minV) maxV = minV;
    appSettings.minDelay = minV; appSettings.maxDelay = maxV;
    saveAppSettings();
    document.getElementById('settingMinDelay').value = minV;
    document.getElementById('settingMaxDelay').value = maxV;
    showToast('延迟设置已保存');
  };

  window.backupData = function() {
    var data = {
      cards: cardState, statuses: statusState, dreams: dreamState,
      history: historyState, chatRound: chatRoundState, secrets: secretState,
      pokes: pokeState, diaries: diaryState, mails: mailState,
      settings: appSettings,
      tarotState: tarotState, // 新增：备份感知页数据（图片库/背景）
      tarotPlaylistId: localStorage.getItem('tarotPlaylistId') || null // 新增：备份歌单ID
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '小纸条_备份_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('备份文件已下载');
  };

  window.restoreData = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        var promises = [];
        if (data.cards) promises.push(dbSet('passANoteCards', data.cards));
        if (data.statuses) promises.push(dbSet('passANoteStatuses', data.statuses));
        if (data.dreams) promises.push(dbSet('passANoteDreams', data.dreams));
        if (data.history) promises.push(dbSet('passANoteHistory', data.history));
        if (data.chatRound) promises.push(dbSet('passANoteChatRound', data.chatRound));
        if (data.secrets) promises.push(dbSet('passANoteSecrets', data.secrets));
        if (data.pokes) promises.push(dbSet('passANotePokes', data.pokes));
        if (data.diaries) promises.push(dbSet('passANoteDiaries', data.diaries));
        if (data.mails) promises.push(dbSet('passANoteMails', data.mails));
        if (data.settings) { appSettings = data.settings; saveAppSettings(); }

        // 恢复感知页数据
        if (data.tarotState) promises.push(dbSet('passANoteTarot', data.tarotState));
        if (data.tarotPlaylistId) {
          try { localStorage.setItem('tarotPlaylistId', data.tarotPlaylistId); } catch(e) {}
        } else if (data.tarotPlaylistId === null) {
          try { localStorage.removeItem('tarotPlaylistId'); } catch(e) {}
        }

        Promise.all(promises).then(function() {
          alert('数据已成功导入，页面即将刷新');
          location.reload();
        }).catch(function(err) { alert('导入失败：' + err.message); });
      } catch(err) { alert('文件解析失败，请确认是有效的备份文件'); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  window.clearAllData = function() {
    if (!confirm('确定清除所有数据吗？\n包括字卡、状态、梦角、历史记录等全部内容。\n\n此操作不可恢复！')) return;
    if (!confirm('再次确认：真的要清除吗？')) return;
    indexedDB.deleteDatabase('PassANoteDB');
    try { localStorage.clear(); } catch(e) {}
    setTimeout(function() { location.reload(); }, 300);
  };

  // ========== 字卡逻辑 ==========
  var currentSearchTerm = '';
  window.renderCardManager = function() { var container = document.getElementById('cardListContainer'); if (!container) return; var html = ''; if (currentSearchTerm) { var matched = cardState.cards.filter(function(c) { return c.text.indexOf(currentSearchTerm) > -1; }); if (matched.length === 0) html = '<div style="text-align:center;color:var(--gray);padding:20px;font-size:13px;">没有找到包含「' + currentSearchTerm + '」的字卡</div>'; else { html = '<div style="font-size:12px;color:var(--gray);margin-bottom:8px;">找到 ' + matched.length + ' 条</div>'; matched.forEach(function(c) { html += window.renderSingleCardHtml(c); }); } container.innerHTML = html; return; } cardState.categories.forEach(function(cat) { var catCards = cardState.cards.filter(function(c) { return c.cat === cat.id; }); var isCollapsed = cat.collapsed ? 'hidden' : ''; var blockSvg = cat.blocked ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'; var delSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="event.stopPropagation();window.deleteCategory(\'' + cat.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; html += '<div class="category-group"><div class="category-header" onclick="window.toggleCategory(\'' + cat.id + '\')"><span class="category-title">' + cat.name + '（' + catCards.length + '）</span><div class="category-actions"><span onclick="event.stopPropagation();window.toggleBlockCategory(\'' + cat.id + '\')" style="cursor:pointer;color:var(--gray);">' + blockSvg + '</span>' + delSvg + '<span class="arrow" style="transform:rotate(' + (cat.collapsed ? '-90deg' : '0deg') + ');transition:transform 0.2s;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span></div></div><div class="category-body ' + isCollapsed + '">'; if (catCards.length === 0) html += '<div style="font-size:12px;color:var(--gray);padding:4px 0;">暂无字卡</div>'; else catCards.forEach(function(c) { html += window.renderSingleCardHtml(c); }); html += '</div></div>'; }); container.innerHTML = html; };
  window.renderSingleCardHtml = function(c) { var editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.editCard(\'' + c.id + '\')"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'; var delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.deleteCard(\'' + c.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; var blockSvg = c.blocked ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.toggleBlockCard(\'' + c.id + '\')"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.toggleBlockCard(\'' + c.id + '\')"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'; return '<div class="card-item ' + (c.blocked ? 'blocked' : '') + '"><div class="card-item-text">' + c.text + '</div><div class="card-item-actions"><span style="color:var(--gray);">' + blockSvg + '</span><span style="color:var(--gray);">' + editSvg + '</span><span class="delete-icon" style="color:var(--gray);">' + delSvg + '</span></div></div>'; };
  window.toggleCategory = function(catId) { var cat = cardState.categories.find(function(c) { return c.id === catId; }); if (cat) { cat.collapsed = !cat.collapsed; saveCardState(); window.renderCardManager(); } };
  window.addCategoryPrompt = function() { var name = prompt('输入分类名称：'); if (!name || name.trim() === '') return; cardState.categories.push({ id: 'cat_' + Date.now(), name: name.trim(), collapsed: false, blocked: false }); saveCardState(); window.renderCardManager(); };
  window.deleteCategory = function(catId) { if (!confirm('删除此分类及其所有字卡？')) return; cardState.cards = cardState.cards.filter(function(c) { return c.cat !== catId; }); cardState.categories = cardState.categories.filter(function(c) { return c.id !== catId; }); if (cardState.categories.length === 0) cardState.categories.push({ id: 'default', name: '默认', collapsed: false, blocked: false }); saveCardState(); window.renderCardManager(); };
  window.toggleBlockCategory = function(catId) { var cat = cardState.categories.find(function(c) { return c.id === catId; }); if (cat) { cat.blocked = !cat.blocked; saveCardState(); window.renderCardManager(); } };
  window.toggleBlockCard = function(cardId) { var c = cardState.cards.find(function(x) { return x.id === cardId; }); if (c) { c.blocked = !c.blocked; saveCardState(); window.renderCardManager(); } };
  window.editCard = function(cardId) { var c = cardState.cards.find(function(x) { return x.id === cardId; }); if (!c) return; var newText = prompt('编辑字卡内容：', c.text); if (newText !== null && newText.trim() !== '') { c.text = newText.trim(); saveCardState(); window.renderCardManager(); } };
  window.deleteCard = function(cardId) { cardState.cards = cardState.cards.filter(function(c) { return c.id !== cardId; }); saveCardState(); window.renderCardManager(); };
  window.onCardSearch = function(val) { currentSearchTerm = val.trim(); window.renderCardManager(); };
  window.dedupeCards = function() { var seen = {}, dupes = []; cardState.cards.forEach(function(c) { var key = c.text.trim(); if (!key) return; if (seen[key] !== undefined) dupes.push(c.id); else seen[key] = c.id; }); if (dupes.length === 0) { alert('没有发现重复的字卡'); return; } if (!confirm('发现 ' + dupes.length + ' 条重复字卡，是否删除？')) return; cardState.cards = cardState.cards.filter(function(c) { return dupes.indexOf(c.id) === -1; }); saveCardState(); window.renderCardManager(); };
  window.openAddCardModal = function() { var sel = document.getElementById('addCardCatSelect'); if(sel) sel.innerHTML = cardState.categories.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join(''); var inp = document.getElementById('addCardTextInput'); if(inp) inp.value = ''; document.getElementById('addCardModal').classList.add('show'); };
  window.closeAddCardModal = function() { document.getElementById('addCardModal').classList.remove('show'); };
  window.confirmAddCard = function() { var catEl = document.getElementById('addCardCatSelect'); if(!catEl) return; var catId = catEl.value; var rawEl = document.getElementById('addCardTextInput'); if(!rawEl) return; var raw = rawEl.value || ''; var lines = raw.split('\n').map(function(s) { return s.trim(); }).filter(function(s) { return s; }); if (lines.length === 0) { alert('请输入字卡内容'); return; } var existing = {}; cardState.cards.forEach(function(c) { existing[c.text.trim()] = true; }); var added = 0, skipped = 0; lines.forEach(function(line) { if (existing[line]) { skipped++; return; } cardState.cards.push({ id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: line, cat: catId, blocked: false }); existing[line] = true; added++; }); saveCardState(); window.closeAddCardModal(); window.renderCardManager(); alert('已添加 ' + added + ' 条，跳过 ' + skipped + ' 条重复'); };
  window.exportCards = function() { var groups = cardState.categories.map(function(cat) { var items = cardState.cards.filter(function(c) { return c.cat === cat.id; }).map(function(c) { return c.text; }); return { name: cat.name, items: items }; }); var data = { customReplyGroups: groups, exportAt: new Date().toISOString(), version: 1 }; var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = '小纸条_字卡_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function() { URL.revokeObjectURL(url); }, 1500); alert('已导出字卡'); };
  window.handleImportCards = function(e) { var file = e.target.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function(ev) { try { var importedData = JSON.parse(ev.target.result); var newCards = []; if (importedData.customReplyGroups && Array.isArray(importedData.customReplyGroups)) { importedData.customReplyGroups.forEach(function(group) { var catName = group.name || '导入分类'; var targetCat = cardState.categories.find(function(c) { return c.name === catName; }); var targetCatId = targetCat ? targetCat.id : ('cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)); if (!targetCat) cardState.categories.push({ id: targetCatId, name: catName, collapsed: false, blocked: false }); if (group.items && Array.isArray(group.items)) { group.items.forEach(function(text) { if (text && text.trim()) newCards.push({ text: text.trim(), cat: targetCatId }); }); } }); } else if (importedData.customReplies && Array.isArray(importedData.customReplies)) { var defaultCatId = cardState.categories[0].id; importedData.customReplies.forEach(function(text) { if (text && text.trim()) newCards.push({ text: text.trim(), cat: defaultCatId }); }); } if (newCards.length === 0) { alert('没有找到可导入的字卡数据'); return; } var existing = {}; cardState.cards.forEach(function(c) { existing[c.text.trim()] = true; }); var added = 0; newCards.forEach(function(card) { if (!existing[card.text]) { cardState.cards.push({ id: 'imported_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: card.text, cat: card.cat, blocked: false }); existing[card.text] = true; added++; } }); saveCardState(); window.renderCardManager(); alert('成功导入 ' + added + ' 张字卡！'); } catch (err) { alert('文件解析失败'); } }; reader.readAsText(file); e.target.value = ''; };

  // ========== 状态逻辑 ==========
  var currentStatusSearchTerm = '';
  window.renderStatusManager = function() { var container = document.getElementById('statusListContainer'); if (!container) return; var html = ''; if (currentStatusSearchTerm) { var matched = statusState.statuses.filter(function(c) { return c.text.indexOf(currentStatusSearchTerm) > -1; }); if (matched.length === 0) html = '<div style="text-align:center;color:var(--gray);padding:20px;font-size:13px;">没有找到包含「' + currentStatusSearchTerm + '」的状态</div>'; else { html = '<div style="font-size:12px;color:var(--gray);margin-bottom:8px;">找到 ' + matched.length + ' 条</div>'; matched.forEach(function(c) { html += window.renderSingleStatusHtml(c); }); } container.innerHTML = html; return; } statusState.categories.forEach(function(cat) { var catStatuses = statusState.statuses.filter(function(c) { return c.cat === cat.id; }); var isCollapsed = cat.collapsed ? 'hidden' : ''; var blockSvg = cat.blocked ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'; var delSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="event.stopPropagation();window.deleteStatusCategory(\'' + cat.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; html += '<div class="category-group"><div class="category-header" onclick="window.toggleStatusCategory(\'' + cat.id + '\')"><span class="category-title">' + cat.name + '（' + catStatuses.length + '）</span><div class="category-actions"><span onclick="event.stopPropagation();window.toggleBlockStatusCategory(\'' + cat.id + '\')" style="cursor:pointer;color:var(--gray);">' + blockSvg + '</span>' + delSvg + '<span class="arrow" style="transform:rotate(' + (cat.collapsed ? '-90deg' : '0deg') + ');transition:transform 0.2s;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span></div></div><div class="category-body ' + isCollapsed + '">'; if (catStatuses.length === 0) html += '<div style="font-size:12px;color:var(--gray);padding:4px 0;">暂无状态</div>'; else catStatuses.forEach(function(c) { html += window.renderSingleStatusHtml(c); }); html += '</div></div>'; }); container.innerHTML = html; };
  window.renderSingleStatusHtml = function(c) { var editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.editStatus(\'' + c.id + '\')"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'; var delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.deleteStatus(\'' + c.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; var blockSvg = c.blocked ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.toggleBlockStatus(\'' + c.id + '\')"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.toggleBlockStatus(\'' + c.id + '\')"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'; return '<div class="card-item ' + (c.blocked ? 'blocked' : '') + '"><div class="card-item-text">' + c.text + '</div><div class="card-item-actions"><span style="color:var(--gray);">' + blockSvg + '</span><span style="color:var(--gray);">' + editSvg + '</span><span class="delete-icon" style="color:var(--gray);">' + delSvg + '</span></div></div>'; };
  window.toggleStatusCategory = function(catId) { var cat = statusState.categories.find(function(c) { return c.id === catId; }); if (cat) { cat.collapsed = !cat.collapsed; saveStatusState(); window.renderStatusManager(); } };
  window.addStatusCategoryPrompt = function() { var name = prompt('输入分类名称：'); if (!name || name.trim() === '') return; statusState.categories.push({ id: 'cat_' + Date.now(), name: name.trim(), collapsed: false, blocked: false }); saveStatusState(); window.renderStatusManager(); };
  window.deleteStatusCategory = function(catId) { if (!confirm('删除此分类及其所有状态？')) return; statusState.statuses = statusState.statuses.filter(function(c) { return c.cat !== catId; }); statusState.categories = statusState.categories.filter(function(c) { return c.id !== catId; }); if (statusState.categories.length === 0) statusState.categories.push({ id: 'default', name: '默认', collapsed: false, blocked: false }); saveStatusState(); window.renderStatusManager(); };
  window.toggleBlockStatusCategory = function(catId) { var cat = statusState.categories.find(function(c) { return c.id === catId; }); if (cat) { cat.blocked = !cat.blocked; saveStatusState(); window.renderStatusManager(); } };
  window.toggleBlockStatus = function(statusId) { var c = statusState.statuses.find(function(x) { return x.id === statusId; }); if (c) { c.blocked = !c.blocked; saveStatusState(); window.renderStatusManager(); } };
  window.editStatus = function(statusId) { var c = statusState.statuses.find(function(x) { return x.id === statusId; }); if (!c) return; var newText = prompt('编辑状态内容：', c.text); if (newText !== null && newText.trim() !== '') { c.text = newText.trim(); saveStatusState(); window.renderStatusManager(); } };
  window.deleteStatus = function(statusId) { statusState.statuses = statusState.statuses.filter(function(c) { return c.id !== statusId; }); saveStatusState(); window.renderStatusManager(); };
  window.onStatusSearch = function(val) { currentStatusSearchTerm = val.trim(); window.renderStatusManager(); };
  window.dedupeStatuses = function() { var seen = {}, dupes = []; statusState.statuses.forEach(function(c) { var key = c.text.trim(); if (!key) return; if (seen[key] !== undefined) dupes.push(c.id); else seen[key] = c.id; }); if (dupes.length === 0) { alert('没有发现重复的状态'); return; } if (!confirm('发现 ' + dupes.length + ' 条重复状态，是否删除？')) return; statusState.statuses = statusState.statuses.filter(function(c) { return dupes.indexOf(c.id) === -1; }); saveStatusState(); window.renderStatusManager(); };
  window.openAddStatusModal = function() { var sel = document.getElementById('addStatusCatSelect'); if(sel) sel.innerHTML = statusState.categories.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join(''); var inp = document.getElementById('addStatusTextInput'); if(inp) inp.value = ''; document.getElementById('addStatusModal').classList.add('show'); };
  window.closeAddStatusModal = function() { document.getElementById('addStatusModal').classList.remove('show'); };
  window.confirmAddStatus = function() { var catEl = document.getElementById('addStatusCatSelect'); if(!catEl) return; var catId = catEl.value; var rawEl = document.getElementById('addStatusTextInput'); if(!rawEl) return; var raw = rawEl.value || ''; var lines = raw.split('\n').map(function(s) { return s.trim(); }).filter(function(s) { return s; }); if (lines.length === 0) { alert('请输入状态内容'); return; } var existing = {}; statusState.statuses.forEach(function(c) { existing[c.text.trim()] = true; }); var added = 0, skipped = 0; lines.forEach(function(line) { if (existing[line]) { skipped++; return; } statusState.statuses.push({ id: 'status_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: line, cat: catId, blocked: false }); existing[line] = true; added++; }); saveStatusState(); window.closeAddStatusModal(); window.renderStatusManager(); assignInitialStatuses(); alert('已添加 ' + added + ' 条，跳过 ' + skipped + ' 条重复'); };
  window.exportStatuses = function() { var groups = statusState.categories.map(function(cat) { var items = statusState.statuses.filter(function(c) { return c.cat === cat.id; }).map(function(c) { return c.text; }); return { name: cat.name, items: items }; }); var data = { customReplyGroups: groups, exportAt: new Date().toISOString(), version: 1 }; var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = '小纸条_状态_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function() { URL.revokeObjectURL(url); }, 1500); alert('已导出状态'); };
  window.handleImportStatuses = function(e) { var file = e.target.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function(ev) { try { var importedData = JSON.parse(ev.target.result); var newStatuses = []; if (importedData.customReplyGroups && Array.isArray(importedData.customReplyGroups)) { importedData.customReplyGroups.forEach(function(group) { var catName = group.name || '导入分类'; var targetCat = statusState.categories.find(function(c) { return c.name === catName; }); var targetCatId = targetCat ? targetCat.id : ('cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)); if (!targetCat) statusState.categories.push({ id: targetCatId, name: catName, collapsed: false, blocked: false }); if (group.items && Array.isArray(group.items)) { group.items.forEach(function(text) { if (text && text.trim()) newStatuses.push({ text: text.trim(), cat: targetCatId }); }); } }); } else if (importedData.customReplies && Array.isArray(importedData.customReplies)) { var defaultCatId = statusState.categories[0].id; importedData.customReplies.forEach(function(text) { if (text && text.trim()) newStatuses.push({ text: text.trim(), cat: defaultCatId }); }); } else if (Array.isArray(importedData)) { importedData.forEach(function(text) { if (typeof text === 'string' && text.trim()) newStatuses.push({ text: text.trim(), cat: 'default' }); }); } else if (importedData.statuses && Array.isArray(importedData.statuses)) { importedData.statuses.forEach(function(item) { if (item && item.text && item.text.trim()) newStatuses.push({ text: item.text.trim(), cat: item.cat || 'default' }); }); } if (newStatuses.length === 0) { alert('没有找到可导入的状态数据'); return; } var existing = {}; statusState.statuses.forEach(function(c) { existing[c.text.trim()] = true; }); var added = 0; newStatuses.forEach(function(item) { if (!existing[item.text]) { statusState.statuses.push({ id: 'imported_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: item.text, cat: item.cat, blocked: false }); existing[item.text] = true; added++; } }); saveStatusState(); window.renderStatusManager(); assignInitialStatuses(); alert('成功导入 ' + added + ' 条状态！'); } catch (err) { alert('文件解析失败'); } }; reader.readAsText(file); e.target.value = ''; };
  function assignInitialStatuses() { var usableStatuses = statusState.statuses.filter(function(s) { if (s.blocked) return false; var cat = statusState.categories.find(function(c) { return c.id === s.cat; }); if (cat && cat.blocked) return false; return true; }); if (usableStatuses.length === 0) return; var changed = false; dreamState.dreams.forEach(function(d) { if (!d.status || d.status === '无状态') { var pick = usableStatuses[Math.floor(Math.random() * usableStatuses.length)]; d.status = pick.text; changed = true; } }); if (changed) { saveDreamState(); window.renderDreamSelector(); if (pageDreamRole && pageDreamRole.classList.contains('active')) window.renderDreamList(); } }

  // ========== 梦角逻辑 ==========
  var editingDreamId = null;
  window.renderDreamList = function() { var container = document.getElementById('dreamListContainer'); if (!container) return; if (dreamState.dreams.length === 0) { container.innerHTML = '<div style="text-align:center;color:var(--gray);padding:40px 20px;font-size:14px;">还没有梦角<br>点击右上角“+ 添加”创建一个吧</div>'; return; } var html = ''; dreamState.dreams.forEach(function(d) { var avatarStyle = d.avatar ? 'background-image:url(' + d.avatar + ');background-size:cover;background-position:center;' : ''; var avatarText = d.avatar ? '' : (d.name ? d.name.charAt(0) : '梦'); html += '<div class="dream-list-item" onclick="window.openDreamEditModal(\'' + d.id + '\')"><div class="avatar-circle" style="' + avatarStyle + '">' + avatarText + '</div><div class="dream-list-info"><div class="dream-list-name">' + (d.name || '未命名') + '</div><div class="dream-list-status">' + (d.status || '无状态') + '</div></div><div class="dream-list-actions"><span onclick="event.stopPropagation();window.deleteDream(\'' + d.id + '\')" style="cursor:pointer;color:var(--gray);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span></div></div>'; }); container.innerHTML = html; };
  window.openDreamEditModal = function(id) { editingDreamId = id || null; var modal = document.getElementById('dreamEditModal'); var title = document.getElementById('dreamEditTitle'); var nameInput = document.getElementById('dreamEditName'); var avatarPreview = document.getElementById('dreamEditAvatarPreview'); if (editingDreamId) { var d = dreamState.dreams.find(function(x) { return x.id === editingDreamId; }); if (!d) return; title.textContent = '编辑梦角'; nameInput.value = d.name || ''; if (d.avatar) { avatarPreview.style.backgroundImage = 'url(' + d.avatar + ')'; avatarPreview.textContent = ''; } else { avatarPreview.style.backgroundImage = ''; avatarPreview.textContent = '+'; } } else { title.textContent = '添加梦角'; nameInput.value = ''; avatarPreview.style.backgroundImage = ''; avatarPreview.textContent = '+'; } if(modal) modal.classList.add('show'); };
  window.closeDreamEditModal = function() { var m = document.getElementById('dreamEditModal'); if(m) m.classList.remove('show'); editingDreamId = null; };
  window.handleDreamAvatarUpload = function(e) { var file = e.target.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function(ev) { var img = new Image(); img.onload = function() { var canvas = document.createElement('canvas'); var MAX_SIZE = 200; var w = img.width, h = img.height; if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } } else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } } canvas.width = w; canvas.height = h; var ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h); var compressed = canvas.toDataURL('image/jpeg', 0.8); var preview = document.getElementById('dreamEditAvatarPreview'); if(preview){ preview.style.backgroundImage = 'url(' + compressed + ')'; preview.textContent = ''; } }; img.src = ev.target.result; }; reader.readAsDataURL(file); e.target.value = ''; };
  window.saveDreamEdit = function() { var nameEl = document.getElementById('dreamEditName'); if(!nameEl) return; var name = nameEl.value.trim(); var avatarPreview = document.getElementById('dreamEditAvatarPreview'); var avatar = avatarPreview ? avatarPreview.style.backgroundImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '') : ''; if (avatar === 'none' || avatar === '') avatar = ''; if (!name) { alert('请输入梦角名字'); return; } if (editingDreamId) { var d = dreamState.dreams.find(function(x) { return x.id === editingDreamId; }); if (d) { d.name = name; d.avatar = avatar; } } else { var newId = 'dream_' + Date.now(); dreamState.dreams.push({ id: newId, name: name, status: '', avatar: avatar }); if (!dreamState.currentId) dreamState.currentId = newId; } saveDreamState(); window.closeDreamEditModal(); window.renderDreamList(); window.renderDreamSelector(); assignInitialStatuses(); };
  window.deleteDream = function(id) { if (!confirm('确定删除这个梦角吗？')) return; dreamState.dreams = dreamState.dreams.filter(function(d) { return d.id !== id; }); if (dreamState.currentId === id) { dreamState.currentId = dreamState.dreams.length > 0 ? dreamState.dreams[0].id : null; } saveDreamState(); window.renderDreamList(); window.renderDreamSelector(); };
  function checkAutoStatusChange() { var now = Date.now(); var TWO_HOURS = 2 * 60 * 60 * 1000; if (!dreamState.lastCheckTime) dreamState.lastCheckTime = now; if (now - dreamState.lastCheckTime >= TWO_HOURS) { var changed = false; var usableStatuses = statusState.statuses.filter(function(s) { if (s.blocked) return false; var cat = statusState.categories.find(function(c) { return c.id === s.cat; }); if (cat && cat.blocked) return false; return true; }); if (usableStatuses.length > 0) { dreamState.dreams.forEach(function(d) { if (Math.random() < 0.5) { var pick = usableStatuses[Math.floor(Math.random() * usableStatuses.length)]; d.status = pick.text; changed = true; } }); } dreamState.lastCheckTime = now; saveDreamState(); if (changed) { window.renderDreamSelector(); window.renderDreamList(); } } }
  checkAutoStatusChange(); setInterval(checkAutoStatusChange, 10 * 60 * 1000);
  window.renderDreamSelector = function() { var avatarEl = document.getElementById('dreamAvatar'); var nameEl = document.getElementById('dreamName'); var statusEl = document.getElementById('dreamStatus'); if(!avatarEl || !nameEl || !statusEl) return; var current = dreamState.dreams.find(function(d) { return d.id === dreamState.currentId; }); if (current) { if (current.avatar) { avatarEl.style.backgroundImage = 'url(' + current.avatar + ')'; avatarEl.textContent = ''; } else { avatarEl.style.backgroundImage = ''; avatarEl.textContent = current.name ? current.name.charAt(0) : '梦'; } nameEl.textContent = current.name || '未命名'; statusEl.textContent = current.status || '无状态'; } else { avatarEl.style.backgroundImage = ''; avatarEl.textContent = '头'; nameEl.textContent = '未设置'; statusEl.textContent = '点击添加梦角'; } var ddList = document.getElementById('dreamDropdownList'); if (!ddList) return; if (dreamState.dreams.length === 0) { ddList.innerHTML = '<div style="padding:14px;text-align:center;color:var(--gray);font-size:13px;">还没有梦角，点击下方小人添加</div>'; } else { ddList.innerHTML = dreamState.dreams.map(function(d) { var isActive = d.id === dreamState.currentId; var avatarStyle = d.avatar ? 'background-image:url(' + d.avatar + ');background-size:cover;background-position:center;' : ''; var avatarText = d.avatar ? '' : (d.name ? d.name.charAt(0) : '梦'); return '<div class="dream-dropdown-item ' + (isActive ? 'active' : '') + '" onclick="window.switchDream(\'' + d.id + '\')"><div class="avatar-circle" style="' + avatarStyle + '">' + avatarText + '</div><div class="dd-info"><div class="dd-name">' + d.name + '</div><div class="dd-status">' + (d.status || '无状态') + '</div></div>' + (isActive ? '<div class="dd-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div>' : '') + '</div>'; }).join(''); } };
  window.switchDream = function(id) { dreamState.currentId = id; saveDreamState(); window.renderDreamSelector(); renderChatRound(); var d = dreamState.dreams.find(function(x) { return x.id === id; }); var chatAvatar = document.getElementById('chatAvatar'); var chatDreamName = document.getElementById('chatDreamName'); var chatDreamStatus = document.getElementById('chatDreamStatus'); if (d && chatAvatar && chatDreamName && chatDreamStatus) { chatAvatar.style.backgroundImage = d.avatar ? 'url(' + d.avatar + ')' : ''; chatAvatar.textContent = d.avatar ? '' : (d.name ? d.name.charAt(0) : '梦'); chatDreamName.textContent = d.name; chatDreamStatus.textContent = d.status || '在线'; } var dd = document.getElementById('dreamDropdown'); if(dd) dd.classList.remove('show'); };
  var dreamSelector = document.getElementById('dreamSelector'); var dreamDropdown = document.getElementById('dreamDropdown');
  if (dreamSelector && dreamDropdown) { dreamSelector.addEventListener('click', function(e) { e.stopPropagation(); dreamDropdown.classList.toggle('show'); }); document.addEventListener('click', function(e) { if (!dreamSelector.contains(e.target) && !dreamDropdown.contains(e.target)) dreamDropdown.classList.remove('show'); }); }
  function renderChatRound() { var promptDisplay = document.getElementById('userPromptDisplay'); var grid = document.getElementById('paperGrid'); if (!promptDisplay || !grid) return; var loadingEl = document.getElementById('paperLoading'); if (loadingEl) loadingEl.style.display = 'none'; var currentDreamId = dreamState.currentId; if (!currentDreamId) { promptDisplay.textContent = '请先选择或添加一个梦角'; grid.innerHTML = ''; return; } var roundData = chatRoundState[currentDreamId]; if (!roundData) { promptDisplay.textContent = '输入一句话，开始抽取纸条吧！'; grid.innerHTML = ''; return; } if (roundData.userInput) { promptDisplay.innerHTML = '你说：<span>' + roundData.userInput + '</span>'; } else { promptDisplay.textContent = '输入一句话，开始抽取纸条吧！'; } if (!roundData.cards || roundData.cards.length === 0) { grid.innerHTML = ''; return; } var html = ''; var paperBgStyle = beautifySettings.paperBg ? 'background: url(' + beautifySettings.paperBg + ') center/cover no-repeat; color: transparent;' : '';roundData.cards.forEach(function(text, index) { var isFlipped = (index === roundData.flippedIndex); var isDisabled = (roundData.flippedIndex !== -1) ? ' disabled' : ''; html += '<div class="paper-card ' + (isFlipped ? 'flipped' : '') + isDisabled + '" data-index="' + index + '" onclick="window.handleFlipCard(' + index + ')"><div class="paper-inner"><div class="paper-back" style="' + paperBgStyle + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 22a10 10 0 0 1-10-10"/></svg></div><div class="paper-front">' + text + '</div></div></div>'; }); grid.innerHTML = html; }
  window.handleFlipCard = function(index) { var currentDreamId = dreamState.currentId; if (!currentDreamId) return; var roundData = chatRoundState[currentDreamId]; if (!roundData) return; if (roundData.flippedIndex !== -1) return; if (!roundData.cards || !roundData.cards[index]) return; roundData.flippedIndex = index; saveChatRound(); renderChatRound(); updateHistoryFlipStatus(currentDreamId, roundData); };
   window.sendChatMsgFromMain = function(fromInputId) {
    var currentDreamId = dreamState.currentId; 
    if (!currentDreamId) return alert('请先添加并选择一个梦角！'); 
    var inputId = fromInputId || 'chatInput'; 
    var input = document.getElementById(inputId); 
    if (!input) return; 
    var text = input.value.trim(); 
    if (!text) return alert('请先输入一句话哦'); 
    var usableCards = cardState.cards.filter(function(c) { 
      if (c.blocked) return false; 
      var cat = cardState.categories.find(function(x) { return x.id === c.cat; }); 
      if (cat && cat.blocked) return false; 
      return true; 
    }); 
    if (usableCards.length === 0) { alert('字卡库是空的！请先去“字卡”页面添加至少 6 张字卡。'); return; } 
    
    document.getElementById('userPromptDisplay').innerHTML = ''; 
    document.getElementById('paperGrid').innerHTML = ''; 
    var loadingEl = document.getElementById('paperLoading'); 
    if (loadingEl) loadingEl.style.display = 'flex'; 
    input.value = ''; 
    
    var minSec = appSettings.minDelay || 1.2;
    var maxSec = appSettings.maxDelay || 1.2;
    var delayMs = (minSec + Math.random() * (maxSec - minSec)) * 1000;
    
    setTimeout(function() { 
      var pickedTexts = []; 
      var pool = usableCards.slice(); 
      for (var i = pool.length - 1; i > 0; i--) { 
        var j = Math.floor(Math.random() * (i + 1)); 
        var temp = pool[i]; pool[i] = pool[j]; pool[j] = temp; 
      } 
      for (var k = 0; k < 6; k++) { pickedTexts.push(pool.length > 0 ? pool[k % pool.length].text : '…'); } 
      chatRoundState[currentDreamId] = { userInput: text, cards: pickedTexts, flippedIndex: -1 }; 
      saveChatRound(); 
      if (loadingEl) loadingEl.style.display = 'none'; 
      renderChatRound(); 
      saveHistoryRecord(currentDreamId, text, pickedTexts, usableCards); 
    }, delayMs); 
  };

// ========== 聊天副页面核心 ==========
window.openChatPlus = function() {
  var mask = document.getElementById('chatPlusMask');
  if (mask) mask.classList.add('show');
};
window.closeChatPlus = function() {
  var mask = document.getElementById('chatPlusMask');
  if (mask) mask.classList.remove('show');
};
window.openChatSettings = function() {
  window.navigateTo('pageChatSettings');
  document.getElementById('chatMinDelay').value = chatSettings.minDelay;
  document.getElementById('chatMaxDelay').value = chatSettings.maxDelay;
  document.getElementById('chatIgnoreRead').checked = !!chatSettings.ignoreRead;
  document.getElementById('chatQuoteEnabled').checked = !!chatSettings.quoteEnabled;
  document.getElementById('chatCardMin').value = chatSettings.cardMin;
  document.getElementById('chatCardMax').value = chatSettings.cardMax;
  document.getElementById('chatActiveMinutes').value = chatSettings.activeMinutes;
  document.getElementById('chatPushEnabled').checked = !!chatSettings.pushEnabled;
};
window.closeChatSettings = function() {
  window.navigateTo('screenChat');
};
window.chatPlusAction = function(type) {
  window.closeChatPlus();
  if (type === 'secret') window.navigateTo('pageSecretCode');
  if (type === 'poke') window.chatPoke();
  if (type === 'choice') window.openChoiceModal();
  if (type === 'call') window.chatCall();
  if (type === 'modeToggle') {
    var btn = document.getElementById('modeToggle');
    if (btn) btn.click();
  }
};

window.renderChatPage = function() {
  var current = dreamState.dreams.find(function(d) { return d.id === dreamState.currentId; });
  var chatAvatar = document.getElementById('chatAvatar');
  var chatName = document.getElementById('chatDreamName');
  var chatStatus = document.getElementById('chatDreamStatus');
  if (current) {
    if (chatAvatar) {
      chatAvatar.style.backgroundImage = current.avatar ? 'url(' + current.avatar + ')' : '';
      chatAvatar.textContent = current.avatar ? '' : (current.name ? current.name.charAt(0) : '梦');
    }
    if (chatName) chatName.textContent = current.name || '未命名';
    if (chatStatus) chatStatus.textContent = current.status || '在线';
  } else {
    if (chatName) chatName.textContent = '未设置';
    if (chatStatus) chatStatus.textContent = '点击添加梦角';
  }
  window.renderChatMessages();
  window.renderChatDreamDropdown();
};

window.showTyping = function() {
  var el = document.getElementById('chatTyping');
  if (el) el.classList.add('show');
};
window.hideTyping = function() {
  var el = document.getElementById('chatTyping');
  if (el) el.classList.remove('show');
};

window.addSystemMessage = function(dreamId, text) {
  if (!dreamId) return;
  if (!chatState.messages[dreamId]) chatState.messages[dreamId] = [];
  chatState.messages[dreamId].push({
    id: 'sys_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    role: 'system',
    text: text,
    time: Date.now()
  });
  saveChatMessages();
  var sc = document.getElementById('screenChat');
  if (sc && sc.classList.contains('active')) window.renderChatMessages();
};

window.chatPoke = function() {
  var dreamId = dreamState.currentId;
  if (!dreamId) return;
  var dream = dreamState.dreams.find(function(d) { return d.id === dreamId; });
  if (!dream) return;
  if (pokeState.pokes.length === 0) {
    showToast('还没有拍一拍文案');
    return;
  }
  var pick = pokeState.pokes[Math.floor(Math.random() * pokeState.pokes.length)].text;
  window.addSystemMessage(dreamId, dream.name + ' ' + pick);
  var dateStr = getDateStr(Date.now());
  if (!historyState[dreamId]) historyState[dreamId] = {};
  if (!historyState[dreamId][dateStr]) historyState[dreamId][dateStr] = [];
  historyState[dreamId][dateStr].push({
    id: 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    time: Date.now(),
    userInput: '',
    drawnCards: [],
    flippedIndex: -1,
    dreamSupplement: '',
    supplementDueAt: null,
    isPoke: true,
    pokeText: pick
  });
  saveHistoryState();
};

window.chatCall = function() {
  var dreamId = dreamState.currentId;
  if (!dreamId) return alert('请先选择一个梦角！');
  var dream = dreamState.dreams.find(function(d) { return d.id === dreamId; });
  window.addSystemMessage(dreamId, '📞 正在呼叫 ' + (dream ? dream.name : '') + '…');
  window.startCall();
};

window.renderChatMessages = function() {
  var container = document.getElementById('chatMessages');
  if (!container) return;
  var dreamId = dreamState.currentId;
  if (!dreamId) {
    container.innerHTML = '<div style="text-align:center;color:var(--gray);padding:40px;">请先选择梦角</div>';
    return;
  }
  var list = chatState.messages[dreamId] || [];
  if (list.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--gray);padding:40px;">还没有聊天记录，发一条消息吧</div>';
    return;
  }
  var html = '';
  list.forEach(function(msg) {
    if (msg.role === 'system') {
      html += '<div class="chat-system-msg">' + escapeHtml(msg.text) + '</div>';
      return;
    }
    // 撤回状态：显示一行灰色小字
    if (msg.recalled) {
      html += '<div class="chat-recall-tip">' + escapeHtml(msg.text) + '</div>';
      return;
    }
    if (msg.type === 'choice') {
  html += '<div class="chat-msg-row dream"><div class="chat-choice-card">';
  html += '<div class="chat-choice-question">' + escapeHtml(msg.question) + '</div>';
  msg.options.forEach(function(opt) {
    var picked = (msg.selected === opt);
    html += '<div class="chat-choice-option' + (picked ? ' picked' : '') + '">' + 
            (picked ? '✓ ' : '') + escapeHtml(opt) + '</div>';
  });
  html += '<div class="chat-choice-tip">' + 
          (msg.selected ? '已选择：' + escapeHtml(msg.selected) : '等待选择中…') + 
          '</div>';
  html += '</div></div>';
  return;
}
    var timeStr = window.formatMessageTime(msg.time);
    if (msg.role === 'user') {
      var statusText = (msg.status === 'read') ? '已读' : '未读';
      html += '<div class="chat-msg-row user"><div class="chat-msg-wrap">';
      html += '<div class="chat-bubble" data-msg-id="' + msg.id + '" data-msg-role="user">';
      if (msg.quote) html += '<div class="chat-quote">引用：' + escapeHtml(msg.quote) + '</div>';
      html += escapeHtml(msg.text) + '</div>';
      html += '<div class="chat-msg-meta">' + timeStr + ' · ' + statusText + '</div>';
      html += '</div></div>';
    } else {
      html += '<div class="chat-msg-row dream"><div class="chat-msg-wrap">';
      html += '<div class="chat-bubble" data-msg-id="' + msg.id + '" data-msg-role="dream">';
      if (msg.quote) html += '<div class="chat-quote">引用：' + escapeHtml(msg.quote) + '</div>';
      html += escapeHtml(msg.text).replace(/\n/g, '<br>') + '</div>';
      html += '<div class="chat-msg-meta">' + timeStr + '</div>';
      html += '</div></div>';
    }
  });
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
  window.bindMessageLongPress();
};

window.formatMessageTime = function(ts) {
  var d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

window.renderChatDreamDropdown = function() {
  var listEl = document.getElementById('chatDreamDropdownList');
  if (!listEl) return;
  if (dreamState.dreams.length === 0) {
    listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--gray);font-size:13px;">还没有梦角</div>';
    return;
  }
  listEl.innerHTML = dreamState.dreams.map(function(d) {
    var isActive = d.id === dreamState.currentId;
    var avatarStyle = d.avatar ? 'background-image:url(' + d.avatar + ');background-size:cover;background-position:center;' : '';
    var avatarText = d.avatar ? '' : (d.name ? d.name.charAt(0) : '梦');
    return '<div class="dream-dropdown-item ' + (isActive ? 'active' : '') + '" onclick="window.chatSwitchDream(\'' + d.id + '\')">' +
      '<div class="avatar-circle" style="' + avatarStyle + '">' + avatarText + '</div>' +
      '<div class="dd-info"><div class="dd-name">' + d.name + '</div><div class="dd-status">' + (d.status || '无状态') + '</div></div>' +
      (isActive ? '<div class="dd-check">✓</div>' : '') +
      '</div>';
  }).join('');
};

window.chatSwitchDream = function(id) {
  dreamState.currentId = id;
  saveDreamState();
  window.renderChatPage();
  window.renderDreamSelector();
  var dd = document.getElementById('chatDreamDropdown');
  if (dd) dd.classList.remove('show');
};

// 点击聊天顶部梦角选择器
safeBind('chatDreamSelector', 'click', function(e) {
  e.stopPropagation();
  var dd = document.getElementById('chatDreamDropdown');
  if (dd) dd.classList.toggle('show');
  window.renderChatDreamDropdown();
});
document.addEventListener('click', function(e) {
  var wrap = document.querySelector('.chat-dream-wrap');
  var dd = document.getElementById('chatDreamDropdown');
  if (wrap && dd && !wrap.contains(e.target)) dd.classList.remove('show');
});

window.chatSend = function() {
  var input = document.getElementById('chatInput2');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  var dreamId = dreamState.currentId;
  if (!dreamId) return alert('请先选择一个梦角！');

  if (!chatState.messages[dreamId]) chatState.messages[dreamId] = [];
  var now = Date.now();
  var quoteText = window._pendingQuote || null;
  chatState.messages[dreamId].push({
    id: 'msg_' + now + '_' + Math.random().toString(36).slice(2, 6),
    role: 'user',
    text: text,
    quote: quoteText,
    time: now,
    status: 'unread'
  });
  window._pendingQuote = null;
  input.placeholder = '输入消息...';
  chatState.lastUserTime[dreamId] = now;
  saveChatMessages();
  input.value = '';
  window.renderChatMessages();

  // 已读不回
  if (chatSettings.ignoreRead && Math.random() < 0.25) {
    var readDelay = (parseFloat(chatSettings.minDelay) || 1) * 1000;
    window.showTyping();
    setTimeout(function() {
      if (chatState.messages[dreamId]) {
        chatState.messages[dreamId].forEach(function(m) {
          if (m.role === 'user' && m.status === 'unread') m.status = 'read';
        });
        saveChatMessages();
        var sc = document.getElementById('screenChat');
        if (sc && sc.classList.contains('active')) window.renderChatMessages();
      }
      window.hideTyping();
    }, readDelay);
    return;
  }

  var min = parseFloat(chatSettings.minDelay) || 1;
  var max = parseFloat(chatSettings.maxDelay) || 3;
  if (max < min) max = min;
  var delay = (min + Math.random() * (max - min)) * 1000;

  window.showTyping();
  setTimeout(function() {
    window.dreamReply(dreamId, text);
  }, delay);
};

window.dreamReply = function(dreamId, userText) {
  window.hideTyping();

  var usableCards = cardState.cards.filter(function(c) {
    if (c.blocked) return false;
    var cat = cardState.categories.find(function(x) { return x.id === c.cat; });
    if (cat && cat.blocked) return false;
    return true;
  });
  if (usableCards.length === 0) return;

  if (chatState.messages[dreamId]) {
    chatState.messages[dreamId].forEach(function(m) {
      if (m.role === 'user' && m.status === 'unread') m.status = 'read';
    });
  }

  var minC = parseInt(chatSettings.cardMin) || 1;
  var maxC = parseInt(chatSettings.cardMax) || 3;
  if (maxC < minC) maxC = minC;
  var count = minC + Math.floor(Math.random() * (maxC - minC + 1));
  var pool = usableCards.slice().sort(function() { return Math.random() - 0.5; });
  var picked = pool.slice(0, Math.min(count, pool.length)).map(function(c) { return c.text; });
  var replyText = picked.join('，');

  var quote = null;
  if (chatSettings.quoteEnabled && Math.random() < 0.2 && userText) {
    quote = userText;
  }

  if (!chatState.messages[dreamId]) chatState.messages[dreamId] = [];
  var newMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  chatState.messages[dreamId].push({
    id: newMsgId,
    role: 'dream',
    text: replyText,
    quote: quote,
    time: Date.now()
  });
  saveChatMessages();
  window.renderChatMessages();

  // 20% 概率主动撤回自己的消息
  if (Math.random() < 0.2) {
    var recallDelay = 3000 + Math.random() * 5000;
    setTimeout(function() {
      var list = chatState.messages[dreamId];
      if (!list) return;
      var msg = list.find(function(m) { return m.id === newMsgId; });
      if (!msg || msg.recalled) return;
      var dream = dreamState.dreams.find(function(d) { return d.id === dreamId; });
      msg.recalled = true;
      msg.text = '「' + (dream ? dream.name : '梦角') + ' 撤回了一条消息」';
      msg.quote = null;
      saveChatMessages();
      var sc = document.getElementById('screenChat');
      if (sc && sc.classList.contains('active')) window.renderChatMessages();
    }, recallDelay);
  }

 var d = dreamState.dreams.find(function(x) { return x.id === dreamId; });
sendNotification(d ? d.name : '梦角', replyText);
};

// 聊天背景
window.handleChatBgUpload = function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var MAX = 800;
      var w = img.width, h = img.height;
      if (w > MAX) { h *= MAX / w; w = MAX; }
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      chatSettings.bg = canvas.toDataURL('image/jpeg', 0.7);
      saveChatSettings();
      window.applyChatBg();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
};
window.resetChatBg = function() {
  chatSettings.bg = null;
  saveChatSettings();
  window.applyChatBg();
};
window.applyChatBg = function() {
  var chatScreen = document.getElementById('screenChat');
  var msgArea = document.getElementById('chatMessages');
  if (chatScreen && chatSettings.bg) {
    chatScreen.style.background = 'url(' + chatSettings.bg + ') center/cover no-repeat';
  } else if (chatScreen) {
    chatScreen.style.background = '';
  }
  if (msgArea) msgArea.style.background = '';
};

// 自定义气泡CSS
window.handleBubbleCssUpload = function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    chatSettings.bubbleCss = ev.target.result || '';
    saveChatSettings();
    window.applyBubbleCss();
  };
  reader.readAsText(file);
  e.target.value = '';
};

window.saveBubbleCss = function() {
  var ta = document.getElementById('bubbleCssTextarea');
  if (!ta) return;
  chatSettings.bubbleCss = ta.value || '';
  saveChatSettingsToDB();
  window.applyBubbleCss();
  showToast('气泡CSS已应用');
};

window.resetBubbleCss = function() {
  chatSettings.bubbleCss = '';
  saveChatSettings();
  window.applyBubbleCss();
};

window.applyBubbleCss = function() {
  var old = document.getElementById('customBubbleStyle');
  if (old) old.remove();
  if (!chatSettings.bubbleCss) return;

  var css = chatSettings.bubbleCss;

  // ===== 类名自动映射：把常见类名替换成本项目的真实类名 =====
  var map = [
    // message-sent / bubble-user → 用户气泡
    ['.message.message-sent', '.chat-msg-row.user .chat-bubble'],
    ['.message.message-received', '.chat-msg-row.dream .chat-bubble'],
    ['.message-sent', '.chat-msg-row.user .chat-bubble'],
    ['.message-received', '.chat-msg-row.dream .chat-bubble'],
    ['.bubble-user', '.chat-msg-row.user .chat-bubble'],
    ['.bubble-dream', '.chat-msg-row.dream .chat-bubble'],
    ['.bubble-sent', '.chat-msg-row.user .chat-bubble'],
    ['.bubble-received', '.chat-msg-row.dream .chat-bubble'],
    ['[class*="bubble-user"]', '.chat-msg-row.user .chat-bubble'],
    ['[class*="bubble-dream"]', '.chat-msg-row.dream .chat-bubble'],
    ['[class*="bubble-sent"]', '.chat-msg-row.user .chat-bubble'],
    ['[class*="bubble-received"]', '.chat-msg-row.dream .chat-bubble'],
    ['[class*="message-sent"]', '.chat-msg-row.user .chat-bubble'],
    ['[class*="message-received"]', '.chat-msg-row.dream .chat-bubble'],
    // 单独 message 放最后
    ['.message', '.chat-bubble']
  ];
  map.forEach(function(pair) {
    css = css.split(pair[0]).join(pair[1]);
  });

  // ===== 给用户 CSS 里没写的 !important 补上优先级 =====
  // 如果用户 CSS 里带 !important，就保持原样；不带的，默认加一层作用域隔离
  // 这里不做强制修改，避免破坏用户 CSS 结构

  var style = document.createElement('style');
  style.id = 'customBubbleStyle';
  style.textContent = css;
  document.head.appendChild(style);
};

// 保存/恢复/清除
window.saveChatSettings = function() {
  chatSettings.minDelay = parseFloat(document.getElementById('chatMinDelay').value) || 1;
  chatSettings.maxDelay = parseFloat(document.getElementById('chatMaxDelay').value) || 3;
  chatSettings.ignoreRead = document.getElementById('chatIgnoreRead').checked;
  chatSettings.quoteEnabled = document.getElementById('chatQuoteEnabled').checked;
  chatSettings.cardMin = parseInt(document.getElementById('chatCardMin').value) || 1;
  chatSettings.cardMax = parseInt(document.getElementById('chatCardMax').value) || 3;
  chatSettings.activeMinutes = parseInt(document.getElementById('chatActiveMinutes').value) || 30;
  chatSettings.pushEnabled = document.getElementById('chatPushEnabled').checked;
    saveChatSettingsToDB();
  showToast('聊天设置已保存');
  window.navigateTo('screenChat');
};
function saveChatSettingsToDB() {
  dbSet('passANoteChatSettings', chatSettings);
}
window.resetChatSettings = function() {
  if (!confirm('确定恢复默认聊天设置吗？')) return;
  chatSettings = {
    bg: null,
    bubbleCss: '',
    minDelay: 1,
    maxDelay: 3,
    ignoreRead: false,
    quoteEnabled: false,
    cardMin: 1,
    cardMax: 3,
    activeMinutes: 30,
    pushEnabled: false
  };
   saveChatSettingsToDB();
  window.applyChatBg();
  window.applyBubbleCss();
  showToast('已恢复默认');
  window.navigateTo('screenChat');
};
window.clearChatMessages = function() {
  if (!confirm('确定清除当前梦角的聊天记录吗？')) return;
  var dreamId = dreamState.currentId;
  if (dreamId) {
    chatState.messages[dreamId] = [];
    saveChatMessages();
    window.renderChatMessages();
  }
  showToast('聊天记录已清除');
};

// 主动找我 + 后台推送定时器
setInterval(function() {
  if (!isDataReady || dreamState.dreams.length === 0) return;
  var dreamId = dreamState.currentId;
  if (!dreamId) return;
  var last = chatState.lastUserTime[dreamId] || 0;
  var minutes = parseInt(chatSettings.activeMinutes) || 30;
  if (Date.now() - last < minutes * 60 * 1000) return;
  if (Math.random() > 0.3) return; // 30% 概率主动
  window.dreamReply(dreamId, '');
  var d = dreamState.dreams.find(function(x) { return x.id === dreamId; });
sendNotification(d ? d.name : '梦角', '主动找你聊天了');
}, 60 * 1000);

// ========== 感知功能 ==========
console.log('当前模式:', tarotState.mode);
window.renderTarotPage = function() {
  var current = dreamState.dreams.find(function(d) { return d.id === dreamState.currentId; });
  var avatar = document.getElementById('tarotAvatar');
  var name = document.getElementById('tarotDreamName');
  var status = document.getElementById('tarotDreamStatus');
  if (current && avatar && name && status) {
    avatar.style.backgroundImage = current.avatar ? 'url(' + current.avatar + ')' : '';
    avatar.textContent = current.avatar ? '' : (current.name ? current.name.charAt(0) : '梦');
    name.textContent = current.name || '未命名';
    status.textContent = current.status || '在线';
  }
  window.applyTarotMode();
  window.renderTarotRound();
};

window.applyTarotMode = function() {
  var mode = tarotState.mode;
  var tabImg = document.getElementById('tarotTabImage');
  var tabSong = document.getElementById('tarotTabSong');
  if (tabImg) tabImg.classList.toggle('active', mode === 'image');
  if (tabSong) tabSong.classList.toggle('active', mode === 'song');
  var bar = document.getElementById('tarotBottomBar');
  if (bar) {
    if (mode === 'song') bar.classList.add('no-plus');
    else bar.classList.remove('no-plus');
  }
};

window.switchTarotMode = function(mode, silent) {
  tarotState.mode = mode;
  if (!silent) saveTarotState();

  var imgMode = document.getElementById('tarotImageMode');
  var songMode = document.getElementById('tarotSongMode');

  if (mode === 'song') {
    if (imgMode) imgMode.style.display = 'none';
    if (songMode) songMode.style.display = 'flex';
  } else {
    if (imgMode) imgMode.style.display = 'flex';
    if (songMode) songMode.style.display = 'none';
  }

  window.applyTarotMode();
  window.renderTarotRound();
  window.applyTarotBgs();
};

window.renderTarotDreamDropdown = function() {
  var listEl = document.getElementById('tarotDreamDropdownList');
  if (!listEl) return;
  if (dreamState.dreams.length === 0) {
    listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--gray);font-size:13px;">还没有梦角</div>';
    return;
  }
  listEl.innerHTML = dreamState.dreams.map(function(d) {
    var isActive = d.id === dreamState.currentId;
    var avatarStyle = d.avatar ? 'background-image:url(' + d.avatar + ');background-size:cover;background-position:center;' : '';
    var avatarText = d.avatar ? '' : (d.name ? d.name.charAt(0) : '梦');
    return '<div class="dream-dropdown-item ' + (isActive ? 'active' : '') + '" onclick="window.tarotSwitchDream(\'' + d.id + '\')">' +
      '<div class="avatar-circle" style="' + avatarStyle + '">' + avatarText + '</div>' +
      '<div class="dd-info"><div class="dd-name">' + d.name + '</div><div class="dd-status">' + (d.status || '无状态') + '</div></div>' +
      (isActive ? '<div class="dd-check">✓</div>' : '') +
      '</div>';
  }).join('');
};

window.tarotSwitchDream = function(id) {
  dreamState.currentId = id;
  saveDreamState();
  window.renderTarotPage();
  window.renderDreamSelector();
  var dd = document.getElementById('tarotDreamDropdown');
  if (dd) dd.classList.remove('show');
};

window.renderTarotRound = function() {
  var promptEl = document.getElementById('tarotPrompt');
  var grid = document.getElementById('tarotGrid');
  var loading = document.getElementById('tarotLoading');
  if (loading) loading.style.display = 'none';
  if (!promptEl || !grid) return;

  var dreamId = dreamState.currentId;
  if (!dreamId) {
    promptEl.textContent = '请先选择梦角';
    grid.className = 'tarot-grid';
    grid.innerHTML = '';
    return;
  }

  if (tarotState.mode !== 'image') {
    promptEl.innerHTML = '';
    grid.className = 'tarot-grid';
    grid.innerHTML = '';
    return;
  }

  var round = tarotState.rounds[dreamId];
  if (!round || !round.cards || round.cards.length === 0) {
    promptEl.textContent = '输入一句话，开始抽取图片吧！';
    grid.className = 'tarot-grid';
    grid.innerHTML = '';
    return;
  }

  promptEl.innerHTML = '你说：<span>' + escapeHtml(round.userInput) + '</span>';
  var html = '';
  round.cards.forEach(function(img, idx) {
    html += '<div class="tarot-card" style="background-image:url(' + img.data + '); animation-delay:' + (idx * 0.1) + 's;"></div>';
  });
  grid.className = 'tarot-grid count-' + round.cards.length;
  grid.innerHTML = html;
};

// ========== 感知 - 传图模式语音 ==========
var tarotVoiceState = { recording: false, startTime: 0, duration: 0 };

window.toggleTarotVoice = function() {
  var btn = document.getElementById('tarotVoiceBtn');
  if (!btn) return;

  if (!tarotVoiceState.recording) {
    // 开始录音（只计时，不真的录）
    tarotVoiceState.recording = true;
    tarotVoiceState.startTime = Date.now();
    tarotVoiceState.duration = 0;
    btn.classList.add('recording');
    showToast('正在录音，再点一下结束');
  } else {
    // 结束录音
    tarotVoiceState.recording = false;
    tarotVoiceState.duration = Math.max(1, Math.round((Date.now() - tarotVoiceState.startTime) / 1000));
    btn.classList.remove('recording');
    showToast('录音完成 ' + tarotVoiceState.duration + ' 秒，点发送发出');
  }
};

// ===== 感知背景 =====
window.handleTarotImageBg = function(e) {
  var file = e.target.files[0];
  if (!file) return;
  compressImage(file, function(dataUrl) {
    tarotState.imageBg = dataUrl;
    saveTarotState();
    window.applyTarotBgs();
    showToast('传图背景已保存');
  });
  e.target.value = '';
};

window.handleTarotSongBg = function(e) {
  var file = e.target.files[0];
  if (!file) return;
  compressImage(file, function(dataUrl) {
    tarotState.songBg = dataUrl;
    saveTarotState();
    window.applyTarotBgs();
    showToast('传歌背景已保存');
  });
  e.target.value = '';
};

window.resetTarotImageBg = function() {
  tarotState.imageBg = null;
  saveTarotState();
  window.applyTarotBgs();
};
window.resetTarotSongBg = function() {
  tarotState.songBg = null;
  saveTarotState();
  window.applyTarotBgs();
};

window.applyTarotBgs = function() {
  var page = document.getElementById('pageTarot');
  if (!page) return;
  // 默认背景用深色还是浅色，根据当前主题
  var isDark = document.body.classList.contains('dark');
  var defaultBg = isDark ? 'var(--bg)' : 'var(--bg)';
  // 根据当前模式应用对应背景
  var bg = tarotState.mode === 'song' ? tarotState.songBg : tarotState.imageBg;
  if (bg) {
    page.style.background = 'url(' + bg + ') center/cover no-repeat';
  } else {
    page.style.background = '';
  }
};

window.openTarotPlus = function() {
  if (tarotState.mode === 'song') {
    showToast('内置歌单共 ' + BUILTIN_SONGS.length + ' 首歌，直接发送即可抽歌');
  } else {
    window.navigateTo('pageTarotLibrary');
    setTimeout(function() { window.renderTarotGroupList(); }, 0);
  }
};
window.closeTarotPlus = function() {
  window.navigateTo('pageTarot');
};

window.addTarotGroup = function() {
  var name = prompt('输入分组名称：');
  if (!name || !name.trim()) return;
  tarotState.groups.push({ id: 'tg_' + Date.now(), name: name.trim(), images: [], collapsed: false });
  saveTarotState();
  setTimeout(function() { window.renderTarotGroupList(); }, 0);
};

window.deleteTarotGroup = function(gid) {
  if (gid === 'default') { alert('默认分组不能删除'); return; }
  if (!confirm('删除此分组及所有图片？')) return;
  tarotState.groups = tarotState.groups.filter(function(g) { return g.id !== gid; });
  saveTarotState();
  setTimeout(function() { window.renderTarotGroupList(); }, 0);
};

window.editTarotGroupName = function(gid) {
  var g = tarotState.groups.find(function(x) { return x.id === gid; });
  if (!g) return;
  var newName = prompt('修改分组名称：', g.name);
  if (newName === null || !newName.trim()) return;
  g.name = newName.trim();
  saveTarotState();
  setTimeout(function() { window.renderTarotGroupList(); }, 0);
};

window.deleteTarotImage = function(gid, imgId) {
  var g = tarotState.groups.find(function(x) { return x.id === gid; });
  if (!g) return;
  g.images = g.images.filter(function(i) { return i.id !== imgId; });
  saveTarotState();
  setTimeout(function() { window.renderTarotGroupList(); }, 0);
};

window.toggleTarotGroup = function(gid) {
  var g = tarotState.groups.find(function(x) { return x.id === gid; });
  if (!g) return;
  g.collapsed = !g.collapsed;
  saveTarotState();
  window.renderTarotGroupList();
};

window.renderTarotGroupList = function() {
  var list = document.getElementById('tarotGroupList');
  if (!list) return;
  if (tarotState.groups.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--gray);padding:20px;font-size:13px;">还没有分组</div>';
    return;
  }
  var html = '';
  tarotState.groups.forEach(function(g) {
    var isCollapsed = g.collapsed ? 'hidden' : '';
    html += '<div class="tarot-group">';
    html += '<div class="tarot-group-head" onclick="window.toggleTarotGroup(\'' + g.id + '\')">';
    html += '<span>' + escapeHtml(g.name) + '（' + g.images.length + '）</span>';
    html += '<div class="tarot-group-head-actions">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="event.stopPropagation();window.editTarotGroupName(\'' + g.id + '\')"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="event.stopPropagation();window.deleteTarotGroup(\'' + g.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    html += '<span class="arrow" style="transform:rotate(' + (g.collapsed ? '-90deg' : '0deg') + ');transition:transform 0.2s;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>';
    html += '</div></div>';
    html += '<div class="tarot-image-grid ' + isCollapsed + '">';
    if (g.images.length === 0) {
      html += '<div style="grid-column: 1/-1; font-size:12px; color:var(--gray); padding: 8px 0;">暂无图片</div>';
    } else {
      g.images.forEach(function(img) {
        html += '<div class="tarot-image-item" style="background-image:url(' + img.data + ');">';
        html += '<span class="del" onclick="event.stopPropagation();window.deleteTarotImage(\'' + g.id + '\', \'' + img.id + '\')">×</span>';
        html += '</div>';
      });
    }
    html += '</div></div>';
  });
  list.innerHTML = html;
};

window.handleTarotImageUpload = function(e) {
  var files = e.target.files;
  if (!files || files.length === 0) return;
  var gid = tarotState.groups[0].id;
  if (tarotState.groups.length > 1) {
    var names = tarotState.groups.map(function(g, i) { return (i + 1) + '. ' + g.name; }).join('\n');
    var pick = prompt('选择要添加到的分组（输入数字）：\n' + names, '1');
    var idx = parseInt(pick) - 1;
    if (isNaN(idx) || idx < 0 || idx >= tarotState.groups.length) { e.target.value = ''; return; }
    gid = tarotState.groups[idx].id;
  }
  var g = tarotState.groups.find(function(x) { return x.id === gid; });
  if (!g) { e.target.value = ''; return; }
  var filesArr = Array.prototype.slice.call(files);
  var total = filesArr.length;
  var done = 0;
  filesArr.forEach(function(file) {
    compressImage(file, function(dataUrl) {
      g.images.push({ id: 'ti_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), data: dataUrl });
      done++;
      if (done === total) {
        saveTarotState();
        setTimeout(function() { window.renderTarotGroupList(); }, 0);
        showToast('已添加 ' + total + ' 张图片');
      }
    });
  });
  e.target.value = '';
};

window.tarotSend = function() {
  // ===== 传图模式 =====
  if (tarotState.mode !== 'song') {
    var input = document.getElementById('tarotInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    var dreamId = dreamState.currentId;
    if (!dreamId) return alert('请先选择一个梦角！');
    var allImages = [];
    tarotState.groups.forEach(function(g) { g.images.forEach(function(i) { allImages.push(i); }); });
    if (allImages.length === 0) return alert('图片库是空的');
    var grid = document.getElementById('tarotGrid');
    var promptEl = document.getElementById('tarotPrompt');
    var loading = document.getElementById('tarotLoading');
    var loadingText = document.getElementById('tarotLoadingText');
    var voiceText = '', normalText = '';
    if (tarotVoiceState.duration > 0) {
      voiceText = '🎤 语音 ' + tarotVoiceState.duration + '″';
      tarotVoiceState.duration = 0;
    } else {
      normalText = text;
      input.value = '';
    }
    if (grid) grid.innerHTML = '';
    if (promptEl) promptEl.innerHTML = '';
    if (loadingText) loadingText.textContent = '正在抽取图片……';
    if (loading) loading.style.display = 'flex';
    var delay = (3 + Math.random() * 9) * 1000;
    setTimeout(function() {
      var count = 1 + Math.floor(Math.random() * 5);
      var pool = allImages.slice();
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      var picked = pool.slice(0, Math.min(count, pool.length));
      tarotState.rounds[dreamId] = { userInput: voiceText || normalText, cards: picked };
      saveTarotState();
      if (loading) loading.style.display = 'none';
      window.renderTarotRound();
    }, delay);
    return;
  }

  // ====== 传歌模式（内置歌单版） ======
  var input2 = document.getElementById('tarotInput');
  if (!input2) return;
  var text2 = input2.value.trim();
  if (!text2) return;

  if (typeof BUILTIN_SONGS === 'undefined' || !BUILTIN_SONGS || BUILTIN_SONGS.length === 0) {
    return alert('内置歌单还没有配置，请去 main.js 里配置 BUILTIN_SONGS');
  }

  input2.value = '';

  var lyricsEl = document.getElementById('lyricsContainer');
  var lyricsContent = document.getElementById('lyricsContent');
  var vinylWrapper = document.getElementById('vinylWrapper');
  var progressWrapper = document.getElementById('progressWrapper');
  if (vinylWrapper) vinylWrapper.style.display = 'none';
  if (progressWrapper) progressWrapper.style.display = 'none';
  if (lyricsEl) lyricsEl.style.display = 'block';
  var songPromptEl = document.getElementById('songPrompt');
  if (songPromptEl) songPromptEl.innerHTML = '你说：<span>' + escapeHtml(text2) + '</span>';
  if (lyricsContent) lyricsContent.innerHTML = '<div style="text-align:center; padding:40px; font-size:13px; color:var(--gray);"><svg class="spinner" viewBox="0 0 50 50" style="width:30px; height:30px;"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle></svg><div style="margin-top:10px;">正在抽取歌曲中……</div></div>';

  var delay2 = 2000 + Math.random() * 3000;
  setTimeout(function() {
    var randomTrack = BUILTIN_SONGS[Math.floor(Math.random() * BUILTIN_SONGS.length)];
    songState.currentSong = randomTrack;

    if (vinylWrapper) vinylWrapper.style.display = 'flex';
    if (progressWrapper) progressWrapper.style.display = 'flex';
    var coverEl = document.getElementById('vinylCover');
    if (coverEl) coverEl.style.backgroundImage = 'url(' + randomTrack.cover + ')';

    songState.audio.src = randomTrack.url;
    songState.audio.onloadedmetadata = function() {
      var duration = songState.audio.duration || 0;
      var randomTime = Math.random() * duration * 0.8;
      songState.audio.currentTime = randomTime;
      songState.audio.pause();
      updateProgressUI();
      showToast('抽到了：' + randomTrack.name + ' - ' + randomTrack.artist);
    };
    songState.audio.ontimeupdate = updateProgressUI;
    songState.audio.onended = function() {
      var disc = document.getElementById('vinylDisc');
      if (disc) disc.style.animationPlayState = 'paused';
      songState.isPlaying = false;
    };
    if (lyricsContent) lyricsContent.innerHTML = '<div style="text-align:center; padding:40px; font-size:13px; color:var(--gray);">暂无歌词，点击播放欣赏</div>';
  }, delay2);
};
// 绑定梦角选择器
safeBind('tarotDreamSelector', 'click', function(e) {
  e.stopPropagation();
  var dd = document.getElementById('tarotDreamDropdown');
  if (dd) dd.classList.toggle('show');
  window.renderTarotDreamDropdown();
});
document.addEventListener('click', function(e) {
  var wrap = document.querySelector('.tarot-dream-wrap');
  var dd = document.getElementById('tarotDreamDropdown');
  if (wrap && dd && !wrap.contains(e.target)) dd.classList.remove('show');
});

// 绑定图片库管理按钮（保险起见，直接在 JS 里绑）
safeBind('tarotAddImageBtn', 'click', function() {
  var el = document.getElementById('tarotImageInput');
  if (el) el.click();
});

  // ========== 抉择逻辑 ==========
  window.openChoiceModal = function() { document.getElementById('choiceQuestionInput').value = ''; document.getElementById('choiceOptionsContainer').innerHTML = ''; addChoiceOption(); addChoiceOption(); document.getElementById('choiceModal').classList.add('show'); setTimeout(function() { document.getElementById('choiceQuestionInput').focus(); }, 100); };
  window.closeChoiceModal = function() { document.getElementById('choiceModal').classList.remove('show'); };
  window.addChoiceOption = function() { var container = document.getElementById('choiceOptionsContainer'); var count = container.querySelectorAll('.choice-option-row').length; if (count >= 10) { alert('最多 10 个选项'); return; } var row = document.createElement('div'); row.className = 'choice-option-row'; row.innerHTML = '<input type="text" placeholder="选项 ' + (count + 1) + '"><span onclick="this.parentNode.remove()">×</span>'; container.appendChild(row); };
  window.sendChoice = function() {
  var question = document.getElementById('choiceQuestionInput').value.trim();
  if (!question) { alert('请输入问题'); return; }

  var rows = document.querySelectorAll('#choiceOptionsContainer .choice-option-row');
  var options = [];
  rows.forEach(function(r) { var v = r.querySelector('input').value.trim(); if (v) options.push(v); });
  if (options.length < 2) { alert('至少 2 个选项'); return; }

  var currentDreamId = dreamState.currentId;
  if (!currentDreamId) return alert('请先选择一个梦角！');

  // ==== 关键：同时写入历史记录 + 写入聊天流 ====
  var dateStr = getDateStr(Date.now());
  if (!historyState[currentDreamId]) historyState[currentDreamId] = {};
  if (!historyState[currentDreamId][dateStr]) historyState[currentDreamId][dateStr] = [];

  var minDelay = 5 * 1000;
  var maxDelay = 2 * 60 * 1000;
  var dueAt = Date.now() + Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  var recordId = 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  var record = {
    id: recordId,
    time: Date.now(),
    type: 'choice',
    question: question,
    options: options,
    selected: null,
    dueAt: dueAt,
    dreamId: currentDreamId
  };
  historyState[currentDreamId][dateStr].push(record);

  // 写入聊天流（这一条就是聊天界面里的卡片）
  if (!chatState.messages[currentDreamId]) chatState.messages[currentDreamId] = [];
  chatState.messages[currentDreamId].push({
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    role: 'user',
    type: 'choice',
    recordId: recordId,
    question: question,
    options: options,
    selected: null,
    time: Date.now()
  });

  saveChatMessages();
  saveHistoryState().then(function() {
    window.closeChoiceModal();
    window.renderChatMessages();
  });
};
  function checkPendingChoices() {
    if (!isDataReady) return; var now = Date.now(); var changed = false;
    for (var dreamId in historyState) { for (var dateStr in historyState[dreamId]) { var records = historyState[dreamId][dateStr]; records.forEach(function(r) {
      if (r.type === 'choice' && r.selected === null && r.dueAt && now >= r.dueAt) {
        r.selected = r.options[Math.floor(Math.random() * r.options.length)];
        r.dueAt = null; changed = true;
        // 同步更新聊天流里的那条抉择卡片
var chatList = chatState.messages[r.dreamId];
if (chatList) {
  for (var k = 0; k < chatList.length; k++) {
    if (chatList[k].type === 'choice' && chatList[k].recordId === r.id) {
      chatList[k].selected = r.selected;
      break;
    }
  }
  saveChatMessages();
  if (dreamState.currentId === r.dreamId && screenChat && screenChat.classList.contains('active')) {
    window.renderChatMessages();
  }
}
        if (dreamState.currentId === r.dreamId && screenMain.classList.contains('active')) {
          var curDream = dreamState.dreams.find(function(d) { return d.id === r.dreamId; });
          var dName = curDream ? curDream.name : '梦角';
          var toast = document.getElementById('pokeToast'); 
          if (toast) { toast.textContent = dName + ' 选择了：' + r.selected; toast.classList.add('show'); setTimeout(function() { toast.classList.remove('show'); }, 2500); }
        }
      }
    }); } }
    if (changed) { saveHistoryState(); if (pageHistory && pageHistory.classList.contains('active')) renderHistoryList(); }
  }
  setInterval(checkPendingChoices, 30 * 1000); checkPendingChoices();
    // ========== 历史记录渲染 ==========
  window.renderHistoryList = function() {
    var container = document.getElementById('historyListContainer'); if (!container) return; 
    var datePicker = document.getElementById('historyDatePicker'); if (datePicker) datePicker.value = historyCurrentDate; 
    var records = (historyState[historyCurrentDreamId] && historyState[historyCurrentDreamId][historyCurrentDate]) ? historyState[historyCurrentDreamId][historyCurrentDate] : []; 
    if (records.length === 0) { container.innerHTML = '<div style="text-align:center;color:var(--gray);padding:60px 20px;font-size:14px;">这一天没有记录哦</div>'; return; } 
    var html = ''; 
    records.slice().reverse().forEach(function(r) { 
      var isSelected = historySelectedIds.indexOf(r.id) > -1; 
      
      // 1. 通话记录
      if (r.type === 'call') {
        var callTypeText = r.callType === 'outgoing' ? '呼出' : '呼入';
        var statusText = r.status === 'answered' ? '已接听' : (r.status === 'missed' ? '未接听' : '已拒接');
        var durationHtml = r.status === 'answered' ? '<span style="font-size:11px;color:var(--gray);margin-left:8px;">通话时长 ' + Math.floor(r.duration/60) + '分' + (r.duration%60) + '秒</span>' : '';
        html += '<div class="history-item ' + (isSelected ? 'selected' : '') + '" onclick="' + (historyEditMode ? 'toggleHistorySelect(\'' + r.id + '\')' : '') + '">';
        if (historyEditMode) { html += '<div class="history-edit-checkbox ' + (isSelected ? 'checked' : '') + '">' + (isSelected ? '✓' : '') + '</div>'; }
        html += '<div class="history-item-left"><div class="history-time">' + formatTime(r.time) + '</div><div class="history-drawn-card" style="border-left-color: var(--green); color: var(--green);">' + callTypeText + ' · ' + statusText + durationHtml + '</div></div></div>';
        return;
      }

      // 2. 抉择记录
      if (r.type === 'choice') {
        var optionsHtml = r.options.map(function(opt) { var isChosen = (r.selected === opt); return '<div class="history-choice-option ' + (isChosen ? 'selected' : '') + '">' + escapeHtml(opt) + '</div>'; }).join('');
        html += '<div class="history-item ' + (isSelected ? 'selected' : '') + '" onclick="' + (historyEditMode ? 'toggleHistorySelect(\'' + r.id + '\')' : '') + '">';
        if (historyEditMode) { html += '<div class="history-edit-checkbox ' + (isSelected ? 'checked' : '') + '">' + (isSelected ? '✓' : '') + '</div>'; }
        html += '<div class="history-item-left"><div class="history-time">' + formatTime(r.time) + '</div><div class="history-choice-question">' + escapeHtml(r.question) + '</div>' + optionsHtml + (r.selected ? '<div style="font-size:11px;color:var(--gray);margin-top:6px;">梦角已选择</div>' : '<div style="font-size:11px;color:var(--gray);margin-top:6px;">等待选择中……</div>') + '</div></div>';
        return;
      }

      // 3. 拍一拍记录
      if (r.isPoke) {
        html += '<div class="history-item ' + (isSelected ? 'selected' : '') + '" onclick="' + (historyEditMode ? 'toggleHistorySelect(\'' + r.id + '\')' : '') + '">';
        if (historyEditMode) { html += '<div class="history-edit-checkbox ' + (isSelected ? 'checked' : '') + '">' + (isSelected ? '✓' : '') + '</div>'; }
        html += '<div class="history-item-left"><div class="history-time">' + formatTime(r.time) + '</div><div class="history-drawn-card" style="border-left-color: var(--blue); color: var(--blue);">' + escapeHtml(r.pokeText) + '</div></div></div>';
        return;
      }

      // 4. 普通抽卡记录
      var drawnText = (r.flippedIndex !== -1 && r.drawnCards[r.flippedIndex]) ? r.drawnCards[r.flippedIndex] : '未抽卡'; 
      var drawnDisplay = drawnText.length > 30 ? drawnText.slice(0, 30) + '...' : drawnText; 
      var supplementHtml = ''; 
      if (r.dreamSupplement) { 
        var supDisplay = r.dreamSupplement.length > 20 ? r.dreamSupplement.slice(0, 20) + '...' : r.dreamSupplement; 
        supplementHtml = '<div class="history-item-right"><div class="history-supplement-label">梦角补充</div><div class="history-supplement-card" onclick="event.stopPropagation(); openHistoryCardModal(\'' + r.dreamSupplement.replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\')">' + supDisplay + '</div></div>'; 
      } 
      html += '<div class="history-item ' + (isSelected ? 'selected' : '') + '" onclick="' + (historyEditMode ? 'toggleHistorySelect(\'' + r.id + '\')' : '') + '">'; 
      if (historyEditMode) { html += '<div class="history-edit-checkbox ' + (isSelected ? 'checked' : '') + '">' + (isSelected ? '✓' : '') + '</div>'; } 
      html += '<div class="history-item-left"><div class="history-time">' + formatTime(r.time) + '</div><div class="history-user-input">' + escapeHtml(r.userInput) + '</div><div class="history-drawn-card" onclick="event.stopPropagation(); openHistoryCardModal(\'' + drawnText.replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\')">' + (r.flippedIndex === -1 ? '未翻开' : drawnDisplay) + '</div></div>' + supplementHtml + '</div>'; 
    }); 
    container.innerHTML = html; 
  };
  window.forceChoice = function() { for (var dreamId in historyState) { for (var dateStr in historyState[dreamId]) { historyState[dreamId][dateStr].forEach(function(r) { if (r.type === 'choice' && r.selected === null && r.dueAt) { r.dueAt = Date.now() - 1000; } }); } } checkPendingChoices(); showToast('已强制触发抉择选择'); };

  // ========== 拍一拍逻辑 ==========
  var currentPokeSearchTerm = '';
  window.renderPokeManager = function() { var container = document.getElementById('pokeListContainer'); if (!container) return; var html = ''; if (currentPokeSearchTerm) { var matched = pokeState.pokes.filter(function(c) { return c.text.indexOf(currentPokeSearchTerm) > -1; }); if (matched.length === 0) html = '<div style="text-align:center;color:var(--gray);padding:20px;font-size:13px;">没有找到包含「' + currentPokeSearchTerm + '」的文案</div>'; else { html = '<div style="font-size:12px;color:var(--gray);margin-bottom:8px;">找到 ' + matched.length + ' 条</div>'; matched.forEach(function(c) { html += window.renderSinglePokeHtml(c); }); } container.innerHTML = html; return; } pokeState.categories.forEach(function(cat) { var catPokes = pokeState.pokes.filter(function(c) { return c.cat === cat.id; }); var isCollapsed = cat.collapsed ? 'hidden' : ''; var delSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="event.stopPropagation();window.deletePokeCategory(\'' + cat.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; html += '<div class="category-group"><div class="category-header" onclick="window.togglePokeCategory(\'' + cat.id + '\')"><span class="category-title">' + cat.name + '（' + catPokes.length + '）</span><div class="category-actions">' + delSvg + '<span class="arrow" style="transform:rotate(' + (cat.collapsed ? '-90deg' : '0deg') + ');transition:transform 0.2s;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span></div></div><div class="category-body ' + isCollapsed + '">'; if (catPokes.length === 0) html += '<div style="font-size:12px;color:var(--gray);padding:4px 0;">暂无拍一拍文案</div>'; else catPokes.forEach(function(c) { html += window.renderSinglePokeHtml(c); }); html += '</div></div>'; }); container.innerHTML = html; };
  window.renderSinglePokeHtml = function(c) { var editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.editPoke(\'' + c.id + '\')"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'; var delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.deletePoke(\'' + c.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; return '<div class="card-item"><div class="card-item-text">' + c.text + '</div><div class="card-item-actions"><span style="color:var(--gray);">' + editSvg + '</span><span class="delete-icon" style="color:var(--gray);">' + delSvg + '</span></div></div>'; };
  window.togglePokeCategory = function(catId) { var cat = pokeState.categories.find(function(c) { return c.id === catId; }); if (cat) { cat.collapsed = !cat.collapsed; savePokeState(); window.renderPokeManager(); } };
  window.addPokeCategoryPrompt = function() { var name = prompt('输入分类名称：'); if (!name || name.trim() === '') return; pokeState.categories.push({ id: 'cat_' + Date.now(), name: name.trim(), collapsed: false }); savePokeState(); window.renderPokeManager(); };
  window.deletePokeCategory = function(catId) { if (!confirm('删除此分类及其所有文案？')) return; pokeState.pokes = pokeState.pokes.filter(function(c) { return c.cat !== catId; }); pokeState.categories = pokeState.categories.filter(function(c) { return c.id !== catId; }); if (pokeState.categories.length === 0) pokeState.categories.push({ id: 'default', name: '默认', collapsed: false }); savePokeState(); window.renderPokeManager(); };
  window.editPoke = function(pokeId) { var c = pokeState.pokes.find(function(x) { return x.id === pokeId; }); if (!c) return; var newText = prompt('编辑拍一拍文案：', c.text); if (newText !== null && newText.trim() !== '') { c.text = newText.trim(); savePokeState(); window.renderPokeManager(); } };
  window.deletePoke = function(pokeId) { pokeState.pokes = pokeState.pokes.filter(function(c) { return c.id !== pokeId; }); savePokeState(); window.renderPokeManager(); };
  window.onPokeSearch = function(val) { currentPokeSearchTerm = val.trim(); window.renderPokeManager(); };
  window.dedupePokes = function() { var seen = {}, dupes = []; pokeState.pokes.forEach(function(c) { var key = c.text.trim(); if (!key) return; if (seen[key] !== undefined) dupes.push(c.id); else seen[key] = c.id; }); if (dupes.length === 0) { alert('没有发现重复的文案'); return; } if (!confirm('发现 ' + dupes.length + ' 条重复文案，是否删除？')) return; pokeState.pokes = pokeState.pokes.filter(function(c) { return dupes.indexOf(c.id) === -1; }); savePokeState(); window.renderPokeManager(); };
  window.openAddPokeModal = function() { var sel = document.getElementById('addPokeCatSelect'); if(sel) sel.innerHTML = pokeState.categories.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join(''); var inp = document.getElementById('addPokeTextInput'); if(inp) inp.value = ''; document.getElementById('addPokeModal').classList.add('show'); };
  window.closeAddPokeModal = function() { document.getElementById('addPokeModal').classList.remove('show'); };
  window.confirmAddPoke = function() { var catEl = document.getElementById('addPokeCatSelect'); if(!catEl) return; var catId = catEl.value; var rawEl = document.getElementById('addPokeTextInput'); if(!rawEl) return; var raw = rawEl.value || ''; var lines = raw.split('\n').map(function(s) { return s.trim(); }).filter(function(s) { return s; }); if (lines.length === 0) { alert('请输入文案'); return; } var existing = {}; pokeState.pokes.forEach(function(c) { existing[c.text.trim()] = true; }); var added = 0, skipped = 0; lines.forEach(function(line) { if (existing[line]) { skipped++; return; } pokeState.pokes.push({ id: 'poke_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: line, cat: catId }); existing[line] = true; added++; }); savePokeState(); window.closeAddPokeModal(); window.renderPokeManager(); alert('已添加 ' + added + ' 条，跳过 ' + skipped + ' 条重复'); };
  window.exportPokes = function() { var groups = pokeState.categories.map(function(cat) { var items = pokeState.pokes.filter(function(c) { return c.cat === cat.id; }).map(function(c) { return c.text; }); return { name: cat.name, items: items }; }); var data = { customReplyGroups: groups, exportAt: new Date().toISOString(), version: 1 }; var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = '小纸条_拍一拍_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function() { URL.revokeObjectURL(url); }, 1500); alert('已导出'); };
  window.handleImportPokes = function(e) { var file = e.target.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function(ev) { try { var importedData = JSON.parse(ev.target.result); var newItems = []; if (importedData.customReplyGroups && Array.isArray(importedData.customReplyGroups)) { importedData.customReplyGroups.forEach(function(group) { var catName = group.name || '导入分类'; var targetCat = pokeState.categories.find(function(c) { return c.name === catName; }); var targetCatId = targetCat ? targetCat.id : ('cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)); if (!targetCat) pokeState.categories.push({ id: targetCatId, name: catName, collapsed: false }); if (group.items && Array.isArray(group.items)) { group.items.forEach(function(text) { if (text && text.trim()) newItems.push({ text: text.trim(), cat: targetCatId }); }); } }); } else if (Array.isArray(importedData)) { importedData.forEach(function(text) { if (typeof text === 'string' && text.trim()) newItems.push({ text: text.trim(), cat: 'default' }); }); } if (newItems.length === 0) { alert('没有找到可导入的数据'); return; } var existing = {}; pokeState.pokes.forEach(function(c) { existing[c.text.trim()] = true; }); var added = 0; newItems.forEach(function(item) { if (!existing[item.text]) { pokeState.pokes.push({ id: 'imported_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: item.text, cat: item.cat }); existing[item.text] = true; added++; } }); savePokeState(); window.renderPokeManager(); alert('成功导入 ' + added + ' 条！'); } catch (err) { alert('文件解析失败'); } }; reader.readAsText(file); e.target.value = ''; };
  function triggerPoke() { if (!isDataReady || pokeState.pokes.length === 0) return; var currentDream = dreamState.dreams.find(function(d) { return d.id === dreamState.currentId; }); if (!currentDream) return; var pick = pokeState.pokes[Math.floor(Math.random() * pokeState.pokes.length)].text; var toast = document.getElementById('pokeToast'); if (toast) { toast.textContent = currentDream.name + ' ' + pick; toast.classList.add('show'); setTimeout(function() { toast.classList.remove('show'); }, 2500); } var dateStr = getDateStr(Date.now()); if (!historyState[currentDream.id]) historyState[currentDream.id] = {}; if (!historyState[currentDream.id][dateStr]) historyState[currentDream.id][dateStr] = []; var record = { id: 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), time: Date.now(), userInput: '', drawnCards: [], flippedIndex: -1, dreamSupplement: '', supplementDueAt: null, isPoke: true, pokeText: pick }; historyState[currentDream.id][dateStr].push(record); saveHistoryState().then(function() { if (pageHistory && pageHistory.classList.contains('active')) renderHistoryList(); }); pokeState.lastPokeTime = Date.now(); savePokeState(); }
  setInterval(function() { if (!isDataReady || pokeState.pokes.length === 0) return; var now = Date.now(); if (now - (pokeState.lastPokeTime || 0) < 5 * 60 * 1000) return; if (Math.random() < 0.25) { triggerPoke(); } }, 2 * 60 * 1000);
  window.forcePoke = function() { triggerPoke(); };

  // ========== 暗号逻辑 ==========
  var secretCooldownTimer = null; var currentEditingSecretIndex = null;
  window.renderSecretCodeManager = function() { var container = document.getElementById('secretListContainer'); if (!container) return; var html = ''; secretState.codes.forEach(function(item, index) { var displayText = item.text ? item.text : '<span style="color:var(--gray);">占位</span>'; var editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="window.openEditSecretModal(' + index + ')"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'; html += '<div class="card-item"><div class="card-item-text">' + displayText + '</div><div class="card-item-actions"><span style="color:var(--gray);">' + editSvg + '</span></div></div>'; }); container.innerHTML = html; updateDrawButtonState(); };
  window.openEditSecretModal = function(index) { currentEditingSecretIndex = index; var item = secretState.codes[index]; var input = document.getElementById('secretInput'); if (input) input.value = item.text || ''; var titleEl = document.getElementById('secretModalTitle'); if (titleEl) titleEl.textContent = '编辑暗号 (' + (index + 1) + '/10)'; document.getElementById('addSecretModal').classList.add('show'); setTimeout(function() { if (input) input.focus(); }, 100); };
  window.closeAddSecretModal = function() { document.getElementById('addSecretModal').classList.remove('show'); currentEditingSecretIndex = null; };
  window.saveSecretEdit = function() { var input = document.getElementById('secretInput'); if (!input) return; var text = input.value.trim(); if (currentEditingSecretIndex !== null) { secretState.codes[currentEditingSecretIndex].text = text; saveSecretState(); window.closeAddSecretModal(); window.renderSecretCodeManager(); } };
  function updateDrawButtonState() { var btn = document.getElementById('drawSecretBtn'); if (!btn) return; var filledCount = secretState.codes.filter(function(c) { return c.text && c.text.trim() !== ''; }).length; if (filledCount === 0) { btn.disabled = true; btn.textContent = '还没有设置暗号'; return; } var now = Date.now(); var cooldown = 3 * 60 * 1000; var elapsed = now - (secretState.lastDrawTime || 0); if (elapsed < cooldown) { btn.disabled = true; var remain = Math.ceil((cooldown - elapsed) / 1000); var m = Math.floor(remain / 60); var s = remain % 60; btn.textContent = '冷却中 ' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); if (!secretCooldownTimer) secretCooldownTimer = setInterval(updateDrawButtonState, 1000); } else { btn.disabled = false; btn.textContent = '对暗号'; if (secretCooldownTimer) { clearInterval(secretCooldownTimer); secretCooldownTimer = null; } } }
  window.drawSecret = function() { var availableSecrets = secretState.codes.filter(function(c) { return c.text && c.text.trim() !== ''; }); if (availableSecrets.length === 0) return alert('请先点击右侧铅笔，设置至少一条暗号！'); var now = Date.now(); var cooldown = 3 * 60 * 1000; if (now - (secretState.lastDrawTime || 0) < cooldown) { alert('冷却中，请稍后再试！'); return; } var randomIndex = Math.floor(Math.random() * availableSecrets.length); var pick = availableSecrets[randomIndex].text; var resultEl = document.getElementById('secretResult'); resultEl.textContent = '「' + pick + '」'; secretState.lastDrawTime = now; saveSecretState(); updateDrawButtonState(); };

  // ========== 日记逻辑 ==========
  var currentDiaryMood = ''; var currentDiaryWeather = ''; var MOODS = ['开心','难过','生气','平静','无聊','焦虑','幸福','疲惫']; var WEATHERS = ['晴朗','多云','阴天','小雨','大雨','雪天','大风'];
  window.renderDiaryPage = function() { var coverEl = document.getElementById('diaryCover'); if (coverEl) { if (diaryState.cover) { coverEl.style.background = 'url(' + diaryState.cover + ') center/cover no-repeat'; } else { coverEl.style.background = 'linear-gradient(135deg,#a8c8e0,#7ec8e3)'; } } window.renderDiaryList(); };
  window.renderDiaryList = function() { var list = document.getElementById('diaryList'); if (!list) return; if (diaryState.diaries.length === 0) { list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray);">还没有日记，点右上角写一篇吧</div>'; return; } var sorted = diaryState.diaries.slice().sort(function(a,b) { return b.time - a.time; }); var html = ''; sorted.forEach(function(d) { var commentsHtml = (d.comments || []).map(function(c) { var avatarHtml = (c.authorId === 'user' || c.authorName === '我') ? '' : '<img class="diary-comment-item-avatar" src="' + (c.avatar || '') + '">'; return '<div class="diary-comment-item">' + avatarHtml + '<span><b>' + c.authorName + '</b>: ' + c.text + '</span></div>'; }).join(''); var avatarHtml = (d.authorId === 'user') ? '' : '<img class="diary-item-avatar" src="' + (d.avatar || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2744%27 height=%2744%27%3E%3Crect width=%2744%27 height=%2744%27 fill=%27%23eee%27/%3E%3Ctext x=%2722%27 y=%2728%27 text-anchor=%27middle%27 fill=%27%23aaa%27 font-size=%2716%27%3E👤%3C/text%3E%3C/svg%3E') + '">'; html += '<div class="diary-item">' + avatarHtml + '<div class="diary-item-body"><div class="diary-item-name">' + d.authorName + '</div><div class="diary-item-content">' + d.content + '</div><div class="diary-item-tags"><span>🌤 ' + d.weather + '</span><span>💭 ' + d.mood + '</span></div><div style="margin-top:8px;font-size:11px;color:var(--gray);">' + new Date(d.time).toLocaleString() + '</div><div style="margin-top:8px;">' + commentsHtml + '</div><button class="btn-black" style="margin-top:8px;font-size:12px;padding:4px 10px;" onclick="openCommentPrompt(\'' + d.id + '\')">评论</button><button class="btn-black" style="position: absolute; top: 14px; right: 14px; padding: 4px 8px; font-size: 11px; background: rgba(255,59,48,0.9);" onclick="deleteDiary(\'' + d.id + '\')">删除</button></div></div>'; }); list.innerHTML = html; };
  window.deleteDiary = function(id) { if (!confirm('确定删除这篇日记吗？')) return; diaryState.diaries = diaryState.diaries.filter(function(d) { return d.id !== id; }); saveDiaryState(); window.renderDiaryList(); };
  window.openWriteDiary = function() { currentDiaryMood = MOODS[0]; currentDiaryWeather = WEATHERS[0]; var moodBox = document.getElementById('diaryMoodTags'); moodBox.innerHTML = MOODS.map(function(m) { return '<span onclick="pickMood(\'' + m + '\')" style="flex-shrink:0;font-size:13px;padding:6px 14px;border-radius:16px;cursor:pointer;background:' + (m === currentDiaryMood ? 'var(--btn-dark)' : 'var(--card)') + ';color:' + (m === currentDiaryMood ? 'var(--btn-dark-text)' : 'var(--text)') + ';border:1px solid var(--border);">' + m + '</span>'; }).join(''); var weatherBox = document.getElementById('diaryWeatherTags'); weatherBox.innerHTML = WEATHERS.map(function(w) { return '<span onclick="pickWeather(\'' + w + '\')" style="flex-shrink:0;font-size:13px;padding:6px 14px;border-radius:16px;cursor:pointer;background:' + (w === currentDiaryWeather ? 'var(--btn-dark)' : 'var(--card)') + ';color:' + (w === currentDiaryWeather ? 'var(--btn-dark-text)' : 'var(--text)') + ';border:1px solid var(--border);">' + w + '</span>'; }).join(''); document.getElementById('diaryTextInput').value = ''; window.navigateTo('pageWriteDiary'); };
  window.pickMood = function(m) { currentDiaryMood = m; var box = document.getElementById('diaryMoodTags'); box.querySelectorAll('span').forEach(function(el) { var isActive = el.textContent === m; el.style.background = isActive ? 'var(--btn-dark)' : 'var(--card)'; el.style.color = isActive ? 'var(--btn-dark-text)' : 'var(--text)'; }); };
  window.pickWeather = function(w) { currentDiaryWeather = w; var box = document.getElementById('diaryWeatherTags'); box.querySelectorAll('span').forEach(function(el) { var isActive = el.textContent === w; el.style.background = isActive ? 'var(--btn-dark)' : 'var(--card)'; el.style.color = isActive ? 'var(--btn-dark-text)' : 'var(--text)'; }); };
  window.saveDiary = function() { var text = document.getElementById('diaryTextInput').value.trim(); if (!text) return alert('写点什么吧'); diaryState.diaries.push({ id: 'diary_' + Date.now(), authorId: 'user', authorName: state.profile.name || '我', content: text, mood: currentDiaryMood, weather: currentDiaryWeather, time: Date.now(), comments: [] }); saveDiaryState(); alert('日记已保存'); window.navigateTo('pageDiary'); };
  window.openCommentPrompt = function(id) { var text = prompt('写评论：'); if (!text || !text.trim()) return; var diary = diaryState.diaries.find(function(x) { return x.id === id; }); if (!diary) return; diary.comments = diary.comments || []; diary.comments.push({ authorId: 'user', authorName: state.profile.name || '我', text: text.trim() }); saveDiaryState(); window.renderDiaryList(); if (Math.random() < 0.8 && dreamState.dreams.length > 0) { setTimeout(function() { var randomDream = dreamState.dreams[Math.floor(Math.random() * dreamState.dreams.length)]; if (randomDream) { var replyTexts = ['写得真好！', '我也这么觉得。', '你要开心一点哦。', '看到你的日记我就放心了。', '抱抱你！', '今天也要好好照顾自己。']; diary.comments.push({ authorId: randomDream.id, authorName: randomDream.name, avatar: randomDream.avatar, text: replyTexts[Math.floor(Math.random() * replyTexts.length)] }); saveDiaryState(); if (pageDiary && pageDiary.classList.contains('active')) window.renderDiaryList(); } }, 3000 + Math.random() * 5000); } };
  window.handleDiaryCoverUpload = function(e) { var file = e.target.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function(ev) { var img = new Image(); img.onload = function() { var canvas = document.createElement('canvas'); var MAX_WIDTH = 800; var w = img.width, h = img.height; if (w > MAX_WIDTH) { h *= MAX_WIDTH / w; w = MAX_WIDTH; } canvas.width = w; canvas.height = h; var ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h); diaryState.cover = canvas.toDataURL('image/jpeg', 0.7); saveDiaryState(); window.renderDiaryPage(); }; img.src = ev.target.result; }; reader.readAsDataURL(file); e.target.value = ''; };
  function checkAutoDiary() { if (!isDataReady || dreamState.dreams.length === 0) return; var now = Date.now(); var EIGHT_HOURS = 8 * 60 * 60 * 1000; var changed = false; dreamState.dreams.forEach(function(dream) { var lastTime = 0; diaryState.diaries.forEach(function(d) { if (d.authorId === dream.id) { var t = d.time || 0; if (t > lastTime) lastTime = t; } }); if (now - lastTime >= EIGHT_HOURS && Math.random() < 0.4) { var usableCards = cardState.cards.filter(function(c) { if (c.blocked) return false; var cat = cardState.categories.find(function(x) { return x.id === c.cat; }); if (cat && cat.blocked) return false; return true; }); if (usableCards.length === 0) return; var count = 3 + Math.floor(Math.random() * 4); var shuffled = usableCards.slice().sort(function() { return Math.random() - 0.5; }); var content = shuffled.slice(0, Math.min(count, shuffled.length)).map(function(c) { return c.text; }).join('\n'); var moods = ['开心','难过','平静','无聊','焦虑','幸福','疲惫']; var weathers = ['晴朗','多云','阴天','小雨','大雨','雪天','大风']; diaryState.diaries.push({ id: 'diary_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), authorId: dream.id, authorName: dream.name, avatar: dream.avatar || '', content: content, mood: moods[Math.floor(Math.random() * moods.length)], weather: weathers[Math.floor(Math.random() * weathers.length)], time: now, comments: [] }); changed = true; } }); if (changed) { saveDiaryState(); var pageDiary = document.getElementById('pageDiary'); if (pageDiary && pageDiary.classList.contains('active')) { window.renderDiaryList(); } } }
  setTimeout(checkAutoDiary, 3000); setInterval(checkAutoDiary, 30 * 60 * 1000);

  // ========== 信箱逻辑 ==========
  var currentMailTab = 'inbox';
  window.openWriteLetter = function() { var sel = document.getElementById('letterTarget'); if (!dreamState.dreams || dreamState.dreams.length === 0) return alert('还没有梦角'); sel.innerHTML = dreamState.dreams.map(function(d) { return '<option value="' + d.id + '">' + d.name + '</option>'; }).join(''); document.getElementById('letterContent').value = ''; window.navigateTo('pageWriteLetter'); };
  window.sendLetter = function() {
    var targetId = document.getElementById('letterTarget').value; var content = document.getElementById('letterContent').value.trim();
    if (!content) return alert('信件内容不能为空');
    var target = dreamState.dreams.find(function(d) { return d.id === targetId; }); if (!target) return;
    var deliverAt = Date.now() + (10 + Math.random() * 38) * 3600 * 1000;
    mailState.mails.push({ id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), from: 'user', fromId: 'user', fromName: state.profile.name || '我', toId: targetId, toName: target.name, content: content, sentAt: Date.now(), deliverAt: deliverAt, delivered: false, read: false, isReply: false });
    saveMailState(); alert('信件已寄出，预计 10-48 小时送达'); window.navigateTo('pageMailbox'); window.switchMailTab('outbox');
  };
  window.switchMailTab = function(tab) {
    currentMailTab = tab; var inbox = document.getElementById('mailTabInbox'); var outbox = document.getElementById('mailTabOutbox');
    if (tab === 'inbox') { inbox.style.color = 'var(--blue)'; inbox.style.borderBottom = '2px solid var(--blue)'; outbox.style.color = 'var(--gray)'; outbox.style.borderBottom = '2px solid transparent'; } 
    else { outbox.style.color = 'var(--blue)'; outbox.style.borderBottom = '2px solid var(--blue)'; inbox.style.color = 'var(--gray)'; inbox.style.borderBottom = '2px solid transparent'; }
    window.renderMailList();
  };
  window.renderMailList = function() {
    var list = document.getElementById('mailList'); if (!list) return;
    var filtered = mailState.mails.filter(function(m) { return currentMailTab === 'inbox' ? m.from !== 'user' : m.from === 'user'; }).sort(function(a, b) { return b.sentAt - a.sentAt; });
    var unreadCount = mailState.mails.filter(function(m) { return m.from !== 'user' && !m.read; }).length;
    var badge = document.getElementById('mailUnreadBadge'); if (badge) { if (unreadCount > 0) { badge.textContent = unreadCount; badge.style.display = 'inline-block'; } else badge.style.display = 'none'; }
    if (filtered.length === 0) { list.innerHTML = '<div style="padding:50px;text-align:center;color:var(--gray);">' + (currentMailTab === 'inbox' ? '还没有收到信' : '还没有寄出过信') + '</div>'; return; }
    var html = '';
    filtered.forEach(function(m) {
      var t = new Date(m.sentAt); var timeStr = (t.getMonth()+1) + '/' + t.getDate() + ' ' + String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0');
      var statusHtml = ''; var dotHtml = '';
      if (m.from === 'user') { if (m.delivered) statusHtml = '<span class="mail-item-status delivered">已送达</span>'; else { var left = Math.max(0, m.deliverAt - Date.now()); var hLeft = Math.floor(left / 3600000); var mLeft = Math.floor((left % 3600000) / 60000); statusHtml = '<span class="mail-item-status">运送中 · 剩 ' + hLeft + 'h' + mLeft + 'm</span>'; } } 
      else { if (!m.read) dotHtml = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff3b30;margin-right:6px;vertical-align:middle;"></span>'; }
      var whoText = m.from === 'user' ? ('寄给 ' + m.toName) : ('来自 ' + m.fromName);
      if (m.isAutoLetter) whoText += ' <span style="font-size:10px;color:#ff9500;background:rgba(255,149,0,0.1);padding:1px 4px;border-radius:4px;margin-left:4px;">主动来信</span>';
      var preview = m.content.replace(/\n/g, ' ').slice(0, 30);
      html += '<div class="mail-item" onclick="openLetterDetail(\'' + m.id + '\')"><div class="mail-item-top"><span class="mail-item-title">' + dotHtml + whoText + '</span><div>' + statusHtml + '<span onclick="event.stopPropagation();deleteMail(\'' + m.id + '\')" style="font-size:12px;color:var(--red);padding:4px 8px;margin-left:8px;cursor:pointer;">🗑</span></div></div><div class="mail-item-preview">' + preview + '</div><div class="mail-item-time">' + timeStr + '</div></div>';
    });
    list.innerHTML = html;
  };
  window.deleteMail = function(id) { if (!confirm('确定删除这封信吗？')) return; mailState.mails = mailState.mails.filter(function(m) { return m.id !== id; }); saveMailState(); window.renderMailList(); };
  window.openLetterDetail = function(id) {
    var m = mailState.mails.find(function(x) { return x.id === id; }); if (!m) return;
    if (m.from !== 'user' && !m.read) { m.read = true; saveMailState(); }
    var t = new Date(m.sentAt); var timeStr = (t.getMonth()+1) + '月' + t.getDate() + '日 ' + String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0');
    document.getElementById('letterDetailTitle').textContent = (m.from === 'user' ? '寄给 ' + m.toName : '来自 ' + m.fromName) + (m.isAutoLetter ? ' · 主动来信' : '');
    document.getElementById('letterDetailContent').innerHTML = '<div style="padding:20px;"><div style="font-size:12px;color:var(--gray);margin-bottom:16px;text-align:center;">' + timeStr + '</div><div style="background:var(--card);border-radius:14px;padding:20px;box-shadow:var(--shadow);line-height:1.8;font-size:14px;color:var(--text);white-space:pre-wrap;word-break:break-word;">' + m.content + '</div>' + (m.from === 'user' && !m.delivered ? '<div style="text-align:center;margin-top:16px;font-size:12px;color:var(--gray);">信件还在运送中……</div>' : '') + '</div>';
    window.navigateTo('pageLetterDetail');
  };
  setInterval(function() {
    if (!isDataReady) return; var now = Date.now(); var changed = false;
    mailState.mails.forEach(function(m) {
      if (m.from === 'user' && !m.delivered && now >= m.deliverAt) {
        m.delivered = true; changed = true;
        setTimeout(function() {
          var targetDream = dreamState.dreams.find(function(d) { return d.id === m.toId; });
          if (!targetDream || cardState.cards.length === 0) return;
          var count = 8 + Math.floor(Math.random() * 8);
          var shuffled = cardState.cards.slice().sort(function() { return Math.random() - 0.5; });
          var content = shuffled.slice(0, Math.min(count, shuffled.length)).map(function(c) { return c.text; }).join('\n');
          mailState.mails.push({ id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), from: 'dream', fromId: targetDream.id, fromName: targetDream.name, fromAvatar: targetDream.avatar || '', toId: 'user', toName: state.profile.name || '我', content: content, sentAt: Date.now(), deliverAt: Date.now(), delivered: true, read: false, isReply: true, replyToId: m.id });
          saveMailState(); if (pageMailbox && pageMailbox.classList.contains('active')) window.renderMailList();
        }, 3000 + Math.random() * 5000);
      }
    });
    if (changed) saveMailState();
  }, 30 * 1000);
  setInterval(function() {
    if (!isDataReady || dreamState.dreams.length === 0 || cardState.cards.length === 0) return;
    if (Math.random() > 0.045) return;
    var dream = dreamState.dreams[Math.floor(Math.random() * dreamState.dreams.length)];
    var count = 8 + Math.floor(Math.random() * 8);
    var shuffled = cardState.cards.slice().sort(function() { return Math.random() - 0.5; });
    var content = shuffled.slice(0, Math.min(count, shuffled.length)).map(function(c) { return c.text; }).join('\n');
    mailState.mails.push({ id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), from: 'dream', fromId: dream.id, fromName: dream.name, fromAvatar: dream.avatar || '', toId: 'user', toName: state.profile.name || '我', content: content, sentAt: Date.now(), deliverAt: Date.now(), delivered: true, read: false, isAutoLetter: true });
    saveMailState(); if (pageMailbox && pageMailbox.classList.contains('active')) window.renderMailList();
  }, 3 * 60 * 60 * 1000);

    // ========== 通话核心逻辑 ==========
  function showCallUI(dreamId, isIncoming) {
    var d = dreamState.dreams.find(function(x) { return x.id === dreamId; });
    if (!d) return;
    callState.active = true; callState.isIncoming = isIncoming; callState.targetId = dreamId;
    document.getElementById('callAvatar').style.backgroundImage = d.avatar ? 'url(' + d.avatar + ')' : '';
    document.getElementById('callAvatar').textContent = d.avatar ? '' : (d.name ? d.name.charAt(0) : '梦');
    document.getElementById('callName').textContent = d.name;
    document.getElementById('callStatus').textContent = isIncoming ? '来电中...' : '正在呼叫...';
    document.getElementById('callTimer').classList.remove('show');
    document.getElementById('callTimer').textContent = '00:00';
    document.getElementById('hangupBtn').style.display = 'block';
    document.getElementById('answerBtn').style.display = isIncoming ? 'block' : 'none';
    document.getElementById('callOverlay').classList.add('active');
    document.getElementById('callMini').classList.remove('show');
  }

    window.minimizeCall = function() {
    if (!callState.active) return;
    document.getElementById('callOverlay').classList.remove('active');
    document.getElementById('callMini').classList.add('show');
  };
  window.expandCall = function() {
    if (!callState.active) return;
    document.getElementById('callMini').classList.remove('show');
    document.getElementById('callOverlay').classList.add('active');
  };

    // 悬浮球拖拽逻辑
  (function initCallMiniDrag() {
    var mini = document.getElementById('callMini');
    if (!mini || mini.dataset.dragInit) return;
    mini.dataset.dragInit = '1';
    var isDragging = false, moved = false, startX, startY, startLeft, startTop;
    function getPhone() { return document.querySelector('.phone'); }
    function onStart(e) {
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var rect = mini.getBoundingClientRect();
      var phoneRect = getPhone().getBoundingClientRect();
      startX = clientX; startY = clientY;
      startLeft = rect.left - phoneRect.left;
      startTop = rect.top - phoneRect.top;
      moved = false; isDragging = true;
      mini.style.right = 'auto'; mini.style.bottom = 'auto';
      mini.style.left = startLeft + 'px'; mini.style.top = startTop + 'px';
    }
    function onMove(e) {
      if (!isDragging) return;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var dx = clientX - startX; var dy = clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
      if (!moved) return;
      e.preventDefault();
      mini.style.left = (startLeft + dx) + 'px';
      mini.style.top = (startTop + dy) + 'px';
    }
    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      if (!moved) { window.expandCall(); } // 没拖动，算点击
    }
    mini.addEventListener('touchstart', onStart, { passive: true });
    mini.addEventListener('touchmove', onMove, { passive: false });
    mini.addEventListener('touchend', onEnd);
    mini.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  })();

  window.startCall = function() {
    if (callState.active) return;
    var currentDreamId = dreamState.currentId; if (!currentDreamId) return alert('请先选择一个梦角！');
    showCallUI(currentDreamId, false);
    // 80% 概率接听，20% 概率不接
    var roll = Math.random();
    callState.timeout = setTimeout(function() {
      if (roll < 0.8) { answerCall(); } 
      else if (roll < 0.9) { // 拒接
        document.getElementById('callStatus').textContent = '对方已拒接';
        document.getElementById('hangupBtn').style.display = 'none';
        endCall('rejected'); 
      } else { // 无应答
        document.getElementById('callStatus').textContent = '对方无应答';
        document.getElementById('hangupBtn').style.display = 'none';
        endCall('missed');
      }
    }, 2000 + Math.random() * 2000);
  };

  window.answerCall = function() {
    if (!callState.active) return;
    clearTimeout(callState.timeout);
    callState.isIncoming = false;
    document.getElementById('callStatus').textContent = '通话中';
    document.getElementById('callTimer').classList.add('show');
    document.getElementById('answerBtn').style.display = 'none';
    callState.startTime = Date.now();
    if (callState.timerInterval) clearInterval(callState.timerInterval);
        callState.timerInterval = setInterval(function() {
      var elapsed = Math.floor((Date.now() - callState.startTime) / 1000);
      var m = Math.floor(elapsed / 60); var s = elapsed % 60;
      var timeStr = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      document.getElementById('callTimer').textContent = timeStr;
      document.getElementById('miniTime').textContent = timeStr;
    }, 1000);
  };

  window.hangupCall = function() {
    if (!callState.active) return;
    var duration = callState.startTime ? Math.floor((Date.now() - callState.startTime) / 1000) : 0;
    endCall('answered', duration);
  };

      function endCall(status, duration) {
    clearTimeout(callState.timeout);
    if (callState.timerInterval) clearInterval(callState.timerInterval);
    document.getElementById('callOverlay').classList.remove('active');
    document.getElementById('callMini').classList.remove('show');
    
    var dreamId = callState.targetId;
    var callType = callState.isIncoming ? 'incoming' : 'outgoing';
    
    // 核心修复：任何挂断都保存历史
    if (dreamId) {
       addCallHistory(dreamId, status, callType, duration);
    }
    
    if (status === 'answered' && duration > 0) {
      var m = Math.floor(duration / 60); var s = duration % 60;
      showToast('通话结束，时长 ' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'));
    }
    if (callState.isIncoming && status === 'rejected') {
      showToast('已拒接来电');
    }
    callState.active = false; callState.isIncoming = false; callState.targetId = null;
  }

  function addCallHistory(dreamId, status, callType) {
    var d = dreamState.dreams.find(function(x) { return x.id === dreamId; });
    if (!d) return;
    var dateStr = getDateStr(Date.now());
    if (!historyState[dreamId]) historyState[dreamId] = {};
    if (!historyState[dreamId][dateStr]) historyState[dreamId][dateStr] = [];
    historyState[dreamId][dateStr].push({
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      time: Date.now(),
      type: 'call',
      callType: callType, // 'outgoing' 或 'incoming'
      status: status,     // 'answered', 'missed', 'rejected'
      duration: arguments[3] || 0
    });
    saveHistoryState().then(function() {
      if (pageHistory && pageHistory.classList.contains('active')) renderHistoryList();
    });
  }

  // 梦角主动来电（3%概率，每30分钟检查一次）
  setInterval(function() {
    if (!isDataReady || dreamState.dreams.length === 0) return;
    if (callState.active) return;
    if (Math.random() > 0.03) return;
    var dream = dreamState.dreams[Math.floor(Math.random() * dreamState.dreams.length)];
    if (!dream) return;
    showCallUI(dream.id, true);
    callState.timeout = setTimeout(function() {
      document.getElementById('callStatus').textContent = '未接来电';
      document.getElementById('hangupBtn').style.display = 'none';
      endCall('missed');
    }, 15000);
  }, 30 * 60 * 1000);

    // ========== 历史记录完整补丁包 ==========
  function getDateStr(timestamp) { 
    var d = new Date(timestamp); 
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); 
  }

  function formatTime(timestamp) { 
    var d = new Date(timestamp); 
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); 
  }

  function escapeHtml(s) { 
    if (!s) return ''; 
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); 
  }

  window.saveHistoryRecord = function(dreamId, userInput, cards, usableCards) { 
    var dateStr = getDateStr(Date.now()); 
    if (!historyState[dreamId]) historyState[dreamId] = {}; 
    if (!historyState[dreamId][dateStr]) historyState[dreamId][dateStr] = []; 
    var minDelay = 2 * 60 * 1000; 
    var maxDelay = 2 * 60 * 1000; // 之前改成了2分钟
    var supplementDueAt = Date.now() + Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay; 
    var record = { 
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), 
      time: Date.now(), 
      userInput: userInput, 
      drawnCards: cards, 
      flippedIndex: -1, 
      dreamSupplement: null, 
      supplementDueAt: supplementDueAt, 
      isPoke: false 
    }; 
    historyState[dreamId][dateStr].push(record); 
    saveHistoryState().then(function() { 
      if (pageHistory && pageHistory.classList.contains('active')) window.renderHistoryList(); 
    }).catch(function(e) { 
      console.error('保存历史记录失败', e); 
    }); 
  };

  window.updateHistoryFlipStatus = function(dreamId, roundData) { 
    var dateStr = getDateStr(Date.now()); 
    var records = historyState[dreamId] && historyState[dreamId][dateStr]; 
    if (!records) return; 
    for (var i = records.length - 1; i >= 0; i--) { 
      if (records[i].userInput === roundData.userInput && records[i].flippedIndex === -1) { 
        records[i].flippedIndex = roundData.flippedIndex; 
        saveHistoryState(); 
        break; 
      } 
    } 
  };

  window.initHistoryPage = function() { 
    if (!isDataReady) { 
      document.getElementById('historyListContainer').innerHTML = '<div style="text-align:center;color:var(--gray);padding:40px 20px;">⏳ 数据加载中，请稍候...</div>'; 
      return; 
    } 
    if (!dreamState.currentId) { 
      document.getElementById('historyListContainer').innerHTML = '<div style="text-align:center;color:var(--gray);padding:40px 20px;">请先添加梦角</div>'; 
      return; 
    } 
    historyCurrentDreamId = dreamState.currentId; 
    var today = getDateStr(Date.now()); 
    if (historyState[historyCurrentDreamId] && historyState[historyCurrentDreamId][today]) { 
      historyCurrentDate = today; 
    } else if (historyState[historyCurrentDreamId]) { 
      var dates = Object.keys(historyState[historyCurrentDreamId]).sort().reverse(); 
      if (dates.length > 0) historyCurrentDate = dates[0]; 
      else historyCurrentDate = today; 
    } else { 
      historyCurrentDate = today; 
    } 
    var sel = document.getElementById('historyDreamSelect'); 
    if (sel) {
      sel.innerHTML = dreamState.dreams.map(function(d) { return '<option value="' + d.id + '">' + d.name + '</option>'; }).join(''); 
      sel.value = historyCurrentDreamId; 
    }
    var datePicker = document.getElementById('historyDatePicker'); 
    if (datePicker) datePicker.value = historyCurrentDate; 
    window.exitHistoryEdit(); 
    window.renderHistoryList(); 
  };

  // 补漏：确保本地存储全局变量有默认值
  var historyEditMode = false; 
  var historySelectedIds = []; 
  var historyCurrentDreamId = null; 
  var historyCurrentDate = '';
  
  window.toggleHistoryEditMode = function() { historyEditMode = !historyEditMode; historySelectedIds = []; document.getElementById('historyEditBtn').textContent = historyEditMode ? '完成' : '编辑'; document.getElementById('historyBottomBar').style.display = historyEditMode ? 'flex' : 'none'; window.renderHistoryList(); };
  window.exitHistoryEdit = function() { historyEditMode = false; historySelectedIds = []; document.getElementById('historyEditBtn').textContent = '编辑'; document.getElementById('historyBottomBar').style.display = 'none'; window.renderHistoryList(); };
  window.toggleHistorySelect = function(id) { var idx = historySelectedIds.indexOf(id); if (idx > -1) historySelectedIds.splice(idx, 1); else historySelectedIds.push(id); window.renderHistoryList(); };
  window.historySelectAll = function() { var records = (historyState[historyCurrentDreamId] && historyState[historyCurrentDreamId][historyCurrentDate]) ? historyState[historyCurrentDreamId][historyCurrentDate] : []; if (historySelectedIds.length === records.length) historySelectedIds = []; else historySelectedIds = records.map(function(r) { return r.id; }); window.renderHistoryList(); };
  window.historyDeleteSelected = function() { if (historySelectedIds.length === 0) return alert('请先选择要删除的记录'); if (!confirm('确定删除选中的 ' + historySelectedIds.length + ' 条记录吗？')) return; historyState[historyCurrentDreamId][historyCurrentDate] = historyState[historyCurrentDreamId][historyCurrentDate].filter(function(r) { return historySelectedIds.indexOf(r.id) === -1; }); saveHistoryState(); window.exitHistoryEdit(); alert('已删除'); };
  window.openHistoryCardModal = function(text) { document.getElementById('historyCardModalContent').textContent = text; document.getElementById('historyCardModal').classList.add('show'); };
  window.closeHistoryCardModal = function() { document.getElementById('historyCardModal').classList.remove('show'); };
  
  // 补全自动状态检查和自动补充逻辑，防止它们依赖的变量丢失
  function checkPendingSupplements() { 
    if (!isDataReady) return; 
    var now = Date.now(); 
    var changed = false; 
    var usableCards = cardState.cards.filter(function(c) { if (c.blocked) return false; var cat = cardState.categories.find(function(x) { return x.id === c.cat; }); if (cat && cat.blocked) return false; return true; }); 
    for (var dreamId in historyState) { 
      for (var dateStr in historyState[dreamId]) { 
        var records = historyState[dreamId][dateStr]; 
        records.forEach(function(r) { 
          if (r.isPoke || r.type === 'choice' || r.type === 'call') return; 
          if (r.supplementDueAt && now >= r.supplementDueAt && r.dreamSupplement === null) { 
            if (Math.random() < 0.5 && usableCards.length > 0) { r.dreamSupplement = usableCards[Math.floor(Math.random() * usableCards.length)].text; } 
            else { r.dreamSupplement = ''; } 
            r.supplementDueAt = null; changed = true; 
          } 
        }); 
      } 
    } 
    if (changed) { 
      saveHistoryState(); 
      if (pageHistory && pageHistory.classList.contains('active')) { window.renderHistoryList(); } 
    } 
  }
  if (window.checkPendingSupplementsInterval) clearInterval(window.checkPendingSupplementsInterval);
  window.checkPendingSupplementsInterval = setInterval(checkPendingSupplements, 30 * 1000);
  checkPendingSupplements();

  // 补全日期切换逻辑
  window.onHistoryDreamChange = function() { historyCurrentDreamId = document.getElementById('historyDreamSelect').value; if (!historyState[historyCurrentDreamId]) historyState[historyCurrentDreamId] = {}; var dates = Object.keys(historyState[historyCurrentDreamId]).sort().reverse(); historyCurrentDate = dates.length > 0 ? dates[0] : getDateStr(Date.now()); document.getElementById('historyDatePicker').value = historyCurrentDate; window.renderHistoryList(); };
  window.onHistoryDateChange = function() { var val = document.getElementById('historyDatePicker').value; if (val) { historyCurrentDate = val; window.renderHistoryList(); } };

  // ========== 设置页面核心逻辑 ==========
  window.saveDelaySetting = function() {
    var minV = parseFloat(document.getElementById('settingMinDelay').value) || 1.2;
    var maxV = parseFloat(document.getElementById('settingMaxDelay').value) || 1.2;
    if (minV < 0.1) minV = 0.1; if (maxV < minV) maxV = minV;
    appSettings.minDelay = minV; appSettings.maxDelay = maxV;
    saveAppSettings();
    document.getElementById('settingMinDelay').value = minV;
    document.getElementById('settingMaxDelay').value = maxV;
    showToast('延迟设置已保存');
  };

  window.navigateToSettings = function() {
    var minEl = document.getElementById('settingMinDelay'); if (minEl) minEl.value = appSettings.minDelay;
    var maxEl = document.getElementById('settingMaxDelay'); if (maxEl) maxEl.value = appSettings.maxDelay;
    window.navigateTo('pageSettings');
  };

  window.backupData = function() {
    var data = {
      cards: cardState, statuses: statusState, dreams: dreamState,
      history: historyState, chatRound: chatRoundState, secrets: secretState,
      pokes: pokeState, diaries: diaryState, mails: mailState,
      settings: appSettings
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '小纸条_备份_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('备份文件已下载');
  };

  window.restoreData = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        var promises = [];
        if (data.cards) promises.push(dbSet('passANoteCards', data.cards));
        if (data.statuses) promises.push(dbSet('passANoteStatuses', data.statuses));
        if (data.dreams) promises.push(dbSet('passANoteDreams', data.dreams));
        if (data.history) promises.push(dbSet('passANoteHistory', data.history));
        if (data.chatRound) promises.push(dbSet('passANoteChatRound', data.chatRound));
        if (data.secrets) promises.push(dbSet('passANoteSecrets', data.secrets));
        if (data.pokes) promises.push(dbSet('passANotePokes', data.pokes));
        if (data.diaries) promises.push(dbSet('passANoteDiaries', data.diaries));
        if (data.mails) promises.push(dbSet('passANoteMails', data.mails));
        if (data.settings) { appSettings = data.settings; saveAppSettings(); }
        
        Promise.all(promises).then(function() {
          alert('数据已成功导入，页面即将刷新');
          location.reload();
        }).catch(function(err) { alert('导入失败：' + err.message); });
      } catch(err) { alert('文件解析失败，请确认是有效的备份文件'); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  window.clearAllData = function() {
    if (!confirm('确定清除所有数据吗？\n包括字卡、状态、梦角、历史记录等全部内容。\n\n此操作不可恢复！')) return;
    if (!confirm('再次确认：真的要清除吗？')) return;
    indexedDB.deleteDatabase('PassANoteDB');
    try { localStorage.clear(); } catch(e) {}
    setTimeout(function() { location.reload(); }, 300);
  };

    // ========== 美化核心逻辑 ==========
  var ICON_KEYS = [
    { id: 'secretCodeBtn', name: '暗号' }, { id: 'pokeBtn', name: '拍一拍' }, { id: 'choiceBtn', name: '抉择' },
    { id: 'callBtn', name: '通话' }, { id: 'tarotBtn', name: '感知' }, { id: 'diaryBtn', name: '日记' },
    { id: 'mailBtn', name: '信箱' }, { id: 'openCardPanelBtn', name: '字卡' }, { id: 'settingsBtn', name: '设置' },
    { id: 'beautifyBtn', name: '美化' }, { id: 'dreamRoleBtn', name: '梦角' }
  ];

    window.saveBeautifySettingsFromUI = function() {
    saveBeautifySettings();
    showToast('美化设置已保存');
  };

  window.resetBeautifySettingsFromUI = function() {
    if (!confirm('确定恢复默认美化设置吗？\n所有自定义背景、纸条、图标、颜色都会恢复初始状态。')) return;
    beautifySettings = { homeBg: null, paperBg: null, icons: {}, fontColor: '', fontSize: 14, themeColor: '#007aff' };
    saveBeautifySettings();
    applyBeautifyStyles();
    window.renderBeautifyPage();
    showToast('已恢复默认美化设置');
  };

  window.renderBeautifyPage = function() {
    var list = document.getElementById('iconCustomList'); if (!list) return;
    list.innerHTML = ICON_KEYS.map(function(item) {
      var preview = beautifySettings.icons[item.id];
      return '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:13px;width:50px;">' + item.name + '</span>' +
        '<button class="btn-black" style="flex:1; background: var(--card); color: var(--text); border: 1px solid var(--border);" onclick="document.getElementById(\'iconInput_' + item.id + '\').click()">选择图片</button>' +
        (preview ? '<button class="btn-black" style="width:50px; background: var(--card); color: var(--text); border: 1px solid var(--border);" onclick="resetIcon(\'' + item.id + '\')">清除</button>' : '') +
        '<input type="file" id="iconInput_' + item.id + '" accept="image/*" style="display:none" onchange="handleIconUpload(event, \'' + item.id + '\')">' +
        '</div>';
    }).join('');
    document.getElementById('beautifyFontColor').value = beautifySettings.fontColor || '#1d1d1f';
    document.getElementById('beautifyFontSize').value = beautifySettings.fontSize || 14;
    document.getElementById('beautifyFontSizeVal').textContent = beautifySettings.fontSize || 14;
    document.getElementById('beautifyThemeColor').value = beautifySettings.themeColor || '#007aff';
  };

  window.applyFontColor = function(color) { beautifySettings.fontColor = color; saveBeautifySettings(); applyBeautifyStyles(); };
  window.applyFontSize = function(size) { beautifySettings.fontSize = size; document.getElementById('beautifyFontSizeVal').textContent = size; saveBeautifySettings(); applyBeautifyStyles(); };
  window.applyThemeColor = function(color) { beautifySettings.themeColor = color; saveBeautifySettings(); applyBeautifyStyles(); };

  window.resetHomeBg = function() { beautifySettings.homeBg = null; saveBeautifySettings(); applyBeautifyStyles(); };
  window.resetPaperBg = function() { beautifySettings.paperBg = null; saveBeautifySettings(); applyBeautifyStyles(); };
  window.resetIcon = function(id) { delete beautifySettings.icons[id]; saveBeautifySettings(); applyBeautifyStyles(); window.renderBeautifyPage(); };

  function compressImage(file, callback) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas'); var MAX = 200; var w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h; var ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  window.handleBeautifyHomeBg = function(e) { var file = e.target.files[0]; if (!file) return; compressImage(file, function(data) { beautifySettings.homeBg = data; saveBeautifySettings(); applyBeautifyStyles(); }); e.target.value = ''; };
  window.handleBeautifyPaper = function(e) { var file = e.target.files[0]; if (!file) return; compressImage(file, function(data) { beautifySettings.paperBg = data; saveBeautifySettings(); applyBeautifyStyles(); }); e.target.value = ''; };
  window.handleIconUpload = function(e, id) { var file = e.target.files[0]; if (!file) return; compressImage(file, function(data) { beautifySettings.icons[id] = data; saveBeautifySettings(); applyBeautifyStyles(); window.renderBeautifyPage(); }); e.target.value = ''; };

  function applyBeautifyStyles() {
    // 1. 字体颜色
    var fontColor = beautifySettings.fontColor || '';
    if (fontColor) {
      document.documentElement.style.setProperty('--global-font-color', fontColor);
      document.documentElement.style.setProperty('--text', fontColor);
    } else {
      document.documentElement.style.setProperty('--global-font-color', '');
      document.documentElement.style.setProperty('--text', document.body.classList.contains('dark') ? '#f5f5f7' : '#1d1d1f');
    }

    // 2. 字体大小（全局强制缩放）
    var fontSize = beautifySettings.fontSize || 14;
    var scale = fontSize / 14;
    var phoneEl = document.querySelector('.phone');
    if (phoneEl) {
      phoneEl.style.fontSize = fontSize + 'px';
      var allEls = phoneEl.querySelectorAll('*');
      allEls.forEach(function(el) {
        if (!el.dataset.origFs) {
          var fs = parseFloat(window.getComputedStyle(el).fontSize);
          if (fs > 0 && !isNaN(fs)) el.dataset.origFs = fs;
        }
        if (el.dataset.origFs) {
          el.style.fontSize = (parseFloat(el.dataset.origFs) * scale).toFixed(1) + 'px';
        }
      });
    }

    // 3. 主题颜色
    var themeColor = beautifySettings.themeColor || '#007aff';
    document.documentElement.style.setProperty('--blue', themeColor);
    document.documentElement.style.setProperty('--theme-color', themeColor);
    document.documentElement.style.setProperty('--btn-dark', themeColor);

    // 4. 主页背景
    var mainEl = document.getElementById('screenMain');
    if (mainEl) {
      if (beautifySettings.homeBg) mainEl.style.background = 'url(' + beautifySettings.homeBg + ') center/cover no-repeat';
      else mainEl.style.background = '';
    }

    // 5. 纸条背景
    var paperBacks = document.querySelectorAll('.paper-back');
    paperBacks.forEach(function(el) {
      if (beautifySettings.paperBg) {
        el.style.background = 'url(' + beautifySettings.paperBg + ') center/cover no-repeat';
        el.style.color = 'transparent';
      } else {
        el.style.background = '';
        el.style.color = '';
      }
    });

    // 6. 图标自定义
    ICON_KEYS.forEach(function(item) {
      var btn = document.getElementById(item.id);
      if (!btn) return;
      var svg = btn.querySelector('svg');
      var img = btn.querySelector('.custom-icon-img');
      if (beautifySettings.icons[item.id]) {
        if (!img) { img = document.createElement('img'); img.className = 'custom-icon-img'; img.style.width = '20px'; img.style.height = '20px'; img.style.objectFit = 'contain'; btn.appendChild(img); }
        img.src = beautifySettings.icons[item.id];
        if (svg) svg.style.display = 'none';
      } else {
        if (img) img.remove();
        if (svg) svg.style.display = '';
      }
    });
  }

  if (Notification && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ========== 长按消息菜单 ==========
window.openMsgMenu = function(msgId, role, bubbleEl) {
  window._menuMsgId = msgId;
  window._menuMsgRole = role;
  var menu = document.getElementById('msgMenu');
  var recallEl = document.getElementById('msgMenuRecall');
  if (!menu) return;
  if (recallEl) recallEl.style.display = (role === 'user') ? 'block' : 'none';

  // 先隐藏测量大小
  menu.style.visibility = 'hidden';
  menu.classList.add('show');

  var phone = document.querySelector('.phone');
  var phoneRect = phone.getBoundingClientRect();
  var bubbleRect = bubbleEl.getBoundingClientRect();
  var menuRect = menu.getBoundingClientRect();

  var left = bubbleRect.left - phoneRect.left + bubbleRect.width / 2 - menuRect.width / 2;
  var top = bubbleRect.top - phoneRect.top - menuRect.height - 8;

  if (left < 8) left = 8;
  if (left + menuRect.width > phoneRect.width - 8) left = phoneRect.width - menuRect.width - 8;
  if (top < 8) top = bubbleRect.bottom - phoneRect.top + 8;

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = 'visible';

  // 防止长按后的 click 立刻关闭菜单
  window._suppressClickUntil = Date.now() + 400;
};

window.closeMsgMenu = function() {
  var menu = document.getElementById('msgMenu');
  if (menu) menu.classList.remove('show');
  window._menuMsgId = null;
  window._menuMsgRole = null;
};

window.deleteMessage = function(msgId) {
  var dreamId = dreamState.currentId;
  if (!dreamId || !chatState.messages[dreamId]) return;
  chatState.messages[dreamId] = chatState.messages[dreamId].filter(function(m) {
    return m.id !== msgId;
  });
  saveChatMessages();
  window.renderChatMessages();
};

window.recallMessage = function(msgId) {
  var dreamId = dreamState.currentId;
  if (!dreamId || !chatState.messages[dreamId]) return;
  var msg = chatState.messages[dreamId].find(function(m) { return m.id === msgId; });
  if (!msg) return;
  if (msg.role !== 'user') return;
  if (msg.recalled) return;
  msg.recalled = true;
  msg.text = '「你 撤回了一条消息」';
  msg.quote = null;
  saveChatMessages();
  window.renderChatMessages();
};

window.quoteMessage = function(msgId) {
  var dreamId = dreamState.currentId;
  if (!dreamId || !chatState.messages[dreamId]) return;
  var msg = chatState.messages[dreamId].find(function(m) { return m.id === msgId; });
  if (!msg) return;
  window._pendingQuote = msg.text;
  var input = document.getElementById('chatInput2');
  if (input) {
    input.placeholder = '引用：' + msg.text.slice(0, 20) + (msg.text.length > 20 ? '...' : '');
    input.focus();
  }
};

// 长按绑定
window.bindMessageLongPress = function() {
  var container = document.getElementById('chatMessages');
  if (!container || container.dataset.lpInit) return;
  container.dataset.lpInit = '1';
  var pressTimer = null;
  var menuOpened = false;

  function start(e) {
    var bubble = e.target.closest('.chat-bubble');
    if (!bubble) return;
    var msgId = bubble.dataset.msgId;
    var role = bubble.dataset.msgRole;
    if (!msgId) return;
    if (pressTimer) clearTimeout(pressTimer);
    menuOpened = false;
    pressTimer = setTimeout(function() {
      window.openMsgMenu(msgId, role, bubble);
      menuOpened = true;
      pressTimer = null;
    }, 500);
  }

  function end() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    // 菜单刚弹出时，松手后 500ms 内的 click 全部忽略
    if (menuOpened) {
      window._suppressClickUntil = Date.now() + 500;
      menuOpened = false;
    }
  }

  container.addEventListener('touchstart', start, { passive: true });
  container.addEventListener('mousedown', start);
  container.addEventListener('touchend', end);
  container.addEventListener('mouseup', end);
  container.addEventListener('touchmove', function() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  });
  container.addEventListener('mouseleave', function() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  });
};

// 菜单项点击
document.addEventListener('click', function(e) {
  var item = e.target.closest('.msg-menu-item');
  if (!item) return;
  e.stopPropagation();
  var action = item.dataset.action;
  var msgId = window._menuMsgId;
  if (!msgId) return;
  window.closeMsgMenu();
  if (action === 'quote') window.quoteMessage(msgId);
  else if (action === 'delete') window.deleteMessage(msgId);
  else if (action === 'recall') window.recallMessage(msgId);
});

// 点击空白关闭菜单
document.addEventListener('click', function(e) {
  if (Date.now() < (window._suppressClickUntil || 0)) return;
  var menu = document.getElementById('msgMenu');
  if (!menu || !menu.classList.contains('show')) return;
  if (menu.contains(e.target)) return;
  window.closeMsgMenu();
}, true);

// ========== 语音消息 ==========
var voiceState = {
  recording: false,
  mediaRecorder: null,
  chunks: [],
  startTime: 0,
  audioData: null,
  audioDuration: 0,
  audioMime: ''
};

window.toggleVoice = function() {
  var dreamId = dreamState.currentId;
  if (!dreamId) return alert('请先选择一个梦角！');
  var btn = document.getElementById('chatVoiceBtn');

  if (!voiceState.recording) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return alert('当前浏览器不支持录音');
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      var mr = new MediaRecorder(stream);
      voiceState.mediaRecorder = mr;
      voiceState.chunks = [];
      voiceState.startTime = Date.now();
      voiceState.recording = true;
      voiceState.audioMime = mr.mimeType || 'audio/webm';

      mr.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) voiceState.chunks.push(e.data);
      };
      mr.onstop = function() {
        var blob = new Blob(voiceState.chunks, { type: voiceState.audioMime });
        var reader = new FileReader();
        reader.onload = function(ev) {
          voiceState.audioData = ev.target.result;
          voiceState.audioDuration = Math.max(1, Math.round((Date.now() - voiceState.startTime) / 1000));
          showToast('录音完成 ' + voiceState.audioDuration + ' 秒，点发送发出去');
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(function(t) { t.stop(); });
      };
      mr.start();
      if (btn) btn.classList.add('recording');
      showToast('正在录音，再点一下结束');
    }).catch(function(err) {
      alert('无法录音：' + err.message);
    });
  } else {
    voiceState.recording = false;
    if (btn) btn.classList.remove('recording');
    if (voiceState.mediaRecorder) voiceState.mediaRecorder.stop();
  }
};

window.playVoiceMessage = function(msgId) {
  var dreamId = dreamState.currentId;
  if (!dreamId || !chatState.messages[dreamId]) return;
  var msg = chatState.messages[dreamId].find(function(m) { return m.id === msgId; });
  if (!msg || !msg.audioData) return;
  var audio = new Audio(msg.audioData);
  audio.play();
};

// ========== 聊天副页面核心补全 ==========
window.openChatPlus = function() {
  var mask = document.getElementById('chatPlusMask');
  if (mask) mask.classList.add('show');
};

window.closeChatPlus = function() {
  var mask = document.getElementById('chatPlusMask');
  if (mask) mask.classList.remove('show');
};

window.chatPlusAction = function(type) {
  window.closeChatPlus();
  if (type === 'secret') window.navigateTo('pageSecretCode');
  if (type === 'poke') window.navigateTo('pagePokes');
  if (type === 'choice') window.openChoiceModal();
  if (type === 'call') window.startCall();
  if (type === 'modeToggle') {
    var btn = document.getElementById('modeToggle');
    if (btn) btn.click();
  }
};

window.openChatSettings = function() {
  window.navigateTo('pageChatSettings');
  var minEl = document.getElementById('chatMinDelay');
  if (minEl) minEl.value = chatSettings.minDelay;
  var maxEl = document.getElementById('chatMaxDelay');
  if (maxEl) maxEl.value = chatSettings.maxDelay;
  var ignoreEl = document.getElementById('chatIgnoreRead');
  if (ignoreEl) ignoreEl.checked = !!chatSettings.ignoreRead;
  var quoteEl = document.getElementById('chatQuoteEnabled');
  if (quoteEl) quoteEl.checked = !!chatSettings.quoteEnabled;
  var cardMinEl = document.getElementById('chatCardMin');
  if (cardMinEl) cardMinEl.value = chatSettings.cardMin;
  var cardMaxEl = document.getElementById('chatCardMax');
  if (cardMaxEl) cardMaxEl.value = chatSettings.cardMax;
  var activeEl = document.getElementById('chatActiveMinutes');
  if (activeEl) activeEl.value = chatSettings.activeMinutes;
  var pushEl = document.getElementById('chatPushEnabled');
  if (pushEl) pushEl.checked = !!chatSettings.pushEnabled;
  var cssEl = document.getElementById('bubbleCssTextarea');
  if (cssEl) cssEl.value = chatSettings.bubbleCss || '';
};

window.closeChatSettings = function() {
  window.navigateTo('screenChat');
};

// 补上缺失的保存函数
function saveChatMessages() { return dbSet('passANoteChatMessages', chatState.messages); }
function saveChatSettingsToDB() { return dbSet('passANoteChatSettings', chatSettings); }

  // ========== 内置歌单 ==========
var BUILTIN_SONGS = [
  {
    name: 'shut up My Moms Calling (stereophony)',
    artist: 'TiTi',
    cover: 'https://p1.music.126.net/MOVXSsnR9TLPrto25FZ6-Q==/109951173114466125.jpg?param=500y500',
    url: 'https://music.163.com/song/media/outer/url?id=3374262801.mp3'
  }
  // 如果你想加第二首，在第一首的大括号后面加一个英文逗号 ","，然后粘贴另一首歌的结构
];
// ===============================

  // ====== 传歌模式（内置歌单版） ======
  var input2 = document.getElementById('tarotInput');
  if (!input2) return;
  var text2 = input2.value.trim();
  if (!text2) return;

  // 检查内置歌单是否为空
  if (typeof BUILTIN_SONGS === 'undefined' || !BUILTIN_SONGS || BUILTIN_SONGS.length === 0) {
    return alert('内置歌单还没有配置，请去 main.js 里配置 BUILTIN_SONGS');
  }

  input2.value = '';

  var lyricsEl = document.getElementById('lyricsContainer');
  var lyricsContent = document.getElementById('lyricsContent');
  var vinylWrapper = document.getElementById('vinylWrapper');
  var progressWrapper = document.getElementById('progressWrapper');
  if (vinylWrapper) vinylWrapper.style.display = 'none';
  if (progressWrapper) progressWrapper.style.display = 'none';
  if (lyricsEl) lyricsEl.style.display = 'block';
  var songPromptEl = document.getElementById('songPrompt');
  if (songPromptEl) songPromptEl.innerHTML = '你说：<span>' + escapeHtml(text2) + '</span>';
  if (lyricsContent) lyricsContent.innerHTML = '<div style="text-align:center; padding:40px; font-size:13px; color:var(--gray);"><svg class="spinner" viewBox="0 0 50 50" style="width:30px; height:30px;"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle></svg><div style="margin-top:10px;">正在抽取歌曲中……</div></div>';

  // 假装等待 2-5 秒
  var delay2 = 2000 + Math.random() * 3000;
  setTimeout(function() {
    // 从内置歌单随机抽一首
    var randomTrack = BUILTIN_SONGS[Math.floor(Math.random() * BUILTIN_SONGS.length)];
    songState.currentSong = randomTrack;

    if (vinylWrapper) vinylWrapper.style.display = 'flex';
    if (progressWrapper) progressWrapper.style.display = 'flex';
    var coverEl = document.getElementById('vinylCover');
    if (coverEl) coverEl.style.backgroundImage = 'url(' + randomTrack.cover + ')';

    // 直接播放内置链接
    songState.audio.src = randomTrack.url;
    songState.audio.onloadedmetadata = function() {
      var duration = songState.audio.duration || 0;
      var randomTime = Math.random() * duration * 0.8;
      songState.audio.currentTime = randomTime;
      songState.audio.pause();
      updateProgressUI();
      showToast('抽到了：' + randomTrack.name + ' - ' + randomTrack.artist);
    };
    songState.audio.ontimeupdate = updateProgressUI;
    songState.audio.onended = function() {
      var disc = document.getElementById('vinylDisc');
      if (disc) disc.style.animationPlayState = 'paused';
      songState.isPlaying = false;
    };
    // 既然没歌词，把歌词区清空
    if (lyricsContent) lyricsContent.innerHTML = '<div style="text-align:center; padding:40px; font-size:13px; color:var(--gray);">暂无歌词，点击播放欣赏</div>';
  }, delay2);
};

  // ====== 传歌模式 ======
  var input2 = document.getElementById('tarotInput');
  if (!input2) return;
  var text2 = input2.value.trim();
  if (!text2) return;
  if (!songState.playlistId || !songState.playlist) {
    return alert('请先点击顶部设置一个公开歌单');
  }
  input2.value = '';

  var lyricsEl = document.getElementById('lyricsContainer');
  var lyricsContent = document.getElementById('lyricsContent');
  var vinylWrapper = document.getElementById('vinylWrapper');
  var progressWrapper = document.getElementById('progressWrapper');
  if (vinylWrapper) vinylWrapper.style.display = 'none';
  if (progressWrapper) progressWrapper.style.display = 'none';
  if (lyricsEl) lyricsEl.style.display = 'block';
    var songPromptEl = document.getElementById('songPrompt');
  if (songPromptEl) songPromptEl.innerHTML = '你说：<span>' + escapeHtml(text2) + '</span>';
  if (lyricsContent) lyricsContent.innerHTML = '<div style="text-align:center; padding:40px; font-size:13px; color:var(--gray);"><svg class="spinner" viewBox="0 0 50 50" style="width:30px; height:30px;"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle></svg><div style="margin-top:10px;">正在抽取歌曲中……</div></div>';

  var delay2 = 8000 + Math.random() * 22000;
  setTimeout(async function() {
    var tracks = songState.playlist.tracks;
    if (!tracks || tracks.length === 0) return alert('这个歌单里没有歌');
    var randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    songState.currentSong = randomTrack;

    if (vinylWrapper) vinylWrapper.style.display = 'flex';
    if (progressWrapper) progressWrapper.style.display = 'flex';
    var coverEl = document.getElementById('vinylCover');
    if (coverEl) coverEl.style.backgroundImage = 'url(' + randomTrack.al.picUrl + ')';

    // 歌词
    try {
      const lrcRes = await fetch(`${API_BASE}/lyric?id=${randomTrack.id}&timestamp=${Date.now()}`);
      const lrcData = await lrcRes.json();
      songState.lyrics = parseLrc(lrcData.lrc ? lrcData.lrc.lyric : '');
      renderLyrics();
    } catch (e) { songState.lyrics = []; renderLyrics(); }

    // 播放链接
    try {
      const urlRes = await fetch(`${API_BASE}/song/url/v1?id=${randomTrack.id}&level=exhigh&timestamp=${Date.now()}`);
      const urlData = await urlRes.json();
      var songUrl = urlData.data && urlData.data[0] ? urlData.data[0].url : null;
      if (!songUrl) songUrl = 'https://music.163.com/song/media/outer/url?id=' + randomTrack.id + '.mp3';
      // 直接用网易云的通用外链（HTTPS），绕开 API 返回的 http 音频
var fallbackUrl = 'https://music.163.com/song/media/outer/url?id=' + randomTrack.id + '.mp3';
songState.audio.src = fallbackUrl;
      songState.audio.src = songUrl;
      songState.audio.onloadedmetadata = function() {
        var duration = songState.audio.duration || 0;
        var randomTime = Math.random() * duration * 0.8;
        songState.audio.currentTime = randomTime;
        songState.audio.pause();
        updateProgressUI();
        showToast('抽到了：' + randomTrack.name);
      };
      songState.audio.ontimeupdate = updateProgressUI;
      songState.audio.onended = function() {
        var disc = document.getElementById('vinylDisc');
        if (disc) disc.style.animationPlayState = 'paused';
        songState.isPlaying = false;
      };
    } catch (e) {
      showToast('获取歌曲链接失败');
    }
  }, delay2);
};

// --- 歌词解析 ---
function parseLrc(lrc) {
  var lines = lrc.split('\n');
  var result = [];
  var timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  lines.forEach(function(line) {
    var match = timeReg.exec(line);
    if (match) {
      var min = parseInt(match[1]);
      var sec = parseInt(match[2]);
      var ms = parseInt(match[3]);
      var time = min * 60 + sec + ms / 1000;
      var text = line.replace(timeReg, '').trim();
      if (text) result.push({ time: time, text: text });
    }
  });
  return result;
}

function renderLyrics() {
  var container = document.getElementById('lyricsContent');
  if (!container) return;
  if (songState.lyrics.length === 0) {
    container.innerHTML = '暂无歌词';
    return;
  }
  var html = '';
  songState.lyrics.forEach(function(line, index) {
    html += '<div class="lyric-line" data-index="' + index + '" data-time="' + line.time + '">' + line.text + '</div>';
  });
  container.innerHTML = html;
}

function updateProgressUI() {
  var audio = songState.audio;
  var duration = audio.duration || 0;
  var current = audio.currentTime || 0;
  var bar = document.getElementById('progressBar');
  var ct = document.getElementById('currentTime');
  var tt = document.getElementById('totalTime');
  if (bar) bar.value = duration ? (current / duration) * 100 : 0;
  if (ct) ct.textContent = formatTime(current);
  if (tt) tt.textContent = formatTime(duration);
  if (songState.lyrics.length > 0) {
    var lines = document.querySelectorAll('.lyric-line');
    var activeIndex = -1;
    for (var i = 0; i < songState.lyrics.length; i++) {
      if (current >= songState.lyrics[i].time) activeIndex = i;
      else break;
    }
    if (activeIndex >= 0) {
      lines.forEach(function(l) { l.classList.remove('active-line'); });
      var al = lines[activeIndex];
      if (al) { al.classList.add('active-line'); al.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  }
}

function formatTime(sec) {
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

window.togglePlay = function() {
  var disc = document.getElementById('vinylDisc');
  if (songState.isPlaying) {
    songState.audio.pause();
    if (disc) disc.style.animationPlayState = 'paused';
    songState.isPlaying = false;
  } else {
    songState.audio.play();
    if (disc) disc.style.animationPlayState = 'running';
    songState.isPlaying = true;
  }
};

window.seekSong = function(val) {
  var duration = songState.audio.duration || 0;
  songState.audio.currentTime = (val / 100) * duration;
  updateProgressUI();
};

  function sendBackgroundNotification(title, body) {
  // 如果网页在前台，就不弹系统通知了，免得吵到用户
  if (!document.hidden) return;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'show-notification',
      title: title,
      body: body
    });
  } else if (Notification && Notification.permission === 'granted') {
    // 降级方案：如果不支持 SW，退回原来的写法
    new Notification(title, { body: body });
  }
}

  function sendNotification(title, body) {
  // 推送开关关了就跳过
  if (!chatSettings || !chatSettings.pushEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // 如果你正在跟这个梦角聊天，就不弹了
  var sc = document.getElementById('screenChat');
  if (sc && sc.classList.contains('active') && dreamState.currentId) {
    var cur = dreamState.dreams.find(function(d) { return d.id === dreamState.currentId; });
    if (cur && cur.name === title) return;
  }

  var options = {
    body: body,
    icon: './icon.png',
    badge: './icon.png',
    tag: 'dream-' + Date.now(),
    vibrate: [200, 100, 200],
    data: { url: './' }
  };

  // 核心：通过 Service Worker 弹通知（移动端必须）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(function(reg) {
      reg.showNotification(title, options);
    }).catch(function() {
      fallbackNotification(title, options);
    });
  } else {
    fallbackNotification(title, options);
  }
}

function fallbackNotification(title, options) {
  try {
    var n = new Notification(title, options);
    setTimeout(function() { n.close(); }, 5000);
  } catch(e) {}
}

    console.log('小纸条初始化完毕，所有按钮绑定完成！');
});
