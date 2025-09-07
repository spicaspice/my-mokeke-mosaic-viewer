(() => {
  'use strict';

  // Constants (use Unicode escapes to avoid encoding issues in source)
  const UNCAT = '\u672a\u5206\u985e'; // 譛ｪ蛻・�E�・
  const NAME_UNKNOWN = '(\u540d\u79f0\u4e0d\u660e)'; // (蜷咲�E��E�荳肴・)

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
    localStorage.setItem(storageKey, JSON.stringify([...progress]);

  function setupWithText(text) {
    showLoading('繝ｪ繧�E�繝医�E�隗�E�譫蝉ｸ�E�窶�E�');
    rawText = text || '';
    const hash = djb2(rawText);
    storageKey = `mokeke:v1:${hash}`;
    progress = new Set();
    usedImages.clear(); // 菴�E�逕ｨ貂医∩逕ｻ蜒上そ繝�Eヨ繧偵Μ繧�E�繝�Eヨ
    loadProgress();
    loadOverrides();
    data = parseAuto(rawText);
    
    // 蜈･謁E��律縺後≠繧九い繧�E�繝�EΒ繧定�E蜍輔〒繝�Eぉ繝�Eけ貂医∩縺�E�縺吶�E�E
    let autoCheckedCount = 0;
    for (const item of data.items) {
      if (item.isAcquired && !progress.has(item.id)) {
        progress.add(item.id);
        autoCheckedCount++;
      }
    }
    
    if (autoCheckedCount > 0) {
      addDebugLog(`${autoCheckedCount} 莉ｶ縺�E�繧�E�繧�E�繝�EΒ繧貞�E謁E��律縺�E�繧医�E�閾�E�蜍輔メ繧�E�繝�Eけ縺励∪縺励◁E);
      saveProgress();
    }
    
    if (els.helpBox) els.helpBox.open = !data.items.length;
    sync();
  }

  // New: list setup with overwrite option (use file ownership as source of truth when requested)
  function setupListWithOptions(text, opts = {}) {
    showLoading('繝ｪ繧�E�繝医�E�隗�E�譫蝉ｸ�E�窶�E�');
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
    let isFirstLine = true; // 繝倥ャ繝繝ｼ陦後ｒ繧�E�繧�E�繝�E・縺吶�E�縺溘ａ縺�E�繝輔Λ繧�E�
    
    for (const raw of lines) {
      if (!raw) continue;
      if (raw.trim().startsWith('#')) continue;
      
      // 譛蛻昴・陦鯉ｼ医・繝�Eム繝ｼ陦鯉ｼ峨�E�繧�E�繧�E�繝�E・
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }
      
      const cols = raw.split('\t');
      if (cols.length < 7) continue; // 譁E��縺励�E�讒矩�E�縺�E�縺�E�7蛻怜ｿ・�E�・

      for (let i = 0; i < cols.length; i++) cols[i] = cols[i].trim();
      // keep trailing empty fields to preserve column count (e.g., 蜈･謁E��律縺檎ｩ�E�縺�E�繧・蛻励�E�邯�E�謖�E
      // while (cols.length && cols[cols.length-1] === '') cols.pop();
      if (!cols.length) continue;

      // 譁E��縺励�E�讒矩�E�縺�E�蛻励�E�蜿門�E�・
      const majorCategory = cols[0]; // 螟ｧ蛻・�E�樒�E蜿�E�
      const minorCategory = cols[1]; // 荳�E�蛻・�E�槫錁E
      const prefectureNo = cols[2];  // 逵君O
      const region = cols[3];        // 蝨�E�蝓�E
      const color = cols[4];         // 繧�E�繝ｩ繝ｼ蛹�E�蛻・      // 荳�E�縺�E�鬁E�E・縺後≠繧区眠繝輔か繝ｼ繝槭ャ繝医↓蟇�E�蠢懶�E�亥・謨�E�>=8・・      let order = 0, name = '', acquiredDate = '';
      if (cols.length >= 8) {
        order = parseInt(cols[5], 10); if (!Number.isFinite(order)) order = 0;
        name = cols[6];
        acquiredDate = cols[7];
      } else {
        name = cols[5];
        acquiredDate = cols[6];
      }

      // 繧�E�繝�Eざ繝ｪ繧呈ｧ狗ｯ・
      majorCategories.add(majorCategory);
      minorCategories.add(minorCategory);

      // 陦�E�遉ｺ蠖｢蠑�E 蝨�E�蝓�E蜷榊�� 繧�E�繝ｩ繝ｼ蛹�E�蛻・
      let displayName = '';
      if (region) displayName += region;
      if (name) displayName += (displayName ? ' ' : '') + name;
      if (color && color.length <= 10 && !/[隨�E�蠑ｾ]/.test(color)) {
        displayName += (displayName ? ' ' : '') + color;
      }
      
      if (!displayName) displayName = NAME_UNKNOWN;

      const idSeed = (cols[0] || '') + '::' + majorCategory + '::' + minorCategory + '::' + name + '::' + order;
      const id = djb2(idSeed);
      
      // 蟁E��蠢懊�E繧狗判蜒上ｒ讀懁E���E�
       const matchingImage = smartFindImage(displayName, region, color, prefectureNo, order);
      
      items.push({ 
        id, 
        name: displayName, // 陦�E�遉ｺ逕ｨ縺�E�蜷榊��
        originalName: name, // 蜈�E・蜷榊��
        region: region, // 蝨�E�蝓�E
        color: color, // 繧�E�繝ｩ繝ｼ蛹�E�蛻・
        majorCategory: majorCategory, // 螟ｧ蛻・�E�・
        minorCategory: minorCategory, // 荳�E�蛻・�E�・
        category: `${majorCategory} > ${minorCategory}`, // 髫主�E��E�陦�E�遉ｺ逕ｨ
        prefectureNo: prefectureNo,
        order: order,
        acquiredDate: acquiredDate,
        isAcquired: !!acquiredDate && acquiredDate.trim() !== '', // 蜈･謁E��律縺後≠繧句�E��E�蜷医・蜿門�E�玲�E�医∩
        image: matchingImage // 蟁E��蠢懊�E繧狗判蜒乗ュ蝣�E�
      });
    }
    
    return { 
      majorCategories: Array.from(majorCategories).sort(),
      minorCategories: Array.from(minorCategories).sort(),
      categories: Array.from(majorCategories).sort(), // 蠕梧婿莠呈鋤諤�E�縺�E�縺溘ａE
      items 
    };
  }

  // 逕ｻ蜒上ョ繝ｼ繧�E�繧定ｪ�E�縺�E�霎ｼ繧・育�E��E�逡�E�蛹也沿・・
  async function loadImageData() {
    addDebugLog('逕ｻ蜒上ョ繝ｼ繧�E�縺�E�隱�E�縺�E�霎ｼ縺�E�髢句�E�具�E�育�E��E�逡�E�蛹也沿・・);
    
    // 螳滁E��縺�E�逕ｻ蜒上ヵ繧�E�繧�E�繝ｫ縺�E�逶�E�謗･隱�E�縺�E�霎ｼ縺�E�縺壹√ヵ繧�E�繧�E�繝ｫ蜷阪°繧画耳貂ｬ縺吶�E�譁E��蠑上�E螟画峩
    imageData = { regions: [], images: [] };
    
    addDebugLog('逕ｻ蜒上ョ繝ｼ繧�E�隱�E�縺�E�霎ｼ縺�E�螳御�E�・�E�育�E��E�逡�E�蛹也沿・・);
    return imageData;
  }
  
  // 逕ｻ蜒上ヵ繧�E�繧�E�繝ｫ蜷阪�E�隗�E�譫・
  function parseImageFilename(filename, regionName) {
    // 萓�E 01_蛹玲�E��E�驕点01_蛹玲�E��E�驕点01_迚�Ejpg
    const parts = filename.replace('.jpg', '').split('_');
    if (parts.length < 6) return null;
    
    const prefectureNo = parts[0];
    const prefecture = parts[1];
    const subRegion = parts[3];
    // 繧�E�繧�E�繝�EΒ蜷阪・5逡�E�逶�E�莉･髯阪�E�邨仙粋�E医き繝ｩ繝ｼ諠・�E��E�繧めE��繧・・
    const itemName = parts.slice(5).join('_');
    const color = ''; // 繧�E�繝ｩ繝ｼ諠・�E��E�縺�E�蛻�E�騾碑ｧ�E�譫・
    
    // 繝�Eヰ繝�Eげ繝ｭ繧�E�繧定｡�E�遉ｺ・域怙蛻昴・5譫壹・縺�E�・・
    if (imageData.images.length < 5) {
      addDebugLog(`逕ｻ蜒剰�E��E�譫・ ${filename} -> 蝨�E�蝓�E${prefecture}, 繧�E�繧�E�繝�E΁E${itemName}`);
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
  
  // 蝨�E�蝓溷錐縺九ｉ繝輔か繝ｫ繝蜷阪�E�蜿門�E�・
  function getRegionFolder(regionName) {
    const folderMap = {
      '蛹玲�E��E�驕�E: '01hokkaido',
      '譚ｱ蛹・: '02tohoku',
      '髢�E�譚ｱ': '03kanto',
      '荳�E�驛ｨ': '04chubu',
      '霑�E柁E: '05kinki',
      '荳�E�蝗ｽ': '06chugoku',
      '蝗帛嵁E: '07shikoku',
      '荵晏ｷ・: '08kyushu',
      '豐也ｸ・: '09okinawa',
      '繧�E�繝昴・繝�E: '10sports',
      '豌ｴ譌城�E��E�': '11suizokukan',
      '蟁E��遽': '12kisetsu'
    };
    return folderMap[regionName] || '';
  }
  
  // 菴�E�逕ｨ貂医∩逕ｻ蜒上ｒ霑�E�霍｡縺吶�E�繧�E�繝�Eヨ
  const usedImages = new Set();
  
  // 繧�E�繧�E�繝�EΒ縺�E�蟁E��蠢懊�E繧狗判蜒上ｒ讀懁E���E�
  function findMatchingImage(displayName, region, color, prefectureNo) {
    if (!imageData.images.length) {
      return null;
    }
    
    // 陦�E�遉ｺ蜷阪°繧牙�E蝓溘�E繧�E�繧�E�繝�EΒ蜷阪�E�蛻・屬
    const displayParts = displayName.split(' ');
    const itemRegion = displayParts[0]; // 譛蛻昴・驛ｨ蛻・′蝨�E�蝓�E
    const itemName = displayParts.slice(1).join(' '); // 谿九ｊ縺後い繧�E�繝�EΒ蜷・
    
    // 蝨�E�蝓溷錐縺�E�邨槭�E�霎�E�縺�E�・医�E�繧頑沐霆溘�E繝槭ャ繝�EΦ繧�E�・・
    const regionImages = imageData.images.filter(img => {
      // 菴�E�逕ｨ貂医∩縺�E�逕ｻ蜒上�E髯�E�螟�E
      if (usedImages.has(img.filename)) return false;
      
      // 螳悟�E荳閾�E�
      if (img.prefecture === itemRegion || img.subRegion === itemRegion) return true;
      // 驛ｨ蛻・�E�閾�E�
      if (img.prefecture && img.prefecture.includes(itemRegion)) return true;
      if (img.subRegion && img.subRegion.includes(itemRegion)) return true;
      // 騾・・驛ｨ蛻・�E�閾�E�・・temRegion縺檎判蜒上�E蝨�E�蝓溷錐縺�E�蜷�E�縺�E�繧後ｋ�E・
      if (img.prefecture && itemRegion.includes(img.prefecture)) return true;
      if (img.subRegion && itemRegion.includes(img.subRegion)) return true;
      return false;
    });
    
    // 蝨�E�蝓溘�E繝�Eメ縺励◁E��ｻ蜒乗�E繧偵Ο繧�E�縺�E�險倬鹸・育�E��E�貎斐↓�E・
    if (regionImages.length === 0) {
      addDebugLog(`笶・蝨�E�蝓溘�E繝�Eメ縺�E�縺・ "${displayName}" (蝨�E�蝓�E ${itemRegion})`);
    }
    
    if (!regionImages.length) {
      // 蝨�E�蝓溘〒隕九▽縺九ｉ縺�E�縺・�E��E�蜷医・縲∝�E逕ｻ蜒上°繧峨ぁE���E�繝�EΒ蜷阪〒讀懁E���E�・井ｽ�E�逕ｨ貂医∩髯�E�螟厄�E�・
      const allNameMatch = imageData.images.find(img => {
        if (usedImages.has(img.filename)) return false;
        
        const imgName = img.itemName.toLowerCase();
        const searchName = itemName.toLowerCase();
        
        // 螳悟�E荳閾�E�
        if (imgName === searchName) return true;
        // 驛ｨ蛻・�E�閾�E�
        if (imgName.includes(searchName)) return true;
        if (searchName.includes(imgName)) return true;
        
        return false;
      });
      
      if (allNameMatch) {
        usedImages.add(allNameMatch.filename);
        addDebugLog(`笨・蜈ｨ逕ｻ蜒上°繧牙錐蜑阪・繝�Eメ: "${displayName}" -> ${allNameMatch.filename}`);
        return allNameMatch;
      }
      
      addDebugLog(`笶・蜈ｨ逕ｻ蜒上°繧峨�E�繝槭ャ繝�E↑縺・ "${displayName}"`);
      return null;
    }
    
    // 繧�E�繧�E�繝�EΒ蜷阪〒繝槭ャ繝�EΦ繧�E�・医�E�繧頑沐霆溘�E・・
    const nameMatch = regionImages.find(img => {
      const imgName = img.itemName.toLowerCase();
      const searchName = itemName.toLowerCase();
      
      // 螳悟�E荳閾�E�
      if (imgName === searchName) return true;
      
      // 驛ｨ蛻・�E�閾�E�・医ぁE���E�繝�EΒ蜷阪′逕ｻ蜒丞錐縺�E�蜷�E�縺�E�繧後ｋ�E・
      if (imgName.includes(searchName)) return true;
      
      // 騾・・驛ｨ蛻・�E�閾�E�・育判蜒丞錐縺後い繧�E�繝�EΒ蜷阪↓蜷�E�縺�E�繧後ｋ�E・
      if (searchName.includes(imgName)) return true;
      
      // 蜊倩�E�槭Ξ繝吶Ν縺�E�縺�E�繝槭ャ繝�EΦ繧�E�
      const imgWords = imgName.split('_');
      const searchWords = searchName.split(' ');
      
      for (const searchWord of searchWords) {
        if (searchWord.length > 1) { // 1譁�E�E�励・蜊倩�E�槭・髯�E�螟�E
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
      addDebugLog(`笨・蝨�E�蝓�E蜷榊��繝槭ャ繝�E "${displayName}" -> ${nameMatch.filename}`);
      return nameMatch;
    } else {
      addDebugLog(`笶・蝨�E�蝓�E蜷榊��繝槭ャ繝�E�E��E�謨・ "${displayName}" (蝨�E�蝓�E ${itemRegion}, 繧�E�繧�E�繝�E΁E ${itemName})`);
    }
    
    // 繧�E�繝ｩ繝ｼ縺�E�繝槭ャ繝�EΦ繧�E�
    if (color) {
      const colorMatch = regionImages.find(img => 
        img.color && img.color.toLowerCase().includes(color.toLowerCase())
      );
      if (colorMatch) {
        usedImages.add(colorMatch.filename);
        addDebugLog(`笨・繧�E�繝ｩ繝ｼ繝槭ャ繝�E "${displayName}" -> ${colorMatch.filename}`);
        return colorMatch;
      }
    }
    
    // 譛蛻昴・譛ｪ菴�E�逕ｨ逕ｻ蜒上ｒ霑斐�E・医ヵ繧�E�繝ｼ繝ｫ繝�Eャ繧�E�・・
    if (regionImages.length > 0) {
      const fallbackImage = regionImages[0];
      usedImages.add(fallbackImage.filename);
      addDebugLog(`笞・・繝輔か繝ｼ繝ｫ繝�Eャ繧�E�: "${displayName}" -> ${fallbackImage.filename}`);
      return fallbackImage;
    }
    
    addDebugLog(`笶・譛邨ら噪縺�E�繝槭ャ繝�E↑縺・ "${displayName}"`);
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

    const normalize = (s) => (s || '').toString().trim().replace(/\s+/g, '').replace(/繝｢繧�E�繧�E�$/,'');
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
      setStatus('蜿�E�荳翫・縲後Μ繧�E�繝郁�E��E�霎ｼ縲阪°繧峨ヵ繧�E�繧�E�繝ｫ繧帝�E謚槭�E�縺�E�縺上□縺輔！E);
    }
  } catch {}
}
function start() {
    addDebugLog('start() 髢�E�謨�E�縺悟他縺�E�蜁E��縺輔ｌ縺�E�縺励◁E);
    try { 
      boot2(); 
    }
    catch (e) { 
      const errorMsg = '蛻晁E��蛹悶お繝ｩ繝ｼ: ' + e.message;
      setStatus(errorMsg);
      addDebugLog(errorMsg);
      addDebugLog('繧�E�繧�E�繝�Eけ繝医Ξ繝ｼ繧�E�: ' + e.stack);
      try { console.error(e); } catch {} 
    }
  }

  addDebugLog('繧�E�繧�E�繝ｪ繝励ヨ隱�E�縺�E�霎ｼ縺�E�螳御�E�・);
  addDebugLog(`document.readyState: ${document.readyState}`);

  if (document.readyState === 'loading') {
    addDebugLog('DOMContentLoaded 繧�E�繝吶Φ繝医�E�蠕�E�E�滉ｸ�E�');
    document.addEventListener('DOMContentLoaded', start);
  } else {
    addDebugLog('DOM隗｣譫先ｸ医∩縲∝叉譎り�E��E�蜍�E);
    // DOM 隗｣譫先ｸ医∩縺�E�繧牙叉譎り�E��E�蜍�E
    start();
  }

  // New image resolve + viewer using CSV when possible
  function showImage2(item) {
    addDebugLog(`逕ｻ蜒剰�E��E�遉ｺ髢句�E�・ ${item.name} (${item.category})`);
    let imagePath = null;
    try {
      if (item && item.image && item.image.path) {
        imagePath = item.image.path;
      } else if (typeof findMatchingImage === 'function' && imageData && imageData.images && imageData.images.length) {
        const m = smartFindImage(item.name || item.originalName || '', item.region || '', item.color || '', item.prefectureNo || '', item.order || 0);
        if (m && m.path) imagePath = m.path;
      }
    } catch {}
    addDebugLog(`豎ｺ螳壹�E�縺溽判蜒上ヱ繧�E�: ${imagePath || '(縺�E�縺・'}`);

    if (imagePath) {
      els.imageTitle.textContent = item.name;
      els.mainImage.src = imagePath;
      els.mainImage.alt = item.name;
      els.imageInfo.textContent = `${item.category} - ${item.name} (${item.color || '濶�E�荳肴・'})`;
      els.imageViewer.style.display = 'flex';
      els.mainImage.onload = () => { addDebugLog(`逕ｻ蜒剰�E��E�縺�E�霎ｼ縺�E�謌仙粥: ${imagePath}`); };
      els.mainImage.onerror = () => { addDebugLog(`逕ｻ蜒剰�E��E�縺�E�霎ｼ縺�E�螟ｱ謨・ ${imagePath}`); };
    } else {
      addDebugLog(`逕ｻ蜒上′隕九▽縺九ｊ縺�E�縺帙ａE ${item.name}`);
    }
  }
})();
