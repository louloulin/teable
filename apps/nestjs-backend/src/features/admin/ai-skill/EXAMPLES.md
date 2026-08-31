# Teable Examples (Self-Hosted)

> Bilingual copy-paste recipes. All examples assume `BASE_URL=https://<host>` and `TOKEN=tbk_xxx`.

## 1. Discovery

### List bases (spaces first)

```bash
curl -sH "Authorization: Bearer $TOKEN" "$BASE_URL/api/spaces"
```

Response:

```json
[
  {"id":"spcXXX","name":"Sales","createdTime":"...","order":0}
]
```

### List tables in a base

```bash
BASE_ID="bseXXX"
curl -sH "Authorization: Bearer $TOKEN" "$BASE_URL/api/base/$BASE_ID/tables"
```

### Inspect a table's fields

```bash
TABLE_ID="tblXXX"
curl -sH "Authorization: Bearer $TOKEN" "$BASE_URL/api/table/$TABLE_ID/fields"
```

## 2. Querying Records

### All records (paginated)

```bash
curl -sH "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/table/$TABLE_ID/records?pageSize=100"
```

### Filter by formula

```bash
curl -sH "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/table/$TABLE_ID/records?filterByFormula=%7Bstatus%7D%3D%22Open%22"
```

Decoded: `?filterByFormula={status}="Open"`

### Sort + limit

```bash
curl -sH "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/table/$TABLE_ID/records?sort%5B0%5D%5Bfield%5D=created_at&sort%5B0%5D%5Border%5D=desc&maxRecords=20"
```

### Field projection

```bash
curl -sH "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/table/$TABLE_ID/records?fields%5B%5D=name&fields%5B%5D=status"
```

## 3. Creating Records

### Single record

```bash
curl -sX POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"fields":{"name":"Acme","status":"Lead"}}]}' \
  "$BASE_URL/api/table/$TABLE_ID/records"
```

### Batch (with typeCast)

```bash
curl -sX POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "typecast": true,
    "records": [
      {"fields":{"name":"Initech","status":"Customer","revenue":150000}},
      {"fields":{"name":"Hooli","status":"Lead","revenue":null}}
    ]
  }' \
  "$BASE_URL/api/table/$TABLE_ID/records"
```

`typecast: true` lets the API coerce string→number, single→multi-select, etc.

## 4. Updating Records

### Patch by record id

```bash
curl -sX PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"id":"recXXX","fields":{"status":"Closed-Won"}}]}' \
  "$BASE_URL/api/table/$TABLE_ID/records"
```

### Patch multiple

```bash
curl -sX PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {"id":"rec1","fields":{"status":"Closed-Won"}},
      {"id":"rec2","fields":{"status":"Closed-Lost"}}
    ]
  }' \
  "$BASE_URL/api/table/$TABLE_ID/records"
```

## 5. Deleting Records

```bash
curl -sX DELETE -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recordIds":["rec1","rec2"]}' \
  "$BASE_URL/api/table/$TABLE_ID/records"
```

## 6. Schema Operations

### Create a table

```bash
curl -sX POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CRM",
    "fields": [
      {"name":"company","type":"singleLineText"},
      {"name":"contact","type":"email"},
      {"name":"status","type":"singleSelect","options":{"choices":[{"name":"Lead","color":"red"},{"name":"Customer","color":"green"}]}},
      {"name":"revenue","type":"currency","options":{"symbol":"$","precision":2}},
      {"name":"notes","type":"longText"}
    ]
  }' \
  "$BASE_URL/api/base/$BASE_ID/tables"
```

### Add a field

```bash
curl -sX POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"next_followup","type":"date","options":{"dateFormat":{"format":"YYYY-MM-DD","timeZone":"Asia/Shanghai"}}}' \
  "$BASE_URL/api/table/$TABLE_ID/fields"
```

## 7. Automations (Round-24+)

### Create an automation via AI draft

```bash
curl -sX POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "baseId": "'$BASE_ID'",
    "prompt": "When a new row is added with status=Done, send a Slack message to #general with the row name."
  }' \
  "$BASE_URL/api/automation/ai-draft"
```

Response includes a complete automation draft (triggers + actions); apply with a follow-up POST `/api/automation`.

### Manual trigger

```bash
curl -sX POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"automationId":"atmXXX","payload":{"id":"recXXX"}}' \
  "$BASE_URL/api/automation/run"
```

### Inspect run history

```bash
curl -sH "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/automation/$AUTOMATION_ID/runs"
```

## 8. Bulk Operations

### CSV upload via `run_script` automation (Round-24 sample)

```javascript
// script-samples/http-fanout variant — POST each row to a webhook
return (input.records || []).map(r => ({
  id: r.id,
  name: r.name,
  ts: Date.now()
}));
```

Wire this into a run_script action's `script` field.

## 9. Error Handling Pattern

```python
import os, requests, time

BASE = os.environ["TEABLE_URL"]
TOK = os.environ["TEABLE_TOKEN"]
H = {"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"}

def req(method, path, **kw):
    for attempt in range(3):
        r = requests.request(method, BASE + path, headers=H, timeout=30, **kw)
        if r.status_code < 500 and r.status_code != 429:
            r.raise_for_status()
            return r.json()
        time.sleep(0.5 * (attempt + 1))
    r.raise_for_status()

records = req("GET", f"/api/table/{TABLE_ID}/records?maxRecords=10")
```

## 10. 脚本示例 (Script Samples)

The Round-24 sample library at `/api/automation/script-samples` ships 12 ready-to-use scripts:

| id | category | description |
| --- | --- | --- |
| `sum-array` | transform | Sum a numeric array (数字数组求和) |
| `uppercase-name` | transform | Uppercase first record name (大写首条记录名称) |
| `format-date` | transform | ISO date → YYYY-MM-DD (格式化 ISO 日期为 YYYY-MM-DD) |
| `find-by-id` | lookup | Find record by id (按 id 查找记录) |
| `filter-by-status` | lookup | Filter records by status (按状态过滤记录) |
| `greet-by-hour` | branch | Hour-of-day greeting (根据小时返回问候语) |
| `http-fanout` | http | POST payload to webhook list (HTTP POST 扇出) |
| `retry-wrapper` | http | Retry up to 3 times (重试包装最多 3 次) |
| `webhook-flatten` | webhook | Flatten nested payload (扁平化 webhook payload) |
| `webhook-signature-verify` | webhook | HMAC SHA-256 verify (HMAC SHA-256 签名验证) |
| `hello-world` | transform | Minimal hello-world (最小 hello-world 脚本) |
| `echo-input` | transform | Return input verbatim (回显输入) |

All samples are exposed under `/api/automation/script-samples?locale=en|zh`.
