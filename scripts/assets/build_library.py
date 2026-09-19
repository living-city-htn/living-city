#!/usr/bin/env python3
"""Rebuild the curated library. Python 3, numpy and Pillow; see README.md.
Source packs are downloaded only with --download. No Blender/runtime codecs needed.
Palette textures are baked to linear vertex colors, removing external dependencies.
"""
import argparse, hashlib, io, json, math, pathlib, shutil, struct, urllib.request, zipfile
import numpy as np
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/public/assets/city'
PACKS = {
 'city-kit-suburban': 'https://kenney.nl/media/pages/assets/city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip',
 'city-kit-commercial': 'https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip',
 'city-kit-industrial': 'https://kenney.nl/media/pages/assets/city-kit-industrial/0ec35b139d-1788171848/kenney_city-kit-industrial_2.0.zip',
 'nature-kit': 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip',
 'furniture-kit': 'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip',
 'city-kit-roads': 'https://kenney.nl/media/pages/assets/city-kit-roads/74288c9459-1787042796/kenney_city-kit-roads.zip',
}
SELECTION = [
 ('house-01','Gabled house','building','city-kit-suburban','building-type-a'),
 ('house-02','Garden house','building','city-kit-suburban','building-type-d'),
 ('house-03','Town house','building','city-kit-suburban','building-type-g'),
 ('apartment-01','Walk-up apartments','building','city-kit-commercial','building-a'),
 ('apartment-02','Courtyard apartments','building','city-kit-commercial','building-e'),
 ('office-01','Glass office','building','city-kit-commercial','building-skyscraper-a'),
 ('office-02','Office tower','building','city-kit-commercial','building-skyscraper-c'),
 ('shop-01','Corner shops','building','city-kit-commercial','building-h'),
 ('cafe-01','Neighbourhood café','building','city-kit-commercial','building-k'),
 ('warehouse-01','Warehouse','building','city-kit-industrial','building-a'),
 ('tree-01','Street tree','nature','nature-kit','tree_small'),
 ('tree-02','Mature oak','nature','nature-kit','tree_oak'),
 ('shrub-01','Garden shrub','nature','nature-kit','plant_bush'),
 ('rock-01','Shoreline rock','nature','nature-kit','rock_smallA'),
 ('flowers-01','Flower cluster','nature','nature-kit','flower_yellowC'),
 ('chair-01','Outdoor chair','furniture','furniture-kit','chair'),
 ('table-01','Round café table','furniture','furniture-kit','tableRound'),
 ('traffic-light-01','Traffic light','street','city-kit-roads','traffic-light'),
 ('street-sign-01','Street sign','street','city-kit-roads','road-sign-street'),
]

def linear(c):
 c=np.asarray(c,dtype=float);return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def srgb(c):
 c=np.asarray(c,dtype=float);return np.where(c<=.0031308,c*12.92,1.055*np.maximum(c,0)**(1/2.4)-.055)
def muted(c):
 c=np.asarray(c,dtype=float); grey=np.sum(c*np.array([.2126,.7152,.0722]),axis=-1,keepdims=True)
 return linear(np.clip(c*.72+grey*.24+.025,0,1))

def read_glb(path):
 d=path.read_bytes();n=struct.unpack_from('<I',d,12)[0];j=json.loads(d[20:20+n]);return j,d[28+n:]
