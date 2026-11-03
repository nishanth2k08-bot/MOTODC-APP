# MotoDC Hub Station - Warehouse Fulfillment & Packing App

Official standalone warehouse terminal application for **MotoDC Logistics & Central Fulfillment Hub** (Karaikal).

## 🚀 Key Features
- **Standalone Terminal App**: Runs independently of customer e-commerce store and admin dashboards.
- **Dual Barcode Scanner Support**:
  - **⚡ Hardware USB / Bluetooth Laser Scanner (Keyboard Wedge)**: Plug in any standard handheld barcode scanner gun (Zebra, Honeywell, Eyoyo, etc.). Aim at parcel or order pick-list and pull the trigger. The app automatically captures the barcode, plays an audio confirmation beep, highlights the order, and opens the shipping label modal.
  - **📷 Camera Barcode Scanner**: Built-in camera barcode reader powered by `html5-qrcode`. Works on tablets, laptops, and smartphones.
- **Security & Shift Lock**:
  - Terminal access secured with PIN **`1234`**.
  - **Automatic Shift Completion Logout at 8:30 PM** with overtime / after-hours unlock override.
- **Corridor Logistics Routing**:
  - Automatically sorts orders into 4 Karaikal staging racks:
    - **CTC-01**: Central Town Corridor (Bus Stand, Beach Rd, Market)
    - **NRC-02**: North Corridor (Kottucherry, Nedungadu)
    - **SRC-03**: South Corridor (T.R. Pattinam, Neravy, Port Road)
    - **WTC-04**: West Corridor (Thirunallar Temple Route, Ambagarathur)
- **Item Quality Verification Checklist**: Click-to-verify parts before boxing.
- **Printable Shipping Labels**: Amazon-style 4x6 labels with Code-128 linear barcode and 2D QR Code.
- **Stage 2 Status Advancement**: Marks order as `packed` in Firebase Firestore, completing Stage 2 on the customer's live tracking page.
- **Theme Support**: High-contrast Dark and Light warehouse modes.

## 🛠️ Running Locally
```bash
cd MOTODC-HUB-APP
npm install
npm run dev
```
Open **`http://localhost:3002`** in your browser.

## 📦 Production Build
```bash
npm run build
```
Generates production assets in `dist/`.
