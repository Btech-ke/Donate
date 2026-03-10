# BTECHPLUS Campus Pathway — Backend API

Full backend for BTECHPLUS: M-Pesa STK Push, AI assistant with memory, forum, PostgreSQL.

## Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL (Render / DBeaver)
- **M-Pesa**: Daraja API v2 (STK Push to Till)
- **AI**: Claude claude-sonnet-4-20250514 with persistent conversation memory
- **Deploy**: Render Free Tier

---

## 🚀 Deploy to Render (Step by Step)

### 1. Push to GitHub
```bash
cd btechplus-backend
git init
git add .
git commit -m "Initial BTECHPLUS backend"
git remote add origin https://github.com/YOUR_USERNAME/btechplus-backend.git
git push -u origin main
```

### 2. Create Render Web Service
1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - **Name**: `btechplus-backend-mpesa`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 3. Add Environment Variables in Render Dashboard
Copy these exact values:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(your full postgres URL from DBeaver)* |
| `MPESA_CONSUMER_KEY` | `hMUHdrQiS9XJZHLPh0MWBqTS9H7h9W6r3OPnPFqjo9uyXsze` |
| `MPESA_CONSUMER_SECRET` | `9A10egG76EXGm1gq5iyCnAlJphNv1kYeqiq9pG9aR1EPMBZM2QQw1nkmeowY8Lby` |
| `MPESA_SHORTCODE` | `4560085` |
| `MPESA_TILL_NUMBER` | `3348765` |
| `MPESA_PASSKEY` | `5177fec96b2a00cf949366a1ed784d1593c6058e2dc94699bcfb58287b05b53c` |
| `MPESA_CALLBACK_URL` | `https://btechplus-backend-mpesa.onrender.com/api/mpesa/callback` |
| `MPESA_BASE_URL` | `https://btechplus-backend-mpesa.onrender.com` |
| `ANTHROPIC_API_KEY` | *(get from console.anthropic.com)* |
| `FRONTEND_URL` | *(your GitHub Pages or frontend URL)* |

### 4. Deploy
Click **Deploy** — Render will build and start automatically.

### 5. Verify
Visit: `https://btechplus-backend-mpesa.onrender.com/health`
Should return: `{"status":"healthy"}`

---

## 📡 API Endpoints

### M-Pesa
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/mpesa/stk` | Trigger STK push to user phone |
| POST | `/api/mpesa/callback` | Safaricom callback (auto) |
| GET | `/api/mpesa/status/:id` | Poll payment status |
| GET | `/api/mpesa/donations` | List all donations |

**STK Push example:**
```json
POST /api/mpesa/stk
{ "phone": "0712345678", "amount": 100 }
```

### AI Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat` | Chat with BTECHPLUS AI |
| GET | `/api/ai/history/:sessionId` | Load conversation history |

```json
POST /api/ai/chat
{ "message": "What KMTC courses can I do with grade C?", "sessionId": "sess_abc123" }
```

### Forum
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forum/posts` | List posts |
| POST | `/api/forum/posts` | Create post |
| POST | `/api/forum/posts/:id/like` | Like a post |

---

## 🗄️ Database (DBeaver / PostgreSQL)

Tables created automatically on first startup:
- `donations` — all M-Pesa transactions with status
- `ai_conversations` — full chat history per session
- `forum_posts` — community forum
- `users` — account system (reserved for future auth)

**Connect in DBeaver:**
1. New Connection → PostgreSQL
2. Paste your `DATABASE_URL` or fill fields manually
3. Use SSL mode = Required

---

## ⚠️ Notes
- Render free tier spins down after 15 min inactivity — first request may take ~30s to wake
- M-Pesa callbacks only work with HTTPS (Render provides this automatically)
- Keep `.env` out of git — use Render dashboard for secrets
