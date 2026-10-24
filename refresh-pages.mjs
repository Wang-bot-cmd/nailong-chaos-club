import fs from 'node:fs';
import path from 'node:path';
const out=new URL('./docs/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
// Remove only old generated asset files; preserve the root and source tree.
const assets=new URL('./docs/assets/',import.meta.url);
if(fs.existsSync(assets))for(const file of fs.readdirSync(assets))if(fs.statSync(new URL(file,assets)).isFile())fs.unlinkSync(new URL(file,assets));
fs.cpSync(new URL('./dist/',import.meta.url),out,{recursive:true});
fs.writeFileSync(new URL('.nojekyll',out),'');
console.log('Updated GitHub Pages files in docs/');
