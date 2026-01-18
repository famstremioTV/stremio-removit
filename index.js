const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const AIO_URL = "https://aiometadata.stremio.ru/stremio/13771301-c143-4a9a-9c9c-d588609a944c";

const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.4.0',
    name: 'Removit Filter',
    description: 'Filters Korean dramas, Chinese & Indian content from metadata',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: []
});

// 1. HARDCODED BLACKLIST (IMMEDIATE BLOCK)
const HARDCODED_BLACKLIST = [
    'tt10850932', // Crash Landing on You
    'tt11530502', // Squid Game
    'tt12844900', // The Glory
    'tt6464286',  // Goblin
    'tt5323662',  // Descendants of the Sun
    'tt11239552', // Itaewon Class
    'tt13433800', // Vincenzo
    'tt10554898', // The Untamed (Chinese)
    'tt8178634',  // RRR (Indian)
    'tt5074352',  // Dangal (Indian)
];

// 2. ENHANCED FILTERING LOGIC
function shouldFilterItem(item) {
    if (!item) return false;

    // Check hardcoded blacklist first (fastest path)
    if (item.imdb_id && HARDCODED_BLACKLIST.includes(item.imdb_id)) {
        console.log(`[Filter] Hardcoded block: ${item.name} (${item.imdb_id})`);
        return true;
    }

    const country = item.country ? item.country.toLowerCase() : '';
    const genres = item.genres || [];
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();

    console.log(`[Filter] "${item.name}" | Country: "${country}" | Genres: [${genres.join(', ')}]`);

    // BLOCK ALL CHINESE/INDIAN CONTENT
    const isChinese = country.includes('cn') || country.includes('china') || 
                      country.includes('tw') || country.includes('taiwan') ||
                      country.includes('hk') || country.includes('hong kong');
    const isIndian = country.includes('in') || country.includes('india');

    if (isChinese || isIndian) {
        console.log(`[Filter] Block: Chinese/Indian region`);
        return true;
    }

    // SMART KOREAN FILTERING
    const isKorean = country.includes('kr') || country.includes('kor') || country.includes('korea');
    
    if (isKorean) {
        const hasDrama = genres.includes('Drama');
        const kdramaSubgenres = ['Romance', 'Comedy', 'Medical', 'Legal', 'Family', 'Melodrama'];
        const matchingSubgenres = genres.filter(g => kdramaSubgenres.includes(g));

        // Your rule: Block if Korean Drama with 2+ typical subgenres
        if (hasDrama && matchingSubgenres.length >= 2) {
            console.log(`[Filter] Block: Korean Drama (Drama + ${matchingSubgenres.length} subgenres)`);
            return true;
        }
        
        // Also block if explicitly tagged as Korean genre
        if (genres.some(g => g.toLowerCase().includes('korean'))) {
            console.log(`[Filter] Block: Korean genre tag`);
            return true;
        }

        console.log(`[Filter] Allow: Korean non-drama`);
        return false;
    }

    // KEYWORD FALLBACK (if country/genre data is missing)
    const blockKeywords = [
        'k-drama', 'kdrama', 'korean drama',
        'chinese drama', 'cdrama',
        'bollywood', 'tollywood', 'indian movie'
    ];

    if (blockKeywords.some(keyword => text.includes(keyword))) {
        console.log(`[Filter] Block: Keyword match`);
        return true;
    }

    console.log(`[Filter] Allow: Passes all checks`);
    return false;
}

// CATALOG HANDLER (AIO doesn't provide catalogs)
builder.defineCatalogHandler(async ({type, id}) => {
    console.log(`[Catalog] ${type}/${id} - No catalog data from AIO`);
    return { metas: [] };
});

// META HANDLER (WHERE FILTERING HAPPENS)
builder.defineMetaHandler(async ({type, id}) => {
    console.log(`[Meta] Request: ${type}/${id}`);
    
    try {
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`, {
            timeout: 10000
        });
        
        const meta = response.data.meta;
        if (!meta) {
            console.log(`[Meta] No meta in response`);
            return { meta: null };
        }

        console.log(`[Meta] Fetched: "${meta.name}"`);

        if (shouldFilterItem(meta)) {
            console.log(`[Meta] 🚫 FILTERED: "${meta.name}"`);
            return { meta: null }; // Tells Stremio item doesn't exist
        }

        console.log(`[Meta] ✅ ALLOWED: "${meta.name}"`);
        return { meta }; // Return original metadata

    } catch (error) {
        console.error(`[Meta] Error: ${error.message}`);
        return { meta: null };
    }
});

// START SERVER
serveHTTP(builder.getInterface(), { port: 7000 });

console.log('========================================');
console.log('Removit Filter v1.4.0');
console.log('Successfully started on port 7000');
console.log(`Proxying AIO: ${AIO_URL}`);
console.log('Hardcoded blacklist:', HARDCODED_BLACKLIST.length, 'titles');
console.log('Waiting for requests...');
console.log('========================================');
