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
    btnStart: document.getElementById('btnStart'),
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
  let imageData = { regions: [], images: [] }; // image data
  let lastListName = '';
  let imageOverrides = {};

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
  function loadOverrides() {
    try {
      const json = localStorage.getItem(storageKey + ':imgOverrides');
      imageOverrides = json ? JSON.parse(json) : {};
    } catch { imageOverrides = {}; }
  }
  function saveOverrides() {
    try { localStorage.setItem(storageKey + ':imgOverrides', JSON.stringify(imageOverrides || {})); } catch {}
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

    filtered.sort((a,b)=> (b.order||0)-(a.order||0));
    for (const it of filtered) {
      if (!it.image && imageData && imageData.images && imageData.images.length) {
        try {
          const m = smartFindImage(it.name || it.originalName || '', it.region || '', it.color || '', it.prefectureNo || '', it.order || 0);
          if (m) it.image = m;
        } catch {}
      }
      try {
        if (!it.image && imageOverrides && imageOverrides[it.id]) {
          it.image = { path: imageOverrides[it.id], filename: (imageOverrides[it.id]||'').split('/').pop(), regionName: it.region };
        }
      } catch {}
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
      let imageHtml = '';
      if (it.image) {
        imageHtml = `<img src="${it.image.path}" alt="${escapeHtml(it.name)}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; margin-right: 10px; float: left;" onerror="this.style.display='none';">`;
      } else {
        imageHtml = `<span class="thumb-placeholder" style="display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:6px;background:#1a1f2e;border:1px dashed #263045;margin-right:10px;float:left;color:#64748b;font-size:10px;">NO IMAGE</span>`;
      }
      
      label.innerHTML = `${imageHtml}<div>${escapeHtml(it.name)}${dateText}</div><small>${categoryText}</small>`;
      const thumbImg = label.querySelector('img');
      if (thumbImg) {
        thumbImg.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.shiftKey) { chooseOverrideForItem(it); return; }
          try { showImage2(it); } catch { showImage(it); }
        });
        thumbImg.style.cursor = 'pointer';
      }
      
      // 画像表示ボタンを追加
      const imageBtn = document.createElement('button');
      imageBtn.className = 'image-btn';
      imageBtn.textContent = '画像';
      imageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.shiftKey) { chooseOverrideForItem(it); return; }
        showImage2(it);
      });
      
      li.append(cb, label, imageBtn);
      frag.appendChild(li);
    }
    els.itemList.replaceChildren(frag);
  }

  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

  function sync() {
    renderCategories();
    renderItems();
  }

  function chooseOverrideForItem(item) {
    try {
      if (!imageData || !Array.isArray(imageData.images) || !imageData.images.length) { alert('画像データが読み込まれていません'); return; }
      const kw = prompt('画像候補のキーワードを入力（例: 名称の一部）', (item.originalName || item.name || ''));
      if (kw === null) return;
      const q = kw.toLowerCase().trim();
      const norm = (s)=> (s||'').toString().toLowerCase();
      const pool = imageData.images.filter(img => {
        const inRegion = !item.region || norm(img.regionName||img.prefecture||'').includes(norm(item.region));
        const nameHit = norm(img.itemName).includes(q) || norm(img.filename).includes(q);
        return inRegion && nameHit;
      });
      if (!pool.length) { alert('候補が見つかりません'); return; }
      const top = pool.slice(0, 20);
      const menu = top.map((img,i)=> `${i+1}: ${img.filename} [${img.regionName||''}] ${img.itemName||''}`).join('\n');
      const pick = prompt(`候補を選んでください (1-${top.length})\n${menu}`, '1');
      if (pick === null) return;
      const idx = Math.max(1, Math.min(top.length, parseInt(pick,10)||1)) - 1;
      const chosen = top[idx];
      imageOverrides[item.id] = chosen.path;
      try { localStorage.setItem(storageKey + ':imgOverrides', JSON.stringify(imageOverrides)); } catch {}
      sync();
      setStatus('画像を差し替えました');
    } catch (e) { alert('画像差し替えでエラー: ' + e.message); }
  }

  function getListCandidates() {
    return [
      'mokekelist_latest.txt',
      'mokekelist_lastest.txt',
      'mokekelist_20250906.txt',
      'mokekelist.txt'
    ];
  }
  async function loadFirstAvailableList(cands) {
    for (const name of cands) {
      const txt = await loadFromRelativeFile(name);
      if (txt && txt.trim()) { lastListName = name; return txt; }
    }
    return '';
  }

  async function loadFromRelativeFile(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = await res.arrayBuffer();
      return decodeBest(buf);
    } catch (e) {
      console.warn('fetch failed:', e);
      return '';
    }
  }

  function initEvents() {
    // Ensure Share Link button exists in DOM; create if missing (older HTML)
    try {
      if (!els.btnShareLink) {
        const controls = document.querySelector('.controls');
        if (controls) {
          const btn = document.createElement('button');
          btn.id = 'btnShareLink';
          btn.className = 'btn btn-secondary';
          btn.title = '共有用リンクをコピー';
          btn.textContent = '共有リンク';
          // insert after Export button if present, else append
          const exportBtn = document.getElementById('btnExport');
          if (exportBtn && exportBtn.nextSibling) {
            controls.insertBefore(btn, exportBtn.nextSibling);
          } else {
            controls.appendChild(btn);
          }
          els.btnShareLink = btn;
        }
      }
    } catch {}
    if (els.btnLoadList && els.loadList) {
      addDebugLog('ファイル読み込みボタンのイベントリスナーを設定');
      els.btnLoadList.addEventListener('click', () => {
        addDebugLog('ファイル読み込みボタンがクリックされました');
        setStatus('ボタンクリックを検知');
        try {
          els.loadList.click();
          addDebugLog('ファイル選択ダイアログを開きました');
          setStatus('ファイル選択ダイアログを開きました');
        } catch (e) {
          addDebugLog('ファイル選択ダイアログの開きに失敗: ' + e.message);
          // Fallback: 入力自体を見せる
          els.loadList.hidden = false;
          els.loadList.style.display = 'inline-block';
          setStatus('ダイアログを開けないため入力欄を表示しました');
        }
      });
    } else {
      addDebugLog('ファイル読み込みボタンまたはファイル入力が見つかりません');
    }

    // 貼り付け読み込み機能
    if (els.btnPasteLoad && els.pasteText) {
      addDebugLog('貼り付けボタンのイベントリスナーを設定');
      els.btnPasteLoad.addEventListener('click', () => {
        addDebugLog('貼り付けボタンがクリックされました');
        const text = els.pasteText.value.trim();
        addDebugLog(`貼り付け内容: ${text.length} 文字`);
        addDebugLog(`貼り付け内容の先頭50文字: ${text.substring(0, 50)}`);
        if (!text) {
          setStatus('貼り付け内容が空です');
          return;
        }
        setStatus('貼り付け内容を読み込み中...');
        setupListWithOptions(text, { overwriteProgress: true });
        if (!data.items.length) {
          setStatus('0 件を読み込みました (未認識)');
        } else {
          setStatus(`${data.items.length} 件を読み込みました`);
        }
      });
    } else {
      addDebugLog('貼り付けボタンまたはテキストエリアが見つかりません');
    }

    // デバッグログクリア
    if (els.btnClearDebug) {
      els.btnClearDebug.addEventListener('click', () => {
        if (els.debugLog) els.debugLog.textContent = '';
        setStatus('デバッグログをクリアしました');
      });
    }

    // テスト用ボタン
    if (els.btnTest) {
      addDebugLog('テストボタンのイベントリスナーを設定');
      els.btnTest.addEventListener('click', () => {
        addDebugLog('テストボタンがクリックされました！');
        alert('テストボタンが正常に動作しています！\n\nデバッグ情報を確認してください。');
        
        // サンプルデータでテスト
        const sampleText = `# テストデータ
[テストカテゴリ]
アイテム1
アイテム2
アイテム3`;
        
        addDebugLog('サンプルデータでテスト実行');
        setupListWithOptions(sampleText, { overwriteProgress: true });
        setStatus('テストデータで読み込み完了');
      });
    } else {
      addDebugLog('テストボタンが見つかりません');
    }
    if (els.dropZone && els.loadList) {
      const dz = els.dropZone;
      dz.addEventListener('click', () => { 
        addDebugLog('ドロップゾーンがクリックされました');
        try { 
          els.loadList.click(); 
          addDebugLog('ファイル選択ダイアログを開きました');
        } catch (e) {
          addDebugLog('ファイル選択ダイアログの開きに失敗: ' + e.message);
        }
      });
      
      const on = (ev) => { 
        ev.preventDefault(); 
        ev.stopPropagation(); 
        dz.classList.add('drop-hover');
        addDebugLog('ドラッグイベント: ' + ev.type);
      };
      const off = (ev) => { 
        ev.preventDefault(); 
        ev.stopPropagation(); 
        dz.classList.remove('drop-hover');
        addDebugLog('ドラッグイベント終了: ' + ev.type);
      };
      
      ['dragenter','dragover'].forEach(t => dz.addEventListener(t, on));
      ;['dragleave','drop'].forEach(t => dz.addEventListener(t, off));
      
      dz.addEventListener('drop', async (ev) => {
        addDebugLog('ドロップイベント発生');
        const file = ev.dataTransfer?.files?.[0];
        if (file) {
          addDebugLog(`ファイルがドロップされました: ${file.name} (${file.size} bytes)`);
          await handleListFile(file);
        } else {
          addDebugLog('ドロップされたファイルがありません');
        }
      });
    }

    // Global drag & drop prevention to stop browser from navigating to the file
    document.addEventListener('dragover', (e) => { 
      e.preventDefault(); 
      addDebugLog('グローバル dragover イベント');
    }, false);
    document.addEventListener('drop', async (e) => {
      // Only handle when dropping files on the document (outside the dropZone)
      addDebugLog('グローバル drop イベント発生');
      const f = e.dataTransfer?.files?.[0];
      if (f) {
        e.preventDefault();
        addDebugLog(`グローバルドロップでファイルを検出: ${f.name}`);
        await handleListFile(f);
      } else {
        addDebugLog('グローバルドロップでファイルが検出されませんでした');
      }
    }, false);
    els.search.addEventListener('input', () => renderItems());
    els.statusFilter.addEventListener('change', () => renderItems());
    els.clearFilter.addEventListener('click', () => { selectedCategory = null; sync(); });
    els.btnExport.addEventListener('click', () => {
      const payload = { key: storageKey, listHash: storageKey.split(':').pop(), collected: [...progress] };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mokeke-progress.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    if (els.btnReset) {
      els.btnReset.addEventListener('click', () => {
        if (!confirm('データ初期化: すべて未取得に戻します。よろしいですか？')) return;
        progress = new Set();
        saveProgress();
        sync();
        setStatus('データを初期化しました');
      });
    }
    if (els.btnShareLink) {
    els.btnShareLink.addEventListener('click', async () => {
      try {
          const state = { list: lastListName || 'mokekelist_latest.txt', hash: storageKey.split(':').pop(), collected: [...progress] };
          const json = JSON.stringify(state);
          const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
          const url = `${location.origin}${location.pathname}#s=${b64}`;
          await navigator.clipboard.writeText(url);
          setStatus('共有リンクをクリップボードにコピーしました');
        } catch (e) {
          setStatus('共有リンクの作成に失敗しました');
        }
      });
    }
    els.importState.addEventListener('change', async () => {
      const f = els.importState.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const obj = JSON.parse(text);
        if (obj && Array.isArray(obj.collected)) {
          const valid = new Set(data.items.map(i => i.id));
          for (const id of obj.collected) if (valid.has(id)) progress.add(id);
          saveProgress();
          sync();
          alert('\u9032\u6357\u3092\u30a4\u30f3\u30dd\u30fc\u30c8\u3057\u307e\u3057\u305f');
        } else {
          alert('JSON \u5f62\u5f0f\u304c\u4e0d\u6b63\u3067\u3059\u3002\u30a8\u30af\u30b9\u30dd\u30fc\u30c8\u3057\u305fJSON\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
        }
      } catch (e) {
        alert('\u9032\u6357\u30c7\u30fc\u30bf(JSON)\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002');
      } finally {
        els.importState.value = '';
      }
    });
    if (els.btnLoadFromPicker && els.loadList) {
      els.btnLoadFromPicker.addEventListener('click', async () => {
        const f = els.loadList.files?.[0];
        if (!f) { setStatus('ファイルを選択してください'); return; }
        showLoading('リストを読み込み中…');
        await handleListFile(f);
        hideLoading();
      });
    }
    els.loadList.addEventListener('change', async () => {
      addDebugLog('ファイル選択が変更されました');
      const f = els.loadList.files?.[0];
      if (!f) {
        addDebugLog('選択されたファイルがありません');
        return;
      }
      addDebugLog(`選択されたファイル: ${f.name} (${f.size} bytes)`);
      try { lastListName = f.name || lastListName; } catch {}
      await handleListFile(f);
    });

    // Fallback: capture file input change at document level as保険
    document.addEventListener('change', async (ev) => {
      try {
        const t = ev.target;
        if (t && t.id === 'loadList' && t.files && t.files[0]) {
          addDebugLog('[fallback] document change: file selected');
          await handleListFile(t.files[0]);
        }
      } catch {}
    }, true);

    // 画像表示のイベントリスナー
    if (els.closeImageViewer) {
      els.closeImageViewer.addEventListener('click', hideImage);
    }
    
    // 画像表示エリア外をクリックしたら閉じる
    if (els.imageViewer) {
      els.imageViewer.addEventListener('click', (e) => {
        if (e.target === els.imageViewer) {
          hideImage();
        }
      });
    }
  }

  async function handleListFile(f) {
    setStatus(`選択: ${f.name} (${f.size}B)`);
    showLoading('リストを読み込み中…');
    try {
      const buf = await f.arrayBuffer();
      const text = decodeBest(buf);
      setupListWithOptions(text, { overwriteProgress: true });
      if (!data.items.length) {
        alert('\u30ea\u30b9\u30c8\u5185\u5bb9\u3092\u8a8d\u8b58\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002TSV\u307e\u305f\u306f\u30bb\u30af\u30b7\u30e7\u30f3\u5f62\u5f0f\u3067\u8a18\u8ff0\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
        setStatus('0 件を読み込みました (未認識)');
      } else {
        setStatus(`${data.items.length} 件を読み込みました`);
      }
    } catch (e) {
      alert('\u30ea\u30b9\u30c8\u30d5\u30a1\u30a4\u30eb\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f');
      setStatus('読み込みに失敗しました');
    } finally {
      els.loadList.value = '';
      hideLoading();
    }
  }

  function setupWithText(text) {
    showLoading('リストを解析中…');
    rawText = text || '';
    const hash = djb2(rawText);
    storageKey = `mokeke:v1:${hash}`;
    progress = new Set();
    usedImages.clear(); // 使用済み画像セットをリセット
    loadProgress();
    loadOverrides();
    data = parseAuto(rawText);
    
    // 入手日があるアイテムを自動でチェック済みにする
    let autoCheckedCount = 0;
    for (const item of data.items) {
      if (item.isAcquired && !progress.has(item.id)) {
        progress.add(item.id);
        autoCheckedCount++;
      }
    }
    
    if (autoCheckedCount > 0) {
      addDebugLog(`${autoCheckedCount} 件のアイテムを入手日により自動チェックしました`);
      saveProgress();
    }
    
    if (els.helpBox) els.helpBox.open = !data.items.length;
    sync();
  }

  // New: list setup with overwrite option (use file ownership as source of truth when requested)
  function setupListWithOptions(text, opts = {}) {
    showLoading('リストを解析中…');
    rawText = text || '';
    const hash = djb2(rawText);
    storageKey = 'mokeke:v1:' + hash;
    usedImages.clear();

    const overwrite = !!opts.overwriteProgress;
    const allUnchecked = !!opts.allUnchecked;
    if (overwrite || allUnchecked) {
      progress = new Set();
    } else {
      progress = new Set();
      loadProgress();
    }

    data = parseAuto(rawText);

    let autoCheckedCount = 0;
    if (allUnchecked) {
      // keep all unchecked
      saveProgress();
    } else if (overwrite) {
      const next = new Set();
      for (const item of data.items) { if (item.isAcquired) { next.add(item.id); autoCheckedCount++; } }
      progress = next;
      saveProgress();
    } else {
      for (const item of data.items) { if (item.isAcquired && !progress.has(item.id)) { progress.add(item.id); autoCheckedCount++; } }
      if (autoCheckedCount > 0) saveProgress();
    }
    if (els.helpBox) els.helpBox.open = !data.items.length;
    sync();
  }

  function parseAuto(text) {
    const first = text.split(/\r?\n/).find(l => l.trim().length > 0) || '';
    const tabCount = (text.match(/\t/g) || []).length;
    if (tabCount >= 5 || first.includes('\t')) return parseTsv(text);
    return parseList(text);
  }

  function parseTsv(text) {
    const items = [];
    const majorCategories = new Set();
    const minorCategories = new Set();
    const lines = text.split(/\r?\n/);
    let isFirstLine = true; // ヘッダー行をスキップするためのフラグ
    
    for (const raw of lines) {
      if (!raw) continue;
      if (raw.trim().startsWith('#')) continue;
      
      // 最初の行（ヘッダー行）をスキップ
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }
      
      const cols = raw.split('\t');
      if (cols.length < 7) continue; // 新しい構造では7列必要

      for (let i = 0; i < cols.length; i++) cols[i] = cols[i].trim();
      // keep trailing empty fields to preserve column count (e.g., 入手日が空でも8列を維持)
      // while (cols.length && cols[cols.length-1] === '') cols.pop();
      if (!cols.length) continue;

      // 新しい構造の列を取得
      const majorCategory = cols[0]; // 大分類番号
      const minorCategory = cols[1]; // 中分類名
      const prefectureNo = cols[2];  // 県NO
      const region = cols[3];        // 地域
      const color = cols[4];         // カラー区分
      // 並び順列がある新フォーマットに対応（列数>=8）
      let order = 0, name = '', acquiredDate = '';
      if (cols.length >= 8) {
        order = parseInt(cols[5], 10); if (!Number.isFinite(order)) order = 0;
        name = cols[6];
        acquiredDate = cols[7];
      } else {
        name = cols[5];
        acquiredDate = cols[6];
      }

      // カテゴリを構築
      majorCategories.add(majorCategory);
      minorCategories.add(minorCategory);

      // 表示形式: 地域 名前 カラー区分
      let displayName = '';
      if (region) displayName += region;
      if (name) displayName += (displayName ? ' ' : '') + name;
      if (color && color.length <= 10 && !/[第弾]/.test(color)) {
        displayName += (displayName ? ' ' : '') + color;
      }
      
      if (!displayName) displayName = NAME_UNKNOWN;

      const idSeed = (cols[0] || '') + '::' + majorCategory + '::' + minorCategory + '::' + name + '::' + order;
      const id = djb2(idSeed);
      
      // 対応する画像を検索
       const matchingImage = smartFindImage(displayName, region, color, prefectureNo, order);
      
      items.push({ 
        id, 
        name: displayName, // 表示用の名前
        originalName: name, // 元の名前
        region: region, // 地域
        color: color, // カラー区分
        majorCategory: majorCategory, // 大分類
        minorCategory: minorCategory, // 中分類
        category: `${majorCategory} > ${minorCategory}`, // 階層表示用
        prefectureNo: prefectureNo,
        order: order,
        acquiredDate: acquiredDate,
        isAcquired: !!acquiredDate && acquiredDate.trim() !== '', // 入手日がある場合は取得済み
        image: matchingImage // 対応する画像情報
      });
    }
    
    return { 
      majorCategories: Array.from(majorCategories).sort(),
      minorCategories: Array.from(minorCategories).sort(),
      categories: Array.from(majorCategories).sort(), // 後方互換性のため
      items 
    };
  }

  // 画像データを読み込む（簡略化版）
  async function loadImageData() {
    addDebugLog('画像データの読み込み開始（簡略化版）');
    
    // 実際の画像ファイルは直接読み込まず、ファイル名から推測する方式に変更
    imageData = { regions: [], images: [] };
    
    addDebugLog('画像データ読み込み完了（簡略化版）');
    return imageData;
  }
  
  // 画像ファイル名を解析
  function parseImageFilename(filename, regionName) {
    // 例: 01_北海道_01_北海道_01_牛.jpg
    const parts = filename.replace('.jpg', '').split('_');
    if (parts.length < 6) return null;
    
    const prefectureNo = parts[0];
    const prefecture = parts[1];
    const subRegion = parts[3];
    // アイテム名は5番目以降を結合（カラー情報も含む）
    const itemName = parts.slice(5).join('_');
    const color = ''; // カラー情報は別途解析
    
    // デバッグログを表示（最初の5枚のみ）
    if (imageData.images.length < 5) {
      addDebugLog(`画像解析: ${filename} -> 地域:${prefecture}, アイテム:${itemName}`);
    }
    
    return {
      filename,
      regionName,
      prefectureNo,
      prefecture,
      subRegion,
      itemName,
      color,
      path: `images/${getRegionFolder(regionName)}/${filename}`
    };
  }
  
  // 地域名からフォルダ名を取得
  function getRegionFolder(regionName) {
    const folderMap = {
      '北海道': '01hokkaido',
      '東北': '02tohoku',
      '関東': '03kanto',
      '中部': '04chubu',
      '近畿': '05kinki',
      '中国': '06chugoku',
      '四国': '07shikoku',
      '九州': '08kyushu',
      '沖縄': '09okinawa',
      'スポーツ': '10sports',
      '水族館': '11suizokukan',
      '季節': '12kisetsu'
    };
    return folderMap[regionName] || '';
  }
  
  // 使用済み画像を追跡するセット
  const usedImages = new Set();
  
  // アイテムに対応する画像を検索
  function findMatchingImage(displayName, region, color, prefectureNo) {
    if (!imageData.images.length) {
      return null;
    }
    
    // 表示名から地域とアイテム名を分離
    const displayParts = displayName.split(' ');
    const itemRegion = displayParts[0]; // 最初の部分が地域
    const itemName = displayParts.slice(1).join(' '); // 残りがアイテム名
    
    // 地域名で絞り込み（より柔軟なマッチング）
    const regionImages = imageData.images.filter(img => {
      // 使用済みの画像は除外
      if (usedImages.has(img.filename)) return false;
      
      // 完全一致
      if (img.prefecture === itemRegion || img.subRegion === itemRegion) return true;
      // 部分一致
      if (img.prefecture && img.prefecture.includes(itemRegion)) return true;
      if (img.subRegion && img.subRegion.includes(itemRegion)) return true;
      // 逆の部分一致（itemRegionが画像の地域名に含まれる）
      if (img.prefecture && itemRegion.includes(img.prefecture)) return true;
      if (img.subRegion && itemRegion.includes(img.subRegion)) return true;
      return false;
    });
    
    // 地域マッチした画像数をログに記録（簡潔に）
    if (regionImages.length === 0) {
      addDebugLog(`❌ 地域マッチなし: "${displayName}" (地域: ${itemRegion})`);
    }
    
    if (!regionImages.length) {
      // 地域で見つからない場合は、全画像からアイテム名で検索（使用済み除外）
      const allNameMatch = imageData.images.find(img => {
        if (usedImages.has(img.filename)) return false;
        
        const imgName = img.itemName.toLowerCase();
        const searchName = itemName.toLowerCase();
        
        // 完全一致
        if (imgName === searchName) return true;
        // 部分一致
        if (imgName.includes(searchName)) return true;
        if (searchName.includes(imgName)) return true;
        
        return false;
      });
      
      if (allNameMatch) {
        usedImages.add(allNameMatch.filename);
        addDebugLog(`✅ 全画像から名前マッチ: "${displayName}" -> ${allNameMatch.filename}`);
        return allNameMatch;
      }
      
      addDebugLog(`❌ 全画像からもマッチなし: "${displayName}"`);
      return null;
    }
    
    // アイテム名でマッチング（より柔軟に）
    const nameMatch = regionImages.find(img => {
      const imgName = img.itemName.toLowerCase();
      const searchName = itemName.toLowerCase();
      
      // 完全一致
      if (imgName === searchName) return true;
      
      // 部分一致（アイテム名が画像名に含まれる）
      if (imgName.includes(searchName)) return true;
      
      // 逆の部分一致（画像名がアイテム名に含まれる）
      if (searchName.includes(imgName)) return true;
      
      // 単語レベルでのマッチング
      const imgWords = imgName.split('_');
      const searchWords = searchName.split(' ');
      
      for (const searchWord of searchWords) {
        if (searchWord.length > 1) { // 1文字の単語は除外
          for (const imgWord of imgWords) {
            if (imgWord.includes(searchWord) || searchWord.includes(imgWord)) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
    
    if (nameMatch) {
      usedImages.add(nameMatch.filename);
      addDebugLog(`✅ 地域+名前マッチ: "${displayName}" -> ${nameMatch.filename}`);
      return nameMatch;
    } else {
      addDebugLog(`❌ 地域+名前マッチ失敗: "${displayName}" (地域: ${itemRegion}, アイテム: ${itemName})`);
    }
    
    // カラーでマッチング
    if (color) {
      const colorMatch = regionImages.find(img => 
        img.color && img.color.toLowerCase().includes(color.toLowerCase())
      );
      if (colorMatch) {
        usedImages.add(colorMatch.filename);
        addDebugLog(`✅ カラーマッチ: "${displayName}" -> ${colorMatch.filename}`);
        return colorMatch;
      }
    }
    
    // 最初の未使用画像を返す（フォールバック）
    if (regionImages.length > 0) {
      const fallbackImage = regionImages[0];
      usedImages.add(fallbackImage.filename);
      addDebugLog(`⚠️ フォールバック: "${displayName}" -> ${fallbackImage.filename}`);
      return fallbackImage;
    }
    
    addDebugLog(`❌ 最終的にマッチなし: "${displayName}"`);
    return null;
  }

  // Fallback/robust matcher using regionName as well
  function smartFindImage(displayName, region, color, prefectureNo, order) {
    try {
      if (typeof findMatchingImage === 'function') {
        const first = findMatchingImage(displayName, region, color, prefectureNo);
        if (first) return first;
      }
    } catch {}
    if (!imageData || !Array.isArray(imageData.images) || !imageData.images.length) return null;

    const normalize = (s) => (s || '').toString().trim().replace(/\s+/g, '').replace(/モケケ$/,'');
    const parts = (displayName || '').split(' ');
    const regionCand = normalize(parts[0] || region || '');
    const itemName = (parts.slice(1).join(' ') || '').toLowerCase();
    const regionCandidates = Array.from(new Set([regionCand, normalize(region || '')].filter(Boolean)));

    // Try region-based filter including regionName/prefecture/subRegion
    let regionImages = imageData.images.filter(img => {
      if (usedImages.has(img.filename)) return false;
      const fields = [img.regionName, img.prefecture, img.subRegion].map(normalize);
      return regionCandidates.some(rc => rc && fields.some(f => f && (f === rc || f.includes(rc) || rc.includes(f))));
    });

    // Name match within region
    const tryNameMatch = (pool) => {
      return pool.find(img => {
        const imgName = (img.itemName || '').toLowerCase();
        if (!itemName) return false;
        if (imgName === itemName) return true;
        if (imgName.includes(itemName)) return true;
        if (itemName.includes(imgName)) return true;
        const imgWords = imgName.split('_');
        const searchWords = itemName.split(' ');
        for (const sw of searchWords) {
          if (sw.length > 1) {
            for (const iw of imgWords) {
              if (iw.includes(sw) || sw.includes(iw)) return true;
            }
          }
        }
        return false;
      }) || null;
    };

    if (order && regionImages.length) {
      const pat = '_' + String(order) + '_';
      regionImages = regionImages.slice().sort((x,y)=> {
        const ya = ((y.filename||'').includes(pat)?1:0);
        const xa = ((x.filename||'').includes(pat)?1:0);
        return ya - xa;
      });
    }
    let m = tryNameMatch(regionImages);
    if (m) { usedImages.add(m.filename); return m; }

    // Global name match
    m = tryNameMatch(imageData.images.filter(img => !usedImages.has(img.filename)));
    if (m) { usedImages.add(m.filename); return m; }

    // Fallback: pick first from region pool
    if (regionImages.length) { const fb = regionImages[0]; usedImages.add(fb.filename); return fb; }
    return null;
  }

  // 画像表示機能
  function showImage(item) {
    addDebugLog(`画像表示開始: ${item.name} (${item.category})`);
    const imagePath = findImageForItem(item);
    addDebugLog(`生成された画像パス: ${imagePath}`);
    
    if (imagePath) {
      els.imageTitle.textContent = item.name;
      els.mainImage.src = imagePath;
      els.mainImage.alt = item.name;
      els.imageInfo.textContent = `${item.category} - ${item.name} (${item.color || '色不明'})`;
      els.imageViewer.style.display = 'flex';
      
      // 画像の読み込み成功/失敗を監視
      els.mainImage.onload = () => {
        addDebugLog(`画像読み込み成功: ${imagePath}`);
      };
      els.mainImage.onerror = () => {
        addDebugLog(`画像読み込み失敗: ${imagePath}`);
      };
    } else {
      addDebugLog(`画像が見つかりません: ${item.name}`);
    }
  }

  function hideImage() {
    els.imageViewer.style.display = 'none';
  }
  function findImageForItem(item) {
    try {
      if (item && item.image && item.image.path) return item.image.path;
      if (imageOverrides && imageOverrides[item.id]) return imageOverrides[item.id];
      if (typeof findMatchingImage === 'function' && imageData && imageData.images && imageData.images.length) {
        const m = smartFindImage(item.name || item.originalName || '', item.region || '', item.color || '', item.prefectureNo || '', item.order || 0);
        if (m && m.path) return m.path;
      }
    } catch {}
    let region, subRegion;if (item.category.includes('季節')) {
      // 季節モケケの場合: "12_季節 モケケ > 01_春" -> region="季節", subRegion="春"
      const parts = item.category.split(' > ');
      if (parts.length > 1) {
        region = '季節';
        subRegion = parts[1].replace(/^[0-9]+_/, '').trim();
      } else {
        region = '季節';
        subRegion = '春'; // デフォルト
      }
    } else {
      // 通常の地域モケケの場合: "08_九州 モケケ > 01_福岡"
      const parts = item.category.split(' > ');
      if (parts.length > 1) {
        // "08_九州 モケケ" から "九州" を抽出（スペースを除去）
        region = parts[0].replace(/モケケ$/, '').replace(/^[0-9]+_/, '').trim();
        // "01_福岡" から "福岡" を抽出し、番号も保持
        const subRegionPart = parts[1].trim();
        const subRegionMatch = subRegionPart.match(/^([0-9]+)_(.+)$/);
        if (subRegionMatch) {
          subRegion = subRegionMatch[2];
          // subRegionの番号を保存
          item.subRegionNumber = subRegionMatch[1];
        } else {
          subRegion = subRegionPart;
        }
      } else {
        // フォールバック
        region = item.category.replace(/モケケ$/, '').replace(/^[0-9]+_/, '').trim();
        subRegion = region;
      }
    }
    
    const name = item.name.replace(/\s+/g, '');
    const color = item.color || '';
    
    addDebugLog(`カテゴリ解析結果: region="${region}", subRegion="${subRegion}"`);
    if (item.subRegionNumber) {
      addDebugLog(`subRegionNumber: "${item.subRegionNumber}"`);
    }
    
    // 実際のファイル名パターンに基づいて画像パスを生成
    const regionCode = getRegionCode(region);
    const folderName = getRegionFolder(region);
    
    addDebugLog(`生成されたコード: regionCode="${regionCode}", folderName="${folderName}"`);
    
    // 実際のファイル名パターンに基づいて画像パスを生成
    const possibleNames = [];
    
    if (region === '季節') {
      // 季節モケケの場合: 12_季節_01_春_01_さくら.jpg
      // subRegionの番号を取得（季節の場合は特別な処理）
      let subRegionCode;
      if (item.subRegionNumber) {
        // 保存されたsubRegionの番号を使用
        subRegionCode = `${item.subRegionNumber}_${subRegion}`;
      } else {
        // デフォルトの番号を使用
        subRegionCode = `01_${subRegion}`;
      }
      
      for (let i = 1; i <= 50; i++) {
        const num = i.toString().padStart(2, '0');
        possibleNames.push(`${regionCode}_${region}_${subRegionCode}_${subRegion}_${num}_${name}.jpg`);
        possibleNames.push(`${regionCode}_${region}_${subRegionCode}_${subRegion}_${num}_${name}_${color}.jpg`);
        possibleNames.push(`${regionCode}_${region}_${subRegionCode}_${subRegion}_${num}_${name}_総柄.jpg`);
      }
    } else {
      // 通常の地域モケケの場合: 08_九州_01_福岡_01_明太子.jpg または 08_九州_07_鹿児島_02_桜島.jpg
      // subRegionが地域名の場合は、その地域の番号を取得
      let subRegionCode;
      if (subRegion === region) {
        // 同じ地域の場合は、地域コードを使用
        subRegionCode = regionCode;
      } else {
              // 異なる地域の場合は、subRegionの番号を取得
      if (item.subRegionNumber) {
        // 保存されたsubRegionの番号を使用
        subRegionCode = `${item.subRegionNumber}_${subRegion}`;
      } else {
        subRegionCode = getRegionCode(subRegion);
        // もしsubRegionがマッピングにない場合は、地域コードの番号部分を使用
        if (subRegionCode === '01_北海道' && subRegion !== '北海道') {
          // 地域コードから番号を抽出（例：08_九州 -> 08）
          const regionNumber = regionCode.split('_')[0];
          subRegionCode = `${regionNumber}_${subRegion}`;
        }
      }
      }
      
      for (let i = 1; i <= 50; i++) {
        const num = i.toString().padStart(2, '0');
        // アイテム名から地域名を除去（重複を避ける）
        let cleanName = name;
        if (name.startsWith(subRegion)) {
          cleanName = name.substring(subRegion.length);
        }
        possibleNames.push(`${regionCode}_${subRegionCode}_${num}_${cleanName}.jpg`);
        possibleNames.push(`${regionCode}_${subRegionCode}_${num}_${cleanName}_${color}.jpg`);
        possibleNames.push(`${regionCode}_${subRegionCode}_${num}_${cleanName}_総柄.jpg`);
      }
    }
    
    // 特殊なパターン（N付きなど）
    if (name.includes('N') || name.includes('ピンク')) {
      if (region === '季節') {
        const subRegionCode = getRegionCode(subRegion);
        for (let i = 1; i <= 50; i++) {
          const num = i.toString().padStart(2, '0');
          possibleNames.push(`${regionCode}_${region}_${subRegionCode}_${subRegion}_${num}_${name}.jpg`);
        }
      } else {
        const subRegionCode = getRegionCode(subRegion);
        for (let i = 1; i <= 50; i++) {
          const num = i.toString().padStart(2, '0');
          possibleNames.push(`${regionCode}_${subRegionCode}_${subRegion}_${num}_${name}.jpg`);
        }
      }
    }
    
    // 最初の可能性を返す（実際の存在チェックはしない）
    return `images/${folderName}/${possibleNames[0]}`;
  }
function getRegionFolder(region) {
    // 地域名からフォルダ名を取得
    const regionMap = {
      '北海道': '01hokkaido',
      '東北': '02tohoku',
      '関東': '03kanto',
      '中部': '04chubu',
      '近畿': '05kinki',
      '中国': '06chugoku',
      '四国': '07shikoku',
      '九州': '08kyushu',
      '沖縄': '09okinawa',
      'スポーツ': '10sports',
      '水族館': '11suizokukan',
      '季節': '12kisetsu'
    };
    
    return regionMap[region] || '01hokkaido';
  }

  function getImageFileName(region, name, color) {
    // 画像ファイル名を生成
    const regionCode = getRegionCode(region);
    const nameCode = name.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
    
    return `${regionCode}_${nameCode}.jpg`;
  }

  function getRegionCode(region) {
    const regionCodes = {
      '北海道': '01_北海道',
      '東北': '02_東北',
      '関東': '03_関東',
      '中部': '04_中部',
      '近畿': '05_近畿',
      '中国': '06_中国',
      '四国': '07_四国',
      '九州': '08_九州',
      '沖縄': '09_沖縄',
      'スポーツ': '10_スポーツ',
      '水族館': '11_水族館',
      '季節': '12_季節'
    };
    
    return regionCodes[region] || '01_北海道';
  }

  async function boot() {
    addDebugLog('boot: start init');
    addDebugLog('boot: DOM check');
    for (const [key, element] of Object.entries(els)) {
      try { addDebugLog('els.' + key + ': ' + (element ? 'ok' : 'missing')); } catch {}
    }
    initEvents();
    addDebugLog('events: ready');

  // 画像データのプリロード
loadImageDataCsv().then(async (res) => {
try {
const src = (res && res.images) ? res : (window && window.mokekeImageData ? window.mokekeImageData : null);
if (src && Array.isArray(src.images)) {
const augmented = src.images.map(img => {
try {
const parsed = (typeof parseImageFilename === 'function')
? parseImageFilename(img.filename, img.regionName || img.area || '')
: null;
if (parsed) {
return {
...img,
prefecture: parsed.prefecture,
subRegion: parsed.subRegion,
color: img.color || parsed.color
};
}
} catch {}
return img;
});
imageData.images = augmented;
imageData.regions = [...new Set(augmented.map(it => it.regionName || it.prefecture).filter(Boolean))].sort();
}
} catch {}
sync();
  });

  // 共有リンクとキャッシュ有無で起動挙動を分岐
  let shared = null;
  try {
    const m = location.hash.match(/#s=([A-Za-z0-9\-_]+)/);
    if (m) {
      const json = decodeURIComponent(escape(atob(m[1].replace(/-/g,'+').replace(/_/g,'/'))));
      shared = JSON.parse(json);
      addDebugLog('共有リンクの状態を検出');
    }
  } catch {}
  const hasAnyProgress = (() => { try { return Object.keys(localStorage).some(k => k.startsWith('mokeke:v1:')); } catch { return false; } })();

  if (shared) {
    showLoading('共有リンクの内容を読み込み中…');
    const txt = await loadFromRelativeFile(shared.list || 'mokekelist_20250906.txt');
    if (txt) {
      setupListWithOptions(txt, { overwriteProgress: false });
      if (shared.collected && Array.isArray(shared.collected)) {
        const valid = new Set(data.items.map(i => i.id));
        for (const id of shared.collected) if (valid.has(id)) progress.add(id);
        saveProgress();
        sync();
        setStatus('共有リンクから進捗を適用しました');
      }
    }
    hideLoading();
  } else if (hasAnyProgress) {
    showLoading('前回のリストを読み込み中…');
    let txt = await loadFromRelativeFile('mokekelist_20250906.txt');
    if (!txt) txt = await loadFromRelativeFile('mokekelist.txt');
    if (txt) setupListWithOptions(txt, { overwriteProgress: false });
    hideLoading();
  } else {
    showLoading('初期データを読み込み中…');
    let txt = await loadFromRelativeFile('mokekelist_20250906.txt');
    if (!txt) txt = await loadFromRelativeFile('mokekelist.txt');
    if (txt) setupListWithOptions(txt, { overwriteProgress: true, allUnchecked: true });
    hideLoading();
  }
}

async function boot2() {
  addDebugLog('boot2: init');
  for (const [key, element] of Object.entries(els)) {
    try { addDebugLog(`els.${key}: ${element ? 'ok' : 'missing'}`); } catch {}
  }
  initEvents();
  loadImageDataCsv().then(async (res) => {
    try {
      const src = (res && res.images) ? res : (window && window.mokekeImageData ? window.mokekeImageData : null);
      if (src && Array.isArray(src.images)) {
        const augmented = src.images.map(img => {
          try {
            const parsed = (typeof parseImageFilename === 'function')
              ? parseImageFilename(img.filename, img.regionName || img.area || '')
              : null;
            if (parsed) {
              return {
                ...img,
                prefecture: parsed.prefecture,
                subRegion: parsed.subRegion,
                color: img.color || parsed.color
              };
            }
          } catch {}
          return img;
        });
        imageData.images = augmented;
        imageData.regions = [...new Set(augmented.map(it => it.regionName || it.prefecture).filter(Boolean))].sort();
      }
    } catch {}
    sync();
  });
  try {
    const hasAnyProgress = Object.keys(localStorage).some(k => k.startsWith('mokeke:v1:'));
    if (!hasAnyProgress) {
      setStatus('右上の「リスト読込」からファイルを選択してください');
    }
  } catch {}
}
function start() {
    addDebugLog('start() 関数が呼び出されました');
    try { 
      boot2(); 
    }
    catch (e) { 
      const errorMsg = '初期化エラー: ' + e.message;
      setStatus(errorMsg);
      addDebugLog(errorMsg);
      addDebugLog('スタックトレース: ' + e.stack);
      try { console.error(e); } catch {} 
    }
  }

  addDebugLog('スクリプト読み込み完了');
  addDebugLog(`document.readyState: ${document.readyState}`);

  if (document.readyState === 'loading') {
    addDebugLog('DOMContentLoaded イベントを待機中');
    document.addEventListener('DOMContentLoaded', start);
  } else {
    addDebugLog('DOM解析済み、即時起動');
    // DOM 解析済みなら即時起動
    start();
  }

  // New image resolve + viewer using CSV when possible
  function showImage2(item) {
    addDebugLog(`画像表示開始: ${item.name} (${item.category})`);
    let imagePath = null;
    try {
      if (item && item.image && item.image.path) {
        imagePath = item.image.path;
      } else if (typeof findMatchingImage === 'function' && imageData && imageData.images && imageData.images.length) {
        const m = smartFindImage(item.name || item.originalName || '', item.region || '', item.color || '', item.prefectureNo || '', item.order || 0);
        if (m && m.path) imagePath = m.path;
      }
    } catch {}
    addDebugLog(`決定した画像パス: ${imagePath || '(なし)'}`);

    if (imagePath) {
      els.imageTitle.textContent = item.name;
      els.mainImage.src = imagePath;
      els.mainImage.alt = item.name;
      els.imageInfo.textContent = `${item.category} - ${item.name} (${item.color || '色不明'})`;
      els.imageViewer.style.display = 'flex';
      els.mainImage.onload = () => { addDebugLog(`画像読み込み成功: ${imagePath}`); };
      els.mainImage.onerror = () => { addDebugLog(`画像読み込み失敗: ${imagePath}`); };
    } else {
      addDebugLog(`画像が見つかりません: ${item.name}`);
    }
  }
})();
    // はじめる！ボタン: mokekelist_latest.txt を読み込み
    if (els.btnStart) {
      els.btnStart.addEventListener('click', async () => {
        try {
          showLoading('リストを読み込み中…');
          let txt = await loadFromRelativeFile('mokekelist_latest.txt');
          if (!txt) {
            // 念のためのフォールバック
            const candidates = ['mokekelist_latest.txt','mokekelist_lastest.txt','mokekelist_20250906.txt','mokekelist.txt'];
            for (const name of candidates) {
              txt = await loadFromRelativeFile(name);
              if (txt && txt.trim()) { lastListName = name; break; }
            }
          } else {
            lastListName = 'mokekelist_latest.txt';
          }
          if (txt) {
            setupListWithOptions(txt, { overwriteProgress: true });
            setStatus(`${data.items.length} 件を読み込みました`);
          } else {
            setStatus('リストファイルが見つかりませんでした');
          }
        } catch (e) {
          setStatus('読み込みでエラーが発生しました');
        } finally {
          hideLoading();
        }
      });
    }
