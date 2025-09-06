const fs = require('fs');

function convertToTwoDigitFormat() {
  try {
    // mokekememo02.txtを読み込み
    const content = fs.readFileSync('mokekememo02.txt', 'utf8');
    const lines = content.split('\n');
    
    const convertedLines = [];
    
    for (const line of lines) {
      if (line.trim() === '') {
        convertedLines.push(line);
        continue;
      }
      
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const categoryNumber = parts[0].trim();
        const categoryName = parts[1].trim();
        
        // 中分類番号を2桁に変換して、中分類名と繋げる
        const twoDigitNumber = categoryNumber.padStart(2, '0');
        const convertedName = `${twoDigitNumber}_${categoryName}`;
        
        // 1番目の列を削除して、2番目の列だけを残す
        convertedLines.push(convertedName);
      } else {
        convertedLines.push(line);
      }
    }
    
    // 変換されたデータをファイルに書き込み
    const convertedContent = convertedLines.join('\n');
    fs.writeFileSync('mokekememo_fixed.md', convertedContent, 'utf8');
    
    console.log('修正完了！mokekememo_fixed.md に保存しました。');
    
    // 最初の10行を表示して確認
    console.log('\n修正結果（最初の10行）:');
    convertedLines.slice(0, 10).forEach((line, index) => {
      console.log(`${index + 1}: ${line}`);
    });
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

convertToTwoDigitFormat();
