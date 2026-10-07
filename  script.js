document.addEventListener('DOMContentLoaded', function() {
  console.log('小纸条 JS 成功加载并开始运行！');

  var screenMain = document.getElementById('screenMain');
  var screenChat = document.getElementById('screenChat');
  var modeToggle = document.getElementById('modeToggle');
  var switchModeBtn = document.getElementById('switchModeBtn');

  var ICON_SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.93" y2="6.93"/><line x1="17.07" y1="17.07" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.93" y2="17.07"/><line x1="17.07" y1="6.93" x2="19.07" y2="4.93"/></svg>';
  var ICON_MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  // 深浅模式切换
  var isDark = false;
  try { isDark = localStorage.getItem('theme') === 'dark'; } catch(e) {}
  if (isDark) { document.body.classList.add('dark'); if (modeToggle) modeToggle.innerHTML = ICON_MOON; } 
  else { if (modeToggle) modeToggle.innerHTML = ICON_SUN; }

  if (modeToggle) {
    modeToggle.addEventListener('click', function() {
      isDark = !isDark;
      if (isDark) { document.body.classList.add('dark'); modeToggle.innerHTML = ICON_MOON; try { localStorage.setItem('theme', 'dark'); } catch(e) {} } 
      else { document.body.classList.remove('dark'); modeToggle.innerHTML = ICON_SUN; try { localStorage.setItem('theme', 'light'); } catch(e) {} }
    });
  }

  // 切换到聊天模式
  if (switchModeBtn) {
    switchModeBtn.addEventListener('click', function() {
      if (screenMain) screenMain.classList.remove('active');
      if (screenChat) screenChat.classList.add('active');
    });
  }

  // ========== 字卡数据逻辑 ==========
  var cardState = {
    categories: [{ id: 'default', name: '默认', collapsed: false, blocked: false }],
    cards: [
      { id: 'c1', text: '今天天气真好呀。', cat: 'default', blocked: false },
      { id: 'c2', text: '要不要一起去散步？', cat: 'default', blocked: false },
      { id: 'c3', text: '我有点想你了。', cat: 'default', blocked: false },
      { id: 'c4', text: '记得按时吃饭哦。', cat: 'default', blocked: false }
    ]
  };

  try {
    var savedCardState = localStorage.getItem('passANoteCards');
    if (savedCardState) cardState = JSON.parse(savedCardState);
  } catch(e) {}

  function saveCardState() {
    try { localStorage.setItem('passANoteCards', JSON.stringify(cardState)); } catch(e) {}
  }

  var openCardPanelBtn = document.getElementById('openCardPanelBtn');
  if (openCardPanelBtn) {
    openCardPanelBtn.addEventListener('click', function() {
      document.getElementById('cardPanel').classList.add('open');
      window.drawRandomCard();
    });
  }

  window.closeCardPanel = function() { document.getElementById('cardPanel').classList.remove('open'); };
  window.showManageCards = function() {
    window.closeCardPanel();
    window.renderCardManager();
    document.getElementById('cardManager').classList.add('open');
  };
  window.closeCardManager = function() { document.getElementById('cardManager').classList.remove('open'); };

  window.drawRandomCard = function() {
    var usableCards = cardState.cards.filter(function(c) {
      if (c.blocked) return false;
      var cat = cardState.categories.find(function(x) { return x.id === c.cat; });
      if (cat && cat.blocked) return false;
      return true;
    });
    var contentEl = document.getElementById('cardContent');
    if (!contentEl) return;
    if (usableCards.length === 0) {
      contentEl.textContent = '没有可用的字卡，去“管理”里添加或开启一些吧。';
      return;
    }
    var randomIndex = Math.floor(Math.random() * usableCards.length);
    contentEl.textContent = usableCards[randomIndex].text;
  };

  var currentSearchTerm = '';
  window.renderCardManager = function() {
    var container = document.getElementById('cardListContainer');
    if (!container) return;
    var html = '';

    if (currentSearchTerm) {
      var matched = cardState.cards.filter(function(c) { return c.text.indexOf(currentSearchTerm) > -1; });
      if (matched.length === 0) {
        html = '<div style="text-align:center;color:var(--gray);padding:20px;font-size:13px;">没有找到包含「' + currentSearchTerm + '」的字卡</div>';
      } else {
        html = '<div style="font-size:12px;color:var(--gray);margin-bottom:8px;">找到 ' + matched.length + ' 条</div>';
        matched.forEach(function(c) { html += window.renderSingleCardHtml(c); });
      }
      container.innerHTML = html;
      return;
    }

    cardState.categories.forEach(function(cat) {
      var catCards = cardState.cards.filter(function(c) { return c.cat === cat.id; });
      var isCollapsed = cat.collapsed ? 'hidden' : '';
      
      var blockSvg = cat.blocked 
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' 
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      
      var delSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="event.stopPropagation();window.deleteCategory(\'' + cat.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

      html += '<div class="category-group">';
      html += '<div class="category-header" onclick="window.toggleCategory(\'' + cat.id + '\')">';
      html += '<span class="category-title">' + cat.name + '（' + catCards.length + '）</span>';
      html += '<div class="category-actions">';
      html += '<span onclick="event.stopPropagation();window.toggleBlockCategory(\'' + cat.id + '\')" style="cursor:pointer;color:var(--gray);">' + blockSvg + '</span>';
      html += delSvg;
      html += '<span class="arrow" style="transform:rotate(' + (cat.collapsed ? '-90deg' : '0deg') + ');transition:transform 0.2s;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
      html += '</div></div>';
      html += '<div class="category-body ' + isCollapsed + '">';
      if (catCards.length === 0) {
        html += '<div style="font-size:12px;color:var(--gray);padding:4px 0;">暂无字卡</div>';
      } else {
        catCards.forEach(function(c) { html += window.renderSingleCardHtml(c); });
      }
      html += '</div></div>';
    });
    container.innerHTML = html;
  };

  window.renderSingleCardHtml = function(c) {
    var editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="window.editCard(\'' + c.id + '\')"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="window.deleteCard(\'' + c.id + '\')"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    var blockSvg = c.blocked 
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="window.toggleBlockCard(\'' + c.id + '\')"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" onclick="window.toggleBlockCard(\'' + c.id + '\')"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';

    return '<div class="card-item ' + (c.blocked ? 'blocked' : '') + '">' +
           '<div class="card-item-text">' + c.text + '</div>' +
           '<div class="card-item-actions">' +
           '<span style="color:var(--gray);">' + blockSvg + '</span>' +
           '<span style="color:var(--gray);">' + editSvg + '</span>' +
           '<span class="delete-icon" style="color:var(--gray);">' + delSvg + '</span>' +
           '</div></div>';
  };

  window.toggleCategory = function(catId) {
    var cat = cardState.categories.find(function(c) { return c.id === catId; });
    if (cat) { cat.collapsed = !cat.collapsed; saveCardState(); window.renderCardManager(); }
  };
  window.addCategoryPrompt = function() {
    var name = prompt('输入分类名称：');
    if (!name || name.trim() === '') return;
    cardState.categories.push({ id: 'cat_' + Date.now(), name: name.trim(), collapsed: false, blocked: false });
    saveCardState(); window.renderCardManager();
  };
  window.deleteCategory = function(catId) {
    if (!confirm('删除此分类及其所有字卡？此操作不可恢复！')) return;
    cardState.cards = cardState.cards.filter(function(c) { return c.cat !== catId; });
    cardState.categories = cardState.categories.filter(function(c) { return c.id !== catId; });
    if (cardState.categories.length === 0) cardState.categories.push({ id: 'default', name: '默认', collapsed: false, blocked: false });
    saveCardState(); window.renderCardManager();
  };
  window.toggleBlockCategory = function(catId) {
    var cat = cardState.categories.find(function(c) { return c.id === catId; });
    if (cat) { cat.blocked = !cat.blocked; saveCardState(); window.renderCardManager(); }
  };
  window.toggleBlockCard = function(cardId) {
    var c = cardState.cards.find(function(x) { return x.id === cardId; });
    if (c) { c.blocked = !c.blocked; saveCardState(); window.renderCardManager(); }
  };
  window.editCard = function(cardId) {
    var c = cardState.cards.find(function(x) { return x.id === cardId; });
    if (!c) return;
    var newText = prompt('编辑字卡内容：', c.text);
    if (newText !== null && newText.trim() !== '') { c.text = newText.trim(); saveCardState(); window.renderCardManager(); }
  };
  window.deleteCard = function(cardId) {
    cardState.cards = cardState.cards.filter(function(c) { return c.id !== cardId; });
    saveCardState(); window.renderCardManager();
  };
  window.onCardSearch = function(val) { currentSearchTerm = val.trim(); window.renderCardManager(); };
  window.dedupeCards = function() {
    var seen = {}, dupes = [];
    cardState.cards.forEach(function(c) {
      var key = c.text.trim(); if (!key) return;
      if (seen[key] !== undefined) dupes.push(c.id); else seen[key] = c.id;
    });
    if (dupes.length === 0) { alert('没有发现重复的字卡'); return; }
    if (!confirm('发现 ' + dupes.length + ' 条重复字卡，是否删除？')) return;
    cardState.cards = cardState.cards.filter(function(c) { return dupes.indexOf(c.id) === -1; });
    saveCardState(); window.renderCardManager();
  };

  window.openAddCardModal = function() {
    var sel = document.getElementById('addCardCatSelect');
    sel.innerHTML = cardState.categories.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
    document.getElementById('addCardTextInput').value = '';
    document.getElementById('addCardModal').classList.add('show');
    setTimeout(function() { document.getElementById('addCardTextInput').focus(); }, 100);
  };
  window.closeAddCardModal = function() { document.getElementById('addCardModal').classList.remove('show'); };
  window.confirmAddCard = function() {
    var catId = document.getElementById('addCardCatSelect').value;
    var raw = document.getElementById('addCardTextInput').value || '';
    var lines = raw.split('\n').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
    if (lines.length === 0) { alert('请输入字卡内容'); return; }
    var existing = {}; cardState.cards.forEach(function(c) { existing[c.text.trim()] = true; });
    var added = 0, skipped = 0;
    lines.forEach(function(line) {
      if (existing[line]) { skipped++; return; }
      cardState.cards.push({ id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: line, cat: catId, blocked: false });
      existing[line] = true; added++;
    });
    saveCardState(); window.closeAddCardModal(); window.renderCardManager();
    alert('已添加 ' + added + ' 条，跳过 ' + skipped + ' 条重复');
  };

  window.exportCards = function() {
    var groups = cardState.categories.map(function(cat) {
      var items = cardState.cards.filter(function(c) { return c.cat === cat.id; }).map(function(c) { return c.text; });
      return { name: cat.name, items: items };
    });
    var data = { customReplyGroups: groups, exportAt: new Date().toISOString(), version: 1 };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = '小纸条_字卡_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
    alert('已导出字卡');
  };
  window.handleImportCards = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var importedData = JSON.parse(ev.target.result);
        var newCards = [];
        if (importedData.customReplyGroups && Array.isArray(importedData.customReplyGroups)) {
          importedData.customReplyGroups.forEach(function(group) {
            var catName = group.name || '未命名分类';
            var targetCat = cardState.categories.find(function(c) { return c.name === catName; });
            var targetCatId = targetCat ? targetCat.id : ('cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
            if (!targetCat) cardState.categories.push({ id: targetCatId, name: catName, collapsed: false, blocked: false });
            if (group.items && Array.isArray(group.items)) {
              group.items.forEach(function(text) { if (text && text.trim()) newCards.push({ text: text.trim(), cat: targetCatId }); });
            }
          });
        } else if (importedData.customReplies && Array.isArray(importedData.customReplies)) {
          var defaultCatId = cardState.categories[0].id;
          importedData.customReplies.forEach(function(text) { if (text && text.trim()) newCards.push({ text: text.trim(), cat: defaultCatId }); });
        }
        if (newCards.length === 0) { alert('没有找到可导入的字卡数据'); return; }
        var existing = {}; cardState.cards.forEach(function(c) { existing[c.text.trim()] = true; });
        var added = 0;
        newCards.forEach(function(card) {
          if (!existing[card.text]) {
            cardState.cards.push({ id: 'imported_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: card.text, cat: card.cat, blocked: false });
            existing[card.text] = true; added++;
          }
        });
        saveCardState(); window.renderCardManager(); alert('成功导入 ' + added + ' 张字卡！');
      } catch (err) { alert('文件解析失败，请确认是有效的 JSON 格式'); }
    };
    reader.readAsText(file); e.target.value = '';
  };

  console.log('小纸条初始化完毕，所有按钮绑定完成！');
});