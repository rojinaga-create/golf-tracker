# Multi-Group Tournament Implementation Plan
## Golf Tracker v22 - Tournament Mode

---

## 🎯 Goal
Allow multiple groups (e.g., 3 groups of 4 players) to play simultaneously and compete on a single shared leaderboard, with each group entering their own scores independently.

---

## 📋 Use Case Example

**Tournament Setup:**
- **12 total players** divided into 3 groups of 4
- Group A: Robert, Greg, Dennis, Mike (Tee Time 8:00am)
- Group B: Julio, Hector, Carlos, Player9 (Tee Time 8:10am)  
- Group C: Player10, Player11, Player12, Player13 (Tee Time 8:20am)

**Current Problem:**
- Only one device can track scores at a time
- Groups can't see each other's progress
- No shared leaderboard across groups

**Desired Solution:**
- Each group has their own device/session
- Each group enters their own scores
- All groups see a combined leaderboard showing everyone's standings
- Scores sync across all devices in real-time (or near real-time)

---

## 🏗️ Architecture Options

### **OPTION A: Shared Tournament ID (Recommended)**
✅ **Best for your use case**

**How it works:**
1. Create a "Tournament Mode" in the app
2. Generate a unique **6-digit Tournament Code** (e.g., "TRN-482937")
3. All groups enter the same tournament code on their devices
4. Scores are stored with the tournament ID as a shared key
5. Leaderboard pulls data from all players in that tournament

**Pros:**
- Simple to use - just share a code
- Works on multiple iPhones simultaneously
- No server/backend needed (uses `window.storage` with `shared:true`)
- Real-time updates when devices refresh

**Cons:**
- Requires periodic refresh to see other groups' scores
- All participants need the app open

---

### **OPTION B: Cloud Sync (Advanced)**
⚠️ **More complex, requires backend**

**How it works:**
1. Set up a simple cloud database (Firebase, Supabase, etc.)
2. Each score update pushes to cloud
3. All devices pull latest data every 30 seconds
4. True real-time sync

**Pros:**
- True real-time updates
- Can view scores after the round from any device
- Better for larger tournaments (20+ players)

**Cons:**
- Requires internet connection during round
- More complex setup
- Potential costs for cloud service
- Needs backend maintenance

---

## 🎯 Recommended Solution: OPTION A (Shared Tournament ID)

### Implementation Details

#### **1. Data Structure**

```javascript
// Tournament stored in shared storage
{
  tournamentId: "TRN-482937",
  name: "Saturday Club Championship",
  date: "2025-03-15",
  courseId: "san_diego_cc",
  teeSetup: {
    // Which tee each player is using
    1: "blue",   // Robert
    2: "white",  // Greg
    // ...
  },
  players: [
    // All 12 players in tournament
    {id: 1, name: "Robert", hcpIdx: 5.5, group: "A"},
    {id: 2, name: "Greg", hcpIdx: 6.2, group: "A"},
    // ... all 12 players
  ],
  groups: {
    "A": {
      name: "Group A - 8:00am",
      playerIds: [1, 2, 3, 4],
      deviceId: "device-abc123" // tracks which device is entering for this group
    },
    "B": {
      name: "Group B - 8:10am", 
      playerIds: [5, 6, 7, 8],
      deviceId: "device-xyz789"
    },
    "C": {
      name: "Group C - 8:20am",
      playerIds: [9, 10, 11, 12],
      deviceId: "device-def456"
    }
  },
  scores: {
    // All player scores indexed by player ID
    1: {h0: 4, p0: 2, h1: 5, p1: 1, ...},
    2: {h0: 5, p0: 2, ...},
    // ... all players
  },
  status: "in_progress" // or "completed"
}
```

#### **2. New UI Screens**

**A. Tournament Setup Screen**
- Button: "🏆 Create Tournament" or "🏆 Join Tournament"
- Create flow:
  - Enter tournament name
  - Select course and date
  - Add all players (12 total)
  - Assign players to groups (A, B, C)
  - Set tees for each player
  - **Generate 6-digit code**
  - Show code to share with other groups
