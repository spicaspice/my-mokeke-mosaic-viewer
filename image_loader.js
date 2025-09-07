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
    log('image_data.csv: loading');
    const result = { regions: [], images: [] };
    try {
      const res = await fetch('image_data.csv', { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      const rows = parseCsv(text);
      if (!rows || rows.length <= 1) { log('image_data.csv is empty or header-only'); return result; }
      const header = rows[0] || [];
      // default column order produced by extract_image_data.js
      const idx = { areaNo:0, area:1, regionNo:2, region:3, itemNo:4, itemName:5, color:6, filename:7, folder:8 };
      const images = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 9) continue;
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
      result.regions = [...new Set(images.map(it => it.regionName).filter(Boolean))].sort();
      log(`image_data.csv loaded: ${images.length} images`);
    } catch (e) {
      log('image_data.csv load failed: ' + e.message);
    }
    try { window.mokekeImageData = result; } catch {}
    return result;
  }

  window.loadImageDataCsv = loadImageDataCsv;
})();
