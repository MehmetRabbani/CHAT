# Chatly — Development Guide

## Features Implemented

### ✅ Core Features
- [x] User authentication (email/password)
- [x] Profile management with 6-digit tags
- [x] Channel creation and management
- [x] Real-time messaging
- [x] User roles (owner, mod, member, banned)
- [x] Channel invites with invite codes
- [x] Channel-specific tags/badges

### ✅ Media & Communication
- [x] Avatar uploads (Supabase Storage)
- [x] Channel icon uploads
- [x] Image/GIF sharing in messages
- [x] Audio file uploads
- [x] WebRTC mesh audio/video (up to 4 participants)
- [x] Audio recording

### ✅ Internationalization
- [x] Turkish (TR)
- [x] English (EN)
- [x] Language switcher

### ✅ Security & Compliance
- [x] Row-level security (RLS) policies
- [x] Password verification for account deletion
- [x] Reserved tags for deleted accounts (anti-impersonation)
- [x] Soft delete for user data retention
- [x] Policy acceptance gate

### ✅ User Experience
- [x] Terms of Service page
- [x] Privacy Policy page
- [x] Policy acceptance modal on first login
- [x] Responsive mobile/desktop UI
- [x] Keyboard accessibility improvements
- [x] Voice/video call UI

## Setup Instructions

### Prerequisites
- Node.js 18+
- Supabase account
- Bun (recommended) or npm

### Installation

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run migrations
# 1. Go to Supabase dashboard
# 2. Navigate to SQL Editor
# 3. Copy contents of supabase/migrations/001_initial_schema.sql
# 4. Paste and execute

# Start development server
bun run dev
```

## Project Structure

```
src/
├── routes/          # TanStack Router pages
├── components/      # React components
├── lib/            # Utilities and helpers
│   ├── webrtc.ts   # WebRTC implementation
│   ├── storage.ts  # Supabase Storage helpers
│   └── supabase-client.ts
├── i18n/           # Translations (TR/EN)
└── styles.css      # Global styles

supabase/
└── migrations/     # Database migrations
```

## Key Components

### VoiceRoom
WebRTC mesh implementation for audio/video calls (≤4 participants)

### MediaUploader
Handle image, GIF, and audio uploads to messages

### LanguageSwitcher
TR/EN language selection with localStorage persistence

### PolicyGate
Ensure users accept platform policy before accessing features

## Known Limitations

- WebRTC mesh limited to 4 participants (recommend LiveKit for larger groups)
- Audio/video requires browser permissions
- Storage bucket needs public read permissions

## Future Enhancements

- [ ] LiveKit integration for larger voice rooms
- [ ] Message reactions/emojis
- [ ] User presence/online status
- [ ] Direct messages
- [ ] Channel permissions granularity
- [ ] Mobile app (React Native)
