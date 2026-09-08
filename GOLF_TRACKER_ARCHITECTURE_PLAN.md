# Golf Tracker - Multi-User Cloud Architecture Plan
## From Single-Device App to Full Cloud Platform

---

## 🎯 Vision

Transform Golf Tracker from a single-device Safari app into a full cloud-based 
multi-user platform where:
- Any player can log in from any device (iPhone, Android, desktop)
- All scores stored in a real database
- Live leaderboards across groups during a round
- Historical stats and handicap tracking
- Tournament management for multiple groups
- Admin controls for club/group management

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
│                                                                 │
│  📱 iPhone Safari    📱 Android Chrome    💻 Desktop Browser    │
│                                                                 │
│           React PWA (Progressive Web App)                       │
│           - Installable on home screen                          │
│           - Works offline (cached)                              │
│           - Real-time updates via WebSockets                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                        BACKEND API                              │
│                                                                 │
│              Node.js + Express  OR  Supabase                    │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │   Auth   │  │  Rounds  │  │ Courses  │  │  Tournaments │   │
│  │  /login  │  │  /score  │  │  /list   │  │   /create    │   │
│  │ /signup  │  │  /save   │  │  /add    │  │   /join      │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                 │
│              Real-time: Supabase Realtime / Socket.io           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                        DATABASE                                 │
│                                                                 │
│              PostgreSQL (via Supabase)                          │
│                                                                 │
│  users │ players │ courses │ rounds │ scores │ tournaments      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### **Table 1: users**
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  last_login  TIMESTAMP,
  role        TEXT DEFAULT 'player'  -- 'admin', 'player', 'guest'
);
```

### **Table 2: players**
```sql
CREATE TABLE players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),  -- null = guest player
  group_id     UUID REFERENCES groups(id),
  name         TEXT NOT NULL,
  hcp_index    DECIMAL(4,1) NOT NULL,
  default_tee  TEXT NOT NULL,
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

### **Table 3: groups**
```sql
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,       -- "Robert's Golf Group"
  admin_id    UUID REFERENCES users(id),
  invite_code TEXT UNIQUE,         -- "GOLF-1234" for others to join
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### **Table 4: courses**
```sql
CREATE TABLE courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  location    TEXT,
  group_id    UUID REFERENCES groups(id),  -- null = global course
  tees        JSONB NOT NULL,              -- [{name, rating, slope, pars[], si[]}]
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### **Table 5: rounds**
```sql
CREATE TABLE rounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID REFERENCES groups(id),
  tournament_id UUID REFERENCES tournaments(id),  -- null if regular round
  course_id     UUID REFERENCES courses(id),
  date          DATE NOT NULL,
  name          TEXT NOT NULL,
  game_format   TEXT NOT NULL,
  status        TEXT DEFAULT 'in_progress',  -- 'in_progress', 'completed'
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### **Table 6: scores**
```sql
CREATE TABLE scores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   UUID REFERENCES rounds(id) ON DELETE CASCADE,
  player_id  UUID REFERENCES players(id),
  tee_id     TEXT NOT NULL,
  hole       INTEGER NOT NULL,    -- 1-18
  gross      INTEGER,             -- strokes
  putts      INTEGER,             -- putts
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(round_id, player_id, hole)
);
```

### **Table 7: tournaments**
```sql
CREATE TABLE tournaments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID REFERENCES groups(id),
  name         TEXT NOT NULL,
  date         DATE NOT NULL,
  course_id    UUID REFERENCES courses(id),
  join_code    TEXT UNIQUE,        -- "TRN-482937"
  format       TEXT NOT NULL,
  status       TEXT DEFAULT 'setup',  -- 'setup', 'active', 'completed'
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMP DEFAULT NOW()
);
```

### **Table 8: tournament_groups**
```sql
CREATE TABLE tournament_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id),
  name          TEXT NOT NULL,     -- "Group A", "Group B"
  tee_time      TIME,
  player_ids    UUID[],            -- array of player IDs
  device_token  TEXT               -- which device is scoring for this group
);
```

### **Table 9: handicap_history**
```sql
CREATE TABLE handicap_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID REFERENCES players(id),
  hcp_index  DECIMAL(4,1) NOT NULL,
  round_id   UUID REFERENCES rounds(id),
  recorded_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🏗️ Technology Stack

### **Option A: Supabase (RECOMMENDED - Fastest to Build)**

