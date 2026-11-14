"""Local stdlib bridge for the Apps Script test shim. No network or real credentials."""
import base64
import io
import json
import sys
import zipfile
from xml.etree import ElementTree as ET

mode = sys.argv[1]
data = json.load(sys.stdin)

if mode == "xml":
    def tree(e):
        return {"tag": e.tag, "attrs": e.attrib, "text": e.text or "",
                "children": [tree(x) for x in e]}
    print(json.dumps(tree(ET.fromstring(data)), ensure_ascii=False))
elif mode == "unzip":
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data))) as z:
        print(json.dumps([{"name": n, "data": base64.b64encode(z.read(n)).decode()}
                          for n in z.namelist()]))
elif mode == "zip":
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in data:
            z.writestr(item["name"], base64.b64decode(item["data"]))
    print(json.dumps(base64.b64encode(out.getvalue()).decode()))
else:
    raise ValueError(mode)
