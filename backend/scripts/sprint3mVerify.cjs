// Local syntax and secret checks. Reports paths/counts only, never secret values.
const fs=require('fs'),path=require('path'),{execFileSync,spawnSync}=require('child_process');
const root=path.join(__dirname,'../..');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>f && f!=='README.txt' && !f.startsWith('docs/'));
const secrets=[];
for(const file of ['backend/.env','frontend/.env','.env']){
  if(!fs.existsSync(path.join(root,file)))continue;
  const env=require('dotenv').parse(fs.readFileSync(path.join(root,file)));
  for(const [key,value] of Object.entries(env))if(/SECRET|PASSWORD|TOKEN|API_KEY/.test(key) && value.length>=12)secrets.push(value);
}
let syntax=0,scanned=0;const findings=[];
for(const file of files){
  if(!/\.(js|jsx|cjs|mjs|json|md|sql|yml|yaml|txt)$/.test(file))continue;
  const body=fs.readFileSync(path.join(root,file),'utf8');scanned++;
  if(secrets.some(value=>body.includes(value)) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40}/.test(body))findings.push(file);
  if(file.startsWith('backend/') && /\.(js|cjs)$/.test(file)){
    if(spawnSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'}).status!==0)findings.push('syntax: '+file);
    syntax++;
  }
}
console.log(JSON.stringify({backendSyntaxFiles:syntax,secretScanFiles:scanned,findings}));
process.exitCode=findings.length?1:0;