```
Frontend:  React (current app, upgraded)
Backend:   Supabase (Backend-as-a-Service)
Database:  PostgreSQL (managed by Supabase)
Auth:      Supabase Auth (email/password, Google login)
Realtime:  Supabase Realtime (WebSockets built-in)
Storage:   Supabase Storage (for profile photos)
Hosting:   Vercel or Netlify (free tier)
```

**Why Supabase:**
- ✅ Free tier: 500MB database, 50,000 monthly active users
- ✅ Built-in auth (email, Google, Apple login)
- ✅ Real-time subscriptions (live scoring!)
- ✅ Auto-generated REST API
- ✅ PostgreSQL (industry standard)
- ✅ Dashboard to view/edit data
- ✅ No backend server to maintain
- ✅ Setup time: 1-2 days

**Cost:**
- Free tier: Handles your entire golf group forever
- Pro tier ($25/month): If you scale to 100+ users

---

### **Option B: Firebase (Google)**

```
Frontend:  React
Backend:   Firebase Functions (serverless)
Database:  Firestore (NoSQL)
Auth:      Firebase Auth
Realtime:  Firestore real-time listeners
Hosting:   Firebase Hosting
```

**Why Firebase:**
- ✅ Very mature platform
- ✅ Excellent real-time sync
- ✅ Great mobile SDKs
- ⚠️ NoSQL (less structured than PostgreSQL)
- ⚠️ Can get expensive at scale
- ⚠️ Vendor lock-in to Google

---

### **Option C: Full Custom Stack**

```
Frontend:  React + Vite
Backend:   Node.js + Express + Socket.io
Database:  PostgreSQL
Auth:      JWT tokens
Hosting:   Railway or Render ($5-7/month)
```

**Why Custom:**
- ✅ Full control
- ✅ Most flexible
- ⚠️ Most complex to build and maintain
- ⚠️ Requires more development time

---

## 📱 Frontend Architecture (React PWA)

### **App Structure:**

```
src/
├── components/
│   ├── auth/
│   │   ├── Login.jsx
│   │   ├── Signup.jsx
│   │   └── ForgotPassword.jsx
│   ├── setup/
│   │   ├── SetupTab.jsx
│   │   ├── CourseSelector.jsx
│   │   └── PlayerManager.jsx
│   ├── scoring/
│   │   ├── HoleEntry.jsx
│   │   ├── ScoreGrid.jsx
│   │   └── QuickButtons.jsx
│   ├── leaderboard/
│   │   ├── Leaderboard.jsx
│   │   └── LeaderboardCard.jsx
│   ├── tournament/
│   │   ├── TournamentSetup.jsx
│   │   ├── TournamentJoin.jsx
│   │   └── TournamentLeaderboard.jsx
│   ├── export/
│   │   ├── ExportTab.jsx
│   │   ├── WhatsAppCard.jsx
│   │   └── ExcelExport.jsx
│   └── dashboard/
│       ├── Dashboard.jsx
│       ├── HandicapChart.jsx
│       ├── RoundHistory.jsx
│       └── CourseStats.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useRound.js
│   ├── useRealtime.js
│   └── useScores.js
├── lib/
│   ├── supabase.js       -- Supabase client setup
│   ├── handicap.js       -- Handicap calculations
│   ├── scoring.js        -- Net score, stableford etc
│   └── export.js         -- Excel, WhatsApp formatting
└── App.jsx
```

---

## 🔐 Authentication Flow

```
┌─────────────────────────────────────────┐
│           User Opens App                │
└─────────────────┬───────────────────────┘
                  │
         ┌────────▼────────┐
         │  Logged In?     │
         └────────┬────────┘
         Yes      │       No
          ┌───────┘       └───────┐
          │                       │
    ┌─────▼──────┐         ┌──────▼──────┐
    │  Main App  │         │  Login Page │
    │            │         │             │
    │ Your group │         │ 📧 Email    │
    │ Your rounds│         │ 🔑 Password │
    │ Your stats │         │ 🔵 Google   │
    └────────────┘         │ 🍎 Apple    │
                           └─────────────┘
```

### **User Roles:**
- **Admin** (you): Manage group, add courses, manage players
- **Player**: Enter scores, view leaderboard, view own history
- **Guest**: View leaderboard only (for spectators)

---

## ⚡ Real-Time Scoring Flow

```
Player A enters score on Hole 7
           │
           ▼
    scores table updated
    in Supabase database
           │
           ▼
    Supabase Realtime
    broadcasts change
           │
    ┌──────┴──────────────────┐
    │                         │
    ▼                         ▼
Player B's phone         Player C's phone
leaderboard updates      leaderboard updates
INSTANTLY                INSTANTLY
```

