/*
 * 🏷️ Tag a version and put its notes on GitHub (the Releases page, and the Tags list).
 *
 *   npm run release                         the newest version in src/core/releases.js, at HEAD
 *   npm run release -- 0.8.3=8c4375b …      older versions, each at the commit it shipped as
 *
 * Push main first: only commits already on GitHub's main get a tag. For each version it makes an annotated tag
 * v<version> (its message is the notes), pushes the new tags in one go, then makes the GitHub release, or brings
 * an existing one's notes up to date. Safe to run again. It talks to GitHub with GITHUB_TOKEN if that's set, or
 * else the login git already pushes with (Git Credential Manager).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { RELEASES, LATEST, niceDate } from '../src/core/releases.js';

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
const tryGit = (args) => { try { return git(args, { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

// What to tag: version=commit pairs, or just the newest version at HEAD.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
if (pkg !== LATEST.version) die(`package.json says ${pkg} but releases.js's newest is ${LATEST.version}`);
const args = process.argv.slice(2);
const jobs = (args.length ? args : [`${LATEST.version}=HEAD`]).map((a) => {
  const [version, at] = a.split('=');
  const r = RELEASES.find((x) => x.version === version);
  if (!r) die(`no version ${version} in src/core/releases.js`);
  if (!at && r !== LATEST) die(`say which commit ${version} shipped as: ${version}=<commit>`);
  const commit = tryGit(['rev-parse', '--verify', `${at || 'HEAD'}^{commit}`]);
  if (!commit) die(`no commit ${at}`);
  return { r, commit, tag: `v${version}`, title: `${version} · ${r.title}` };
});
// Oldest first, so GitHub lists them in order and the newest ends up as "Latest".
jobs.sort((a, b) => RELEASES.indexOf(b.r) - RELEASES.indexOf(a.r));

git(['fetch', '-q', 'origin', 'main']);
for (const j of jobs) {
  if (tryGit(['merge-base', '--is-ancestor', j.commit, 'origin/main']) === null) die(`${j.tag}: ${j.commit.slice(0, 7)} isn't on GitHub's main yet (push first)`);
}

// 1. Tags (dated like the commit, so they sort by when each version shipped).
const notes = (r) => r.notes.map((n) => `- ${n}`).join('\n');
for (const j of jobs) {
  const have = tryGit(['rev-parse', '-q', '--verify', `refs/tags/${j.tag}^{commit}`]);
  if (have && have !== j.commit) die(`${j.tag} is already on ${have.slice(0, 7)}, not ${j.commit.slice(0, 7)}`);
  if (have) continue;
  const env = { ...process.env, GIT_COMMITTER_DATE: git(['show', '-s', '--format=%cI', j.commit]) };
  git(['tag', '-a', j.tag, j.commit, '-F', '-'], { input: `${j.title} (${niceDate(j.r.date)})\n\n${notes(j.r)}\n`, env });
  console.log(`🏷️  ${j.tag} → ${j.commit.slice(0, 7)}`);
}
const onGitHub = new Set(git(['ls-remote', '--tags', 'origin']).split('\n').map((l) => l.split('refs/tags/')[1]).filter(Boolean));
const toPush = jobs.filter((j) => !onGitHub.has(j.tag)).map((j) => `refs/tags/${j.tag}`);
if (toPush.length) { git(['push', '-q', 'origin', ...toPush]); console.log(`⬆️  pushed ${toPush.length} tag${toPush.length > 1 ? 's' : ''}`); }

// 2. GitHub releases.
const slug = git(['remote', 'get-url', 'origin']).match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
if (!slug) die('origin is not a GitHub repo');
let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  const cred = git(['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n' });
  token = cred.match(/^password=(.+)$/m)?.[1];
}
if (!token) die('no GitHub login: set GITHUB_TOKEN');
async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${slug}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'merry-release-script' },
    body: body && JSON.stringify(body),
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) die(`GitHub said ${res.status} to ${method} ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
for (const j of jobs) {
  const body = `📅 ${niceDate(j.r.date)}\n\n${notes(j.r)}`;
  const latest = j.r === LATEST ? 'true' : 'false';
  const had = await api('GET', `/releases/tags/${j.tag}`);
  if (!had) {
    const made = await api('POST', '/releases', { tag_name: j.tag, name: j.title, body, make_latest: latest });
    console.log(`📣 ${j.title}: ${made.html_url}`);
  } else if (had.name !== j.title || had.body !== body) {
    await api('PATCH', `/releases/${had.id}`, { name: j.title, body, make_latest: latest });
    console.log(`✏️  ${j.title}: notes updated`);
  } else console.log(`✓  ${j.title}: already up to date`);
}