def array(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];types={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dt=np.dtype(types[a['componentType']]);start=v.get('byteOffset',0)+a.get('byteOffset',0)
 out=np.ndarray((a['count'],count),dt,b,offset=start,strides=(v.get('byteStride',dt.itemsize*count),dt.itemsize)).copy()
 if a.get('normalized') and dt.kind=='u':out=out/np.iinfo(dt).max
 return out

def matrix(node):
 if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
 x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m

def imported(path):
 j,b=read_glb(path);parts=[]
 def visit(ni,parent):
  n=j['nodes'][ni];m=parent@matrix(n)
  if 'mesh' in n:
   for p in j['meshes'][n['mesh']]['primitives']:
    pos=array(j,b,p['attributes']['POSITION']);norm=array(j,b,p['attributes']['NORMAL']);pos=(np.c_[pos,np.ones(len(pos))]@m.T)[:,:3];norm=norm@np.linalg.inv(m[:3,:3]);norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),1e-9)
    mat=j.get('materials',[{}])[p.get('material',0)].get('pbrMetallicRoughness',{});col=np.tile(np.array(mat.get('baseColorFactor',[1,1,1,1])[:3],dtype=float),(len(pos),1))
    if 'baseColorTexture' in mat:
     tex=mat['baseColorTexture'];im=j['images'][j['textures'][tex['index']]['source']]
     if 'uri' in im:img=Image.open(path.parent/im['uri']).convert('RGB')
     else:
      v=j['bufferViews'][im['bufferView']];off=v.get('byteOffset',0);img=Image.open(io.BytesIO(b[off:off+v['byteLength']])).convert('RGB')
     uv=array(j,b,p['attributes']['TEXCOORD_0']);pixels=np.asarray(img)/255.;u=np.minimum((np.clip(uv[:,0],0,1)*img.width).astype(int),img.width-1);v=np.minimum((np.clip(uv[:,1],0,1)*img.height).astype(int),img.height-1);col*=linear(pixels[v,u])
    # glTF factors and COLOR_0 are linear; texture samples are sRGB.
    elif 'COLOR_0' in p['attributes']:col*=array(j,b,p['attributes']['COLOR_0'])[:,:3]
    idx=array(j,b,p['indices']).ravel() if 'indices' in p else np.arange(len(pos))
    if np.linalg.det(m[:3,:3])<0:idx=idx.reshape(-1,3)[:,::-1].ravel()
    parts.append((pos,norm,muted(srgb(col)),idx))
  for ch in n.get('children',[]):visit(ch,m)
 for ni in j['scenes'][j.get('scene',0)]['nodes']:visit(ni,np.eye(4))
 return parts

class Model:
 def __init__(self):self.parts=[]
 def triangles(self,vertices,faces,color):
  pos=[];norm=[]
  for f in faces:
   a,b,c=[np.array(vertices[i],float) for i in f];n=np.cross(b-a,c-a);n/=max(np.linalg.norm(n),1e-9);pos.extend([a,b,c]);norm.extend([n,n,n])
  self.parts.append((np.array(pos),np.array(norm),np.tile(linear(color),(len(pos),1)),np.arange(len(pos))))
 def box(self,x,y,z,w,h,d,c):
  v=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  self.triangles(v,[(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,4,7),(0,7,3),(1,2,6),(1,6,5),(3,7,6),(3,6,2),(0,1,5),(0,5,4)],c)
 def cylinder(self,x,y,z,r,h,c,n=12,r2=None):
  r2=r if r2 is None else r2;v=[(x+math.cos(i*2*math.pi/n)*rr,y+dy,z+math.sin(i*2*math.pi/n)*rr) for rr,dy in [(r,-h/2),(r2,h/2)] for i in range(n)]+[(x,y-h/2,z),(x,y+h/2,z)];f=[]
  for i in range(n):k=(i+1)%n;f.extend([(i,n+i,n+k),(i,n+k,k),(2*n,i,k),(2*n+1,n+k,n+i)])
  self.triangles(v,f,c)

