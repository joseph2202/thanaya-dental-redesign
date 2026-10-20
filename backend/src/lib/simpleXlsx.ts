// Minimal standards-compliant XLSX writer with inline strings and an uncompressed ZIP.
// No formulas or macros. User values are always text/number cells, never executable formulas.
// Each workbook is generated only from server-validated, permission-checked data.
export type Sheet={name:string;headers:string[];rows:(string|number|null|undefined)[][]};
const utf=(s:string)=>Buffer.from(s,'utf8');
const clean=(v:string)=>v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'');
const xml=(v:string)=>clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const col=(n:number)=>{let s='';for(let v=n+1;v>0;v=Math.floor((v-1)/26))s=String.fromCharCode(65+(v-1)%26)+s;return s;};
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data:Buffer){let c=0xffffffff;for(const byte of data)c=crcTable[(c^byte)&0xff]^(c>>>8);return(c^0xffffffff)>>>0}
function zip(files:{name:string;content:string}[]){
 const chunks:Buffer[]=[],directory:Buffer[]=[];
 let offset=0;
 for(const f of files){
  const name=utf(f.name),bytes=utf(f.content),crc=crc32(bytes);
  const header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);
  header.writeUInt16LE(0,8);header.writeUInt32LE(crc,14);
  header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  chunks.push(header,name,bytes);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(0x0800,8);central.writeUInt32LE(crc,16);
  central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);
  central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  directory.push(central,name);
  offset+=header.length+name.length+bytes.length;
 }
 const centralBytes=directory.reduce((sum,part)=>sum+part.length,0);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(centralBytes,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,...directory,end]);
}
function worksheet(sheet:Sheet){
 const rows=[sheet.headers,...sheet.rows];
 const sheetRows=rows.map((row,r)=>{
  const cells=row.map((v,c)=>{
   if(v===null||v===undefined)return '';
   const ref=col(c)+(r+1),style=r===0?' s="1"':'';
   if(typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}"${style}><v>${v}</v></c>`;
   return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
  }).join('');
  return `<row r="${r+1}"${r===0?' ht="25" customHeight="1"':''}>${cells}</row>`;
 }).join('');
 const last=col(Math.max(0,sheet.headers.length-1));
 const widths=sheet.headers.map((_,i)=>`<col min="${i+1}" max="${i+1}" width="${i===0?29:21}" customWidth="1"/>`).join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <dimension ref="A1:${last}${rows.length}"/>
 <sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
 <cols>${widths}</cols><sheetData>${sheetRows}</sheetData>
 <autoFilter ref="A1:${last}${rows.length}"/></worksheet>`;
}
export function createXlsx(sheets:Sheet[]):Buffer{
 if(!sheets.length||sheets.length>10)throw Error('عدد أوراق الملف غير صالح');
 for(const s of sheets){
  if(!s.headers.length||s.headers.length>50||s.rows.length>10000)throw Error('حجم التصدير أكبر من المسموح');
  if(s.rows.some(row=>row.length>s.headers.length))throw Error('بيانات الورقة لا تطابق العناوين');
 }
 const sheetContent=sheets.map(worksheet);
 const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
 const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
 const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
 const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF047BA8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
 return zip([
  {name:'[Content_Types].xml',content:types},{name:'_rels/.rels',content:rels},
  {name:'xl/workbook.xml',content:workbook},{name:'xl/_rels/workbook.xml.rels',content:wbRels},
  {name:'xl/styles.xml',content:styles},
  ...sheetContent.map((content,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,content}))
 ]);
}
