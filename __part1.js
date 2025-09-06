(() => {
  'use strict';

  // Constants (use Unicode escapes to avoid encoding issues in source)
  const UNCAT = '\u672a\u5206\u985e'; // 未分類
  const NAME_UNKNOWN = '(\u540d\u79f0\u4e0d\u660e)'; // (名称不明)

  const els = {
    search: document.getElementById('search'),
    statusFilter: document.getElementById('statusFilter'),
    categoryList: document.getElementById('categoryList'),
    itemList: document.getElementById('itemList'),
    clearFilter: document.getElementById('clearFilter'),
    countTotal: document.getElementById('countTotal'),
    countDone: document.getElementById('countDone'),
    countTodo: document.getElementById('countTodo'),
    btnExport: document.getElementById('btnExport'),
    btnShareLink: document.getElementById('btnShareLink'),
    btnReset: document.getElementById('btnReset'),
    btnLoadList: document.getElementById('btnLoadList'),
    importState: document.getElementById('importState'),
    btnLoadFromPicker: document.getElementById('btnLoadFromPicker'),
    loadList: document.getElementById('loadList'),
    helpBox: document.getElementById('helpBox'),
    statusText: document.getElementById('statusText'),
    dropZone: document.getElementById('dropZone'),
    pasteText: document.getElementById('pasteText'),
    btnPasteLoad: document.getElementById('btnPasteLoad'),
    debugLog: document.getElementById('debugLog'),
    btnClearDebug: document.getElementById('btnClearDebug'),
    debugBox: document.getElementById('debugBox'),
    btnTest: document.getElementById('btnTest'),
    imageViewer: document.getElementById('imageViewer'),
    imageTitle: document.getElementById('imageTitle'),
    mainImage: document.getElementById('mainImage'),
    imageInfo: document.getElementById('imageInfo'),
    closeImageViewer: document.getElementById('closeImageViewer'),
  };

  // State
  let rawText = '';
  let data = { categories: [], items: [] }; // {id, name, category}
  let selectedCategory = null; // string or null
  let progress = new Set(); // ids collected
  let storageKey = 'mokeke:v1:'; // finalized after list is loaded
  let imageData = { regions: [], images: [] }; // 画像データ

  // Utilities
  function djb2(str) {
    let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  function loadProgress() {
    const json = localStorage.getItem(storageKey);
    if (!json) return;
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) progress = new Set(arr);
    } catch {}
  }
  function saveProgress() {
    localStorage.setItem(storageKey, JSON.stringify([...progress]));
  }

  function setStatus(msg) {
    if (els.statusText) els.statusText.textContent = msg;
    try { console.log('[mokeke]', msg); } catch {}
    addDebugLog(msg);
  }

  function showLoading(msg) {
    const ov = document.getElementById('loading');
    if (ov) {
      const t = document.getElementById('loadingText');
      if (t && msg) t.textContent = msg;
      ov.style.display = 'block';
      try { document.body.classList.add('loading'); } catch {}
    } else {
      setStatus(msg || '処理中...');
    }
  }
  function hideLoading() {
    const ov = document.getElementById('loading');
    if (ov) ov.style.display = 'none';
    try { document.body.classList.remove('loading'); } catch {}
  }

  function addDebugLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${msg}`;
    
    // コンソールにも出力
    try { console.log('[mokeke-debug]', logEntry); } catch {}
    
    // デバッグログエリアに出力
    if (els.debugLog) {
      els.debugLog.textContent += logEntry + '\n';
      els.debugLog.scrollTop = els.debugLog.scrollHeight;
    }
  }

  // Encoding detection: try UTF-8 / Shift_JIS / UTF-16LE / UTF-16BE and pick best
  function decodeBest(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const hasBOM_LE = bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE;
    const hasBOM_BE = bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF;

    addDebugLog(`ファイルサイズ: ${bytes.length} bytes`);
    addDebugLog(`BOM_LE: ${hasBOM_LE}, BOM_BE: ${hasBOM_BE}`);

    const candidates = [];
    const push = (label) => { 
      try { 
        const decoded = new TextDecoder(label).decode(arrayBuffer);
        candidates.push([label, decoded]);
        addDebugLog(`エンコーディング ${label}: ${decoded.substring(0, 50)}...`);
      } catch (e) {
        addDebugLog(`エンコーディング ${label} でエラー: ${e.message}`);
      }
    };

    if (hasBOM_LE) push('utf-16le');
    if (hasBOM_BE) push('utf-16be');
    push('utf-8'); // UTF-8を最初に試す
    push('shift_jis'); // cp932
    push('euc-jp'); // 追加
    push('iso-2022-jp'); // 追加

    if (!hasBOM_LE && !hasBOM_BE) {
      let zerosEven = 0, zerosOdd = 0;
      for (let i = 0; i < bytes.length; i++) {
        if (i % 2 === 0) {
          zerosEven += (bytes[i] === 0);
        } else {
          zerosOdd += (bytes[i] === 0);
        }
      }
      const ratioEven = zerosEven / Math.max(1, Math.ceil(bytes.length / 2));
      const ratioOdd = zerosOdd / Math.max(1, Math.floor(bytes.length / 2));
      if (ratioEven > 0.2 || ratioOdd > 0.2) { push('utf-16le'); push('utf-16be'); }
    }

    const score = (s) => {
      if (!s) return -1e9;
      let jp = 0, bad = 0, ascii = 0, tab = 0;
      for (const ch of s) {
        const code = ch.codePointAt(0);
        const isJP = (code>=0x3040&&code<=0x30ff) || (code>=0x4e00&&code<=0x9fff) || (code>=0xff66&&code<=0xff9f);
        const isASCII = code >= 32 && code <= 126;
        if (isJP) jp++;
        if (isASCII) ascii++;
        if (ch === '\t') tab++;
        if (ch === '\uFFFD') bad++;
      }
      const len = s.length || 1;
      // UTF-8を優先し、タブ文字（TSV形式）がある場合はボーナス
      const baseScore = jp * 3 + ascii * 1 - bad * 10 - (len < 5 ? 5 : 0);
      const tabBonus = tab > 10 ? 1000 : 0; // TSV形式の場合は大幅ボーナス
      return baseScore + tabBonus;
    };

    let best = '', bestScore = -1e9;
    for (const [label, text] of candidates) {
      let sc = score(text);
      // UTF-8に明示的なボーナスを追加
      if (label === 'utf-8') {
        sc += 5000; // UTF-8ボーナス
        addDebugLog(`${label} スコア: ${sc} (UTF-8ボーナス適用)`);
      } else {
        addDebugLog(`${label} スコア: ${sc}`);
      }
      if (sc > bestScore) { best = text; bestScore = sc; }
    }
    
    addDebugLog(`選択されたエンコーディングのスコア: ${bestScore}`);
    return best || new TextDecoder('utf-8').decode(arrayBuffer);
  }

  // Parsing: INI-like format
  function parseList(text) {
    const items = [];
    const categories = new Set();
    let current = null;
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^\[(.+?)\]$/);
      if (m) { current = m[1].trim(); categories.add(current); continue; }
      const name = line;
      const cat = current || UNCAT;
      categories.add(cat);
      const id = `${cat}::${name}`;
      items.push({ id, name, category: cat });
    }
    return { categories: [...categories], items };
  }

  function renderCategories() {
    const frag = document.createDocumentFragment();
    const allCounts = countByCategory();
    
    // 地域分類は削除 - 大分類から直接開始
    
    // 大分類・中分類の階層構造で表示（折りたたみ式）
    if (data.majorCategories && data.majorCategories.length > 0) {
      for (const majorCat of data.majorCategories) {
        // この大分類に属する中分類を取得
        const minorCats = data.items
          .filter(item => item.majorCategory === majorCat)
          .map(item => item.minorCategory)
          .filter((value, index, self) => self.indexOf(value) === index)
          .sort();
        
        // 大分類の進捗を計算
        const majorCount = data.items.filter(item => item.majorCategory === majorCat).length;
        const majorDone = data.items.filter(item => 
          item.majorCategory === majorCat && progress.has(item.id)
        ).length;
        
        // 大分類の折りたたみセクション
        const details = document.createElement('details');
        details.style.marginBottom = '4px';
        
        // この大分類に選択された中分類がある場合は開いた状態にする
        const hasSelectedMinor = minorCats.some(minorCat => 
          selectedCategory === `${majorCat} > ${minorCat}`
        );
        if (hasSelectedMinor) {
          details.open = true;
        }
        
        const summary = document.createElement('summary');
        summary.style.padding = '6px 8px';
        summary.style.cursor = 'pointer';
        summary.style.color = '#c7d2e3';
        summary.style.fontSize = '14px';
        summary.style.listStyle = 'none';
        summary.style.userSelect = 'none';
        summary.style.borderRadius = '6px';
        summary.style.display = 'flex';
        summary.style.justifyContent = 'space-between';
        summary.style.alignItems = 'center';
        
        const majorText = document.createElement('span');
        majorText.textContent = majorCat;
        
        const majorBadge = document.createElement('span');
        majorBadge.className = 'badge';
        majorBadge.textContent = `${majorDone}/${majorCount}`;
        majorBadge.style.float = 'none';
        majorBadge.style.marginLeft = '8px';
        
        summary.appendChild(majorText);
        summary.appendChild(majorBadge);
        details.appendChild(summary);
        
        // 中分類リスト
        const minorList = document.createElement('ul');
        minorList.style.listStyle = 'none';
        minorList.style.margin = '0';
        minorList.style.padding = '0';
        minorList.style.paddingLeft = '16px';
        
        for (const minorCat of minorCats) {
          const count = data.items.filter(item => 
            item.majorCategory === majorCat && item.minorCategory === minorCat
          ).length;
          const done = data.items.filter(item => 
            item.majorCategory === majorCat && 
            item.minorCategory === minorCat && 
            progress.has(item.id)
          ).length;
          
          const li = document.createElement('li');
          li.textContent = minorCat;
          li.dataset.cat = `${majorCat} > ${minorCat}`;
          li.className = (selectedCategory === `${majorCat} > ${minorCat}`) ? 'active' : '';
          li.style.padding = '4px 8px';
          li.style.fontSize = '13px';
          li.style.cursor = 'pointer';
          li.style.borderRadius = '4px';
          li.style.marginBottom = '2px';
          li.style.display = 'flex';
          li.style.justifyContent = 'space-between';
          li.style.alignItems = 'center';
          
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = `${done}/${count}`;
          badge.style.float = 'none';
          badge.style.marginLeft = '8px';
          
          li.appendChild(badge);
          li.addEventListener('click', (e) => {
            e.preventDefault(); // デフォルトの動作を防ぐ
            e.stopPropagation(); // 親要素のクリックイベントを防ぐ
            selectedCategory = (selectedCategory === `${majorCat} > ${minorCat}`) ? null : `${majorCat} > ${minorCat}`;
            sync();
          });
          minorList.appendChild(li);
        }
        
        details.appendChild(minorList);
        frag.appendChild(details);
      }
    } else {
      // フォールバック: 従来のカテゴリ表示
      data.categories.sort((a, b) => {
        const aNum = parseInt(a.split(' ')[0]) || 999;
        const bNum = parseInt(b.split(' ')[0]) || 999;
        if (aNum !== bNum) return aNum - bNum;
        return a.localeCompare(b, 'ja');
      });
      
    for (const cat of data.categories) {
      const li = document.createElement('li');
      li.textContent = cat;
      li.dataset.cat = cat;
      li.className = (selectedCategory === cat) ? 'active' : '';
      const badge = document.createElement('span');
      badge.className = 'badge';
      const total = allCounts[cat]?.total ?? 0;
      const done = allCounts[cat]?.done ?? 0;
      badge.textContent = `${done}/${total}`;
      li.appendChild(badge);
      li.addEventListener('click', () => {
        selectedCategory = (selectedCategory === cat) ? null : cat;
        sync();
      });
      frag.appendChild(li);
      }
    }
    els.categoryList.replaceChildren(frag);
  }

  function countByCategory() {
    const map = {};
    for (const it of data.items) {
      const entry = map[it.category] || (map[it.category] = { total: 0, done: 0 });
      entry.total++;
      if (progress.has(it.id)) entry.done++;
    }
    return map;
  }

  function renderItems() {
    const q = (els.search.value || '').trim().toLowerCase();
    const status = els.statusFilter.value; // all|todo|done
    const frag = document.createDocumentFragment();
    let total = 0, done = 0;
    const filtered = data.items.filter(it => {
      // 地域分類でのフィルタリング
      if (selectedCategory && selectedCategory.startsWith('region_')) {
        const region = selectedCategory.replace('region_', '');
        if (it.region !== region && it.image?.regionName !== region) return false;
      } else if (selectedCategory && it.category !== selectedCategory) {
        return false;
      }
      
      if (q) {
        // 地域名、名前、カラー区分で検索
        const searchText = `${it.region || ''} ${it.originalName || ''} ${it.color || ''}`.toLowerCase();
        if (!searchText.includes(q)) return false;
      }
      const isDone = progress.has(it.id);
      if (status === 'todo' && isDone) return false;
      if (status === 'done' && !isDone) return false;
      return true;
    });

    for (const it of data.items) {
      total++;
      if (progress.has(it.id)) done++;
    }
    els.countTotal.textContent = String(total);
    els.countDone.textContent = String(done);
    els.countTodo.textContent = String(total - done);

    for (const it of filtered) {
      const li = document.createElement('li');
      li.className = 'item' + (progress.has(it.id) ? ' done' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = progress.has(it.id);
      cb.addEventListener('change', () => {
        if (cb.checked) progress.add(it.id); else progress.delete(it.id);
        saveProgress();
        sync();
      });
      const label = document.createElement('div');
      let categoryText = escapeHtml(it.category);
      let dateText = '';
      
      // 入手日がある場合は表示
      if (it.acquiredDate) {
        dateText = ` <span style="color: #4ade80; font-size: 0.8em;">[${escapeHtml(it.acquiredDate)}]</span>`;
      }
      
      // 画像がある場合は表示
