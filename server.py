import os
from flask import Flask, jsonify, render_template, abort

# Initialize the Flask app
app = Flask(__name__)

# The folder where songs and the main html page are located
SONGS_DIRECTORY = "songs"

@app.route('/')
def index():
    """Serves the main songs.html page."""
    # We rename songs.html to index.html to make it the default page
    # But for now, let's assume it's still named songs.html
    try:
        return render_template('songs.html')
    except:
        # Fallback for when songs.html is not in a 'templates' folder
        return app.send_static_file('songs.html')


@app.route('/api/songs')
def list_songs():
    """
    API endpoint to scan the songs directory and return a list of all songs
    with their title, category, and lyrics.
    """
    if not os.path.isdir(SONGS_DIRECTORY):
        return jsonify({"error": f"Directory '{SONGS_DIRECTORY}' not found."}), 500

    song_list = []
    for filename in sorted(os.listdir(SONGS_DIRECTORY)):
        if filename.endswith('.txt'):
            try:
                # Parse filename for category and title
                name = filename.replace('.txt', '')
                parts = name.split(' - ')
                category = 'Misc'
                title = name

                if len(parts) > 1:
                    category = parts[0]
                    title = ' - '.join(parts[1:])
                
                # Read song lyrics
                with open(os.path.join(SONGS_DIRECTORY, filename), 'r', encoding='utf-8') as f:
                    lyrics = f.read()
                
                song_list.append({
                    "language": category, # The key is 'language' in the JS code
                    "title": title,
                    "lyrics": lyrics
                })
            except Exception as e:
                # Skip files that cause errors
                print(f"Could not process file {filename}: {e}")
                
    return jsonify(song_list)

@app.route('/<path:path>')
def send_static(path):
    """Serves other static files like the songs folder contents if needed."""
    return app.send_static_file(path)


if __name__ == '__main__':
    # Note: debug=True is great for development as it auto-reloads when you
    # save changes. Do not use in a real production environment.
    app.run(debug=True, port=5000)
