# ⚙️ Backend Logic & Responsibilities

The Python backend acts as the "Brain" of the Rizal Provincial Library System. It bridges the gap between the React UI and the MySQL Database.

### 🧠 Core Responsibilities

1. **Biometric Identity Mapping**: 
   * Convert facial images into 128-dimension mathematical vectors.
   * Compare live camera frames from the `EntryGate` against the MySQL `users` table to identify members.

2. **QR Code Orchestration**:
   * Generate unique QR IDs for new book entries during bulk Excel uploads.
   * Process "Scan to Return" requests by updating book status from `borrowed` to `available`.

3. **Smart Shelf (Recommendation AI)**:
   * **Personalized Logic**: Analyze a user's `borrow_history` table to suggest books in similar categories.
   * **Trending Logic**: Calculate the most-borrowed books within the last 30 days.

4. **Bulk Data Processing**:
   * Handle Librarian's `.xlsx` uploads to update the 7,000+ book inventory in real-time.

5. **Reporting Engine**:
   * Query the `logs` and `transactions` tables to aggregate monthly data into official PDF/Excel formats.

---

### 🛠️ API Endpoints (Planned)
* `POST /api/auth/face`: Biometric login/entry.
* `GET /api/books/recommendations`: Fetch AI-suggested books.
* `POST /api/librarian/upload`: Bulk book import via Excel.
* `GET /api/user/report`: Generate the PDF Reading Transcript.