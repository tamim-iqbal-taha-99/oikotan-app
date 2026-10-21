# ঐকতান ওয়েবসাইট (Node.js + MongoDB)

## ফোল্ডার
- `server.js` : সার্ভার, ডাটাবেস, লগইন ও API
- `public/index.html` : পাবলিক ওয়েবসাইট
- `public/admin.html` : অ্যাডমিন প্যানেল (`/admin` লিংকে খোলে)

## ১. MongoDB Atlas (ফ্রি ডাটাবেস)
1. mongodb.com/atlas এ অ্যাকাউন্ট খুলে **M0 Free** ক্লাস্টার বানান।
2. **Database Access** এ একটি ইউজার ও পাসওয়ার্ড তৈরি করুন।
3. **Network Access** এ `0.0.0.0/0` যোগ করুন (Render এর IP বদলায়)।
4. **Connect → Drivers** থেকে connection string কপি করুন। শেষে ডাটাবেসের নাম দিন:
   `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/oikotan`
   পাসওয়ার্ডে বিশেষ চিহ্ন থাকলে সেটি URL-encode করতে হবে।

## ২. নিজের কম্পিউটারে চালান
```bash
cd oikotan-app
npm install
cp .env.example .env     # তারপর .env খুলে মান বসান
npm run dev
```
সাইট: http://localhost:3000 — অ্যাডমিন: http://localhost:3000/admin

`JWT_SECRET` বানাতে: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## ৩. অনলাইনে দিন (Render)
1. প্রজেক্ট GitHub এ আপলোড করুন (`.env` আপলোড করবেন না; `.gitignore` এ `node_modules` ও `.env` রাখুন)।
2. render.com → **New → Web Service** → আপনার repo বেছে নিন।
3. Build Command: `npm install`, Start Command: `npm start`
4. **Environment** এ চারটি মান দিন: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASS`
5. Deploy শেষ হলে `https://আপনার-নাম.onrender.com` এ সাইট, `/admin` এ প্যানেল।

ফ্রি প্ল্যানে কিছুক্ষণ কেউ না ঢুকলে সার্ভার ঘুমিয়ে যায়, প্রথম লোডে ৩০–৬০ সেকেন্ড লাগতে পারে।

## নিরাপত্তা
- ADMIN_PASS বড় ও কঠিন রাখুন, কাউকে দেবেন না।
- সদস্য আবেদনে মানুষের ফোন নম্বর জমা হয়, তাই অ্যাডমিন লগইন সুরক্ষিত রাখুন।
- সাইট অবশ্যই HTTPS এ চালান (Render নিজে দেয়)।
