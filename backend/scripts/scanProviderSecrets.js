// Print only finding types and paths, never matching contents.
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const files=cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const dotenv=require('dotenv');const values=[];
for(const file of ['backend/.env','frontend/.env']) {
  if(!fs.existsSync(path.join(root,file)))continue;
  const env=dotenv.parse(fs.readFileSync(path.join(root,file)));
  for(const [key,value] of Object.entries(env))if(/SECRET|PASSWORD|API_KEY|DATABASE_URL/.test(key)&&value.length>=12)values.push(value);
}
const dist=path.join(root,'frontend/dist');
if(fs.existsSync(dist))for(const file of fs.readdirSync(dist,{recursive:true}).filter(x=>/\.(js|html|css)$/.test(x)))files.push('frontend/dist/'+file.replaceAll('\\','/'));
const findings=[];
for(const file of files) {
  if(/(?:^|\/)\.env$|\.(key|pem|p12|pfx|crt)$/i.test(file))findings.push({type:'TRACKED_CREDENTIAL_FILE',file});
  if(!fs.existsSync(path.join(root,file)))continue;
  const text=fs.readFileSync(path.join(root,file),'utf8');
  if(values.some(value=>text.includes(value)))findings.push({type:'KNOWN_SECRET_VALUE',file});
  if(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{16}/.test(text))findings.push({type:'PRIVATE_KEY_MATERIAL',file});
  if(file.startsWith('frontend/dist/')&&/HOTELBEDS_LIVE_API_SECRET|DATABASE_URL|JWT_SECRET|OFFER_TOKEN_SECRET|postgres(?:ql)?:\/\//.test(text))findings.push({type:'SERVER_SECRET_MARKER_IN_BUNDLE',file});
}
console.log(JSON.stringify({scannedFiles:files.length,knownValuesCompared:values.length,findings},null,2));
if(findings.length)process.exitCode=1;
