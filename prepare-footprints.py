"""Reduce selected Historical Basemaps snapshots to approximate display footprints.
Source: André Ourednik and contributors, historical-basemaps, GPL-3.0.
Rows specify the first usable snapshot and an exclusive display cut-off.
"""
from pathlib import Path
import json
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely import make_valid

root=Path(__file__).resolve().parent
# An alias only matches the entire historical feature name.
catalog = """
es|1530|1898|Küba|Cuba (Spain)
es|1530|1697|Hispanyola|Hispaniola (Spain)
es|1530|1821|Yeni İspanya|Viceroyalty of New Spain
es|1650|1824|Peru Genel Valiliği|Viceroyalty of Peru
es|1783|1819|Yeni Granada|Viceroyalty of New Granada
es|1783|1810|Río de la Plata|Viceroyalty of the Río de la Plata
es|1650|1763|Florida|Florida;Florida (Spain)
es|1783|1800|İspanyol Louisianası|Luisiana
pt|1650|1822|Brezilya|Portuguese Brazil;Viceroyalty of Brazil
nl|1650|1654|Hollanda Brezilyası|Dutch Brazil
nl|1650|1662|Formosa|Dutch Formosa
nl|1650|1664|Yeni Amsterdam|New Amsterdam
gb|1650|1776|Virginia|Virginia
gb|1650|1776|Massachusetts|Massachusetts Bay
fr|1650|1763|Yeni Fransa|New France
gb|1783|1867|Québec|Quebec
gb|1715|1870|Rupert Toprakları|Rupert's Land
gb|1815|1867|Kanada kolonileri|Canada
gb|1815|1901|Avustralya kolonileri|New South Wales;New South Wales (UK);Northern Territory (UK);Queensland (UK);Western Australia (UK);South Australia (UK);Victoria (UK)
nl|1715|1795|Kap Kolonisi|Cape Colony
gb|1815|1910|Kap Kolonisi|Cape Colony
gb|1783|1858|Bengal|Bengal
gb|1815|1858|Doğu Hindistan Şirketi yönetimi|British East India Company
gb|1878|1947|Britanya Hindistanı|British Raj
gb|1914|1948|Seylan|Ceylon
nl|1650|1796|Hollanda Seylanı|Ceylon (Dutch)
nl|1650|1942|Hollanda Doğu Hint Adaları|Dutch East Indies;Netherlands Indies
pt|1650|1975|Portekiz Doğu Afrikası|Portuguese East Africa;Mozambique;Mozambique (Portugal)
pt|1815|1975|Angola|Angola;Angola (Portugal)
pt|1650|1974|Portekiz Ginesi|Portuguese Guinea;Guinea-Bissau (Portugal);Guinea-Bissau
fr|1878|1962|Cezayir|Algeria (FR);Algeria;Algeria (France)
fr|1878|1960|Senegal|Senegal (FR);Senegal
fr|1900|1956|Tunus|Tunisia
fr|1938|1956|Fas Fransız Protektorası|Morocco (France)
es|1914|1956|İspanyol Fası|Spanish Morocco
es|1914|1976|İspanyol Sahrası|Spanish Sahara
es|1878|1968|İspanyol Ginesi|Spanish Guinea;Equatorial Guinea
fr|1914|1958|Fransız Batı Afrikası|French West Africa
fr|1914|1958|Fransız Ekvator Afrikası|French Equatorial Africa
fr|1914|1960|Madagaskar|Madagascar (France)
fr|1914|1954|Fransız Çinhindi|French Indochina
fr|1920|1977|Fransız Somalisi|French Somaliland
de|1914|1919|Alman Güneybatı Afrikası|German South-West Africa
de|1914|1919|Alman Doğu Afrikası|German E. Africa (Tanganyika)
de|1914|1919|Kamerun|Kamerun
de|1914|1919|Togoland|Togoland
be|1914|1960|Belçika Kongosu|Belgian Congo
it|1914|1941|Eritre|Eritrea;Eritrea (Italy)
it|1914|1941|İtalyan Somalisi|Italian Somaliland
it|1914|1943|Libya|Libya;Libya (IT)
gb|1914|1963|Kenya|British East Africa;Kenya
gb|1914|1962|Uganda|Uganda
gb|1914|1960|Nijerya|Nigeria
gb|1914|1956|İngiliz-Mısır Sudanı|Anglo-Egyptian Sudan;Sudan
gb|1878|1957|Altın Sahili|Gold Coast (GB);Gold Coast
gb|1914|1922|Mısır|Egypt
gb|1914|1960|Britanya Somalisi|British Somaliland
gb|1878|1965|Gambiya|Gambia;Gambia, The
gb|1878|1961|Sierra Leone|Sierra Leone
gb|1878|1966|Britanya Guyanası|British Guiana
nl|1878|1975|Surinam|Dutch Guiana
fr|1878|1946|Fransız Guyanası|French Guiana
"""
features={}
for file in sorted((root/'historical').glob('*.json')):
    features[int(file.stem)]=json.loads(file.read_text())['features']
out=[]
region_ids=['cuba', 'hispaniola', 'mexico', 'peru', 'colombia', 'argentina', '-', 'louisiana', 'brazil', 'brazil', '-', '-', 'thirteen-colonies', 'thirteen-colonies', 'quebec', 'quebec', 'canada', 'canada', 'australia', 'south-africa', 'south-africa', 'bangladesh', 'india', 'india', 'sri-lanka', 'sri-lanka', 'indonesia', 'mozambique', 'angola', '-', 'algeria', 'senegal', 'tunisia', 'morocco', 'morocco', 'western-sahara', '-', 'west-africa', 'french-equatorial-africa', 'madagascar', 'vietnam,cambodia,laos', '-', 'namibia', 'tanzania', '-', '-', 'drc', 'eritrea', 'somalia', 'libya', 'kenya', 'uganda', 'nigeria', 'sudan', 'ghana', 'egypt', '-', '-', '-', 'guyana', 'suriname', '-']
for row, ids in zip(catalog.strip().splitlines(),region_ids):
    power,first,last,name,aliases=row.split('|')
    start,end=int(first),int(last)
    segments=[]
    for year,items in features.items():
        if not start<=year<min(end,1960):continue
        polys=[make_valid(shape(f['geometry'])) for f in items if f['properties']['NAME'] in aliases.split(';') and f['geometry']]
        if not polys:continue
        geom=unary_union(polys)
        rings=[]
        def add(g):
            if g.geom_type=='Polygon' and g.area>.00001:
                rings.extend([[[round(x,4),round(y,4)] for x,y in ring.coords] for ring in [g.exterior,*g.interiors]])
            elif hasattr(g,'geoms'):
                for child in g.geoms:add(child)
        add(geom)
        if not rings:continue
        if segments and segments[-1]['rings']==rings:continue
        if segments:segments[-1]['end']=year
        segments.append(dict(power=power,start=year,end=end,name=name,rings=rings,regionIds=ids.split(',') if ids!='-' else []))
    out.extend(segments)
(root/'footprints.js').write_text('window.ATLAS_FOOTPRINTS='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n')
print(len(out),'polygon frames')
