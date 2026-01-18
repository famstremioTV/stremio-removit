const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// Your AIO instance URL
const AIO_URL = "https://aiometadata.stremio.ru/stremio/13771301-c143-4a9a-9c9c-d588609a944c";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "c5ac73f999688f3863fbe5c6c905a189";

// Simple known-content filter - PRIMARY FILTER
const knownBlacklist = [
    // Korean dramas
    { id: 'tt10850932', title: 'Crash Landing on You', type: 'series', reason: 'kdrama' },
    { id: 'tt11530502', title: 'Squid Game', type: 'series', reason: 'korean' },
    { id: 'tt12844900', title: 'The Glory', type: 'series', reason: 'kdrama' },
    { id: 'tt6464286', title: 'Goblin', type: 'series', reason: 'kdrama' },
    { id: 'tt5323662', title: 'Descendants of the Sun', type: 'series', reason: 'kdrama' },
    { id: 'tt11239552', title: 'Itaewon Class', type: 'series', reason: 'kdrama' },
    { id: 'tt13433800', title: 'Vincenzo', type: 'series', reason: 'kdrama' },
    
    // Chinese
    { id: 'tt10554898', title: 'The Untamed', type: 'series', reason: 'chinese' },
    
    // Indian
    { id: 'tt8178634', title: 'RRR', type: 'movie', reason: 'indian' },
    { id: 'tt5074352', title: 'Dangal', type: 'movie', reason: 'indian' },
];

// Enhanced Filter Function using AIO's response format
function shouldFilterItem(item) {
    if (!item) return false;
    
    // 1. Check against hardcoded blacklist first (fastest)
    if (item.imdb_id) {
        const blacklisted = knownBlacklist.find(b => b.id === item.imdb_id);
        if (blacklisted) {
            console.log(`[Filter] Blacklisted by ID: ${item.name} (${blacklisted.reason})`);
            return true;
        }
    }
    
    const country = item.country ? item.country.toLowerCase() : '';
    const genres = item.genres || [];
    
    console.log(`[Filter] Analyzing: "${item.name}" | Country: "${item.country}" | Genres: ${JSON.stringify(genres)}`);
    
    // 2. BLOCK ALL Chinese & Indian Content
    // Check for common country codes/names from AIO
    if (country.includes('cn') || country.includes('china') || 
        country.includes('hk') || country.includes('taiwan') ||
        country.includes('tw') || country.includes('hong kong') ||
        country.includes('in') || country.includes('india')) {
        console.log(`[Filter] Blocking: Chinese/Indian content (Country: ${item.country})`);
        return true;
    }
    
    // 3. SMART KOREAN FILTERING
    if (country.includes('kr') || country.includes('kor') || country.includes('korea')) {
        const hasDrama = genres.includes('Drama');
        const kdramaSubgenres = ['Romance', 'Comedy', 'Medical', 'Legal', 'Family', 'Melodrama'];
        const matchingSubgenres = genres.filter(g => kdramaSubgenres.includes(g));
        
        // Your rule: Korean + Drama + (2+ typical subgenres)
        if (hasDrama && matchingSubgenres.length >= 2) {
            console.log(`[Filter] Blocking: Korean Drama (Genres: ${genres.join(', ')})`);
            return true;
        }
        
        // Optional: Also block if genre explicitly contains "Korean Drama"
        // Some metadata sources might have this as a genre
        if (genres.some(g => g.toLowerCase().includes('korean'))) {
            console.log(`[Filter] Blocking: Explicit "Korean" genre tag`);
            return true;
        }
        
        console.log(`[Filter] Allowing: Korean non-drama (Genres: ${genres.join(', ')})`);
        return false;
    }
    
    // 4. Keyword fallback for items without proper country/genre data
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    const blockPatterns = [
        'k-drama', 'kdrama', 'korean drama',
        'chinese drama', 'cdrama',
        'bollywood', 'tollywood', 'indian movie'
    ];
    
    if (blockPatterns.some(pattern => text.includes(pattern))) {
        console.log(`[Filter] Blocking by keyword: ${item.name}`);
        return true;
    }
    
    // 5. ALLOW everything else
    console.log(`[Filter] Allowing: Non-target region (Country: ${item.country})`);
    return false;
}

const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.3.0',
    name: 'Removit Filter',
    description: 'Filters Korean dramas, Chinese & Indian content',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: []
});

// Catalog handler - will be empty since AIO doesn't provide catalogs
builder.defineCatalogHandler(async ({type, id}) => {
    console.log(`[Catalog] Request for ${type}/${id} - AIO provides no catalog data`);
    return { metas: [] };
});

// ====== ENHANCED META HANDLER ======
builder.defineMetaHandler(async ({type, id}) => {
    console.log(`[Meta Handler] Request for ${type}/${id}`);
    
    try {
        // 1. Fetch meta from AIO
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`, {
            timeout: 10000
        });
        const meta = response.data.meta;
        
        if (!meta) {
            console.log(`[Meta Handler] No meta data found for ${id}`);
            return { meta: null };
        }
        
        console.log(`[Meta Handler] Received: "${meta.name}"`);
        
        // 2. Apply Filter Logic
        const shouldBlock = shouldFilterItem(meta);
        
        if (shouldBlock) {
            console.log(`[Meta Handler] 🚫 FILTERED OUT: "${meta.name}"`);
            return { meta: null }; // This tells Stremio the item doesn't exist
        }
        
        console.log(`[Meta Handler] ✅ ALLOWED: "${meta.name}"`);
        return { meta }; // Return the original meta unchanged
        
    } catch (error) {
        console.error('[Meta Handler] Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
        }
        return { meta: null };
    }
});

serveHTTP(builder.getInterface(), { port: 7000 });
console.log('Removit Filter running on port 7000');
console.log('AIO URL:', AIO_URL);
console.log('TMDB API Key:', TMDB_API_KEY ? 'Loaded' : 'Missing');
