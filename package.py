import argparse
import shutil
import base64
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent

modules = ('atlas-bootstrap','history','map','province-layer','compare','ui')
datasets = {'geography':'GEOGRAPHY', 'footprints':'FOOTPRINTS', 'subregions':'SUBREGIONS'}

def read_dataset(name, identifier):
    # Legacy generators emit one JSON literal, prefixed by an assignment.
    source = (root / f'{name}.js').read_text()
    prefix = re.match(r'(?:\s*//[^\n]*\n)*\s*window\.ATLAS_' + identifier + r'\s*=\s*', source)
    if not prefix:
        raise ValueError('Unexpected dataset wrapper: '+name)
    return json.loads(source[prefix.end():].strip().removesuffix(';'))

def html_json(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).translate(
        {ord('<'):r'\u003c',ord('>'):r'\u003e',ord('&'):r'\u0026',0x2028:r'\u2028',0x2029:r'\u2029'})

def build(with_cshapes=False):
    output = root / ('optional' if with_cshapes else '.')
    dist = output/'dist'
    dist.mkdir(parents=True, exist_ok=True)
    shutil.copytree(root/'assets', dist, dirs_exist_ok=True)
    shutil.copyfile(root/'LICENSE', dist/'LICENSE.txt')
    shutil.copyfile(root/'DATA-LICENSES.md', dist/'DATA-LICENSES.md')
    shutil.copyfile(root/'LICENSE-ISC.txt', dist/'LICENSE-ISC.txt')
    (output/'outputs').mkdir(exist_ok=True)
    template = (root/'ui.html').read_text().replace('__CSS__',(root/'ui.css').read_text())
    script = '\n'.join((root/f'{name}.js').read_text() for name in modules)
    if '</script' in script.lower():
        raise ValueError('Unexpected end tag in trusted application code')
    digest = 'sha256-'+base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
    data = {name:read_dataset(name,key) for name,key in datasets.items()}
    if with_cshapes:
        data['footprints'] = read_dataset('optional/footprints','FOOTPRINTS')
    else:
        if any(row.get('source') == 'cshapes' for row in data['footprints']):
            raise ValueError('Default build contains optional data')
        template = re.sub(r'<li><a href="https://icr.ethz.ch/data/cshapes/".*?</li>', '', template, count=1)
    tiles = sorted((dist/'terrain').glob('*.webp'))
    if {tile.stem for tile in tiles} != {'world'} | {f'{x}-{y}' for x in range(6) for y in range(4)}:
        raise ValueError('Unexpected terrain inventory')
    (dist/'atlas-app.js').write_text(script)
    for offline in (False, True):
        data['terrain'] = {p.stem:('data:image/webp;base64,'+base64.b64encode(p.read_bytes()).decode() if offline else 'terrain/'+p.name) for p in tiles}
        if offline:
            data['provinces']=json.loads((dist/'provinces.json').read_text())
        network = "'none'" if offline else "'self'"
        policy = f"default-src 'none'; script-src '{digest}'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src {network}; object-src 'none'; base-uri 'none'; form-action 'none'"
        markup = '<script type="application/json" id="atlas-payload">'+html_json(data)+'</script>\n'
        markup += ('<script>'+script+'</script>' if offline else f'<script src="atlas-app.js" integrity="{digest}"></script>')
        page = template.replace('<script>__SCRIPTS__</script>',markup).replace('<meta charset="utf-8">','<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="'+policy+'">')
        destination = output/'outputs/Yeryuzu-Atlasi.html' if offline else dist/'index.html'
        destination.write_text(page)

if __name__=='__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-cshapes", action="store_true")
    build(parser.parse_args().with_cshapes)
