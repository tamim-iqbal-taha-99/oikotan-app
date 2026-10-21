require('dotenv').config();
const path = require('path'), crypto = require('crypto');
const express = require('express'), mongoose = require('mongoose'), jwt = require('jsonwebtoken');
const helmet = require('helmet'), rateLimit = require('express-rate-limit');

const { MONGODB_URI, JWT_SECRET, ADMIN_USER, ADMIN_PASS, PORT = 3000, FEE = 200, BKASH_NUMBER, NAGAD_NUMBER } = process.env;
if (!MONGODB_URI || !JWT_SECRET || !ADMIN_USER || !ADMIN_PASS) {
  console.error('.env ফাইলে MONGODB_URI, JWT_SECRET, ADMIN_USER, ADMIN_PASS দিতে হবে');
  process.exit(1);
}

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));

const S = (o) => new mongoose.Schema(o, { timestamps: true });
const url = { type: String, maxlength: 120000, default: '', match: [/^(https?:\/\/.{1,480}|data:image\/jpeg;base64,[A-Za-z0-9+\/=]+)?$/, 'ছবির লিংক https:// দিয়ে শুরু হতে হবে'] };
const T = (n = 100, x = {}) => ({ type: String, maxlength: n, default: '', ...x });
const Models = {
  notices: mongoose.model('Notice', S({
    title: { type: String, required: true, maxlength: 150 },
    body: { type: String, maxlength: 2000, default: '' },
    date: { type: Date, default: Date.now },
  })),
  leaders: mongoose.model('Leader', S({
    name: { type: String, required: true, maxlength: 100 },
    position: { type: String, maxlength: 100, default: '' },
    photo: url,
    order: { type: Number, default: 100 },
  })),
  joins: mongoose.model('Join', S({
    appId: { type: String, unique: true, sparse: true },
    name: T(100, { required: true }), father: T(100, { required: true }), mother: T(100, { required: true }),
    phone: { type: String, required: true, match: [/^01[3-9]\d{8}$/, 'মোবাইল নম্বর সঠিক নয়'] },
    nid: T(30), education: T(100), institute: T(150), grade: T(60), profession: T(100),
    presentAddress: T(200, { required: true }), permanentAddress: T(200),
    bloodGroup: T(10), emergency: T(60), skills: T(200),
    payMethod: { type: String, enum: ['bkash', 'nagad', 'cash'], required: true },
    payNumber: { type: String, default: '' },
    trxId: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    note: T(300),
  })),
};
const sorts = { notices: { date: -1 }, leaders: { order: 1, createdAt: 1 }, joins: { createdAt: -1 } };
// শুধু schema-র ফিল্ডগুলো নেওয়া হয়, বাকি সব বাদ
const pick = (M, b = {}) => {
  const o = {};
  Object.keys(M.schema.obj).forEach((k) => { if (b[k] !== undefined) o[k] = typeof b[k] === 'string' ? b[k].trim() : b[k]; });
  return o;
};
const w = (f) => (q, s, n) => f(q, s, n).catch(n);

// ---------- পাবলিক API ----------
app.get('/api/:col(notices|leaders)', w(async (q, s) =>
  s.json(await Models[q.params.col].find().sort(sorts[q.params.col]).lean())));

