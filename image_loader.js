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
      const idx = {
        areaNo: header.indexOf('エリア番号'),
        area: header.indexOf('エリア'),
        regionNo: header.indexOf('地域番号'),
        region: header.indexOf('地域'),
        itemNo: header.indexOf('番号'),
        itemName: header.indexOf('名前'),
        color: header.indexOf('カラー種別'),
        filename: header.indexOf('ファイル名'),
        folder: header.indexOf('フォルダ名'),
      };
      const images = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const folder = r[idx.folder] || '';
        const filename = r[idx.filename] || '';
        if (!folder || !filename) continue;
        images.push({
          areaNo: r[idx.areaNo] || '',
          area: r[idx.area] || '',
          regionNo: r[idx.regionNo] || '',
          regionName: r[idx.region] || '',
          itemNo: r[idx.itemNo] || '',
          itemName: r[idx.itemName] || '',
          color: r[idx.color] || '',
          filename,
          path: `images/${folder}/${filename}`,
        });
      }
      result.images = images;
      result.regions = [...new Set(images.map(it => it.regionName))].sort();
      log(`画像データ読み込み完了: ${images.length}件`);
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
