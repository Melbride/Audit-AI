import urllib.request
import urllib.error
import json

req = urllib.request.Request(
    'http://localhost:8000/engagements/13/send-to-client',
    data=b'',
    headers={'Content-Type': 'application/json'},
    method='POST'
)

try:
    res = urllib.request.urlopen(req)
    print(res.read().decode())
except urllib.error.HTTPError as e:
    print("STATUS:", e.code)
    print("ERROR:", e.read().decode())