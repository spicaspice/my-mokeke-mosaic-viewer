(() => {
  'use strict';

  // Constants (use Unicode escapes to avoid encoding issues in source)
  const UNCAT = '\u672a\u5206\u985e'; // 隴幢ｽｪ陋ｻ繝ｻ・ｽE・ｽ繝ｻ
  const NAME_UNKNOWN = '(\u540d\u79f0\u4e0d\u660e)'; // (陷ｷ蜥ｲ・ｽE・ｽ・ｽE・ｽ闕ｳ閧ｴ繝ｻ)

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

  function setupWithText(text) {
    showLoading('郢晢ｽｪ郢ｧ・ｽE・ｽ郢晏現・ｽE・ｽ髫暦ｿｽE・ｽ隴ｫ陜会ｽｸ・ｽE・ｽ遯ｶ・ｽE・ｽ');
    rawText = text || '';
    const hash = djb2(rawText);
    storageKey = `mokeke:v1:${hash}`;
    progress = new Set();
    usedImages.clear(); // 闖ｴ・ｽE・ｽ騾包ｽｨ雋ょ現竏ｩ騾包ｽｻ陷剃ｸ翫◎郢晢ｿｽE繝ｨ郢ｧ蛛ｵﾎ懃ｹｧ・ｽE・ｽ郢晢ｿｽE繝ｨ
    loadProgress();
    loadOverrides();
    data = parseAuto(rawText);
    
    // 陷茨ｽ･隰・・ｽ・ｽ蠕狗ｸｺ蠕娯旺郢ｧ荵昴＞郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ堤ｹｧ螳夲ｿｽE陷崎ｼ斐堤ｹ晢ｿｽE縺臥ｹ晢ｿｽE縺題ｲょ現竏ｩ邵ｺ・ｽE・ｽ邵ｺ蜷ｶ・ｽE・ｽE
    let autoCheckedCount = 0;
    for (const item of data.items) {
      if (item.isAcquired && !progress.has(item.id)) {
        progress.add(item.id);
        autoCheckedCount++;
      }
    }
    
    if (autoCheckedCount > 0) {
      addDebugLog(`${autoCheckedCount} 闔会ｽｶ邵ｺ・ｽE・ｽ郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ堤ｹｧ雋橸ｿｽE隰・・ｽ・ｽ蠕狗ｸｺ・ｽE・ｽ郢ｧ蛹ｻ・ｽE・ｽ髢ｾ・ｽE・ｽ陷崎ｼ斐Γ郢ｧ・ｽE・ｽ郢晢ｿｽE縺醍ｸｺ蜉ｱ竏ｪ邵ｺ蜉ｱ笳・);
      saveProgress();
    }
    
    if (els.helpBox) els.helpBox.open = !data.items.length;
    sync();
  }

  // New: list setup with overwrite option (use file ownership as source of truth when requested)
  function setupListWithOptions(text, opts = {}) {
    showLoading('郢晢ｽｪ郢ｧ・ｽE・ｽ郢晏現・ｽE・ｽ髫暦ｿｽE・ｽ隴ｫ陜会ｽｸ・ｽE・ｽ遯ｶ・ｽE・ｽ');
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
    let isFirstLine = true; // 郢晏･繝｣郢敖郢晢ｽｼ髯ｦ蠕鯉ｽ堤ｹｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽE繝ｻ邵ｺ蜷ｶ・ｽE・ｽ邵ｺ貅假ｽ∫ｸｺ・ｽE・ｽ郢晁ｼ釆帷ｹｧ・ｽE・ｽ
    
    for (const raw of lines) {
      if (!raw) continue;
      if (raw.trim().startsWith('#')) continue;
      
      // 隴崢陋ｻ譏ｴ繝ｻ髯ｦ魃会ｽｼ蛹ｻ繝ｻ郢晢ｿｽE繝郢晢ｽｼ髯ｦ魃会ｽｼ蟲ｨ・ｽE・ｽ郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽE繝ｻ
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }
      
      const cols = raw.split('\t');
      if (cols.length < 7) continue; // 隴・・ｽ・ｽ邵ｺ蜉ｱ・ｽE・ｽ隶堤洸ﾂ・ｽE・ｽ邵ｺ・ｽE・ｽ邵ｺ・ｽE・ｽ7陋ｻ諤懶ｽｿ繝ｻ・ｽE・ｽ繝ｻ

      for (let i = 0; i < cols.length; i++) cols[i] = cols[i].trim();
      // keep trailing empty fields to preserve column count (e.g., 陷茨ｽ･隰・・ｽ・ｽ蠕狗ｸｺ讙趣ｽｩ・ｽE・ｽ邵ｺ・ｽE・ｽ郢ｧ繝ｻ陋ｻ蜉ｱ・ｽE・ｽ驍ｯ・ｽE・ｽ隰厄ｿｽE
      // while (cols.length && cols[cols.length-1] === '') cols.pop();
      if (!cols.length) continue;

      // 隴・・ｽ・ｽ邵ｺ蜉ｱ・ｽE・ｽ隶堤洸ﾂ・ｽE・ｽ邵ｺ・ｽE・ｽ陋ｻ蜉ｱ・ｽE・ｽ陷ｿ髢・ｽE・ｽ繝ｻ
      const majorCategory = cols[0]; // 陞滂ｽｧ陋ｻ繝ｻ・ｽE・ｽ讓抵ｿｽE陷ｿ・ｽE・ｽ
      const minorCategory = cols[1]; // 闕ｳ・ｽE・ｽ陋ｻ繝ｻ・ｽE・ｽ讒ｫ骭・
      const prefectureNo = cols[2];  // 騾ｵ蜷娑
      const region = cols[3];        // 陜ｨ・ｽE・ｽ陜難ｿｽE
      const color = cols[4];         // 郢ｧ・ｽE・ｽ郢晢ｽｩ郢晢ｽｼ陋ｹ・ｽE・ｽ陋ｻ繝ｻ      // 闕ｳ・ｽE・ｽ邵ｺ・ｽE・ｽ鬯・・ｽE繝ｻ邵ｺ蠕娯旺郢ｧ蛹ｺ逵郢晁ｼ斐°郢晢ｽｼ郢晄ｧｭ繝｣郢晏現竊楢汞・ｽE・ｽ陟｢諛ｶ・ｽE・ｽ莠･繝ｻ隰ｨ・ｽE・ｽ>=8繝ｻ繝ｻ      let order = 0, name = '', acquiredDate = '';
      if (cols.length >= 8) {
        order = parseInt(cols[5], 10); if (!Number.isFinite(order)) order = 0;
        name = cols[6];
        acquiredDate = cols[7];
      } else {
        name = cols[5];
        acquiredDate = cols[6];
      }

      // 郢ｧ・ｽE・ｽ郢晢ｿｽE縺也ｹ晢ｽｪ郢ｧ蜻茨ｽｧ迢暦ｽｯ繝ｻ
      majorCategories.add(majorCategory);
      minorCategories.add(minorCategory);

      // 髯ｦ・ｽE・ｽ驕会ｽｺ陟厄ｽ｢陟托ｿｽE 陜ｨ・ｽE・ｽ陜難ｿｽE陷ｷ讎奇ｿｽ・ｽ 郢ｧ・ｽE・ｽ郢晢ｽｩ郢晢ｽｼ陋ｹ・ｽE・ｽ陋ｻ繝ｻ
      let displayName = '';
      if (region) displayName += region;
      if (name) displayName += (displayName ? ' ' : '') + name;
      if (color && color.length <= 10 && !/[髫ｨ・ｽE・ｽ陟托ｽｾ]/.test(color)) {
        displayName += (displayName ? ' ' : '') + color;
      }
      
      if (!displayName) displayName = NAME_UNKNOWN;

      const idSeed = (cols[0] || '') + '::' + majorCategory + '::' + minorCategory + '::' + name + '::' + order;
      const id = djb2(idSeed);
      
      // 陝・・ｽ・ｽ陟｢諛奇ｿｽE郢ｧ迢怜愛陷剃ｸ奇ｽ定ｮ諛・・ｽ・ｽ・ｽE・ｽ
       const matchingImage = smartFindImage(displayName, region, color, prefectureNo, order);
      
      items.push({ 
        id, 
        name: displayName, // 髯ｦ・ｽE・ｽ驕会ｽｺ騾包ｽｨ邵ｺ・ｽE・ｽ陷ｷ讎奇ｿｽ・ｽ
        originalName: name, // 陷茨ｿｽE繝ｻ陷ｷ讎奇ｿｽ・ｽ
        region: region, // 陜ｨ・ｽE・ｽ陜難ｿｽE
        color: color, // 郢ｧ・ｽE・ｽ郢晢ｽｩ郢晢ｽｼ陋ｹ・ｽE・ｽ陋ｻ繝ｻ
        majorCategory: majorCategory, // 陞滂ｽｧ陋ｻ繝ｻ・ｽE・ｽ繝ｻ
        minorCategory: minorCategory, // 闕ｳ・ｽE・ｽ陋ｻ繝ｻ・ｽE・ｽ繝ｻ
        category: `${majorCategory} > ${minorCategory}`, // 鬮ｫ荳ｻ・ｽE・ｽ・ｽE・ｽ髯ｦ・ｽE・ｽ驕会ｽｺ騾包ｽｨ
        prefectureNo: prefectureNo,
        order: order,
        acquiredDate: acquiredDate,
        isAcquired: !!acquiredDate && acquiredDate.trim() !== '', // 陷茨ｽ･隰・・ｽ・ｽ蠕狗ｸｺ蠕娯旺郢ｧ蜿･・ｽE・ｽ・ｽE・ｽ陷ｷ蛹ｻ繝ｻ陷ｿ髢・ｽE・ｽ邇ｲ・ｽE・ｽ蛹ｻ竏ｩ
        image: matchingImage // 陝・・ｽ・ｽ陟｢諛奇ｿｽE郢ｧ迢怜愛陷剃ｹ励Η陜｣・ｽE・ｽ
      });
    }
    
    return { 
      majorCategories: Array.from(majorCategories).sort(),
      minorCategories: Array.from(minorCategories).sort(),
      categories: Array.from(majorCategories).sort(), // 陟墓｢ｧ蟀ｿ闔蜻磯共隲､・ｽE・ｽ邵ｺ・ｽE・ｽ邵ｺ貅假ｽ・
      items 
    };
  }

  // 騾包ｽｻ陷剃ｸ翫Ι郢晢ｽｼ郢ｧ・ｽE・ｽ郢ｧ螳夲ｽｪ・ｽE・ｽ邵ｺ・ｽE・ｽ髴趣ｽｼ郢ｧﾂ繝ｻ閧ｲ・ｽE・ｽ・ｽE・ｽ騾｡・ｽE・ｽ陋ｹ荵滓ｲｿ繝ｻ繝ｻ
  async function loadImageData() {
    addDebugLog('騾包ｽｻ陷剃ｸ翫Ι郢晢ｽｼ郢ｧ・ｽE・ｽ邵ｺ・ｽE・ｽ髫ｱ・ｽE・ｽ邵ｺ・ｽE・ｽ髴趣ｽｼ邵ｺ・ｽE・ｽ鬮｢蜿･・ｽE・ｽ蜈ｷ・ｽE・ｽ閧ｲ・ｽE・ｽ・ｽE・ｽ騾｡・ｽE・ｽ陋ｹ荵滓ｲｿ繝ｻ繝ｻ);
    
    // 陞ｳ貊・・ｽ・ｽ邵ｺ・ｽE・ｽ騾包ｽｻ陷剃ｸ翫Ψ郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｽｫ邵ｺ・ｽE・ｽ騾ｶ・ｽE・ｽ隰暦ｽ･髫ｱ・ｽE・ｽ邵ｺ・ｽE・ｽ髴趣ｽｼ邵ｺ・ｽE・ｽ邵ｺ螢ｹﾂ竏壹Ψ郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｽｫ陷ｷ髦ｪﾂｰ郢ｧ逕ｻ閠ｳ雋ゑｽｬ邵ｺ蜷ｶ・ｽE・ｽ隴・・ｽ・ｽ陟台ｸ奇ｿｽE陞溽判蟲ｩ
    imageData = { regions: [], images: [] };
    
    addDebugLog('騾包ｽｻ陷剃ｸ翫Ι郢晢ｽｼ郢ｧ・ｽE・ｽ髫ｱ・ｽE・ｽ邵ｺ・ｽE・ｽ髴趣ｽｼ邵ｺ・ｽE・ｽ陞ｳ蠕｡・ｽE・ｽ繝ｻ・ｽE・ｽ閧ｲ・ｽE・ｽ・ｽE・ｽ騾｡・ｽE・ｽ陋ｹ荵滓ｲｿ繝ｻ繝ｻ);
    return imageData;
  }
  
  // 騾包ｽｻ陷剃ｸ翫Ψ郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｽｫ陷ｷ髦ｪ・ｽE・ｽ髫暦ｿｽE・ｽ隴ｫ繝ｻ
  function parseImageFilename(filename, regionName) {
    // 關難ｿｽE 01_陋ｹ邇ｲ・ｽE・ｽ・ｽE・ｽ鬩慕せ01_陋ｹ邇ｲ・ｽE・ｽ・ｽE・ｽ鬩慕せ01_霑夲ｿｽEjpg
    const parts = filename.replace('.jpg', '').split('_');
    if (parts.length < 6) return null;
    
    const prefectureNo = parts[0];
    const prefecture = parts[1];
    const subRegion = parts[3];
    // 郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ定惺髦ｪ繝ｻ5騾｡・ｽE・ｽ騾ｶ・ｽE・ｽ闔会ｽ･鬮ｯ髦ｪ・ｽE・ｽ驍ｨ莉咏ｲ具ｿｽE蛹ｻ縺咲ｹ晢ｽｩ郢晢ｽｼ隲繝ｻ・ｽE・ｽ・ｽE・ｽ郢ｧ繧・・ｽ・ｽ郢ｧﾂ繝ｻ繝ｻ
    const itemName = parts.slice(5).join('_');
    const color = ''; // 郢ｧ・ｽE・ｽ郢晢ｽｩ郢晢ｽｼ隲繝ｻ・ｽE・ｽ・ｽE・ｽ邵ｺ・ｽE・ｽ陋ｻ・ｽE・ｽ鬨ｾ遒托ｽｧ・ｽE・ｽ隴ｫ繝ｻ
    
    // 郢晢ｿｽE繝ｰ郢晢ｿｽE縺堤ｹ晢ｽｭ郢ｧ・ｽE・ｽ郢ｧ螳夲ｽ｡・ｽE・ｽ驕会ｽｺ繝ｻ蝓滓呵崕譏ｴ繝ｻ5隴ｫ螢ｹ繝ｻ邵ｺ・ｽE・ｽ繝ｻ繝ｻ
    if (imageData.images.length < 5) {
      addDebugLog(`騾包ｽｻ陷貞臆・ｽE・ｽ・ｽE・ｽ隴ｫ繝ｻ ${filename} -> 陜ｨ・ｽE・ｽ陜難ｿｽE${prefecture}, 郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ・${itemName}`);
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
  
  // 陜ｨ・ｽE・ｽ陜捺ｺｷ骭千ｸｺ荵晢ｽ臥ｹ晁ｼ斐°郢晢ｽｫ郢敖陷ｷ髦ｪ・ｽE・ｽ陷ｿ髢・ｽE・ｽ繝ｻ
  function getRegionFolder(regionName) {
    const folderMap = {
      '陋ｹ邇ｲ・ｽE・ｽ・ｽE・ｽ鬩包ｿｽE: '01hokkaido',
      '隴夲ｽｱ陋ｹ繝ｻ: '02tohoku',
      '鬮｢・ｽE・ｽ隴夲ｽｱ': '03kanto',
      '闕ｳ・ｽE・ｽ鬩幢ｽｨ': '04chubu',
      '髴托ｿｽE譟・: '05kinki',
      '闕ｳ・ｽE・ｽ陜暦ｽｽ': '06chugoku',
      '陜怜ｸ帛ｵ・: '07shikoku',
      '闕ｵ譎擾ｽｷ繝ｻ: '08kyushu',
      '雎蝉ｹ滂ｽｸ繝ｻ: '09okinawa',
      '郢ｧ・ｽE・ｽ郢晄亢繝ｻ郢晢ｿｽE: '10sports',
      '雎鯉ｽｴ隴悟沁・ｽE・ｽ・ｽE・ｽ': '11suizokukan',
      '陝・・ｽ・ｽ驕ｽﾂ': '12kisetsu'
    };
    return folderMap[regionName] || '';
  }
  
  // 闖ｴ・ｽE・ｽ騾包ｽｨ雋ょ現竏ｩ騾包ｽｻ陷剃ｸ奇ｽ帝恆・ｽE・ｽ髴搾ｽ｡邵ｺ蜷ｶ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽE繝ｨ
  const usedImages = new Set();
  
  // 郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ堤ｸｺ・ｽE・ｽ陝・・ｽ・ｽ陟｢諛奇ｿｽE郢ｧ迢怜愛陷剃ｸ奇ｽ定ｮ諛・・ｽ・ｽ・ｽE・ｽ
  function findMatchingImage(displayName, region, color, prefectureNo) {
    if (!imageData.images.length) {
      return null;
    }
    
    // 髯ｦ・ｽE・ｽ驕会ｽｺ陷ｷ髦ｪﾂｰ郢ｧ迚呻ｿｽE陜捺ｺ假ｿｽE郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ定惺髦ｪ・ｽE・ｽ陋ｻ繝ｻ螻ｬ
    const displayParts = displayName.split(' ');
    const itemRegion = displayParts[0]; // 隴崢陋ｻ譏ｴ繝ｻ鬩幢ｽｨ陋ｻ繝ｻ窶ｲ陜ｨ・ｽE・ｽ陜難ｿｽE
    const itemName = displayParts.slice(1).join(' '); // 隹ｿ荵晢ｽ顔ｸｺ蠕後＞郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ定惺繝ｻ
    
    // 陜ｨ・ｽE・ｽ陜捺ｺｷ骭千ｸｺ・ｽE・ｽ驍ｨ讒ｭ・ｽE・ｽ髴趣ｿｽE・ｽ邵ｺ・ｽE・ｽ繝ｻ蛹ｻ・ｽE・ｽ郢ｧ鬆第ｲ宣怕貅假ｿｽE郢晄ｧｭ繝｣郢晢ｿｽEﾎｦ郢ｧ・ｽE・ｽ繝ｻ繝ｻ
    const regionImages = imageData.images.filter(img => {
      // 闖ｴ・ｽE・ｽ騾包ｽｨ雋ょ現竏ｩ邵ｺ・ｽE・ｽ騾包ｽｻ陷剃ｸ奇ｿｽE鬮ｯ・ｽE・ｽ陞滂ｿｽE
      if (usedImages.has(img.filename)) return false;
      
      // 陞ｳ謔滂ｿｽE闕ｳﾂ髢ｾ・ｽE・ｽ
      if (img.prefecture === itemRegion || img.subRegion === itemRegion) return true;
      // 鬩幢ｽｨ陋ｻ繝ｻ・ｽE・ｽﾂ髢ｾ・ｽE・ｽ
      if (img.prefecture && img.prefecture.includes(itemRegion)) return true;
      if (img.subRegion && img.subRegion.includes(itemRegion)) return true;
      // 鬨ｾ繝ｻ繝ｻ鬩幢ｽｨ陋ｻ繝ｻ・ｽE・ｽﾂ髢ｾ・ｽE・ｽ繝ｻ繝ｻtemRegion邵ｺ讙主愛陷剃ｸ奇ｿｽE陜ｨ・ｽE・ｽ陜捺ｺｷ骭千ｸｺ・ｽE・ｽ陷ｷ・ｽE・ｽ邵ｺ・ｽE・ｽ郢ｧ蠕鯉ｽ具ｿｽE繝ｻ
      if (img.prefecture && itemRegion.includes(img.prefecture)) return true;
      if (img.subRegion && itemRegion.includes(img.subRegion)) return true;
      return false;
    });
    
    // 陜ｨ・ｽE・ｽ陜捺ｺ假ｿｽE郢晢ｿｽE繝｡邵ｺ蜉ｱ笳・・ｽ・ｽ・ｻ陷剃ｹ暦ｿｽE郢ｧ蛛ｵﾎ溽ｹｧ・ｽE・ｽ邵ｺ・ｽE・ｽ髫ｪ蛟ｬ鮖ｸ繝ｻ閧ｲ・ｽE・ｽ・ｽE・ｽ雋取鱒竊難ｿｽE繝ｻ
    if (regionImages.length === 0) {
      addDebugLog(`隨ｶ繝ｻ陜ｨ・ｽE・ｽ陜捺ｺ假ｿｽE郢晢ｿｽE繝｡邵ｺ・ｽE・ｽ邵ｺ繝ｻ "${displayName}" (陜ｨ・ｽE・ｽ陜難ｿｽE ${itemRegion})`);
    }
    
    if (!regionImages.length) {
      // 陜ｨ・ｽE・ｽ陜捺ｺ倥帝囎荵昶命邵ｺ荵晢ｽ臥ｸｺ・ｽE・ｽ邵ｺ繝ｻ・ｽE・ｽ・ｽE・ｽ陷ｷ蛹ｻ繝ｻ邵ｲ竏晢ｿｽE騾包ｽｻ陷剃ｸ環ｰ郢ｧ蟲ｨ縺・・ｽ・ｽ・ｽE・ｽ郢晢ｿｽEﾎ定惺髦ｪ縲定ｮ諛・・ｽ・ｽ・ｽE・ｽ繝ｻ莠包ｽｽ・ｽE・ｽ騾包ｽｨ雋ょ現竏ｩ鬮ｯ・ｽE・ｽ陞溷私・ｽE・ｽ繝ｻ
      const allNameMatch = imageData.images.find(img => {
        if (usedImages.has(img.filename)) return false;
        
        const imgName = img.itemName.toLowerCase();
        const searchName = itemName.toLowerCase();
        
        // 陞ｳ謔滂ｿｽE闕ｳﾂ髢ｾ・ｽE・ｽ
        if (imgName === searchName) return true;
        // 鬩幢ｽｨ陋ｻ繝ｻ・ｽE・ｽﾂ髢ｾ・ｽE・ｽ
        if (imgName.includes(searchName)) return true;
        if (searchName.includes(imgName)) return true;
        
        return false;
      });
      
      if (allNameMatch) {
        usedImages.add(allNameMatch.filename);
        addDebugLog(`隨ｨ繝ｻ陷茨ｽｨ騾包ｽｻ陷剃ｸ環ｰ郢ｧ迚咎倹陷鷹亂繝ｻ郢晢ｿｽE繝｡: "${displayName}" -> ${allNameMatch.filename}`);
        return allNameMatch;
      }
      
      addDebugLog(`隨ｶ繝ｻ陷茨ｽｨ騾包ｽｻ陷剃ｸ環ｰ郢ｧ蟲ｨ・ｽE・ｽ郢晄ｧｭ繝｣郢晢ｿｽE竊醍ｸｺ繝ｻ "${displayName}"`);
      return null;
    }
    
    // 郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ定惺髦ｪ縲堤ｹ晄ｧｭ繝｣郢晢ｿｽEﾎｦ郢ｧ・ｽE・ｽ繝ｻ蛹ｻ・ｽE・ｽ郢ｧ鬆第ｲ宣怕貅假ｿｽE繝ｻ繝ｻ
    const nameMatch = regionImages.find(img => {
      const imgName = img.itemName.toLowerCase();
      const searchName = itemName.toLowerCase();
      
      // 陞ｳ謔滂ｿｽE闕ｳﾂ髢ｾ・ｽE・ｽ
      if (imgName === searchName) return true;
      
      // 鬩幢ｽｨ陋ｻ繝ｻ・ｽE・ｽﾂ髢ｾ・ｽE・ｽ繝ｻ蛹ｻ縺・・ｽ・ｽ・ｽE・ｽ郢晢ｿｽEﾎ定惺髦ｪ窶ｲ騾包ｽｻ陷剃ｸ樣倹邵ｺ・ｽE・ｽ陷ｷ・ｽE・ｽ邵ｺ・ｽE・ｽ郢ｧ蠕鯉ｽ具ｿｽE繝ｻ
      if (imgName.includes(searchName)) return true;
      
      // 鬨ｾ繝ｻ繝ｻ鬩幢ｽｨ陋ｻ繝ｻ・ｽE・ｽﾂ髢ｾ・ｽE・ｽ繝ｻ閧ｲ蛻､陷剃ｸ樣倹邵ｺ蠕後＞郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ定惺髦ｪ竊楢惺・ｽE・ｽ邵ｺ・ｽE・ｽ郢ｧ蠕鯉ｽ具ｿｽE繝ｻ
      if (searchName.includes(imgName)) return true;
      
      // 陷雁ｩ・ｽE・ｽ讒ｭﾎ樒ｹ晏生ﾎ晉ｸｺ・ｽE・ｽ邵ｺ・ｽE・ｽ郢晄ｧｭ繝｣郢晢ｿｽEﾎｦ郢ｧ・ｽE・ｽ
      const imgWords = imgName.split('_');
      const searchWords = searchName.split(' ');
      
      for (const searchWord of searchWords) {
        if (searchWord.length > 1) { // 1隴・ｿｽE・ｽE・ｽ蜉ｱ繝ｻ陷雁ｩ・ｽE・ｽ讒ｭ繝ｻ鬮ｯ・ｽE・ｽ陞滂ｿｽE
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
      addDebugLog(`隨ｨ繝ｻ陜ｨ・ｽE・ｽ陜難ｿｽE陷ｷ讎奇ｿｽ・ｽ郢晄ｧｭ繝｣郢晢ｿｽE "${displayName}" -> ${nameMatch.filename}`);
      return nameMatch;
    } else {
      addDebugLog(`隨ｶ繝ｻ陜ｨ・ｽE・ｽ陜難ｿｽE陷ｷ讎奇ｿｽ・ｽ郢晄ｧｭ繝｣郢晢ｿｽE・ｽE・ｽ・ｽE・ｽ隰ｨ繝ｻ "${displayName}" (陜ｨ・ｽE・ｽ陜難ｿｽE ${itemRegion}, 郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽEﾎ・ ${itemName})`);
    }
    
    // 郢ｧ・ｽE・ｽ郢晢ｽｩ郢晢ｽｼ邵ｺ・ｽE・ｽ郢晄ｧｭ繝｣郢晢ｿｽEﾎｦ郢ｧ・ｽE・ｽ
    if (color) {
      const colorMatch = regionImages.find(img => 
        img.color && img.color.toLowerCase().includes(color.toLowerCase())
      );
      if (colorMatch) {
        usedImages.add(colorMatch.filename);
        addDebugLog(`隨ｨ繝ｻ郢ｧ・ｽE・ｽ郢晢ｽｩ郢晢ｽｼ郢晄ｧｭ繝｣郢晢ｿｽE "${displayName}" -> ${colorMatch.filename}`);
        return colorMatch;
      }
    }
    
    // 隴崢陋ｻ譏ｴ繝ｻ隴幢ｽｪ闖ｴ・ｽE・ｽ騾包ｽｨ騾包ｽｻ陷剃ｸ奇ｽ帝恆譁撰ｿｽE繝ｻ蛹ｻ繝ｵ郢ｧ・ｽE・ｽ郢晢ｽｼ郢晢ｽｫ郢晢ｿｽE繝｣郢ｧ・ｽE・ｽ繝ｻ繝ｻ
    if (regionImages.length > 0) {
      const fallbackImage = regionImages[0];
      usedImages.add(fallbackImage.filename);
      addDebugLog(`隨橸｣ｰ繝ｻ繝ｻ郢晁ｼ斐°郢晢ｽｼ郢晢ｽｫ郢晢ｿｽE繝｣郢ｧ・ｽE・ｽ: "${displayName}" -> ${fallbackImage.filename}`);
      return fallbackImage;
    }
    
    addDebugLog(`隨ｶ繝ｻ隴崢驍ｨ繧牙飭邵ｺ・ｽE・ｽ郢晄ｧｭ繝｣郢晢ｿｽE竊醍ｸｺ繝ｻ "${displayName}"`);
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

    const normalize = (s) => (s || '').toString().trim().replace(/\s+/g, '').replace(/郢晢ｽ｢郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ$/,'');
    const parts = (displayName || '').split(' ');
    const regionCand = normalize(parts[0] || region || '');
    const itemName = (parts.slice(1).join(' ') || '').toLowerCase();
    const regionCandidates = Array.from(new Set([regionCand, normalize(region || '')].filter(Boolean));

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
      setStatus('陷ｿ・ｽE・ｽ闕ｳ鄙ｫ繝ｻ邵ｲ蠕湖懃ｹｧ・ｽE・ｽ郢晞メ・ｽE・ｽ・ｽE・ｽ髴趣ｽｼ邵ｲ髦ｪﾂｰ郢ｧ蟲ｨ繝ｵ郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｽｫ郢ｧ蟶晢ｿｽE隰壽ｧｭ・ｽE・ｽ邵ｺ・ｽE・ｽ邵ｺ荳岩味邵ｺ霈費ｼ・);
    }
  } catch {}
}
function start() {
    addDebugLog('start() 鬮｢・ｽE・ｽ隰ｨ・ｽE・ｽ邵ｺ謔滉ｻ也ｸｺ・ｽE・ｽ陷・・ｽ・ｽ邵ｺ霈費ｽ檎ｸｺ・ｽE・ｽ邵ｺ蜉ｱ笳・);
    try { 
      boot2(); 
    }
    catch (e) { 
      const errorMsg = '陋ｻ譎・・ｽ・ｽ陋ｹ謔ｶ縺顔ｹ晢ｽｩ郢晢ｽｼ: ' + e.message;
      setStatus(errorMsg);
      addDebugLog(errorMsg);
      addDebugLog('郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｿｽE縺醍ｹ晏現ﾎ樒ｹ晢ｽｼ郢ｧ・ｽE・ｽ: ' + e.stack);
      try { console.error(e); } catch {} 
    }
  }

  addDebugLog('郢ｧ・ｽE・ｽ郢ｧ・ｽE・ｽ郢晢ｽｪ郢晏干繝ｨ髫ｱ・ｽE・ｽ邵ｺ・ｽE・ｽ髴趣ｽｼ邵ｺ・ｽE・ｽ陞ｳ蠕｡・ｽE・ｽ繝ｻ);
  addDebugLog(`document.readyState: ${document.readyState}`);

  if (document.readyState === 'loading') {
    addDebugLog('DOMContentLoaded 郢ｧ・ｽE・ｽ郢晏生ﾎｦ郢晏現・ｽE・ｽ陟包ｿｽE・ｽE・ｽ貊会ｽｸ・ｽE・ｽ');
    document.addEventListener('DOMContentLoaded', start);
  } else {
    addDebugLog('DOM髫暦ｽ｣隴ｫ蜈茨ｽｸ蛹ｻ竏ｩ邵ｲ竏晏初隴弱ｊ・ｽE・ｽ・ｽE・ｽ陷搾ｿｽE);
    // DOM 髫暦ｽ｣隴ｫ蜈茨ｽｸ蛹ｻ竏ｩ邵ｺ・ｽE・ｽ郢ｧ迚吝初隴弱ｊ・ｽE・ｽ・ｽE・ｽ陷搾ｿｽE
    start();
  }

  // New image resolve + viewer using CSV when possible
  function showImage2(item) {
    addDebugLog(`騾包ｽｻ陷貞臆・ｽE・ｽ・ｽE・ｽ驕会ｽｺ鬮｢蜿･・ｽE・ｽ繝ｻ ${item.name} (${item.category})`);
    let imagePath = null;
    try {
      if (item && item.image && item.image.path) {
        imagePath = item.image.path;
      } else if (typeof findMatchingImage === 'function' && imageData && imageData.images && imageData.images.length) {
        const m = smartFindImage(item.name || item.originalName || '', item.region || '', item.color || '', item.prefectureNo || '', item.order || 0);
        if (m && m.path) imagePath = m.path;
      }
    } catch {}
    addDebugLog(`雎趣ｽｺ陞ｳ螢ｹ・ｽE・ｽ邵ｺ貅ｽ蛻､陷剃ｸ翫Τ郢ｧ・ｽE・ｽ: ${imagePath || '(邵ｺ・ｽE・ｽ邵ｺ繝ｻ'}`);

    if (imagePath) {
      els.imageTitle.textContent = item.name;
      els.mainImage.src = imagePath;
      els.mainImage.alt = item.name;
      els.imageInfo.textContent = `${item.category} - ${item.name} (${item.color || '豼ｶ・ｽE・ｽ闕ｳ閧ｴ繝ｻ'})`;
      els.imageViewer.style.display = 'flex';
      els.mainImage.onload = () => { addDebugLog(`騾包ｽｻ陷貞臆・ｽE・ｽ・ｽE・ｽ邵ｺ・ｽE・ｽ髴趣ｽｼ邵ｺ・ｽE・ｽ隰御ｻ咏ｲ･: ${imagePath}`); };
      els.mainImage.onerror = () => { addDebugLog(`騾包ｽｻ陷貞臆・ｽE・ｽ・ｽE・ｽ邵ｺ・ｽE・ｽ髴趣ｽｼ邵ｺ・ｽE・ｽ陞滂ｽｱ隰ｨ繝ｻ ${imagePath}`); };
    } else {
      addDebugLog(`騾包ｽｻ陷剃ｸ岩ｲ髫穂ｹ昶命邵ｺ荵晢ｽ顔ｸｺ・ｽE・ｽ邵ｺ蟶呻ｽ・ ${item.name}`);
    }
  }
})();