### **React Code for Real-Time:**
```javascript
// Subscribe to live score updates
useEffect(() => {
  const subscription = supabase
    .channel('scores')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'scores', 
        filter: `round_id=eq.${roundId}` },
      (payload) => {
        // Score updated by another player!
        updateLeaderboard(payload.new);
      }
    )
    .subscribe();

  return () => subscription.unsubscribe();
}, [roundId]);
```

---

## 📊 Dashboard & Analytics (New Feature)

### **Player Dashboard:**
```
┌─────────────────────────────────────┐
│  👋 Welcome back, Robert!           │
│  Current HCP: 5.5 → Trending: ↓4.9 │
├─────────────────────────────────────┤
│  📊 THIS SEASON (2025)              │
│  Rounds: 12    Avg Score: 78.3      │
│  Best Net: 68   Best Gross: 73      │
│  Avg Putts: 31.2                    │
├─────────────────────────────────────┤
│  📈 HANDICAP TREND                  │
│  [Chart showing 6.2→5.5 trend]      │
├─────────────────────────────────────┤
│  🏆 RECENT ROUNDS                   │
│  Mar 10 - SDCC    76 (+4)  Net 68  │
│  Mar 3  - Coronado 79 (+7) Net 71  │
│  Feb 24 - Torrey S 81 (+9) Net 73  │
├─────────────────────────────────────┤
│  ⛳ BY COURSE                        │
│  SDCC:    Avg 77.2  Best 73        │
│  Coronado: Avg 79.1  Best 75       │
│  Torrey S: Avg 82.4  Best 79       │
└─────────────────────────────────────┘
```

### **Group Dashboard (Admin View):**
```
┌─────────────────────────────────────┐
│  🏌️ GROUP STANDINGS 2025            │
├─────────────────────────────────────┤
│  #1  Robert    5.5 HCP  12 rounds  │
│  #2  Greg      6.2 HCP  11 rounds  │
│  #3  Julio     6.0 HCP   8 rounds  │
│  #4  Dennis    6.9 HCP  10 rounds  │
├─────────────────────────────────────┤
│  🏆 SEASON WINNERS                  │
│  Most Wins: Robert (4)             │
│  Most Birdies: Greg (47)           │
│  Best Round: Dennis 71 @ SDCC      │
│  Most Improved: Mike (-2.1 HCP)    │
└─────────────────────────────────────┘
```

---

## 🚀 Implementation Phases

### **Phase 1: Supabase Setup (Week 1)**
- [ ] Create Supabase project (free)
- [ ] Create all database tables
- [ ] Set up authentication (email + Google)
- [ ] Connect React app to Supabase
- [ ] Migrate existing localStorage data to database

**Deliverable:** App works with database, login/logout functional

---

### **Phase 2: Multi-User Core (Week 2)**
- [ ] Group management (create group, invite players)
- [ ] Player profiles with handicap history
- [ ] Round creation and score entry
- [ ] Scores save to database (not localStorage)
- [ ] Basic leaderboard from database

**Deliverable:** Multiple users can score simultaneously

---

### **Phase 3: Real-Time Sync (Week 3)**
- [ ] Live score updates via Supabase Realtime
- [ ] Live leaderboard during round
- [ ] Group progress indicators
- [ ] Connection status indicator
- [ ] Offline mode with sync when reconnected

**Deliverable:** All phones see scores update in real-time

---

### **Phase 4: Tournament Mode (Week 4)**
- [ ] Tournament creation with join codes
- [ ] Multiple scoring groups
- [ ] Combined tournament leaderboard
- [ ] Tournament history and results

**Deliverable:** Full tournament support for 3+ groups

---

### **Phase 5: Dashboard & Analytics (Week 5-6)**
- [ ] Player dashboard with season stats
- [ ] Handicap trend charts
- [ ] Course performance breakdown
- [ ] Group leaderboard and standings
- [ ] Hole-by-hole averages
- [ ] Birdie/eagle/bogey breakdown

**Deliverable:** Full analytics dashboard

---

### **Phase 6: PWA & Polish (Week 7)**
- [ ] Install on home screen (iOS + Android)
- [ ] Works offline (cached scoring)
- [ ] Push notifications (round invites, results)
- [ ] Profile photos
- [ ] Share scorecard as image

**Deliverable:** Professional polished app, works like native

---

## 💰 Cost Breakdown

### **Development Phase (Free):**
| Service | Cost |
|---------|------|
| Supabase (free tier) | $0/month |
| Vercel hosting | $0/month |
| GitHub repo | $0/month |
| **Total** | **$0/month** |

