# 📚 Rizal Provincial Library System (Phase 4: Biometrics)

An intelligent library management system featuring **AI-driven Facial Recognition** and **Automated Academic Reporting** for a seamless, "oldie-friendly" provincial library experience.

Cloud deployment: see [Vercel and Supabase setup](docs/DEPLOYMENT.md).

---

## 🚀 Features
* **Dual-Layer Authentication**: 
    * **Level 1 (Kiosk Mode)**: Biometric Time-In/Out for guests.
    * **Level 2 (Member Hub)**: Secure access to the "Personal Terminal" for book history and reports.
* **The "Modern Imprint" UI**: A high-contrast, premium "Netflix-style" interface optimized for readability and comfort.
* **Slidable Genre Shelves**: Horizontal browsing with 20+ books per category (History, Classics, etc.), showing 7 books per view.
* **FaceID Reservations**: Real-time biometric verification to finalize book selection.
* **Automated Academic Reports**: Generates downloadable reading transcripts for library compliance and academic credits.

---

## 🛠️ Tech Stack
| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React.js (Vite), Tailwind CSS | User Interface & Slidable Layout |
| **Backend** | Python (FastAPI / Flask) | AI "Brain" & Logic Controller |
| **Database & Files** | Supabase PostgreSQL & Storage | Online library records, face embeddings, covers, avatars and IDs |
| **AI Engine** | OpenCV, Dlib, Face Recognition | Facial Feature Extraction & Matching |
| **Data Tools** | Pandas, Openpyxl | Excel-to-QR Processing & Stats |

---

## 📂 Project Structure
```text
Rizal-Provincial-Library-System/
├── frontend/                 # React UI (Modern Imprint Style)
│   ├── src/components/       # Navbar, BookCard, BiometricModal
│   └── src/pages/            # LandingPage, UserHome, LibDashboard
├── backend/                  # Python AI Server
│   ├── api/                  # FastAPI Routes (Login, Borrow, Report)
│   ├── core/                 # AI Logic (Face recognition, QR processing)
│   ├── database/             # MySQL Schemas & Connection
│   └── known_faces/          # Encrypted Biometric Database
└── docs/                     # Requirements & Technical Manuals
