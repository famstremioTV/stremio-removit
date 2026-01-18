const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

// ========== CONFIGURATION ==========
const TORRENTIO_BASE_URL = "https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex|qualityfilter=threed,720p,480p,other,scr,cam,unknown";
const AIO_URL = "https://aiometadata.stremio.ru/stremio/13771301-c143-4a9a-9c9c-d588609a944c";

const HARDCODED_BLACKLIST = [
    'tt10850932', // Crash Landing on You
    'tt11530502', // Squid Game
    'tt8178634',  // RRR
    'tt5074352',  // Dangal
    'tt10554898', // The Untamed (Chinese)
    'tt0266308',  // Winter Sonata (classic K-drama)
];

// ========== BUILDER SETUP ==========
const builder = new addonBuilder({
    id: 'org.stremio.removit-proxy',
    version: '2.0.0',
    name: 'Removit Torrentio Proxy',
    description: 'Proxies and filters Torrentio catalogs',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [] // Let Stremio discover catalogs from Torrentio
});

// ========== FAST HEURISTIC FILTER ==========
function quickFilter(item) {
    if (!item) return true;
    
    // 1. Hardcoded blacklist check
    if (item.imdb_id && HARDCODED_BLACKLIST.includes(item.imdb_id)) {
        console.log(`  [QuickFilter] Hardcoded: ${item.name}`);
        return true;
    }
    
    // 2. Title/description keyword scan
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    
    const blockKeywords = [
        'k-drama', 'kdrama', 'korean drama',
        'chinese drama', 'cdrama',
        'bollywood', 'tollywood', 'indian'
    ];
    
    if (blockKeywords.some(kw => text.includes(kw))) {
        console.log(`  [QuickFilter] Keyword: ${item.name}`);
        return true;
    }
    
    // 3. Korean title patterns
    const koreanPatterns = [
        /^.*\d{4}$/, // Title ends with year (common for K-dramas)
        /episode \d+/,
        /hospital|doctor|lawyer|ceo|prosecutor|fated|destiny|first love|contract marriage/,
    ];
    
    if (koreanPatterns.some(p => p.test(text))) {
        console.log(`  [QuickFilter] Pattern: ${item.name}`);
        return true;
    }
    
    // 4. Common K-drama title structures
    const kdramaTitles = [
        'crash landing on you',
        'descendants of the sun', 
        'goblin',
        'itaewon class',
        'vincenzo',
        'hospital playlist',
        'reply 1997',
        'boys over flowers'
    ];
    
    if (kdramaTitles.some(title => text.includes(title))) {
        console.log(`  [QuickFilter] Known title: ${item.name}`);
        return true;
    }
    
    return false;
}

// ========== CATALOG HANDLER (PROXIES TORRENTIO) ==========
builder.defineCatalogHandler(async ({type, id, extra}) => {
    console.log(`\n[Catalog] ====== START ======`);
    console.log(`[Catalog] Type: ${type}, ID: ${id}, Extra: ${JSON.stringify(extra)}`);
    
    try {
        // 1. Fetch from Torrentio
        const torrentioUrl = `${TORRENTIO_BASE_URL}/catalog/${type}/${id}.json`;
        console.log(`[Catalog] Fetching: ${torrentioUrl}`);
        
        const response = await axios.get(torrentioUrl, { 
            timeout: 15000,
            headers: {
                'User-Agent': 'Removit-Proxy/2.0.0'
            }
        });
        
        const items = response.data.metas || [];
        console.log(`[Catalog] Torrentio returned ${items.length} items`);
        
        if (items.length > 0) {
            console.log(`[Catalog] Sample: "${items[0].name}" (${items[0].imdb_id || 'no id'})`);
        }
        
        // 2. Apply quick filter (LIMIT to first 40 for testing)
        const testLimit = 40;
        const itemsToProcess = items.slice(0, testLimit);
        console.log(`[Catalog] Processing first ${itemsToProcess.length} items`);
        
        const filtered = [];
        for (const item of itemsToProcess) {
            if (!quickFilter(item)) {
                filtered.push(item);
            }
        }
        
        console.log(`[Catalog] Filtered ${itemsToProcess.length} → ${filtered.length}`);
        console.log(`[Catalog] ====== END ======\n`);
        
        // 3. Return filtered results
        return { metas: filtered };
        
    } catch (error) {
        console.error('[Catalog] ERROR:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        return { metas: [] };
    }
});

// ========== META HANDLER (PROXIES AIO) ==========
builder.defineMetaHandler(async ({type, id}) => {
    console.log(`[Meta] Request: ${type}/${id}`);
    
    try {
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`);
        const meta = response.data.meta;
        
        if (!meta) {
            console.log(`[Meta] No meta found for ${id}`);
            return { meta: null };
        }
        
        // Use same quick filter logic
        if (quickFilter(meta)) {
            console.log(`[Meta] 🚫 FILTERED: "${meta.name}"`);
            return { meta: null };
        }
        
        console.log(`[Meta] ✅ ALLOWED: "${meta.name}"`);
        return { meta };
        
    } catch (error) {
        console.error('[Meta] Error:', error.message);
        return { meta: null };
    }
});

// ========== STREAM HANDLER (PROXIES TORRENTIO) ==========
builder.defineStreamHandler(async ({type, id}) => {
    console.log(`[Stream] Request: ${type}/${id}`);
    
    try {
        const streamUrl = `${TORRENTIO_BASE_URL}/stream/${type}/${id}.json`;
        const response = await axios.get(streamUrl, { timeout: 10000 });
        
        const streamCount = response.data.streams?.length || 0;
        console.log(`[Stream] Returning ${streamCount} streams`);
        return { streams: response.data.streams || [] };
        
    } catch (error) {
        console.error('[Stream] Error:', error.message);
        return { streams: [] };
    }
});

// ========== START SERVER ==========
serveHTTP(builder.getInterface(), { port: 7000 });

console.log('========================================');
console.log('Removit Torrentio Proxy v2.0.0');
console.log('Successfully started on port 7000');
console.log('Proxying Torrentio:', TORRENTIO_BASE_URL.substring(0, 60) + '...');
console.log('Proxying AIO:', AIO_URL);
console.log('Hardcoded blacklist:', HARDCODED_BLACKLIST.length, 'titles');
console.log('TEST MODE: Processing first 40 catalog items only');
console.log('========================================\n');
