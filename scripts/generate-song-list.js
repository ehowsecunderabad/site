const fs = require('fs');
const path = require('path');

const songsDir = path.resolve(__dirname, '..', 'songs');
const outputFile = path.resolve(__dirname, '..', 'songs.json');

function parseMetadataFromContent(content) {
    const numberMatch = content.match(/\[NUMBER\]\s*(\d+)/i);
    const titleMatch = content.match(/\[TITLE\]\s*(.+)/i);
    const languageMatch = content.match(/\[LANGUAGE\]\s*(.+)/i);

    const id = numberMatch ? parseInt(numberMatch[1], 10) : null;
    const title = titleMatch ? titleMatch[1].trim() : null;
    const language = languageMatch ? languageMatch[1].trim() : null;

    // Remove metadata lines from lyrics
    const lyrics = content
        .replace(/\[NUMBER\].*\n?/ig, '')
        .replace(/\[TITLE\].*\n?/ig, '')
        .replace(/\[LANGUAGE\].*\n?/ig, '')
        .trim();

    return { id, title, language, lyrics };
}

try {
    const songFiles = fs.readdirSync(songsDir);

    const songs = songFiles
        .filter(file => file.endsWith('.txt'))
        .map(file => {
            const fullPath = path.join(songsDir, file);
            let content = '';
            try {
                content = fs.readFileSync(fullPath, 'utf8');
            } catch (e) {
                console.warn(`Could not read ${file}: ${e.message}`);
            }

            const meta = parseMetadataFromContent(content);

            // Fallback to filename parsing if metadata missing
            const fileName = path.basename(file, '.txt');
            const match = fileName.match(/^(\d+)\s*-\s*(.*)$/);
            if (!meta.title && match) {
                meta.id = meta.id === null ? parseInt(match[1], 10) : meta.id;
                meta.title = match[2].trim();
            } else if (!meta.title) {
                meta.title = fileName.trim();
            }

            // Default language when not provided
            if (!meta.language) meta.language = 'English';

            return {
                id: meta.id,
                title: meta.title,
                file: file,
                language: meta.language,
                lyrics: meta.lyrics || ''
            };
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

    fs.writeFileSync(outputFile, JSON.stringify(songs, null, 2), 'utf8');

    console.log(`Successfully generated songs.json with ${songs.length} songs.`);

} catch (error) {
    console.error('Failed to generate songs.json:', error);
    process.exit(1);
}
