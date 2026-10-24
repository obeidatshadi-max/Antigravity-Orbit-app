import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'public');
const assets=['index.html','manifest.json','sw.js','icon-192.svg','orbit-core.js','orbit-storage.js','orbit-experience.js','orbit-experience.css'];
await mkdir(output,{recursive:true});
for(const asset of assets)await copyFile(path.join(root,asset),path.join(output,asset));
let commit=process.env.COMMIT_REF||null;
if(!commit){try{commit=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/').replace(/\/$/,'')}`,'rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}}
await writeFile(path.join(output,'release.json'),JSON.stringify({product:'ORBIT',commit,builtAt:new Date().toISOString()},null,2));
await writeFile(path.join(output,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><a href="/">Return to ORBIT</a></html>');
console.log(`Built ${assets.length} public assets and release metadata.`);
