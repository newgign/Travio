// Offline filesystem-only build identity. No runtime imports, env autoload or network.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { publicHttps } = require('../preProductionCheck.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const revision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
function api(value) {
  if (typeof value !== 'string' || value !== value.trim() || !publicHttps(value)) throw Error('INVALID_API');
  const url = new URL(value);
  if (url.search || url.hash || !/^\/api\/?$/.test(url.pathname)) throw Error('INVALID_API');
  return value.replace(/\/$/, '');
}
function filesIn(dir) {
  // Refuse symlink ancestors as well as entries; do not follow public artifact links.
  for (let current = path.resolve(dir); ; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('UNSAFE_BUILD_PATH');
    if (current === path.dirname(current)) break;
  }
  const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw Error('UNSAFE_BUILD_PATH');
    if (entry.isDirectory()) return walk(file);
    if (!entry.isFile()) throw Error('UNSAFE_BUILD_FILE');
    return [file];
  });
  return walk(dir).sort();
}
function inspect(dir) {
  const files = filesIn(dir);
  if (files.some(file => /\.(dump|backup|sql|pem|key|p12|pfx)$|\.manifest\.json$|\.backup\.json$/i.test(file))) throw Error('PUBLIC_ARTIFACT');
  const assets = files.filter(file => path.relative(dir, file) !== 'release.json');
  const digest = crypto.createHash('sha256');
  let text = '', scriptText = '', hasIndex = false, scripts = 0, large = false, maps = false;
  for (const file of assets) {
    const name = path.relative(dir, file).split(path.sep).join('/');
    const data = fs.readFileSync(file);
    digest.update(JSON.stringify([name, data.length, sha(data)]));
    if (/\.(js|css|html)$/.test(file)) text += data.toString('utf8') + '\n';
    if (file.endsWith('.js')) { scripts++; scriptText += data.toString('utf8') + '\n'; large ||= data.length > 500000; }
    hasIndex ||= name === 'index.html'; maps ||= file.endsWith('.map');
  }
  return { digest: digest.digest('hex'), text, scriptText, large, present: hasIndex && scripts > 0,
    maps: maps || /sourceMappingURL/.test(text) };
}
function embedded(text, target) {
  // Exact quoted literal, not an arbitrary substring or another host's path.
  return ['"', "'", '`'].some(quote => text.includes(quote + target + quote) || text.includes(quote + target + '/' + quote));
}
function receipt(env, artifact) {
  if (!['staging', 'production'].includes(env.APP_ENV) || !revision(env.RELEASE_SHA) || !artifact.present || artifact.maps) throw Error('INVALID_RELEASE');
  const target = api(env.VITE_API_URL);
  if (!embedded(artifact.scriptText, target)) throw Error('BUILD_TARGET_MISMATCH');
  if (env.VITE_HOTELBEDS_STAGING_TEST_ENABLED !== undefined && !['true', 'false'].includes(env.VITE_HOTELBEDS_STAGING_TEST_ENABLED)) throw Error('INVALID_DISCLOSURE');
  return { version: 1, environment: env.APP_ENV, revision: env.RELEASE_SHA,
    testDisclosure: env.VITE_HOTELBEDS_STAGING_TEST_ENABLED === 'true', apiSha256: sha(target), assetsSha256: artifact.digest };
}
module.exports = { sha, revision, api, inspect, embedded, receipt };
