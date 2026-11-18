"""Add dated CShapes 2.0 boundaries. Intervals use the atlas's end-exclusive years."""
import json
from pathlib import Path
import shapefile
from shapely.geometry import shape
from shapely import make_valid

root=Path(__file__).parent
reader=shapefile.Reader(str(root/'cshapes/CShapes-2.0.shp'),encoding='latin1')
# Use an explicit historical attribution for each unit. Dataset names identify geometry only.
catalog = """
Canada|canada|Kanada|gb|1886|1931
Newfoundland||Newfoundland|gb|1886|1949
Australia|australia|Avustralya|gb|1901|1942
New Zealand|new-zealand|Yeni Zelanda|gb|1886|1947
New Caledonia and Dependencies|new-caledonia|Yeni Kaledonya|fr|1886|1946
Philippines|philippines|Filipinler|es|1886|1898
Cuba|cuba|Küba|es|1886|1898
Puerto Rico|puerto-rico|Porto Riko|es|1886|1898
Jamaica|jamaica|Jamaika|gb|1886|1962
Madagascar (Malagasy)|madagascar|Madagaskar|fr|1896|1960
Sri Lanka (Ceylon)|sri-lanka|Seylan|gb|1886|1948
East Timor|timor|Portekiz Timoru|pt|1886|1942
East Timor|timor|Portekiz Timoru|pt|1945|1975
Indonesia|indonesia|Hollanda Doğu Hint Adaları|nl|1886|1942
Algeria|algeria|Cezayir|fr|1886|1962
Tunisia|tunisia|Tunus|fr|1886|1956
Libya|libya|Libya|it|1912|1943
Namibia|namibia|Alman Güneybatı Afrikası|de|1886|1915
Angola|angola|Angola|pt|1886|1975
Mozambique|mozambique|Mozambik|pt|1886|1975
South Africa|south-africa|Güney Afrika Birliği|gb|1910|1931
Zimbabwe (Rhodesia)|zimbabwe|Güney Rodezya|gb|1923|1965
Zambia|zambia|Kuzey Rodezya|gb|1911|1964
Congo, Democratic Republic of (Zaire)|drc|Belçika Kongosu|be|1908|1960
"""
rows=[]
for line in catalog.strip().splitlines():
    key,rid,name,power,begin,end=line.split('|')
    for entry in reader.iterShapeRecords():
        rec=entry.record
        if rec.cntry_name!=key:continue
        # Use the configuration in force on 31 December of the selected year.
        start=max(int(begin),rec.gwsyear)
        stop=min(int(end),rec.gweyear+int(rec.gwemonth==12 and rec.gweday==31))
        if start>=stop:continue
        geom=make_valid(shape(entry.shape.__geo_interface__)).simplify(.012,preserve_topology=True)
        rings=[]
        def collect(g):
            if g.geom_type=='Polygon':
                for r in [g.exterior,*g.interiors]:
                    pts=[[round(x,4),round(y,4)] for x,y in r.coords]
                    if any(abs(a[0]-b[0])>180 for a,b in zip(pts,pts[1:])):raise ValueError(key+' crosses date line')
                    rings.append(pts)
            elif hasattr(g,'geoms'):
                for part in g.geoms:collect(part)
        collect(geom)
        rows.append(dict(name=name,power=power,start=start,end=stop,regionIds=[rid] if rid else [],rings=rings,source='cshapes'))
p=root/'footprints.js'
previous=json.loads(p.read_text().split('=',1)[1].strip().rstrip(';'))
result=[]
for item in previous:
    if item.get('source')=='cshapes':continue
    spans=[(item['start'],item['end'])]
    for better in rows:
        if item['power']!=better['power'] or not set(item['regionIds']).intersection(better['regionIds']):continue
        a,b=better['start'],better['end']
        spans=[part for lo,hi in spans for part in [(lo,min(hi,a)),(max(lo,b),hi)] if part[0]<part[1]]
    result.extend(dict(item,start=lo,end=hi) for lo,hi in spans)
result.extend(rows)
dest = root/'optional/footprints.js'
dest.parent.mkdir(exist_ok=True)
dest.write_text('window.ATLAS_FOOTPRINTS='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n')
print(len(rows),'dated CShapes geometries')
