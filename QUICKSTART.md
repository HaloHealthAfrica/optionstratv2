# Optionstrat Quick Start Guide

Get your trading system deployed in 15 minutes.

## Prerequisites

- Fly.io account (https://fly.io)
- Vercel account (https://vercel.com)
- Git installed
- flyctl CLI installed

---

## 🚀 Quick Deploy

### 1. Clone and Setup (2 min)

```bash
git clone https://github.com/HaloHealthAfrica/optionstratv2.git
cd optionstratv2/optionstrat-main
chmod +x scripts/*.sh
```

### 2. Deploy Backend to Fly.io (5 min)

```bash
# Login
flyctl auth login

# Create database
./scripts/setup-database.sh

# Run migrations
./scripts/run-migrations.sh

# Deploy backend
./scripts/deploy.sh
```

### 3. Deploy Frontend to Vercel (3 min)

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### 4. Configure (2 min)

1. Get your Fly.io backend URL:
   ```bash
   flyctl info --app optionstrat-backend | grep Hostname
   ```

2. Add to Vercel environment variables:
   - Go to https://vercel.com/dashboard
   - Select your project
   - Settings → Environment Variables
   - Add: `VITE_API_URL` = `https://optionstrat-backend.fly.dev`

3. Redeploy Vercel:
   ```bash
   vercel --prod
   ```

### 5. Test (1 min)

```bash
# Test backend
curl https://optionstrat-backend.fly.dev/health

# Visit frontend
open https://your-app.vercel.app
```

---

## ✅ You're Done!

Your trading system is now live:
- **Backend:** https://optionstrat-backend.fly.dev
- **Frontend:** https://your-app.vercel.app

---

## 📚 Next Steps

- Read full deployment guide: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Review system architecture: [REVIEW_REPORT.md](./REVIEW_REPORT.md)
- Check production readiness: [EXECUTIVE_SUMMARY.md](./EXECUTIVE_SUMMARY.md)

---

## 🆘 Need Help?

- **Fly.io Issues:** https://fly.io/docs
- **Vercel Issues:** https://vercel.com/docs
- **System Review:** See REVIEW_REPORT.md
