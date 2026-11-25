# ระบบบัญชี: ใบเสนอราคา · ใบวางบิล · ใบแบ่งจ่าย · ใบเสร็จรับเงิน

ใช้ Next.js 16 (App Router), Supabase (Auth + Postgres + Storage), Tailwind CSS v4 และฟอนต์ IBM Plex Sans Thai

## ฟีเจอร์

- **แดชบอร์ดรายเดือน**: ยอดวางบิล, รับชำระแล้ว, ยอดรอจ่ายทั้งหมด, ยอดเกินกำหนด, กราฟ 12 เดือน, รายการรอจ่ายเรียงตามวันครบกำหนด (กดออกใบเสร็จได้ทันที) และใบเสนอราคาที่รออนุมัติ
- **ข้อมูลบริษัท**: ชื่อ, ที่อยู่, เลขผู้เสียภาษี/สาขา, โทร/อีเมล, **โลโก้**, **ลายเซ็นกรรมการ** + ชื่อ/ตำแหน่ง, **ธนาคาร/ชื่อบัญชี/เลขบัญชี**, **QR รับเงิน** (เก็บใน Storage แบบ private)
- **เอกสาร 4 ประเภท** เลขที่เอกสารรันให้อัตโนมัติ (`QT202611-001`, `IV…`, `IN…`, `RE…`) หรือกรอกเองก็ได้
  - แก้รายการย่อยได้: เพิ่ม ลบ และเลื่อนลำดับ (จำนวน × ราคา/หน่วย)
  - ส่วนลดเป็น **%** หรือ **บาท**
  - VAT เปิด/ปิดได้ และกำหนดอัตราเองได้
  - **หักภาษี ณ ที่จ่าย** มีปุ่มลัด 1/2/3/5% หรือกรอกเองก็ได้ (คิดจากยอดก่อน VAT)
  - มีหมายเหตุ และแสดงยอดเงินเป็นตัวอักษรไทย (บาทถ้วน)
- **แปลงเอกสารต่อกัน**: ใบเสนอราคา → ใบวางบิล / ใบแบ่งจ่าย → ใบเสร็จ
  - ใบแบ่งจ่ายมีตัวช่วยคำนวณงวดเป็น % หรือบาท และแสดงยอดที่เรียกเก็บไปแล้วกับยอดคงเหลือ
  - ออกใบเสร็จแล้ว เอกสารต้นทางจะเปลี่ยนเป็น "ชำระแล้ว" ให้อัตโนมัติ และเมื่อทุกงวดชำระครบ ใบวางบิลแม่ก็จะปิดให้ด้วย
- **พิมพ์ / บันทึก PDF** ขนาด A4 (สั่งพิมพ์ต้นฉบับพร้อมสำเนาได้)
- ข้อมูลแยกตามผู้ใช้ด้วย Row Level Security

## ติดตั้ง

```bash
npm install
cp .env.example .env.local   # ใส่ URL และ anon/publishable key
```

1. ไปที่ Supabase Dashboard ของโปรเจกต์ → **SQL Editor** → วางเนื้อหาไฟล์ `supabase/migrations/0001_init.sql` แล้วกด **Run**
2. **Project Settings → API**: คัดลอก Project URL และ anon (หรือ publishable) key ไปใส่ใน `.env.local`
3. (ไม่บังคับ) **Authentication → Providers → Email**: ถ้าอยากสมัครแล้วใช้งานได้ทันที ให้ปิด "Confirm email"
4. รัน

```bash
npm run dev
```

เปิด http://localhost:3000 → สมัครสมาชิก → ตั้งค่า **ข้อมูลบริษัท** ก่อนเริ่มออกเอกสาร

> ถ้าใช้ Next.js 15 ให้เปลี่ยนชื่อไฟล์ `proxy.ts` เป็น `middleware.ts` และเปลี่ยนชื่อฟังก์ชัน `proxy` เป็น `middleware`

## การคำนวณ

```
รวมเป็นเงิน        = Σ (จำนวน × ราคา/หน่วย)
ส่วนลด             = รวม × %  หรือ  จำนวนบาท
ยอดหลังหักส่วนลด   = รวม − ส่วนลด
VAT               = ยอดหลังหักส่วนลด × อัตรา VAT
จำนวนเงินรวมทั้งสิ้น = ยอดหลังหักส่วนลด + VAT
หัก ณ ที่จ่าย       = ยอดหลังหักส่วนลด × อัตรา WHT
ยอดชำระสุทธิ       = จำนวนเงินรวมทั้งสิ้น − หัก ณ ที่จ่าย
```

