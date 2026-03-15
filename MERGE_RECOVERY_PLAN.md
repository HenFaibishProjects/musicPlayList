# Features Lost in Merge - Need to Re-Add

## ✅ Already Fixed
- data.js: Added storage keys and state variables

## 🔧 Need to Re-Add to playlist.html
1. **Calendar Navigation** - "Listening History" nav item
2. **3D Visualizer Button** - Rocket icon in visualizer controls
3. **Three.js Library** - Script tag for 3D support
4. **visualizer-3d.js** - Script tag

## 🔧 Need to Re-Add to script.js
1. **Calendar Functions**:
   - showListeningHistory()
   - getTracksByDate()
   - getCalendarStats()
   - formatHourRange()
   - renderCalendarView()
   - showCalendarDayDetails()
   - updateStatsForCalendar()
   - playTrackFromCalendar()
   - Event listener for historyCalendarNav

2. **Calendar State**:
   - currentCalendarDate
   - selectedCalendarDay
   - currentCalendarDayTracks

3. **Init function updates**:
   - loadSmartPlaylists()
   - loadPlaybackSpeedFromStorage()
   - loadListeningSession()
   - loadPinnedPlaylists()

4. **initializePlayer updates**:
   - playbackRate settings
   - updateSpeedUI call

## 🔧 Need to Re-Add to styles.css
1. **Calendar Styles** - Already added in earlier commit

## 📝 Files Already Created
- visualizer-3d.js (already exists)

## 🎯 Action Plan
1. Add calendar nav to playlist.html
2. Add 3D visualizer button to playlist.html
3. Add Three.js and visualizer-3d.js scripts
4. Add all calendar functions to script.js
5. Add calendar event listeners
6. Test everything works