(() => {
  'use strict';

  // Constants (use Unicode escapes to avoid encoding issues in source)
  const UNCAT = '\u672a\u5206\u985e'; // è­›ï½ªè›»ãƒ»E¡ãƒ»
  const NAME_UNKNOWN = '(\u540d\u79f0\u4e0d\u660e)'; // (èœ·å’²E§E°è³è‚´ãƒ»)

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
    showLoading('ç¹ï½ªç¹§E¹ç¹åŒ»E’éš—E£è­«è‰ï½¸E­çª¶E¦');
    rawText = text || '';
    const hash = djb2(rawText);
    storageKey = `mokeke:v1:${hash}`;
    progress = new Set();
    usedImages.clear(); // è´E¿é€•ï½¨è²‚åŒ»âˆ©é€•ï½»èœ’ä¸Šãç¹ãEãƒ¨ç¹§åµÎœç¹§E»ç¹ãEãƒ¨
    loadProgress();
    loadOverrides();
    data = parseAuto(rawText);
    
    // èœˆï½¥è¬EŒºå¾‹ç¸ºå¾Œâ‰ ç¹§ä¹ã„ç¹§E¤ç¹ãEÎ’ç¹§å®šãEèœè¼”ã€’ç¹âEã‰ç¹ãEã‘è²‚åŒ»âˆ©ç¸ºE«ç¸ºå¶EE
    let autoCheckedCount = 0;
    for (const item of data.items) {
      if (item.isAcquired && !progress.has(item.id)) {
        progress.add(item.id);
        autoCheckedCount++;
      }
    }
    
    if (autoCheckedCount > 0) {
      addDebugLog(`${autoCheckedCount} è‰ï½¶ç¸ºE®ç¹§E¢ç¹§E¤ç¹ãEÎ’ç¹§è²ãEè¬EŒºå¾‹ç¸ºE«ç¹§åŒ»EŠé–¾Eªèœè¼”ãƒ¡ç¹§E§ç¹ãEã‘ç¸ºåŠ±âˆªç¸ºåŠ±â—E);
      saveProgress();
    }
    
    if (els.helpBox) els.helpBox.open = !data.items.length;
    sync();
  }

  // New: list setup with overwrite option (use file ownership as source of truth when requested)
  function setupListWithOptions(text, opts = {}) {
    showLoading('ç¹ï½ªç¹§E¹ç¹åŒ»E’éš—E£è­«è‰ï½¸E­çª¶E¦');
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
    let isFirstLine = true; // ç¹å€¥ãƒ£ç¹Â€ç¹ï½¼é™¦å¾Œï½’ç¹§E¹ç¹§E­ç¹ãEãƒ»ç¸ºå¶E‹ç¸ºæº˜ï½ç¸ºE®ç¹è¼”Î›ç¹§E°
    
    for (const raw of lines) {
      if (!raw) continue;
      if (raw.trim().startsWith('#')) continue;
      
      // è­›Â€è›»æ˜´ãƒ»é™¦é¯‰ï½¼åŒ»ãƒ»ç¹ãEãƒ ç¹ï½¼é™¦é¯‰ï½¼å³¨E’ç¹§E¹ç¹§E­ç¹ãEãƒ»
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }
      
      const cols = raw.split('\t');
      if (cols.length < 7) continue; // è­E½°ç¸ºåŠ±Eè®’çŸ©Â€E°ç¸ºE§ç¸ºE¯7è›»æ€œï½¿ãƒ»E¦ãƒ»

      for (let i = 0; i < cols.length; i++) cols[i] = cols[i].trim();
      // keep trailing empty fields to preserve column count (e.g., èœˆï½¥è¬EŒºå¾‹ç¸ºæªï½©Eºç¸ºE§ç¹§ãƒ»è›»åŠ±E’é‚¯E­è¬–ãE
      // while (cols.length && cols[cols.length-1] === '') cols.pop();
      if (!cols.length) continue;

      // è­E½°ç¸ºåŠ±Eè®’çŸ©Â€E°ç¸ºE®è›»åŠ±E’èœ¿é–€E¾ãƒ»
      const majorCategory = cols[0]; // èŸï½§è›»ãƒ»E¡æ¨’åEèœ¿E·
      const minorCategory = cols[1]; // è³E­è›»ãƒ»E¡æ§«éŒE
      const prefectureNo = cols[2];  // é€µå›O
      const region = cols[3];        // è¨E°è“ãE
      const color = cols[4];         // ç¹§E«ç¹ï½©ç¹ï½¼è›¹Eºè›»ãƒ»      // è³E¦ç¸ºE³é¬EEãƒ»ç¸ºå¾Œâ‰ ç¹§åŒºçœ ç¹è¼”ã‹ç¹ï½¼ç¹æ§­ãƒ£ç¹åŒ»â†“èŸ‡E¾è ¢æ‡¶E¼äº¥ãƒ»è¬¨E°>=8ãƒ»ãƒ»      let order = 0, name = '', acquiredDate = '';
      if (cols.length >= 8) {
        order = parseInt(cols[5], 10); if (!Number.isFinite(order)) order = 0;
        name = cols[6];
        acquiredDate = cols[7];
      } else {
        name = cols[5];
        acquiredDate = cols[6];
      }

      // ç¹§E«ç¹ãEã–ç¹ï½ªç¹§å‘ˆï½§ç‹—ï½¯ãƒ»
      majorCategories.add(majorCategory);
      minorCategories.add(minorCategory);

      // é™¦E¨é‰ï½ºè –ï½¢è ‘ãE è¨E°è“ãEèœ·æ¦Šçã ç¹§E«ç¹ï½©ç¹ï½¼è›¹Eºè›»ãƒ»
      let displayName = '';
      if (region) displayName += region;
      if (name) displayName += (displayName ? ' ' : '') + name;
      if (color && color.length <= 10 && !/[éš¨E¬è ‘ï½¾]/.test(color)) {
        displayName += (displayName ? ' ' : '') + color;
      }
      
      if (!displayName) displayName = NAME_UNKNOWN;

      const idSeed = (cols[0] || '') + '::' + majorCategory + '::' + minorCategory + '::' + name + '::' + order;
      const id = djb2(idSeed);
      
      // èŸE½¾è ¢æ‡ŠâEç¹§ç‹—åˆ¤èœ’ä¸Šï½’è®€æ‡E½´E¢
       const matchingImage = smartFindImage(displayName, region, color, prefectureNo, order);
      
      items.push({ 
        id, 
        name: displayName, // é™¦E¨é‰ï½ºé€•ï½¨ç¸ºE®èœ·æ¦Šçã
        originalName: name, // èœˆãEãƒ»èœ·æ¦Šçã
        region: region, // è¨E°è“ãE
        color: color, // ç¹§E«ç¹ï½©ç¹ï½¼è›¹Eºè›»ãƒ»
        majorCategory: majorCategory, // èŸï½§è›»ãƒ»E¡ãƒ»
        minorCategory: minorCategory, // è³E­è›»ãƒ»E¡ãƒ»
        category: `${majorCategory} > ${minorCategory}`, // é««ä¸»E±E¤é™¦E¨é‰ï½ºé€•ï½¨
        prefectureNo: prefectureNo,
        order: order,
        acquiredDate: acquiredDate,
        isAcquired: !!acquiredDate && acquiredDate.trim() !== '', // èœˆï½¥è¬EŒºå¾‹ç¸ºå¾Œâ‰ ç¹§å¥E°E´èœ·åŒ»ãƒ»èœ¿é–€E¾ç²E¸åŒ»âˆ©
        image: matchingImage // èŸE½¾è ¢æ‡ŠâEç¹§ç‹—åˆ¤èœ’ä¹—ãƒ¥è£E±
      });
    }
    
    return { 
      majorCategories: Array.from(majorCategories).sort(),
      minorCategories: Array.from(minorCategories).sort(),
      categories: Array.from(majorCategories).sort(), // è •æ¢§å©¿è å‘ˆé‹¤è«¤E§ç¸ºE®ç¸ºæº˜ï½E
      items 
    };
  }

  // é€•ï½»èœ’ä¸Šãƒ§ç¹ï½¼ç¹§E¿ç¹§å®šï½ªE­ç¸ºE¿éœï½¼ç¹§Â€ãƒ»è‚²E°E¡é€¡E¥è›¹ä¹Ÿæ²¿ãƒ»ãƒ»
  async function loadImageData() {
    addDebugLog('é€•ï½»èœ’ä¸Šãƒ§ç¹ï½¼ç¹§E¿ç¸ºE®éš±E­ç¸ºE¿éœï½¼ç¸ºE¿é«¢å¥E§å…·E¼è‚²E°E¡é€¡E¥è›¹ä¹Ÿæ²¿ãƒ»ãƒ»);
    
    // è³æ»Eœ€ç¸ºE®é€•ï½»èœ’ä¸Šãƒµç¹§E¡ç¹§E¤ç¹ï½«ç¸ºE¯é€¶E´è¬—ï½¥éš±E­ç¸ºE¿éœï½¼ç¸ºE¾ç¸ºå£¹Â€âˆšãƒµç¹§E¡ç¹§E¤ç¹ï½«èœ·é˜ªÂ°ç¹§ç”»è€³è²‚ï½¬ç¸ºå¶E‹è­E½¹è ‘ä¸ŠâEèŸç”»å³©
    imageData = { regions: [], images: [] };
    
    addDebugLog('é€•ï½»èœ’ä¸Šãƒ§ç¹ï½¼ç¹§E¿éš±E­ç¸ºE¿éœï½¼ç¸ºE¿è³å¾¡Eºãƒ»E¼è‚²E°E¡é€¡E¥è›¹ä¹Ÿæ²¿ãƒ»ãƒ»);
    return imageData;
  }
  
  // é€•ï½»èœ’ä¸Šãƒµç¹§E¡ç¹§E¤ç¹ï½«èœ·é˜ªE’éš—E£è­«ãƒ»
  function parseImageFilename(filename, regionName) {
    // è“ãE 01_è›¹ç²EµE·é©•ç‚¹01_è›¹ç²EµE·é©•ç‚¹01_è¿šãEjpg
    const parts = filename.replace('.jpg', '').split('_');
    if (parts.length < 6) return null;
    
    const prefectureNo = parts[0];
    const prefecture = parts[1];
    const subRegion = parts[3];
    // ç¹§E¢ç¹§E¤ç¹ãEÎ’èœ·é˜ªãƒ»5é€¡Eªé€¶E®è‰ï½¥é«¯é˜ªE’é‚¨ä»™ç²‹ãEåŒ»ãç¹ï½©ç¹ï½¼è« ãƒ»E°E±ç¹§ã‚E€§ç¹§Â€ãƒ»ãƒ»
    const itemName = parts.slice(5).join('_');
    const color = ''; // ç¹§E«ç¹ï½©ç¹ï½¼è« ãƒ»E°E±ç¸ºE¯è›»E¥é¨¾ç¢‘ï½§E£è­«ãƒ»
    
    // ç¹ãEãƒ°ç¹ãEã’ç¹ï½­ç¹§E°ç¹§å®šï½¡E¨é‰ï½ºãƒ»åŸŸæ€™è›»æ˜´ãƒ»5è­«å£¹ãƒ»ç¸ºE¿ãƒ»ãƒ»
    if (imageData.images.length < 5) {
      addDebugLog(`é€•ï½»èœ’å‰°E§E£è­«ãƒ» ${filename} -> è¨E°è“ãE${prefecture}, ç¹§E¢ç¹§E¤ç¹ãEÎE${itemName}`);
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
  
  // è¨E°è“æº·éŒç¸ºä¹ï½‰ç¹è¼”ã‹ç¹ï½«ç¹Â€èœ·é˜ªE’èœ¿é–€E¾ãƒ»
  function getRegionFolder(regionName) {
    const folderMap = {
      'è›¹ç²EµE·é©•ãE: '01hokkaido',
      'è­šï½±è›¹ãƒ»: '02tohoku',
      'é«¢E¢è­šï½±': '03kanto',
      'è³E­é©›ï½¨': '04chubu',
      'éœ‘éEæŸE: '05kinki',
      'è³E­è—ï½½': '06chugoku',
      'è—å¸›åµE: '07shikoku',
      'èµæ™ï½·ãƒ»: '08kyushu',
      'è±ä¹Ÿï½¸ãƒ»: '09okinawa',
      'ç¹§E¹ç¹æ˜´ãƒ»ç¹ãE: '10sports',
      'è±Œï½´è­ŒåŸE¤E¨': '11suizokukan',
      'èŸE½£é½Â€': '12kisetsu'
    };
    return folderMap[regionName] || '';
  }
  
  // è´E¿é€•ï½¨è²‚åŒ»âˆ©é€•ï½»èœ’ä¸Šï½’éœ‘E½éœï½¡ç¸ºå¶E‹ç¹§E»ç¹ãEãƒ¨
  const usedImages = new Set();
  
  // ç¹§E¢ç¹§E¤ç¹ãEÎ’ç¸ºE«èŸE½¾è ¢æ‡ŠâEç¹§ç‹—åˆ¤èœ’ä¸Šï½’è®€æ‡E½´E¢
  function findMatchingImage(displayName, region, color, prefectureNo) {
    if (!imageData.images.length) {
      return null;
    }
    
    // é™¦E¨é‰ï½ºèœ·é˜ªÂ°ç¹§ç‰™æEè“æº˜âEç¹§E¢ç¹§E¤ç¹ãEÎ’èœ·é˜ªE’è›»ãƒ»å±¬
    const displayParts = displayName.split(' ');
    const itemRegion = displayParts[0]; // è­›Â€è›»æ˜´ãƒ»é©›ï½¨è›»ãƒ»â€²è¨E°è“ãE
    const itemName = displayParts.slice(1).join(' '); // è°¿ä¹ï½Šç¸ºå¾Œã„ç¹§E¤ç¹ãEÎ’èœ·ãƒ»
    
    // è¨E°è“æº·éŒç¸ºE§é‚¨æ§­EŠéœE¼ç¸ºE¿ãƒ»åŒ»Eˆç¹§é ‘æ²éœ†æº˜âEç¹æ§­ãƒ£ç¹âEÎ¦ç¹§E°ãƒ»ãƒ»
    const regionImages = imageData.images.filter(img => {
      // è´E¿é€•ï½¨è²‚åŒ»âˆ©ç¸ºE®é€•ï½»èœ’ä¸ŠãEé«¯E¤èŸãE
      if (usedImages.has(img.filename)) return false;
      
      // è³æ‚ŸãEè³Â€é–¾E´
      if (img.prefecture === itemRegion || img.subRegion === itemRegion) return true;
      // é©›ï½¨è›»ãƒ»E¸Â€é–¾E´
      if (img.prefecture && img.prefecture.includes(itemRegion)) return true;
      if (img.subRegion && img.subRegion.includes(itemRegion)) return true;
      // é¨¾ãƒ»ãƒ»é©›ï½¨è›»ãƒ»E¸Â€é–¾E´ãƒ»ãƒ»temRegionç¸ºæªåˆ¤èœ’ä¸ŠãEè¨E°è“æº·éŒç¸ºE«èœ·E«ç¸ºE¾ç¹§å¾Œï½‹ãEãƒ»
      if (img.prefecture && itemRegion.includes(img.prefecture)) return true;
      if (img.subRegion && itemRegion.includes(img.subRegion)) return true;
      return false;
    });
    
    // è¨E°è“æº˜ãEç¹ãEãƒ¡ç¸ºåŠ±â—E€•ï½»èœ’ä¹—çEç¹§åµÎŸç¹§E°ç¸ºE«éšªå€¬é¹¸ãƒ»è‚²E°E¡è²æ–â†“ãEãƒ»
    if (regionImages.length === 0) {
      addDebugLog(`ç¬¶ãƒ»è¨E°è“æº˜ãEç¹ãEãƒ¡ç¸ºEªç¸ºãƒ» "${displayName}" (è¨E°è“ãE ${itemRegion})`);
    }
    
    if (!regionImages.length) {
      // è¨E°è“æº˜ã€’éš•ä¹â–½ç¸ºä¹ï½‰ç¸ºEªç¸ºãƒ»E°E´èœ·åŒ»ãƒ»ç¸²âˆãEé€•ï½»èœ’ä¸ŠÂ°ç¹§å³¨ãE¹§E¤ç¹ãEÎ’èœ·é˜ªã€’è®€æ‡E½´E¢ãƒ»äº•ï½½E¿é€•ï½¨è²‚åŒ»âˆ©é«¯E¤èŸå„E¼ãƒ»
      const allNameMatch = imageData.images.find(img => {
        if (usedImages.has(img.filename)) return false;
        
        const imgName = img.itemName.toLowerCase();
        const searchName = itemName.toLowerCase();
        
        // è³æ‚ŸãEè³Â€é–¾E´
        if (imgName === searchName) return true;
        // é©›ï½¨è›»ãƒ»E¸Â€é–¾E´
        if (imgName.includes(searchName)) return true;
        if (searchName.includes(imgName)) return true;
        
        return false;
      });
      
      if (allNameMatch) {
        usedImages.add(allNameMatch.filename);
        addDebugLog(`ç¬¨ãƒ»èœˆï½¨é€•ï½»èœ’ä¸ŠÂ°ç¹§ç‰™éŒèœ‘é˜ªãƒ»ç¹ãEãƒ¡: "${displayName}" -> ${allNameMatch.filename}`);
        return allNameMatch;
      }
      
      addDebugLog(`ç¬¶ãƒ»èœˆï½¨é€•ï½»èœ’ä¸ŠÂ°ç¹§å³¨E‚ç¹æ§­ãƒ£ç¹âEâ†‘ç¸ºãƒ» "${displayName}"`);
      return null;
    }
    
    // ç¹§E¢ç¹§E¤ç¹ãEÎ’èœ·é˜ªã€’ç¹æ§­ãƒ£ç¹âEÎ¦ç¹§E°ãƒ»åŒ»Eˆç¹§é ‘æ²éœ†æº˜âEãƒ»ãƒ»
    const nameMatch = regionImages.find(img => {
      const imgName = img.itemName.toLowerCase();
      const searchName = itemName.toLowerCase();
      
      // è³æ‚ŸãEè³Â€é–¾E´
      if (imgName === searchName) return true;
      
      // é©›ï½¨è›»ãƒ»E¸Â€é–¾E´ãƒ»åŒ»ãE¹§E¤ç¹ãEÎ’èœ·é˜ªâ€²é€•ï½»èœ’ä¸éŒç¸ºE«èœ·E«ç¸ºE¾ç¹§å¾Œï½‹ãEãƒ»
      if (imgName.includes(searchName)) return true;
      
      // é¨¾ãƒ»ãƒ»é©›ï½¨è›»ãƒ»E¸Â€é–¾E´ãƒ»è‚²åˆ¤èœ’ä¸éŒç¸ºå¾Œã„ç¹§E¤ç¹ãEÎ’èœ·é˜ªâ†“èœ·E«ç¸ºE¾ç¹§å¾Œï½‹ãEãƒ»
      if (searchName.includes(imgName)) return true;
      
      // èœŠå€©Eªæ§­Îç¹å¶Îç¸ºE§ç¸ºE®ç¹æ§­ãƒ£ç¹âEÎ¦ç¹§E°
      const imgWords = imgName.split('_');
      const searchWords = searchName.split(' ');
      
      for (const searchWord of searchWords) {
        if (searchWord.length > 1) { // 1è­ãEE­åŠ±ãƒ»èœŠå€©Eªæ§­ãƒ»é«¯E¤èŸãE
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
      addDebugLog(`ç¬¨ãƒ»è¨E°è“ãEèœ·æ¦Šçãç¹æ§­ãƒ£ç¹ãE "${displayName}" -> ${nameMatch.filename}`);
      return nameMatch;
    } else {
      addDebugLog(`ç¬¶ãƒ»è¨E°è“ãEèœ·æ¦Šçãç¹æ§­ãƒ£ç¹âEE¤E±è¬¨ãƒ» "${displayName}" (è¨E°è“ãE ${itemRegion}, ç¹§E¢ç¹§E¤ç¹ãEÎE ${itemName})`);
    }
    
    // ç¹§E«ç¹ï½©ç¹ï½¼ç¸ºE§ç¹æ§­ãƒ£ç¹âEÎ¦ç¹§E°
    if (color) {
      const colorMatch = regionImages.find(img => 
        img.color && img.color.toLowerCase().includes(color.toLowerCase())
      );
      if (colorMatch) {
        usedImages.add(colorMatch.filename);
        addDebugLog(`ç¬¨ãƒ»ç¹§E«ç¹ï½©ç¹ï½¼ç¹æ§­ãƒ£ç¹ãE "${displayName}" -> ${colorMatch.filename}`);
        return colorMatch;
      }
    }
    
    // è­›Â€è›»æ˜´ãƒ»è­›ï½ªè´E¿é€•ï½¨é€•ï½»èœ’ä¸Šï½’éœ‘æ–âEãƒ»åŒ»ãƒµç¹§E©ç¹ï½¼ç¹ï½«ç¹èEãƒ£ç¹§E¯ãƒ»ãƒ»
    if (regionImages.length > 0) {
      const fallbackImage = regionImages[0];
      usedImages.add(fallbackImage.filename);
      addDebugLog(`ç¬ï£°ãƒ»ãƒ»ç¹è¼”ã‹ç¹ï½¼ç¹ï½«ç¹èEãƒ£ç¹§E¯: "${displayName}" -> ${fallbackImage.filename}`);
      return fallbackImage;
    }
    
    addDebugLog(`ç¬¶ãƒ»è­›Â€é‚¨ã‚‰å™ªç¸ºE«ç¹æ§­ãƒ£ç¹âEâ†‘ç¸ºãƒ» "${displayName}"`);
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

    const normalize = (s) => (s || '').toString().trim().replace(/\s+/g, '').replace(/ç¹ï½¢ç¹§E±ç¹§E±$/,'');
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
      setStatus('èœ¿E³è³ç¿«ãƒ»ç¸²å¾ŒÎœç¹§E¹ç¹éƒEªE­éœï½¼ç¸²é˜ªÂ°ç¹§å³¨ãƒµç¹§E¡ç¹§E¤ç¹ï½«ç¹§å¸âEè¬šæ§­E ç¸ºE¦ç¸ºä¸Šâ–¡ç¸ºè¼”ï¼E);
    }
  } catch {}
}
function start() {
    addDebugLog('start() é«¢E¢è¬¨E°ç¸ºæ‚Ÿä»–ç¸ºE³èœE½ºç¸ºè¼”ï½Œç¸ºE¾ç¸ºåŠ±â—E);
    try { 
      boot2(); 
    }
    catch (e) { 
      const errorMsg = 'è›»æ™E‚„è›¹æ‚¶ãŠç¹ï½©ç¹ï½¼: ' + e.message;
      setStatus(errorMsg);
      addDebugLog(errorMsg);
      addDebugLog('ç¹§E¹ç¹§E¿ç¹ãEã‘ç¹åŒ»Îç¹ï½¼ç¹§E¹: ' + e.stack);
      try { console.error(e); } catch {} 
    }
  }

  addDebugLog('ç¹§E¹ç¹§E¯ç¹ï½ªç¹åŠ±ãƒ¨éš±E­ç¸ºE¿éœï½¼ç¸ºE¿è³å¾¡Eºãƒ»);
  addDebugLog(`document.readyState: ${document.readyState}`);

  if (document.readyState === 'loading') {
    addDebugLog('DOMContentLoaded ç¹§E¤ç¹å¶Î¦ç¹åŒ»E’è •ãEE©æ»‰ï½¸E­');
    document.addEventListener('DOMContentLoaded', start);
  } else {
    addDebugLog('DOMéš—ï½£è­«å…ˆï½¸åŒ»âˆ©ç¸²âˆå‰è­ã‚ŠEµE·èœãE);
    // DOM éš—ï½£è­«å…ˆï½¸åŒ»âˆ©ç¸ºEªç¹§ç‰™å‰è­ã‚ŠEµE·èœãE
    start();
  }

  // New image resolve + viewer using CSV when possible
  function showImage2(item) {
    addDebugLog(`é€•ï½»èœ’å‰°E¡E¨é‰ï½ºé«¢å¥E§ãƒ» ${item.name} (${item.category})`);
    let imagePath = null;
    try {
      if (item && item.image && item.image.path) {
        imagePath = item.image.path;
      } else if (typeof findMatchingImage === 'function' && imageData && imageData.images && imageData.images.length) {
        const m = smartFindImage(item.name || item.originalName || '', item.region || '', item.color || '', item.prefectureNo || '', item.order || 0);
        if (m && m.path) imagePath = m.path;
      }
    } catch {}
    addDebugLog(`è±ï½ºè³å£¹E ç¸ºæº½åˆ¤èœ’ä¸Šãƒ±ç¹§E¹: ${imagePath || '(ç¸ºEªç¸ºãƒ»'}`);

    if (imagePath) {
      els.imageTitle.textContent = item.name;
      els.mainImage.src = imagePath;
      els.mainImage.alt = item.name;
      els.imageInfo.textContent = `${item.category} - ${item.name} (${item.color || 'æ¿¶E²è³è‚´ãƒ»'})`;
      els.imageViewer.style.display = 'flex';
      els.mainImage.onload = () => { addDebugLog(`é€•ï½»èœ’å‰°EªE­ç¸ºE¿éœï½¼ç¸ºE¿è¬Œä»™ç²¥: ${imagePath}`); };
      els.mainImage.onerror = () => { addDebugLog(`é€•ï½»èœ’å‰°EªE­ç¸ºE¿éœï½¼ç¸ºE¿èŸï½±è¬¨ãƒ» ${imagePath}`); };
    } else {
      addDebugLog(`é€•ï½»èœ’ä¸Šâ€²éš•ä¹â–½ç¸ºä¹ï½Šç¸ºE¾ç¸ºå¸™ï½E ${item.name}`);
    }
  }
})();
