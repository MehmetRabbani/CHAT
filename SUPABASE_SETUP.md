# Supabase Setup Instructions

## Your Supabase Credentials

### Project URL
```
https://cqxghkrlzxfcgmxxlygm.supabase.co
```

### Publishable Key (Anon Key)
```
sb_publishable_yLwlQCn_lwXndbEmUseIGw_r3yI6nxR
```

### Database Connection String
```
postgresql://postgres:[YOUR-PASSWORD]@db.cqxghkrlzxfcgmxxlygm.supabase.co:5432/postgres
```

---

## CLI Setup (Local Development)

### 1. Install Supabase CLI
```bash
npm install -g supabase
# or
brew install supabase/tap/supabase
```

### 2. Login to Supabase
```bash
supabase login
```
- Browser açılacak, GitHub ile login yap
- Access token oluştur

### 3. Initialize Project
```bash
supabase init
```

### 4. Link to Your Project
```bash
supabase link --project-ref cqxghkrlzxfcgmxxlygm
```

### 5. Push Database Migrations
```bash
supabase db push
```
Bu komut `supabase/migrations/001_initial_schema.sql` dosyasını Supabase'e yükleyecek.

---

## Environment Variables

### For Web App (.env.local)
```
VITE_SUPABASE_URL=https://cqxghkrlzxfcgmxxlygm.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_yLwlQCn_lwXndbEmUseIGw_r3yI6nxR
```

### For Netlify Deploy
Same as above → Add to Site Settings → Environment variables

### For Local Database (Optional)
```bash
export SUPABASE_DB_PASSWORD="[YOUR-PASSWORD]"
```

---

## Next Steps

1. ✅ GitHub'a push edildi (Credentials var)
2. ⏭️ Netlify'ya bağla (Site settings → Environment)
3. ⏭️ Migrations çalıştır (supabase db push)
4. ⏭️ Deploy et

---

## Verification

After migration, test with:
```bash
# Local test
supabase start
bun run dev

# Check database
# Open: http://localhost:54322 (pgAdmin)
```