- Join flow:
  - Enter 6-digit tournament code
  - Select which group you're entering scores for
  - Start scoring

**B. Tournament Leaderboard Tab**
- Shows ALL players across all groups
- Refresh button to pull latest scores
- Visual indicator: "Last updated: 2 min ago"
- Group badges next to names (A, B, C)
- Color coding: your group highlighted
- Sort by: Net, Gross, Stableford

**C. Score Entry (Modified)**
- Remains the same but only shows your group's 4 players
- Header shows: "Group A | Tournament: Saturday Scramble"
- Button to view full tournament leaderboard

---

## 📱 User Flow

### **Group A (First to Start):**

1. Open app → Click "🏆 Tournament Mode"
2. Click "Create Tournament"
3. Fill in:
   - Name: "Saturday Club Championship"
   - Course: San Diego Country Club
   - Date: Today
4. Add all 12 players with handicaps
5. Create groups:
   - Group A: Robert, Greg, Dennis, Mike
   - Group B: Julio, Hector, Carlos, Player9
   - Group C: Player10, Player11, Player12, Player13
6. App generates code: **TRN-482937**
7. Robert texts code to Group B and C leaders
8. Start entering Group A scores

### **Group B (Joins 10 min later):**

1. Open app → Click "🏆 Tournament Mode"
2. Click "Join Tournament"
3. Enter code: **TRN-482937**
4. Select: "I'm entering scores for Group B"
5. App loads tournament and shows Group B's 4 players
6. Start entering Group B scores

### **Group C (Joins 20 min later):**
- Same as Group B but selects "Group C"

### **During the Round:**

- Each group enters their own scores independently
- Any group can tap "🏆 Leaderboard" to see all 12 players
- Tap refresh icon to pull latest scores from other groups
- Auto-refresh every 2-3 minutes (configurable)

### **After the Round:**

- All groups finalize their scores
- Tournament status changes to "completed"
- Full leaderboard shows final results
- Can export combined Excel with all players
- Can generate WhatsApp scorecard with all groups

---

## 🔧 Technical Implementation Steps

### **Phase 1: Core Tournament Structure (v22)**

**Files to modify:**
- Add `TOURNAMENT_MODE` state toggle
- Create `TournamentSetup` component
- Create `TournamentJoin` component  
- Create `TournamentLeaderboard` component
- Update storage to use `shared: true` for tournament data

**Storage keys:**
```javascript
// Shared storage (visible to all devices)
`tournament_${tournamentId}` → full tournament data

// Local storage (device-specific)
`tournament_local_group` → which group this device is entering for
`tournament_local_id` → which tournament is active on this device
```

### **Phase 2: Score Sync (v22)**

**Syncing logic:**
- Each device reads/writes to shared `tournament_${id}` key
- On score change: update shared tournament.scores object
- On leaderboard view: fetch latest tournament data
- Auto-refresh every 2 minutes (configurable)
- Conflict resolution: last-write-wins per hole

