import json
import httpx
from pymongo import MongoClient

client = MongoClient('mongodb://127.0.0.1:27017/bloodstock?replicaSet=rs0')
db = client.bloodstock

units = [{
    'id': u['id'], 'component': u['component'], 'group': u['group'],
    'hospitalId': u['hospitalId'], 'collectedAt': u['collectedAt'].isoformat() + 'Z',
    'expiresAt': u['expiresAt'].isoformat() + 'Z', 'status': u['status']
} for u in db.units.find({'status': 'AVAILABLE'})]

requests = [{
    'id': r['id'], 'hospitalId': r['hospitalId'], 'component': r['component'],
    'group': r['group'], 'unitsNeeded': r['unitsNeeded'],
    'neededBy': r['neededBy'].isoformat() + 'Z', 'urgency': r['urgency'], 'status': r['status']
} for r in db.bloodrequests.find({'status': 'OPEN'})]

routes = [{
    'fromId': r['fromId'], 'toId': r['toId'], 'baseMinutes': r['baseMinutes'],
    'status': r['status'], 'delayMinutes': r['delayMinutes']
} for r in db.routes.find()]

payload_base = {
    'units': units, 'requests': requests, 'routes': routes,
    'now': '2026-10-15T08:00:00Z', 'mode': 'baseline'
}
payload_opt = {
    'units': units, 'requests': requests, 'routes': routes,
    'now': '2026-10-15T08:00:00Z', 'mode': 'optimized'
}

headers = {'X-Internal-Secret': 'bloodstock-dev-secret-key-32chars-min'}

with httpx.Client(base_url='http://127.0.0.1:8000', timeout=10.0) as http:
    res_base = http.post('/v1/plan', json=payload_base, headers=headers)
    print('Baseline HTTP Status:', res_base.status_code)
    b_data = res_base.json()
    print('Baseline Metrics:', b_data['metrics'])
    print('Baseline Unfulfilled:', b_data['unfulfilled'])
    for a in b_data['assignments']:
        print(f"  {a['requestId']}: units={a['allocatedUnitIds']} complete={a['isComplete']} expl=\"{a['explanation']}\"")

    print('\n----------------------------------------\n')
    res_opt = http.post('/v1/plan', json=payload_opt, headers=headers)
    print('Optimized HTTP Status:', res_opt.status_code)
    o_data = res_opt.json()
    print('Optimized Metrics:', o_data['metrics'])
    print('Optimized Unfulfilled:', o_data['unfulfilled'])
    for a in o_data['assignments']:
        print(f"  {a['requestId']}: units={a['allocatedUnitIds']} complete={a['isComplete']} expl=\"{a['explanation']}\"")
