"""Static source inventory only. Does not launch UI, send requests or certify controls."""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
class Controls(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack=[]; self.rows=[]; self.open_controls=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag in {'button','input','select','textarea','a'} and (tag!='a' or attrs.get('href')):
            row={'tag':tag,'id':attrs.get('id',''),'type':attrs.get('type',''),'name':attrs.get('name',''),
                 'label':attrs.get('aria-label') or attrs.get('placeholder') or attrs.get('title',''),
                 'sourceLine':self.getpos()[0], 'containers':[x[1] for x in self.stack if x[1]],
                 'dataAttributes':{k:v for k,v in attrs.items() if k.startswith('data-')},
                 'status':'NOT_TESTED','scope':'STATIC_SOURCE_DECLARATION','runtimeEvidence':None}
            self.rows.append(row)
            if tag not in VOID: self.open_controls.append((len(self.stack),row))
        if tag not in VOID:self.stack.append((tag,attrs.get('id','')))
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.handle_endtag(tag)
    def handle_data(self,data):
        for _,row in self.open_controls:
            if data.strip():row['label']+=' '+data.strip()
    def handle_endtag(self,tag):
        found=next((i for i in range(len(self.stack)-1,-1,-1) if self.stack[i][0]==tag),None)
        if found is not None:
            self.stack=self.stack[:found]
            self.open_controls=[(depth,row) for depth,row in self.open_controls if depth<found]

def build():
    views={};hashes={}
    for file in ['index.html','google-apps-script/Index.html']:
        content=(ROOT/file).read_text();p=Controls();p.feed(content)
        hashes[file]=hashlib.sha256(content.encode()).hexdigest()
        for i,row in enumerate(p.rows,1):
            row['inventoryId']=('PAGES' if file=='index.html' else 'NATIVE')+f'-{i:03}'
            row['label']=' '.join(row['label'].split())[:180]
            row['source']=file
            row['locatorCandidate']='#'+row['id'] if row['id'] else None
            row['locatorNeedsRuntimeReview']=True
        views[file]=p.rows
    source=(ROOT/'js/app.js').read_text();dynamic=[]
    for name in sorted(set(re.findall(r'onclick="window\.__domusApp\.([A-Za-z0-9_]+)\(',source))):
        match=re.search(r'onclick="window\.__domusApp\.'+re.escape(name)+r'\(',source)
        dynamic.append({'handler':name,'source':'js/app.js','sourceLine':source[:match.start()].count('\n')+1,'status':'NOT_TESTED','scope':'DYNAMIC_INLINE_HANDLER_FAMILY','runtimeEvidence':None})
    result={'schema':'DOMUS_STATIC_CONTROLS_V1','sourceHashes':hashes,'scope':'Candidate source, not deployed UI; Pages and Native are two representations, not two independent features.',
            'counts':{k:len(v) for k,v in views.items()},'dynamicFamilyCount':len(dynamic),'views':views,'dynamicFamilies':dynamic,
            'limits':['No rendered visibility, clickability or role access checked.','Delegated listeners, programmatic handlers and external administration views need runtime inventory.','No PASS is assigned from source presence.','No input values or credentials captured.']}
    out=ROOT/'docs/qa/control_inventory.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'staticControls':result['counts'],'dynamicFamilies':len(dynamic)}))
if __name__=='__main__':build()
