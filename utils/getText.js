import * as XLSX from 'xlsx';
import fs from 'fs';

//excelファイルからテキストを抽出する
export const getTextFromExcel = async (filePath) => {
  console.log('gettextfromExcel', filePath); 
  if (!fs.existsSync(filePath)) { 
    throw new Error(`File not found: ${filePath}`);  
  }
  const buffer = fs.readFileSync(filePath); 
  console.log('buffer', buffer);

  //Excelファイルを読む
  const workbook = XLSX.read(buffer, { type: 'buffer' }); 
  const sheetNames = workbook.SheetNames;
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetNames[0]]);  
  return data;
}
