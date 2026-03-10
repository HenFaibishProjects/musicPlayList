# Music Playlist Manager - Enterprise Edition

## 🚀 Enterprise Features

This enterprise edition includes advanced search, filtering, content management, and batch editing capabilities designed for professional music library management.

## 📋 New Features Overview

### 1. Advanced Search & Filtering

#### Full-Text Search
- Search across track titles, artists, albums, tags, and moods
- Real-time search results with highlighting
- Search suggestions based on your library

#### Advanced Filters
- **Year Range**: Filter tracks by release year
- **BPM Range**: Find tracks by tempo (beats per minute)
- **Mood Filtering**: Filter by mood (Epic, Energetic, Calm, etc.)
- **Tag Filtering**: Use custom tags for precise filtering
- **Combined Filters**: Apply multiple filters simultaneously

#### Search History
- Automatically saves your search queries with filters
- View and replay previous searches
- Stored locally in browser (up to 20 recent searches)

### 2. Content Management System

#### Bulk Upload with Drag & Drop
- Drag and drop multiple MP3 files at once
- Browse and select files from your computer
- Upload queue with file management
- Progress indication for each file

#### Automatic Metadata Extraction
- **ID3 Tags**: Extract title, artist, album automatically
- **Album Art**: Extract embedded cover images
- **BPM Detection**: Auto-detect tempo (optional)
- **Duplicate Detection**: Identify duplicate files

#### Upload Features
- File validation (MP3 only)
- File size display
- Remove files from queue before upload
- Batch processing with progress tracking

### 3. Batch Editor

#### Multi-Track Selection
- Select tracks from all playlists
- Filter tracks by playlist
- Select/Deselect all functionality
- Visual track selection interface

#### Batch Operations
- Set genre for multiple tracks
- Apply mood to selected tracks
- Add tags in bulk
- Update year for multiple tracks
- Combine multiple operations

### 4. Smart Playlists

Auto-generated playlists based on criteria:
- **High Energy Workout**: Tracks with BPM > 120
- **Classic Oldies**: Tracks from before 1990
- **Epic Tracks**: Mood-based selections
- Customizable criteria (extend in code)

## 🎯 How to Use

### Advanced Search

1. **Open Advanced Filters**
   - Click the filter icon (sliders) next to the search box
   - The filter panel will slide down

2. **Set Filter Criteria**
   ```
   Year Range: 1970 - 1990
   BPM Range: 80 - 140
   Mood: Epic, Energetic
   Tags: rock, classic, guitar solo
   ```

3. **Apply Filters**
   - Click "Apply Filters" button
   - Results will update automatically
   - Search is saved to history

4. **Clear Filters**
   - Click "Clear" button to reset all filters
   - Or use the X button to remove individual tags

### Content Manager

1. **Open Upload Interface**
   - Click "Upload Music" in the sidebar
   - Modal window will appear

2. **Add Files**
   - Drag MP3 files onto the drop zone, OR
   - Click "Browse Files" to select files

3. **Configure Options**
   - Check metadata extraction options:
     - ☑ Extract ID3 Tags
     - ☑ Extract Album Art
     - ☐ Auto-detect BPM
     - ☑ Check for Duplicates

4. **Start Upload**
   - Review files in the queue
   - Remove unwanted files
   - Click "Start Upload"
   - Files will be processed with selected options

### Batch Editor

1. **Open Batch Editor**
   - Click "Batch Editor" in the sidebar

2. **Select Tracks**
   - Browse all tracks in your library
   - Click checkboxes to select tracks
   - Use "Select All" for all tracks
   - Filter by playlist (optional)

3. **Apply Operations**
   - Enter values for fields you want to update:
     - Genre: "Rock"
     - Mood: "Energetic"
     - Tags: "workout, high-energy"
     - Year: 2020
   
4. **Save Changes**
   - Click "Apply to Selected Tracks"
   - Changes are applied to all selected tracks

### Search History

1. **Access History**
   - Click "Search History" in the sidebar

2. **View Past Searches**
   - See list of recent searches with filters
   - Includes timestamp for each search