STONE=(.77,.76,.70);WHITE=(.88,.87,.82);DARK=(.27,.31,.33);WOOD=(.52,.39,.28);GREEN=(.38,.52,.39);BLUE=(.38,.58,.64);BRICK=(.64,.46,.37);GOLD=(.88,.74,.44)
def custom(id):
 m=Model()
 if id in ['campus-01','civic-01']:
  m.box(0,.35,0,1.25,.7,.8,BRICK if id=='campus-01' else STONE);m.box(0,.73,0,1.36,.09,.9,WHITE)
  for x in [-.43,-.2,.2,.43]:
   for y in [.28,.53]:m.box(x,y,.405,.12,.15,.025,BLUE)
  m.box(0,.18,.42,.16,.36,.05,DARK)
  if id=='campus-01':m.box(0,.97,0,.34,.44,.4,BRICK);m.box(0,1.22,0,.41,.08,.46,WHITE);m.box(0,1.04,.211,.17,.17,.018,WHITE);m.box(0,1.065,.223,.012,.06,.008,DARK);m.box(.023,1.04,.223,.06,.012,.008,DARK)
  else:
   for x in [-.46,-.23,.23,.46]:m.cylinder(x,.35,.53,.035,.64,WHITE)
   m.box(0,.7,.54,1.12,.07,.22,WHITE)
 elif id=='bench':
  for z in [-.16,0,.16]:m.box(0,.35,z,1,.07,.12,WOOD)
  for y in [.52,.66]:m.box(0,y,-.19,1,.1,.06,WOOD)
  for x in [-.36,.36]:m.box(x,.18,0,.065,.36,.34,DARK);m.box(x,.49,-.19,.065,.43,.065,DARK)
 elif id=='planter':
  m.box(0,.15,0,.6,.3,.5,STONE);m.box(0,.31,0,.53,.025,.43,WOOD)
  for x,z in [(-.15,-.08),(.13,.07),(0,.12)]:m.cylinder(x,.46,z,.02,.3,GREEN,6);m.cylinder(x,.62,z,.075,.06,GOLD,7)
 elif id=='string-lights':
  for x in [-.55,.55]:m.cylinder(x,.5,0,.025,1,DARK,8)
  for i in range(10):
   x=-.5+i/9;y=.92-.16*(1-(x/.5)**2);m.box(x,y,0,.125,.012,.012,DARK)
   if i%2==0:m.cylinder(x,y-.06,0,.035,.07,GOLD,8)
 elif id=='food-truck':
  m.box(0,.43,0,1.2,.53,.52,WHITE);m.box(0,.21,0,1.2,.07,.54,GREEN);m.box(.42,.53,.269,.25,.23,.018,BLUE);m.box(-.16,.55,.269,.54,.23,.018,DARK);m.box(-.16,.39,.33,.64,.035,.19,WOOD);m.box(-.16,.72,.35,.73,.055,.22,GREEN)
  for x in [-.4,.4]:
   for z in [-.25,.25]:m.box(x,.15,z,.21,.23,.075,DARK);m.box(x,.15,z*1.17,.09,.11,.016,STONE)
 elif id=='fountain':
  m.cylinder(0,.055,0,.52,.11,STONE,24);m.cylinder(0,.116,0,.43,.016,BLUE,24);m.cylinder(0,.25,0,.08,.34,STONE,12);m.cylinder(0,.43,0,.25,.065,STONE,20);m.cylinder(0,.468,0,.2,.012,BLUE,20);m.cylinder(0,.58,0,.025,.21,BLUE,8)
 elif id=='sculpture':
  m.box(0,.065,0,.5,.13,.5,STONE);m.cylinder(0,.23,0,.14,.23,DARK,8,r2=.095);m.cylinder(0,.49,0,.22,.3,BLUE,6,r2=.05);m.cylinder(.06,.7,0,.09,.13,GOLD,6)
 elif id=='stage':
  m.box(0,.11,0,1.4,.22,.85,WOOD)
  for x in [-.61,.61]:m.box(x,.72,-.3,.07,1.2,.07,DARK);m.box(x,.32,.1,.2,.4,.25,DARK)
  m.box(0,1.32,-.3,1.3,.065,.07,DARK);m.box(0,.69,-.34,1.15,.94,.035,GREEN);m.cylinder(0,.55,0,.015,.84,DARK,8);m.box(0,.97,0,.1,.035,.04,DARK)
 elif id=='market-stall':
  m.box(0,.34,0,.95,.12,.55,WOOD)
  for x in [-.43,.43]:
   for z in [-.22,.22]:m.box(x,.47,z,.035,.94,.035,WOOD)
  m.box(0,.92,0,1.08,.08,.7,GREEN);m.box(0,.25,.24,.9,.38,.06,WHITE)
  for x in [-.28,0,.28]:m.box(x,.44,0,.2,.12,.3,GOLD)
 return m.parts