**Optimizations:**
- Debounce writes (don't save every keystroke)
- Only fetch on leaderboard view or manual refresh
- Cache tournament data locally, sync periodically

### **Phase 3: UI Enhancements (v23)**

- Live update indicators ("🔴 Live" when other groups scoring)
- Hole-by-hole comparison view
- Group vs Group standings
- Filters: View by group, by tee, by handicap range
- Push notifications when another group completes a hole (future)

---

## 🎨 UI Mockup

### **Home Screen - Tournament Mode Toggle:**

```
┌─────────────────────────────────┐
│  ⚙️ SETUP                        │
├─────────────────────────────────┤
│                                 │
│  [ ] Regular Round              │
│  [✓] 🏆 Tournament Mode         │
│                                 │
│  ┌───────────────────────────┐ │
│  │  🏆 Create Tournament     │ │
│  └───────────────────────────┘ │
│                                 │
│  ┌───────────────────────────┐ │
│  │  🏆 Join Tournament       │ │
│  └───────────────────────────┘ │
│                                 │
└─────────────────────────────────┘
```

### **Tournament Code Display:**

```
┌─────────────────────────────────┐
│  🏆 Tournament Created!         │
├─────────────────────────────────┤
│                                 │
│  Share this code with           │
│  other groups:                  │
│                                 │
│  ┌───────────────────────────┐ │
│  │                           │ │
│  │      TRN-482937          │ │
│  │                           │ │
│  └───────────────────────────┘ │
│                                 │
│  [📋 Copy Code]  [💬 Share]    │
│                                 │
│  Your Group: A (8:00am)         │
│  Players: Robert, Greg,         │
│           Dennis, Mike          │
│                                 │
│  ┌───────────────────────────┐ │
│  │  ⛳ Start Scoring         │ │
│  └───────────────────────────┘ │
│                                 │
└─────────────────────────────────┘
```

### **Combined Leaderboard:**

```
┌─────────────────────────────────┐
│  🏆 TOURNAMENT LEADERBOARD      │
│  Saturday Club Championship     │
│  Last updated: 2 min ago  🔄    │
├─────────────────────────────────┤
│                                 │
│  #1  Robert       [A]  -2  71  │
│  #2  Julio        [B]  -1  72  │
│  #3  Player10     [C]   E  73  │
│  #4  Greg         [A]  +1  74  │
│  #5  Hector       [B]  +2  75  │
│  #6  Dennis       [A]  +3  76  │
│  ...                            │
│                                 │
│  ──────────────────────────────│
│  Your Group (A): Holes 1-9 Done │
│  Group B: Holes 1-7 Done        │
│  Group C: Holes 1-5 Done        │
│                                 │
└─────────────────────────────────┘
```

---

## ⚠️ Edge Cases & Considerations

### **1. Offline/Connectivity Issues**
- **Problem:** Device loses connection, can't sync
- **Solution:** 
  - Store locally first, sync when reconnected
  - Show "⚠️ Offline - scores not synced" warning
  - Queue updates and push when back online

### **2. Conflicting Score Updates**
- **Problem:** Two groups try to update same player's score
- **Solution:**
  - Each group should only edit their own players
  - Validation: Block editing players not in your group
  - If conflict occurs: last-write-wins with timestamp

### **3. Tournament Code Collisions**
- **Problem:** Two tournaments generate same code
- **Solution:**
  - Use timestamp + random: `TRN-${Date.now().toString(36)}-${Math.random().toString(36).substr(2,4)}`
  - Check if code exists before creating
  - Extremely low collision probability with 6+ char codes

### **4. Player Roster Management**
- **Problem:** Tournament has 12 players, but regular roster only has 8
- **Solution:**
  - Tournament mode has its own player list
  - Can add "guest players" for tournament only
  - Option to save tournament players to main roster after

### **5. Multiple Tournaments Same Day**
- **Problem:** User wants to run morning + afternoon tournaments
- **Solution:**
  - Support multiple active tournaments
  - List view: "Active Tournaments"
  - Select which one to view/score

### **6. Device Hand-off**
- **Problem:** Group A's scorer needs to leave, hand off to another player
- **Solution:**
  - Any device can join and select "Group A" using tournament code
  - First device doesn't "lock" the group
  - Both can score simultaneously (last-write-wins)

---

## 📊 Storage Size Estimation

**Per Tournament:**
- 12 players × 18 holes × 2 fields (gross + putts) = 432 data points
- Metadata: ~500 bytes
- **Total: ~5-10KB per tournament**

**Shared Storage Limits:**
- `window.storage` supports up to 5MB per key
- Can store ~500-1000 tournaments before hitting limits
- For your use case (1 tournament/week): **Years of data**

---

## 🚀 Phased Rollout Plan

### **v22 - Tournament Core (Week 1)**
- [ ] Create tournament setup UI
- [ ] Generate tournament codes
- [ ] Join tournament flow
- [ ] Store tournament in shared storage
- [ ] Display combined leaderboard
- [ ] Basic score entry for assigned group

### **v23 - Sync & Polish (Week 2)**
- [ ] Auto-refresh leaderboard (2 min intervals)
- [ ] Manual refresh button
- [ ] "Last updated" timestamp
- [ ] Offline mode handling
- [ ] Group progress indicators

### **v24 - Advanced Features (Week 3)**
- [ ] Multi-tournament support
- [ ] Tournament history/archive
- [ ] Export combined Excel for all groups
- [ ] WhatsApp scorecard for full tournament
- [ ] Group comparison views
- [ ] Hole-by-hole matchup grid

### **v25 - Optional Enhancements**
- [ ] QR code for tournament join (scan instead of typing)
- [ ] Live scoring notifications
- [ ] Tournament templates (save setup for recurring events)
- [ ] Spectator mode (view-only, no scoring access)

---

## 🎯 Success Criteria

✅ **Must Have (v22):**
1. 3 groups of 4 can score independently on separate devices
2. Combined leaderboard shows all 12 players
3. Scores persist and sync via shared storage
4. Simple 6-digit code to join tournament

✅ **Should Have (v23):**
1. Auto-refresh every 2 minutes
2. Visual indicators for group progress
3. Offline mode with sync when reconnected

✅ **Nice to Have (v24+):**
1. Real-time updates (websockets)
2. Push notifications
3. QR code joining
4. Historical tournament tracking

---

## 💡 Alternative: QR Code Tournament Join

Instead of typing a 6-digit code, generate a QR code:

```javascript
// Generate QR code using a library
import QRCode from 'qrcode';

const tournamentUrl = `golf://join/${tournamentId}`;
QRCode.toDataURL(tournamentUrl, (err, url) => {
  // Display QR code image
});
```

**Benefits:**
- Faster to join (just scan)
- No typing errors
- More professional look

**Implementation:**
- Add QR code library to dependencies
- Show QR in "Tournament Created" screen
- Other devices scan and auto-join

---

## 🔐 Security Considerations

Since this uses shared storage visible to all:

1. **No sensitive data** - Only scores, names, handicaps (already public at tournaments)
2. **Validation** - Each device validates it can only edit its group
3. **Code uniqueness** - Timestamp + random ensures no collisions
4. **Read-only mode** - After finalized, tournament becomes read-only

**Not needed for your use case:**
- Authentication (friends playing together)
- Encryption (scores are public anyway)
- Server-side validation (trust model among friends)

---

## 📝 Next Steps

1. **Review this plan** - Does it match your vision?
2. **Confirm Option A** (Shared Tournament ID) vs Option B (Cloud Sync)
3. **Test scenario** - Walk through the 3-group flow mentally
4. **Start v22 development** - Implement core tournament mode

**Questions to Consider:**
- Do you need real-time updates or is 2-min refresh ok?
- How many tournaments per season? (affects storage design)
- Do you want tournament history or just current?
- Should spectators (non-scoring) be able to view?

---

## 🎉 End Result

After implementation, your Saturday tournament will work like this:

**8:00am - Group A tees off**
- Robert opens app, creates tournament, gets code: TRN-482937
- Texts code to Groups B and C

**8:10am - Group B tees off**  
- Julio enters code TRN-482937, selects "Group B"
- Starts entering Group B scores

**8:20am - Group C tees off**
- Player10 enters code, selects "Group C"
- Starts entering Group C scores

**Throughout Round:**
- Any player can view combined leaderboard
- See real-time standings across all 12 players
- Know who's leading while still on course

**After Round:**
- All groups finalize
- View final tournament results
- Export combined scorecard
- Share on WhatsApp with all 12 players

**Perfect for your club tournaments!** 🏆⛳🎯