แดชบอร์ดไม่นับใบวางบิลที่ถูกแบ่งจ่ายแล้วซ้ำ ยอดจะนับจากใบแบ่งจ่ายแต่ละงวดแทน

## โครงสร้าง

```
app/
  login/                 เข้าสู่ระบบ / สมัคร
  (app)/page.tsx         แดชบอร์ด
  (app)/settings         ข้อมูลบริษัท + อัปโหลดรูป
  (app)/customers        ลูกค้า
  (app)/documents        รายการ / สร้าง / แก้ไข / พิมพ์
components/              DocumentForm, DocumentPaper (A4), DocToolbar, Nav
lib/                     calc (ยอดรวม), format (เงิน วันที่ บาทถ้วน), dashboard, draft
supabase/migrations/     SQL schema + RLS + storage
proxy.ts                 รีเฟรช session / กันหน้าที่ต้องล็อกอิน
```

## เชื่อมต่อ AI ผ่าน MCP (เช่น Grok)

แอปมี MCP server แบบ Streamable HTTP อยู่ที่ `https://<โดเมนของคุณ>/api/mcp`

### ตั้งค่าครั้งแรก

1. รัน `supabase/migrations/0002_mcp_tokens.sql` ใน Supabase SQL Editor
2. ใน Vercel > Settings > Environment Variables ให้เพิ่ม `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Project Settings > API Keys > `service_role` / secret) แล้ว Redeploy
   > key ตัวนี้ข้าม RLS ได้ ห้ามตั้งชื่อขึ้นต้นด้วย `NEXT_PUBLIC_` และห้าม commit ลง git เด็ดขาด
3. ในเว็บ ไปที่หน้า **ข้อมูลบริษัท > เชื่อมต่อ AI (MCP)** กด **สร้าง token** แล้วคัดลอกเก็บไว้ (ระบบแสดงให้ดูครั้งเดียว)

### Tools

| Tool | ใช้ทำอะไร |
|---|---|
| `get_dashboard` | ยอดวางบิล/รับชำระรายเดือน ยอดรอจ่าย เกินกำหนด |
| `list_documents` | ค้นหาเอกสาร (ประเภท สถานะ เดือน คำค้น) |
| `get_document` | รายละเอียดเอกสาร + รายการ + ยอด + ลิงก์พิมพ์ |
| `create_document` | สร้างใบเสนอราคา/วางบิล/แบ่งจ่าย/ใบเสร็จ |
| `update_document` | แก้รายการย่อย ส่วนลด VAT หัก ณ ที่จ่าย หมายเหตุ |
| `convert_document` | ออกเอกสารต่อ (QT → IV → IN → RE) |
| `set_document_status` | เปลี่ยนสถานะ (ชำระแล้ว ยกเลิก ฯลฯ) |
| `list_customers` / `create_customer` | ลูกค้า |
| `get_company_profile` | ข้อมูลบริษัท |

### Grok (xAI SDK, Python)

```python
from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import mcp

client = Client(api_key=os.environ["XAI_API_KEY"])
chat = client.chat.create(
    model="grok-4.3",
    tools=[mcp(
        server_url="https://<โดเมนของคุณ>/api/mcp",
        server_label="thai_billing",
        authorization=os.environ["BILL_MCP_TOKEN"],
    )],
)
chat.append(user("เดือนนี้มียอดรอจ่ายเท่าไหร่ ใครเกินกำหนดบ้าง"))
print(chat.sample().content)
```

### Grok (Responses API / HTTP)

```json
{
  "model": "grok-4.3",
  "input": "ออกใบเสนอราคาให้บริษัท ABC ค่าออกแบบเว็บ 50,000 บาท หัก ณ ที่จ่าย 3%",
  "tools": [{
    "type": "mcp",
    "server_label": "thai_billing",
    "server_url": "https://<โดเมนของคุณ>/api/mcp",
    "authorization": "<token>"
  }]
}
```

### Grok Build CLI / MCP client อื่น

```bash
grok mcp add --transport http thai-billing https://<โดเมนของคุณ>/api/mcp \
  --header "Authorization: Bearer <token>"
```

ทดสอบว่า endpoint ทำงาน: เปิด `https://<โดเมนของคุณ>/api/mcp` ในเบราว์เซอร์ จะเห็นรายชื่อ tools
