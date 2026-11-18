"""Reproject Natural Earth II raster into the atlas's Equal Earth SVG coordinate system."""
import hashlib
from importlib.metadata import version
import numpy as np
from PIL import Image
from pathlib import Path
root = Path(__file__).resolve().parent
lock = root/'raster-macos-arm64-py313.lock'
for line in lock.read_text().splitlines():
    package, expected = line.split()[0].split('==')
    if version(package) != expected:
        raise SystemExit('Raster build requires the verified versions in '+lock.name)
raster = root/'NE2_LR_LC_SR_W.tif'
expected_digest = '23a70c30876dc4a8a1d09b3009dbf12512b5137093f7f6bf4327c09d6405a842'
Image.MAX_IMAGE_PIXELS = 16200 * 8100
with raster.open('rb') as stream:
    if hashlib.file_digest(stream, 'sha256').hexdigest() != expected_digest:
        raise ValueError('Source TIFF does not match the reviewed raster')
    stream.seek(0)
    with Image.open(stream,formats=['TIFF']) as image:
        if image.size != (16200,8100) or image.mode != 'RGB' or image.tag_v2.get(259)!=1:
            raise ValueError('Unexpected source TIFF dimensions, mode or compression')
        source = np.asarray(image.convert('RGB'))
h,w=source.shape[:2]
scale=7
# Inverse of the Equal Earth projection used for the vector layers.
x=(np.arange(1200*scale,dtype=np.float32)/scale + .5/scale-600)/198.5
result=Image.new('RGBA',(1200*scale,640*scale))
for row in range(0,result.height,48):
    rows=min(48,result.height-row)
    y=(340-(np.arange(row,row+rows)+.5)/scale)/198.5
    t=np.clip(y/1.34,-np.pi/3,np.pi/3)
    for _ in range(7):
        t2=t*t;t6=t2**3
        deriv=1.340264-.243957*t2+t6*(.006123+.017204*t2)
        t-=(t*(1.340264-.081319*t2+t6*(.000893+.003796*t2))-y)/deriv
    valid_lat=np.abs(t)<=np.pi/3
    t=np.clip(t,-np.pi/3,np.pi/3)
    t2=t*t;t6=t2**3
    lat=np.arcsin(np.clip(np.sin(t)*2/np.sqrt(3),-1,1))
    lon=(x[None,:]*3*(1.340264-.243957*t2+t6*(.006123+.017204*t2))[:,None])/(2*np.sqrt(3)*np.cos(t)[:,None])
    inside=(np.abs(lon)<=np.pi)&valid_lat[:,None]
    px=np.clip((lon/(2*np.pi)+.5)*w-.5,0,w-1)
    py=np.clip((.5-lat/np.pi)*h-.5,0,h-1)[:,None]
    ix,iy=px.astype(int),py.astype(int)
    nx,ny=np.minimum(ix+1,w-1),np.minimum(iy+1,h-1)
    dx=(px-ix)[:,:,None];dy=(py-iy)[:,:,None]
    color=(1-dy)*((1-dx)*source[iy,ix]+dx*source[iy,nx])+dy*((1-dx)*source[ny,ix]+dx*source[ny,nx])
    # Lighten marine blues while retaining the bathymetric texture.
    blue=np.clip((color[:,:,2]-color[:,:,0]-8)/42,0,1)[:,:,None]
    ocean=color*.63+[102,112,109]
    land=color*.92+[17,16,12]
    rgb=np.clip(land*(1-blue)+ocean*blue,0,255).astype('uint8')
    strip=np.dstack((rgb,inside.astype('uint8')*255))
    result.paste(Image.fromarray(strip), (0,row))
tiles=root/'assets/terrain'
tiles.mkdir(exist_ok=True)
for col in range(6):
    for row in range(4):
        tile=result.crop((col*1400,row*1120,(col+1)*1400,(row+1)*1120))
        tile.save(tiles/f'{col}-{row}.webp',quality=87,method=4)
overview=result.resize((3000,1600),Image.Resampling.LANCZOS)
overview.save(tiles/'world.webp',quality=86,method=5)
result.thumbnail((1120,600))
result.save(root/'relief-preview.png')