const bn = (s) => String(s ?? '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).trim();
const APPLY = ['name', 'father', 'mother', 'phone', 'nid', 'education', 'institute', 'grade', 'profession',
  'presentAddress', 'permanentAddress', 'bloodGroup', 'emergency', 'skills', 'payMethod', 'payNumber', 'trxId'];
const PHONE = /^01[3-9]\d{8}$/;

app.get('/api/config', (q, s) => s.json({ fee: +FEE, bkash: BKASH_NUMBER || '', nagad: NAGAD_NUMBER || '' }));

// আবেদন: status/appId আবেদনকারী দিতে পারে না, শুধু APPLY তালিকার ফিল্ড নেওয়া হয়
app.post('/api/join', rateLimit({ windowMs: 3600e3, max: 10 }), w(async (q, s) => {
  const d = {};
  APPLY.forEach((k) => { if (typeof q.body?.[k] === 'string') d[k] = q.body[k].trim(); });
  d.phone = bn(d.phone);
  if (d.payMethod === 'cash') { delete d.trxId; delete d.payNumber; }
  else {
    d.trxId = bn(d.trxId).toUpperCase(); d.payNumber = bn(d.payNumber);
    if (!d.trxId || !PHONE.test(d.payNumber)) return s.status(400).json({ error: 'পেমেন্টের প্রেরক নম্বর ও TrxID সঠিকভাবে দিন' });
  }
  d.appId = 'OK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  try { await Models.joins.create(d); }
  catch (e) {
    if (e.code === 11000 && e.keyPattern?.trxId) return s.status(409).json({ error: 'এই TrxID দিয়ে আগেই আবেদন করা হয়েছে' });
    throw e;
  }
  s.status(201).json({ appId: d.appId });
}));

// আবেদনের অবস্থা: আইডি + ফোন নম্বর মিললে তবেই তথ্য দেওয়া হয়
app.post('/api/status', rateLimit({ windowMs: 15 * 60e3, max: 30 }), w(async (q, s) => {
  const id = String(q.body?.appId || '').trim().toUpperCase();
  const j = id ? await Models.joins.findOne({ appId: id }).lean() : null;
  if (!j || j.phone !== bn(q.body?.phone)) return s.status(404).json({ error: 'আবেদন পাওয়া যায়নি। আইডি ও মোবাইল নম্বর মিলিয়ে দেখুন।' });
  delete j.trxId; delete j._id; delete j.__v;
  s.json(j);
}));

// ---------- অ্যাডমিন লগইন ----------
const eq = (a, b) => {
  const h = (x) => crypto.createHash('sha256').update(String(x)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};
app.post('/api/login', rateLimit({ windowMs: 15 * 60e3, max: 10 }), (q, s) => {
  const { user, pass } = q.body || {};
  if (eq(user, ADMIN_USER) & eq(pass, ADMIN_PASS))
    return s.json({ token: jwt.sign({ admin: 1 }, JWT_SECRET, { expiresIn: '8h' }) });
  s.status(401).json({ error: 'ইউজারনেম বা পাসওয়ার্ড ভুল' });
});

// ---------- অ্যাডমিন CRUD (লগইন ছাড়া চলবে না) ----------
const admin = express.Router();
admin.use((q, s, n) => {
  try { jwt.verify((q.headers.authorization || '').slice(7), JWT_SECRET); n(); }
  catch { s.status(401).json({ error: 'আবার লগইন করুন' }); }
});
admin.param('col', (q, s, n, c) => (Object.hasOwn(Models, c) ? n() : s.sendStatus(404)));
admin.get('/:col', w(async (q, s) => s.json(await Models[q.params.col].find().sort(sorts[q.params.col]).lean())));
admin.post('/:col', w(async (q, s) => s.status(201).json(await Models[q.params.col].create(pick(Models[q.params.col], q.body)))));
admin.put('/:col/:id', w(async (q, s) => {
  const M = Models[q.params.col];
  s.json(await M.findByIdAndUpdate(q.params.id, pick(M, q.body), { new: true, runValidators: true }));
}));
admin.delete('/:col/:id', w(async (q, s) => { await Models[q.params.col].findByIdAndDelete(q.params.id); s.json({ ok: true }); }));
app.use('/api/admin', admin);

// ---------- ফ্রন্টএন্ড ----------
app.get('/admin', (q, s) => s.sendFile(path.join(__dirname, 'public/admin.html')));
app.use(express.static(path.join(__dirname, 'public')));

app.use((e, q, s, n) => {
  if (e.name === 'ValidationError' || e.name === 'CastError') return s.status(400).json({ error: 'তথ্য সঠিক নয়, আবার চেক করুন' });
  console.error(e);
  s.status(500).json({ error: 'সার্ভারে সমস্যা হয়েছে' });
});

mongoose.connect(MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log('চালু হয়েছে: http://localhost:' + PORT)))
  .catch((e) => { console.error('MongoDB কানেক্ট হয়নি:', e.message); process.exit(1); });
