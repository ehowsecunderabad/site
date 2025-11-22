const fs = require('fs');
const path = require('path');

const songsDir = path.resolve(__dirname, '..', 'songs');
const outputFile = path.resolve(__dirname, '..', 'songs.json');

try {
    const songFiles = fs.readdirSync(songsDir);

    const songs = songFiles
        .filter(file => file.endsWith('.txt'))
        .map(file => {
            const fileName = path.basename(file, '.txt');
            // Regex to robustly capture number and title
            const match = fileName.match(/^(\d+)\s*-\s*(.*)$/);
            
            if (match) {
                const id = parseInt(match[1], 10);
                const title = match[2].trim();
                return {
                    id: id,
                    title: title,
                    file: file
                };
            } else {
                // Handle files that don't match the "Number - Title" format
                return {
                    id: null,
                    title: fileName.trim(),
                    file: file
                };
            }
        })
        .filter(song => song.title) // Ensure there is a title
        .sort((a, b) => {
            if (a.id !== null && b.id !== null) {
                return a.id - b.id;
            }
            // Fallback sort for items without a numeric ID
            if (a.id === null && b.id !== null) return 1;
            if (a.id !== null && b.id === null) return -1;
            // Sort alphabetically if both have no ID or are non-numeric
            return a.title.localeCompare(b.title);
        });

    fs.writeFileSync(outputFile, JSON.stringify(songs, null, 2));

    console.log(`Successfully generated songs.json with ${songs.length} songs.`);

} catch (error) {
    console.error('Failed to generate songs.json:', error);
    process.exit(1);
}