### **If You Scale (100+ users):**
| Service | Cost |
|---------|------|
| Supabase Pro | $25/month |
| Vercel Pro | $20/month |
| Custom domain | $12/year |
| **Total** | **~$45/month** |

---

## 🔄 Migration Plan (localStorage → Database)

### **Current Data in localStorage:**
- `golf_library_v14` → courses + players
- `golf_round_v14` → current round
- `golf_archive_v14` → past rounds
- `golf_saved_rounds_v14` → saved rounds

### **Migration Steps:**
1. User logs in for first time
2. App detects existing localStorage data
3. Prompts: "Import your existing rounds?"
4. Exports localStorage → uploads to Supabase
5. Clears localStorage
6. All data now in database!

### **Migration Code:**
```javascript
const migrateLocalData = async (userId) => {
  // Check for existing local data
  const localLibrary = localStorage.getItem('golf_library_v14');
  const localArchive = localStorage.getItem('golf_archive_v14');
  
  if (localLibrary) {
    const library = JSON.parse(localLibrary);
    
    // Upload courses
    await supabase.from('courses').upsert(
      library.courses.map(c => ({ ...c, group_id: userGroupId }))
    );
    
    // Upload players
    await supabase.from('players').upsert(
      library.roster.map(p => ({ ...p, group_id: userGroupId }))
    );
  }
  
  if (localArchive) {
    const archive = JSON.parse(localArchive);
    // Upload each archived round...
    for (const round of archive) {
      await uploadRound(round, userId);
    }
  }
  
  // Clear local storage after migration
  localStorage.clear();
  console.log('Migration complete!');
};
```

---

## 📱 PWA Installation (Replace Safari Workaround)

Once deployed to Vercel, the app becomes a PWA:

### **iPhone Install:**
1. Open `https://golf-tracker.vercel.app` in Safari
2. Tap Share button
3. Tap "Add to Home Screen"
4. App installs like a native app!
5. Opens fullscreen, no browser UI

### **Android Install:**
1. Open URL in Chrome
2. Chrome shows "Install App" banner automatically
3. One tap to install

### **Benefits over current setup:**
- ✅ No need to open Claude.ai
- ✅ Works on ALL devices (iPhone + Android)
- ✅ Looks and feels like native app
- ✅ Faster loading (cached)
- ✅ Can work offline
- ✅ Your own URL (not claude.ai)

---

## 🔑 Supabase Quick Start (Step by Step)

### **Day 1 Setup:**

1. **Create account:** https://supabase.com (free)
2. **New project:** "golf-tracker"
3. **Run SQL** to create tables (I'll provide the exact SQL)
4. **Get credentials:**
   - Project URL: `https://xyz.supabase.co`
   - Anon key: `eyJhbGci...`
5. **Add to app:**
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://xyz.supabase.co',   // your project URL
  'eyJhbGci...'                // your anon key
)
```

6. **Deploy to Vercel:**
   - Connect GitHub repo
   - Add environment variables
   - Deploy! (automatic on every git push)

---

## 🎯 Recommended Next Steps

### **Immediate (This Week):**
1. ✅ Create Supabase account (free, 5 min)
2. ✅ Create Vercel account (free, 5 min)
3. ✅ Share Supabase credentials with me
4. ✅ I'll set up the full database schema
5. ✅ I'll update the React app to use Supabase

### **Short Term (2-4 Weeks):**
1. Multi-user login working
2. All scores in database
3. Real-time leaderboard
4. Tournament support

### **Medium Term (1-2 Months):**
1. Analytics dashboard
2. Handicap tracking
3. PWA installable app
4. Your own domain name

---

## 📋 Summary

| Feature | Current | After Migration |
|---------|---------|-----------------|
| Storage | localStorage (one device) | PostgreSQL database (all devices) |
| Users | Single user | Unlimited users |
| Access | Safari on Robert's iPhone | Any device, any browser |
| Real-time | No | Yes - live scoring |
| History | Local only | Cloud, permanent |
| Analytics | None | Full dashboard |
| Tournaments | Not yet | Multi-group support |
| Offline | Yes | Yes (PWA cache) |
| Cost | $0 | $0 (free tier) |
| Install | Bookmark Safari | Native-like PWA |

---

**The bottom line:** Supabase + Vercel gets you a professional 
multi-user golf app for $0/month, deployed to the web, 
accessible from any device, with real-time scoring - 
in about 2-3 weeks of focused development.

Ready to start? The first step is creating a free Supabase account!
