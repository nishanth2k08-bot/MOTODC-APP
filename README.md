# MotoDC Partner — Delivery & Handover PWA App 🚚

Official Progressive Web Application (PWA) built specifically for **MotoDC Delivery Partners and Couriers**.

Designed mobile-first for couriers in the field to handle fast doorstep parcel verification, COD cash collection, customer handover PIN validation, and daily shift reconciliation.

---

## ⚡ Core Features

* **📷 High-Speed Dual Scanner:** Rear camera barcode & 2D QR Code scanner with glowing reticle and laser sweep animation.
* **🔍 Order ID Manual Lookup:** Fallback search allows riders to type the Order ID manually if a physical parcel label is scuffed or torn.
* **📦 Product Identification:** Displays the parcel manifest with product names, quantities, and **real product image thumbnails** so couriers can verify items.
* **💵 COD Cash Checklist:**
  * **Cash on Delivery (COD):** Amber high-contrast banner showing the exact rupees to collect, with a mandatory confirmation checklist.
  * **Prepaid Orders:** Green banner indicating payment was settled online (Collect ₹0).
* **🔒 Doorstep Handover PIN:** Requires entering the customer's 4-digit Security PIN (shown on the customer's `/orders` portal) to complete delivery.
* **📋 Daily Run Sheet:** Tracks total packages delivered today, timestamps, and total COD cash collected during the shift.
* **📱 1-Tap Home Screen Installation (PWA):**
  * Android / Chrome: In-app prompt to install **"MotoDC Partner"** to the home screen.
  * iOS / Safari: Runs in standalone full-screen mode without browser tabs or URL bars.
* **📳 Silent Haptic Feedback:** Vibrates subtly on successful scans and verified deliveries with zero audio chimes.

---

## 🛠️ Technology Stack

* **Frontend:** React 18 + Vite
* **PWA:** Web App Manifest + Service Worker offline caching
* **Scanning Engine:** `html5-qrcode` (high-frame-rate environment camera)
* **Backend Database:** Firebase Firestore (`moto-dc-6e049`)
* **Icons & Styling:** Lucide React + Custom Dark-Theme CSS

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Build for production
npm run build
```

---

## 🌐 Deploy to Vercel

1. Push this repository to GitHub (`nishanth2k08-bot/MOTODC-APP`).
2. Go to [Vercel](https://vercel.com) ➔ **Add New Project**.
3. Import `MOTODC-APP`.
4. Framework Preset: **Vite**.
5. Click **Deploy**.

Your delivery partners can then open the deployed URL (e.g. `motodc-partner.vercel.app` or `partner.motodc.in`) and tap **"Install"** to use it as a native app on their phones!