def write_asset(id,parts):
 pos=[];norm=[];col=[];idx=[];offset=0
 for p,n,c,i in parts:pos.extend(p);norm.extend(n);col.extend(c);idx.extend(i+offset);offset+=len(p)
 pos=np.asarray(pos);lo=pos.min(axis=0);hi=pos.max(axis=0);size=hi-lo;scale=1/max(size[0],size[2]);pos=(pos-np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]))*scale
 # Weld identical complete vertices, keeping hard normals and material colors.
 attrs=np.c_[pos,np.asarray(norm),np.asarray(col)].astype('<f4');unique,inverse=np.unique(attrs,axis=0,return_inverse=True);idx=inverse[np.asarray(idx,dtype=int)]
 arrays=[unique[:,:3].copy(),unique[:,3:6].copy(),unique[:,6:9].copy(),idx.astype('<u2' if len(unique)<65536 else '<u4')];blob=bytearray();views=[];access=[]
 for a in arrays:
  while len(blob)%4:blob.append(0)
  views.append({'buffer':0,'byteOffset':len(blob),'byteLength':a.nbytes});blob.extend(a.tobytes());item={'bufferView':len(views)-1,'componentType':5126 if a.dtype.kind=='f' else (5123 if a.dtype.itemsize==2 else 5125),'count':len(a),'type':'VEC3' if a.ndim==2 else 'SCALAR'}
  if len(views)==1:item.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
  access.append(item)
 while len(blob)%4:blob.append(0)
 j={'asset':{'version':'2.0','generator':'Living City reproducible asset pipeline'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':id}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'COLOR_0':2},'indices':3,'material':0}]}],'materials':[{'name':'muted-vertex-palette','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.9}}],'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':access}
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
 (OUT/'models'/f'{id}.glb').write_bytes(data)
 return {'footprint':[round(float(size[0]*scale),6),round(float(size[2]*scale),6)],'height':round(float(size[1]*scale),6),'bytes':len(data),'triangles':len(idx)//3,'sha256':hashlib.sha256(data).hexdigest()}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--packs',type=pathlib.Path,default=pathlib.Path('/tmp/living-city-packs'));parser.add_argument('--download',action='store_true');a=parser.parse_args();(OUT/'models').mkdir(parents=True,exist_ok=True);(OUT/'licenses').mkdir(exist_ok=True)
 if a.download:
  for pack,url in PACKS.items():
   data=urllib.request.urlopen(url).read();dest=a.packs/pack;dest.mkdir(parents=True,exist_ok=True)
   with zipfile.ZipFile(io.BytesIO(data)) as z:
    for member in z.infolist():
     target=(dest/member.filename).resolve()
     if not target.is_relative_to(dest.resolve()):raise ValueError('Unsafe archive path')
    z.extractall(dest)
 assets=[]
 for id,label,category,pack,file in SELECTION:
  path=next((a.packs/pack).rglob(file+'.glb'));stats=write_asset(id,imported(path));shutil.copyfile(a.packs/pack/'License.txt',OUT/'licenses'/f'{pack}.txt')
  assets.append({'id':id,'label':label,'url':f'/assets/city/models/{id}.glb','category':category,**stats,'source':{'name':'Kenney '+pack.replace('-',' ').title(),'url':'https://kenney.nl/assets/'+pack,'file':str(path.relative_to(a.packs/pack)),'downloadUrl':PACKS[pack],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'license':'CC0-1.0'},'paletteSlots':['muted-vertex-palette']})
 for id,label,category in [('campus-01','University hall','building'),('civic-01','Civic hall','building'),('bench','Park bench','decoration'),('planter','Flower planter','decoration'),('string-lights','String lights','decoration'),('food-truck','Food truck','decoration'),('fountain','Fountain','decoration'),('sculpture','Sculpture','decoration'),('stage','Event stage','event'),('market-stall','Market stall','event')]:
  stats=write_asset(id,custom(id));assets.append({'id':id,'label':label,'url':f'/assets/city/models/{id}.glb','category':category,**stats,'source':{'name':'Living City','url':'https://github.com/living-city-htn/living-city','file':'scripts/assets/build_library.py','license':'original'},'paletteSlots':['muted-vertex-palette']})
 (ROOT/'packages/modeling/src/assets.generated.json').write_text(json.dumps(assets,indent=2)+'\n');(OUT/'manifest.json').write_text(json.dumps(assets,indent=2)+'\n');print(f'{len(assets)} models; {sum(x["bytes"] for x in assets):,} bytes; {sum(x["triangles"] for x in assets):,} triangles')
if __name__=='__main__':main()
