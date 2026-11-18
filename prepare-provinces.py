"""Simplify Natural Earth Admin 1 rings in the atlas's Equal Earth projection."""
from pathlib import Path
import base64
import json
import math
import numpy as np
import shapefile
from shapely.geometry import LineString

root=Path(__file__).resolve().parent
reader=shapefile.Reader(str(root/'provinces/ne_10m_admin_1_states_provinces.shp'))
def encode(value,out):
    while value>=128:
        out.append((value&127)|128)
        value >>= 7
    out.append(value)

def project(points):
    xy=np.deg2rad(np.array(points))
    t=np.arcsin(math.sqrt(3)/2*np.sin(xy[:,1])); t2=t*t; t6=t2**3
    x=600+198.5*2*math.sqrt(3)*xy[:,0]*np.cos(t)/(3*(1.340264-.243957*t2+t6*(.006123+.017204*t2)))
    y=340-198.5*t*(1.340264-.081319*t2+t6*(.000893+.003796*t2))
    return np.column_stack((x,y))

rows=[]
for item in reader.iterShapeRecords():
    rec=item.record.as_dict(); shp=item.shape
    bounds=list(shp.parts)+[len(shp.points)]
    data=bytearray()
    for start,end in zip(bounds,bounds[1:]):
        xy=project(shp.points[start:end])
        if len(xy)<4:continue
        simplified=np.array(LineString(xy).simplify(.055,preserve_topology=False).coords)
        if len(simplified)<4:simplified=xy
        points=np.rint(simplified[:-1]*25).astype(int)
        if len(points)<3:continue
        encode(len(points),data)
        prev=(0,0)
        for x,y in points:
            for delta in (int(x-prev[0]),int(y-prev[1])):
                encode(delta*2 if delta>=0 else -delta*2-1,data)
            prev=(x,y)
    if not data:continue
    name=rec['name_tr'] or rec['name'] or rec['name_en'] or rec['admin']
    english_name=rec['name_en'] or rec['name'] or name
    rows.append([name,rec['iso_a2'],rec['admin'],base64.b64encode(data).decode(),english_name])
dest=root/'assets/provinces.json'
dest.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
print(len(rows),'units',dest.stat().st_size)
