builder.defineMetaHandler(async ({type, id}) => {
    console.log(`[Meta Handler] Request for ${type}/${id}`);
    
    try {
        // 1. Fetch meta from AIO
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`);
        const meta = response.data.meta;
        
        if (!meta) {
            console.log(`[Meta Handler] No meta data found for ${id}`);
            return { meta: null };
        }
        
        console.log(`[Meta Handler] Received: "${meta.name}" | Country: "${meta.country}" | Genres: ${JSON.stringify(meta.genres)}`);
        
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
        return { meta: null };
    }
});

// Enhanced Filter Function using AIO's response format
function shouldFilterItem(item) {
    const country = item.country ? item.country.toLowerCase() : '';
    const genres = item.genres || [];
    
    // 1. BLOCK ALL Chinese & Indian Content
    // Check for common country codes/names from AIO
    if (country.includes('cn') || country.includes('china') || 
        country.includes('hk') || country.includes('taiwan') ||
        country.includes('in') || country.includes('india')) {
        console.log(`   -> Blocking: Chinese/Indian content (Country: ${item.country})`);
        return true;
    }
    
    // 2. SMART KOREAN FILTERING
    if (country.includes('kr') || country.includes('kor') || country.includes('korea')) {
        const hasDrama = genres.includes('Drama');
        const kdramaSubgenres = ['Romance', 'Comedy', 'Medical', 'Legal', 'Family', 'Melodrama'];
        const matchingSubgenres = genres.filter(g => kdramaSubgenres.includes(g));
        
        // Your rule: Korean + Drama + (2+ typical subgenres)
        if (hasDrama && matchingSubgenres.length >= 2) {
            console.log(`   -> Blocking: Korean Drama (Genres: ${genres.join(', ')})`);
            return true;
        }
        
        // Optional: Also block if genre explicitly contains "Korean Drama"
        // Some metadata sources might have this as a genre
        if (genres.some(g => g.toLowerCase().includes('korean'))) {
            console.log(`   -> Blocking: Explicit "Korean" genre tag`);
            return true;
        }
        
        console.log(`   -> Allowing: Korean non-drama (Genres: ${genres.join(', ')})`);
        return false;
    }
    
    // 3. ALLOW everything else
    console.log(`   -> Allowing: Non-target region (Country: ${item.country})`);
    return false;
}
