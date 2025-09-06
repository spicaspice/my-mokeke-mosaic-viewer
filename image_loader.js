// Defines a global function `loadImageDataCsv` used by app.js
// Loads `image_data.csv`, parses it, and returns { regions, images }
(function () {
  'use strict';

  function log(msg) {
    try { console.log('[image-loader]', msg); } catch {}
    try {
      var debugEl = document.getElementById('debugLog');
      if (debugEl) { debugEl.textContent += String(msg) + '\n'; debugEl.scrollTop = debugEl.scrollHeight; }
    } catch {}
  }

  function parseCsv(text) {
    const out = [];
    let row = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else { inQ = false; }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else { cur += ch; }
      }
    }
    if (cur.length || row.length) { row.push(cur); out.push(row); }
    return out;
  }

  async function loadImageDataCsv() {
    log('画像データの読み込み開始');
    const result = { regions: [], images: [] };
    try {
      const res = await fetch('image_data.csv', { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      const rows = parseCsv(text);
      if (rows.length <= 1) {
        log('image_data.csv は空、またはヘッダーのみ');
        return result;
      }
      const header = rows[0];
      // Fuzzy header index resolver (handles mojibake and variations)
      function findCol(names, fallback) {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i !== -1) return i;
        }
        // fuzzy contains
        for (let i = 0; i < header.length; i++) {
          const h = (header[i] || '').toString();
          if (names.some(n => h.includes(n.replace(/名$/, '')))) return i;
        }
        return fallback;
      }
      // Default order written by extract_image_data.js
      const byOrder = { areaNo:0, area:1, regionNo:2, region:3, itemNo:4, itemName:5, color:6, filename:7, folder:8 };
      const idx = {
        areaNo: findCol(['エリア番号'], byOrder.areaNo),
        area: findCol(['エリア'], byOrder.area),
        regionNo: findCol(['地域番号'], byOrder.regionNo),
        region: findCol(['地域'], byOrder.region),
        itemNo: findCol(['番号'], byOrder.itemNo),
        itemName: findCol(['名前'], byOrder.itemName),
        color: findCol(['カラー種別','カラー区分','カラー'], byOrder.color),
        filename: findCol(['ファイル名','ファイル'], byOrder.filename),
        folder: findCol(['フォルダ名','フォルダ','フォルダー'], byOrder.folder),
      };
      const images = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const folder = r[idx.folder] || r[byOrder.folder] || '';
        const filename = r[idx.filename] || r[byOrder.filename] || '';
        if (!folder || !filename) continue;
        images.push({
          areaNo: r[idx.areaNo] || r[byOrder.areaNo] || '',
          area: r[idx.area] || r[byOrder.area] || '',
          regionNo: r[idx.regionNo] || r[byOrder.regionNo] || '',
          regionName: r[idx.region] || r[byOrder.region] || '',
          itemNo: r[idx.itemNo] || r[byOrder.itemNo] || '',
          itemName: r[idx.itemName] || r[byOrder.itemName] || '',
          color: r[idx.color] || r[byOrder.color] || '',
          filename,
          path: `images/${folder}/${filename}`,
        });
      }
      result.images = images;
      result.regions = [...new Set(images.map(it => it.regionName))].sort();
      try {
        const missRegion = images.filter(it => !it.regionName).length;
        const missName = images.filter(it => !it.itemName).length;
        log(`画像データ読み込み完了: ${images.length}件 (region欠損:${missRegion}, name欠損:${missName})`);
      } catch { log(`画像データ読み込み完了: ${images.length}件`); }
    } catch (e) {
      log('image_data.csv の読み込みに失敗: ' + e.message);
    }
    // publish to global for app.js to pick up
    try { window.mokekeImageData = result; } catch {}
    return result;
  }

  // expose globally
  window.loadImageDataCsv = loadImageDataCsv;
})();
