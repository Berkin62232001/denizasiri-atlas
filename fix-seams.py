"""Use the original, antimeridian-cut Natural Earth rings for wrapped geometries."""
from pathlib import Path
import shapefile, json,base64, numpy as np
from shapely.geometry import LineString
root=Path(__file__).resolve().parent
source=json.loads((root/'source-world-10m.json').read_text())
p=root/'geography.js'
packed=json.loads(p.read_text().split('=',1)[1].rstrip(';\n'))
blob=bytearray(base64.b64decode(packed['arcs']))
def put(n):
    while n>=128:
        blob.append((n&127)|128);n>>=7
    blob.append(n)
def add(shapes):
    rings=[]
    for shape in shapes:
        ends=list(shape.parts)+[len(shape.points)]
        for first,stop in zip(ends,ends[1:]):
            xy=np.deg2rad(np.array(shape.points[first:stop]))
            t=np.arcsin(np.sqrt(3)/2*np.sin(xy[:,1])); t2=t*t;t6=t2**3
            x=600+198.5*2*np.sqrt(3)*xy[:,0]*np.cos(t)/(3*(1.340264-.243957*t2+t6*(.006123+.017204*t2)))
            y=340-198.5*t*(1.340264-.081319*t2+t6*(.000893+.003796*t2))
            pts=np.rint(np.array(LineString(np.column_stack((x,y))).simplify(.042,preserve_topology=True).coords)*20).astype(int)
            if len(pts)<4:continue
            put(len(pts));prev=(0,0)
            for x,y in pts:
                for delta in (int(x-prev[0]),int(y-prev[1])):put(delta*2 if delta>=0 else -2*delta-1)
                prev=(x,y)
            rings.append([packed['arcCount']]);packed['arcCount']+=1
    return rings
packed['land']=add(shapefile.Reader(str(root/'land/ne_10m_land.shp')).iterShapes())
reader=shapefile.Reader(str(root/'countries/ne_10m_admin_0_countries.shp'))
for entry in reader.iterShapeRecords():
    name=entry.record['NAME']
    if name in ('Fiji','Russia','Antarctica','United States of America','New Zealand','France','Kiribati'):
        for row in packed['countries']:
            if row[0]==name:row[1]=add([entry.shape])
packed['arcs']=base64.b64encode(blob).decode()
p.write_text('window.ATLAS_GEOGRAPHY='+json.dumps(packed,separators=(',',':'))+';\n')