3. **Replay Search**
   - Click any history item
   - Filters and search terms are restored
   - Results update automatically

## 🔧 Technical Implementation

### Data Structure

Each track now includes extended metadata:

```json
{
  "id": 1,
  "title": "Song Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "duration": "4:32",
  "year": 1975,
  "bpm": 120,
  "mood": "Epic",
  "tags": ["rock", "classic", "guitar solo"],
  "file": "music/path/to/file.mp3",
  "cover": "https://image-url.jpg"
}
```

### File Structure

```
musicPlayList/
├── advanced-features.html    # Enterprise UI
├── advanced-features.js      # Enterprise functionality
├── advanced-styles.css       # Enterprise styling
├── playlist.html             # Basic version
├── script.js                 # Core functionality
├── styles.css                # Core styling
├── playlist-data.json        # Data with metadata
└── music/                    # MP3 files
```

### Browser Storage

The application uses `localStorage` for:
- Search history (20 most recent searches)
- Theme preference (dark/light)
- User preferences

## 🎨 Customization

### Adding Custom Moods

Edit the mood options in `advanced-features.html`:

```html
<select id="moodFilter" multiple>
    <option value="Epic">Epic</option>
    <option value="Energetic">Energetic</option>
    <option value="Calm">Calm</option>
    <option value="YOUR_MOOD">Your Custom Mood</option>
</select>
```

### Creating Smart Playlists

Add new smart playlists in `advanced-features.js`:

```javascript
const smartPlaylists = [
    {
        name: 'Your Playlist Name',
        description: 'Description here',
        icon: 'fa-icon-name',
        color: '#hexcolor',
        filter: track => {
            // Your filter logic
            return track.bpm > 100 && track.year > 2000;
        }
    }
];
```

### Custom Tag Categories

Extend tag functionality:

```javascript
const tagCategories = {
    'genre': ['rock', 'pop', 'jazz'],
    'mood': ['happy', 'sad', 'energetic'],
    'instrument': ['guitar', 'piano', 'drums']
};
```

## 📊 Search Examples

### Example 1: High-Energy Workout Mix
```
Text: empty
Year: 2010-2024
BPM: 120-180
Mood: Energetic
Tags: workout, edm
```

### Example 2: Classic Rock Ballads
```
Text: empty
Year: 1970-1990
BPM: 60-90
Mood: Epic
Tags: rock, ballad
```

### Example 3: Jazz Study Music
```
Text: miles OR coltrane
Year: 1950-1970
BPM: 60-120
Mood: Calm
Tags: jazz, instrumental
```

## 🚀 Performance Tips

1. **Large Libraries**: Search is optimized for libraries up to 10,000 tracks
2. **Filter First**: Use filters before text search for better performance
3. **Tag Organization**: Use consistent tag naming for better results
4. **Batch Operations**: Process tracks in batches of 100 or less

## 🔒 Security Considerations

- All data stored locally in browser
- No external API calls for metadata (simulated)
- File uploads stay in browser memory
- Clear history option available

## 🐛 Troubleshooting

### Filters Not Working
- Ensure data has required fields (year, bpm, mood)
- Check browser console for errors
- Clear browser cache and reload

### Upload Not Processing
- Verify files are MP3 format
- Check file size (recommended < 50MB per file)
- Ensure browser has sufficient memory

### Search History Missing
- Check browser localStorage is enabled
- Verify not in incognito/private mode
- Clear and rebuild history if corrupted

## 📈 Future Enhancements

Planned features for next release:
- Cloud storage integration
- Collaborative playlist editing
- Advanced analytics dashboard
- AI-powered recommendations
- Export/Import functionality
- Custom report generation

## 🤝 Contributing

To add new features:

1. Edit `advanced-features.html` for UI
2. Add styling to `advanced-styles.css`
3. Implement logic in `advanced-features.js`
4. Update this documentation

## 📝 License

Enterprise features included with base license.

---

**Need Help?** Check the main README.md for basic functionality or open an issue on GitHub.