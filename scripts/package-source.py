from pathlib import Path
import hashlib, json, re, zipfile
root = Path(__file__).resolve().parent.parent
source = ['api/demo.ts', 'lib/security.ts', 'lib/contracts.ts', 'tsconfig.json', '.env.example', '.nvmrc', 'build.mjs', 'dev.mjs', 'package.json', 'package-lock.json', 'vercel.json', 'README.md', 'AGENTS.md', '.github/workflows/ci.yml', '.gitignore', '.vercelignore']
for folder in ['web', 'scripts', 'tests', 'docs']:
    source += sorted(str(p.relative_to(root)) for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
source += ['public/sojern-implementation-guide.pdf']
for name in source:
    if re.search(rb'brew_[A-Za-z0-9]{32,}', (root/name).read_bytes()):
        raise ValueError(f'Possible API credential in {name}; remove it before packaging.')
archive = root/'public/headless-email-studio.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in source: z.write(root/name, name)
files = sorted(source + ['public/headless-email-studio.zip'])
manifest = {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in files}
digest = hashlib.sha256()
for name in files: digest.update(name.encode()+b'\0'+(root/name).read_bytes()+b'\0')
(root/'.artifacts').mkdir(exist_ok=True)
(root/'.artifacts/release-manifest.json').write_text(json.dumps({'digest': digest.hexdigest(), 'files': manifest}, indent=2))
print(json.dumps({'sourceFiles': len(source), 'archiveBytes': archive.stat().st_size, 'sourceDigest': digest.hexdigest()}))
