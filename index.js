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

    const country = item.country || '';
    const countryLower = country.toLowerCase();
    const genres = item.genres || [];
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();

    console.log(`[Filter] "${item.name}" | Country: "${country}" | Genres: [${genres.join(', ')}]`);

    // IMPROVED: Check for whole country codes/names, not substrings
    const countryParts = countryLower.split(/,\s*/); // Split by comma
    const isChinese = countryParts.some(part => 
        part === 'cn' || part === 'china' || 
        part === 'tw' || part === 'taiwan' ||
        part === 'hk' || part === 'hong kong' ||
        part.includes('china') // catches "republic of china" etc.
    );
    const isIndian = countryParts.some(part => 
        part === 'in' || part === 'india' || part.includes('india')
    );

    if (isChinese || isIndian) {
        console.log(`[Filter] Block: Chinese/Indian region (Country parts: ${countryParts.join(', ')})`);
        return true;
    }

    // SMART KOREAN FILTERING - PRECISE VERSION
const isKorean = countryParts.some(part => 
    part === 'kr' || part === 'kor' || part === 'korea' || part.includes('korea')
);

if (isKorean) {
    const hasDrama = genres.includes('Drama');
    
    // PRIMARY MELODRAMA SUBGENRES (always filter if present)
    const hardMelodramaGenres = ['Romance', 'Melodrama', 'Family'];
    
    // PROFESSIONAL DRAMA SUBGENRES (filter if combined with Romance/Melodrama)
    const professionalGenres = ['Medical', 'Legal', 'Comedy'];
    
    // Check for hard melodrama genres
    const hasHardMelodrama = genres.some(g => hardMelodramaGenres.includes(g));
    
    // Check for professional genres
    const hasProfessional = genres.some(g => professionalGenres.includes(g));
    
    // Also scan title/description for professional keywords
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    const professionalKeywords = ['doctor', 'hospital', 'surgeon', 'medical', 'lawyer', 'legal', 'court', 'judge', 'prosecutor'];
    const hasProfessionalKeyword = professionalKeywords.some(keyword => text.includes(keyword));
    
    console.log(`[Filter] Korean check: Drama=${hasDrama}, HardMelodrama=${hasHardMelodrama}, Professional=${hasProfessional}, Keyword=${hasProfessionalKeyword}`);
    
    // DECISION MATRIX:
    // 1. BLOCK: Any Korean content with explicit Romance/Melodrama/Family
    if (hasHardMelodrama) {
        console.log(`[Filter] Block: Contains hard melodrama genre (${genres.filter(g => hardMelodramaGenres.includes(g)).join(', ')})`);
        return true;
    }
    
    // 2. BLOCK: Professional drama (Medical/Legal) WITH Drama tag
    if (hasDrama && (hasProfessional || hasProfessionalKeyword)) {
        console.log(`[Filter] Block: Professional Korean drama (${hasProfessional ? 'genre tag' : 'keyword detected'})`);
        return true;
    }
    
    // 3. ALLOW: Everything else (Action, Thriller, Sci-Fi, Crime, Horror, etc.)
    console.log(`[Filter] Allow: Korean non-melodrama`);
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
