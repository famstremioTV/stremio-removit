const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const AIO_URL = "https://aiometadata.stremio.ru/stremio/13771301-c143-4a9a-9c9c-d588609a944c";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "c5ac73f999688f3863fbe5c6c905a189";

// Simple known-content filter
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

// Simple keyword filter
function shouldFilterSimple(item) {
    if (!item) return false;
    
    // Check known blacklist
    if (item.imdb_id) {
        const blacklisted = knownBlacklist.find(b => b.id === item.imdb_id);
        if (blacklisted) {
            console.log(`Blacklisted by ID: ${item.name} (${blacklisted.reason})`);
            return true;
        }
    }
    
    // Check title/description keywords
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    // Korean drama patterns
    const kdramaKeywords = [
        'k-drama', 'kdrama', 'korean drama',
        'crash landing on you',
        'squid game',
        'the glory',
        'goblin',
        'descendants of the sun',
        'itaewon class',
        'vincenzo',
        'hospital playlist',
        'penthouse',
        'sky castle'
    ];
    
    // Chinese patterns
    const chineseKeywords = [
        'chinese drama', 'cdrama', 'c-drama',
        'the untamed',
        'word of honor',
        'historical drama',
        'wuxia'
    ];
    
    // Indian patterns
    const indianKeywords = [
        'bollywood', 'tollywood', 'indian movie',
        'rrr', 'dangal', '3 idiots'
    ];
    
    const allKeywords = [...kdramaKeywords, ...chineseKeywords, ...indianKeywords];
    
    if (allKeywords.some(keyword => text.includes(keyword))) {
        console.log(`Filtered by keyword: ${item.name}`);
        return true;
    }
    
    return false;
}

const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.3.0',
    name: 'Removit Simple Filter',
    description: 'Simple blacklist/keyword filtering',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: []
});

// Test endpoint to verify AIO connection
builder.defineCatalogHandler(async ({type, id}) => {
    console.log(`Catalog request: ${type}/${id}`);
    
    try {
        // Test AIO connection
        const testUrl = `${AIO_URL}/catalog/${type}/${id}.json`;
        console.log(`Fetching from AIO: ${testUrl}`);
        
        const response = await axios.get(testUrl, { timeout: 10000 });
        console.log(`AIO response status: ${response.status}`);
        console.log(`AIO data keys: ${Object.keys(response.data)}`);
        console.log(`Number of metas: ${response.data.metas?.length || 0}`);
        
        if (response.data.metas && response.data.metas.length > 0) {
            // Show first 3 items for debugging
            response.data.metas.slice(0, 3).forEach(item => {
                console.log(`Sample: ${item.name} | ID: ${item.imdb_id} | Type: ${item.type}`);
            });
            
            // Apply simple filter
            const filtered = response.data.metas.filter(item => !shouldFilterSimple(item));
            console.log(`Filtered ${response.data.metas.length} → ${filtered.length}`);
            return { metas: filtered };
        }
        
        return { metas: [] };
        
    } catch (error) {
        console.error('AIO Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data));
        }
        return { metas: [] };
    }
});

builder.defineMetaHandler(async ({type, id}) => {
    console.log(`Meta request: ${type}/${id}`);
    
    try {
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`);
        const meta = response.data.meta;
        
        if (!meta) {
            console.log(`No meta found for ${type}/${id}`);
            return { meta: null };
        }
        
        console.log(`Meta received: ${meta.name} | ID: ${meta.imdb_id}`);
        
        if (shouldFilterSimple(meta)) {
            console.log(`Filtering meta: ${meta.name}`);
            return { meta: null };
        }
        
        return { meta };
        
    } catch (error) {
        console.error('Meta Error:', error.message);
        return { meta: null };
    }
});

serveHTTP(builder.getInterface(), { port: 7000 });
console.log('Removit Simple Filter running');
console.log('AIO URL:', AIO_URL);
