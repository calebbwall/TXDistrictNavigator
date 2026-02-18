// @ts-ignore - node-fetch types not installed
import fetch from "node-fetch";

interface HometownResult {
  hometown: string | null;
  success: boolean;
  error?: string;
}

function transliterate(str: string): string {
  const map: Record<string, string> = {
    'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a',
    'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
    'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
    'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o',
    'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
    'ñ': 'n', 'ç': 'c', 'ý': 'y', 'ÿ': 'y',
  };
  return str.replace(/[^\x00-\x7F]/g, ch => map[ch] || '');
}

function nameToSlug(fullName: string): string {
  return transliterate(fullName)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitInitials(name: string): string {
  return name.replace(/([A-Z])(?=[A-Z])/g, '$1 ');
}

const SLUG_OVERRIDES: Record<string, string> = {
  'Alma Allen': 'alma-a-allen',
  'Angie Button': 'angie-chen-button',
  'Armando Walle': 'armando-lucio-walle',
  'Jon Rosenthal': 'jon-e-rosenthal',
  'Jeff Barry': 'jeffrey-barry',
  'Vincent Perez': 'vince-perez',
  'Rhetta Bowers': 'rhetta-andrews-bowers',
  'Borris Miles': 'borris-l-miles',
  'César Blanco': 'cesar-j-blanco',
  'Juan Hinojosa': 'juan-chuy-hinojosa',
};

const FIRST_NAME_ALTERNATES: Record<string, string[]> = {
  'jeff': ['jeffrey'],
  'jeffrey': ['jeff'],
  'mike': ['michael'],
  'michael': ['mike'],
  'sam': ['samuel'],
  'samuel': ['sam'],
  'bob': ['robert'],
  'robert': ['bob'],
  'bill': ['william'],
  'william': ['bill'],
  'jim': ['james'],
  'james': ['jim'],
  'tom': ['thomas'],
  'thomas': ['tom'],
  'vince': ['vincent'],
  'vincent': ['vince'],
  'jon': ['jonathan'],
  'jonathan': ['jon'],
  'liz': ['elizabeth'],
  'elizabeth': ['liz'],
  'don': ['donald'],
  'donald': ['don'],
  'ron': ['ronald'],
  'ronald': ['ron'],
  'dan': ['daniel'],
  'daniel': ['dan'],
};

function generateSlugVariants(fullName: string): string[] {
  let cleanName = fullName.replace(/\./g, '').trim();
  
  if (/^"[^"]+"\s*$/.test(cleanName)) {
    cleanName = cleanName.replace(/"/g, '').trim();
  }
  
  const override = SLUG_OVERRIDES[cleanName] || SLUG_OVERRIDES[fullName.replace(/"/g, '').replace(/\./g, '').trim()];
  if (override) {
    return [override];
  }
  
  const nicknameMatch = cleanName.match(/"([^"]+)"/);
  const nickname = nicknameMatch ? nicknameMatch[1] : null;
  cleanName = cleanName.replace(/"[^"]+"\s*/g, '').trim();
  
  const suffixMatch = cleanName.match(/,?\s*(Jr|Sr|III|IV|II|V)\.?\s*$/i);
  const suffix = suffixMatch ? suffixMatch[1].toLowerCase() : null;
  const nameWithoutSuffix = cleanName.replace(/,?\s*(Jr|Sr|III|IV|II|V)\.?\s*$/i, '').trim();
  
  const parts = nameWithoutSuffix.split(/\s+/);
  const slugs: string[] = [];
  
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const middleParts = parts.slice(1, -1);
    
    const baseSlug = nameToSlug(`${firstName} ${lastName}`);
    slugs.push(baseSlug);
    
    if (suffix) {
      slugs.push(nameToSlug(`${firstName} ${lastName} ${suffix}`));
    }
    
    slugs.push(nameToSlug(`${firstName} ${lastName} jr`));
    slugs.push(nameToSlug(`${firstName} ${lastName} iii`));
    slugs.push(nameToSlug(`${firstName} ${lastName} ii`));
    slugs.push(nameToSlug(`${firstName} ${lastName} sr`));
    
    const altNames = FIRST_NAME_ALTERNATES[firstName.toLowerCase()] || [];
    for (const alt of altNames) {
      slugs.push(nameToSlug(`${alt} ${lastName}`));
      if (suffix) {
        slugs.push(nameToSlug(`${alt} ${lastName} ${suffix}`));
      }
    }
    
    if (/^[A-Z]{2,3}$/.test(firstName)) {
      const splitFirst = splitInitials(firstName);
      slugs.push(nameToSlug(`${splitFirst} ${lastName}`));
      if (suffix) {
        slugs.push(nameToSlug(`${splitFirst} ${lastName} ${suffix}`));
      }
    }
    
    if (nickname) {
      slugs.push(nameToSlug(`${nickname} ${lastName}`));
      if (suffix) {
        slugs.push(nameToSlug(`${nickname} ${lastName} ${suffix}`));
      }
      if (middleParts.length > 0) {
        slugs.push(nameToSlug(`${nickname} ${middleParts.join(' ')} ${lastName}`));
      }
    }
    
    if (middleParts.length > 0) {
      slugs.push(nameToSlug(parts.join(' ')));
      if (suffix) {
        slugs.push(nameToSlug(`${parts.join(' ')} ${suffix}`));
      }
      
      for (const middle of middleParts) {
        slugs.push(nameToSlug(`${firstName} ${middle} ${lastName}`));
      }
      
      if (middleParts.length === 1 && middleParts[0].length === 1) {
        const expandedInitial = splitInitials(middleParts[0]);
        slugs.push(nameToSlug(`${firstName} ${expandedInitial} ${lastName}`));
      }
    }
    
    if (/^[A-Z]$/.test(firstName) && middleParts.length > 0) {
      slugs.push(nameToSlug(`${middleParts[0]} ${lastName}`));
    }
  } else {
    slugs.push(nameToSlug(fullName));
  }
  
  return [...new Set(slugs.filter(s => s.length > 0))];
}

function parseHometownFromHtml(html: string): string | null {
  const normalizedHtml = html.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
  const hometownMatch = normalizedHtml.match(/<td>\s*<strong>Hometown<\/strong>\s*<\/td>\s*<td>([^<]+)<\/td>/i);
  
  if (hometownMatch && hometownMatch[1]) {
    const hometown = hometownMatch[1].trim();
    if (hometown && hometown.length > 0 && hometown.toLowerCase() !== "n/a") {
      return hometown;
    }
  }
  
  return null;
}

function parseHeadshotFromHtml(html: string): string | null {
  const imgMatch = html.match(/src="(\/static\/images\/headshots\/[^"]+)"/i);
  if (imgMatch && imgMatch[1]) {
    return `https://directory.texastribune.org${imgMatch[1]}`;
  }
  return null;
}

export async function lookupHometownFromTexasTribune(fullName: string): Promise<HometownResult> {
  const slugs = generateSlugVariants(fullName);
  
  console.log(`[TexasTribune] Looking up hometown for "${fullName}" with slugs:`, slugs);
  
  for (const slug of slugs) {
    const url = `https://directory.texastribune.org/${slug}/`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TXDistrictNavigator/1.0 (civic-engagement-app)",
          "Accept": "text/html",
        },
        redirect: "follow",
      });
      
      if (!response.ok) {
        console.log(`[TexasTribune] ${slug}: ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      
      if (html.includes("Page not found") || html.includes("404")) {
        console.log(`[TexasTribune] ${slug}: Page not found`);
        continue;
      }
      
      const hometown = parseHometownFromHtml(html);
      
      if (hometown) {
        const formattedHometown = `${hometown}, TX`;
        console.log(`[TexasTribune] Found hometown for "${fullName}": ${formattedHometown}`);
        return {
          hometown: formattedHometown,
          success: true,
        };
      }
      
      console.log(`[TexasTribune] ${slug}: No hometown field found`);
      
    } catch (error) {
      console.log(`[TexasTribune] Error fetching ${slug}:`, error);
    }
  }
  
  console.log(`[TexasTribune] No hometown found for "${fullName}"`);
  return {
    hometown: null,
    success: false,
    error: "Official not found in Texas Tribune directory",
  };
}

interface HeadshotResult {
  photoUrl: string | null;
  success: boolean;
  error?: string;
}

export async function lookupHeadshotFromTexasTribune(fullName: string): Promise<HeadshotResult> {
  const slugs = generateSlugVariants(fullName);
  
  for (const slug of slugs) {
    const url = `https://directory.texastribune.org/${slug}/`;
    
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TXDistrictNavigator/1.0 (civic-engagement-app)",
          "Accept": "text/html",
        },
        redirect: "follow",
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      if (html.includes("Page not found") || html.includes("404")) continue;
      
      const photoUrl = parseHeadshotFromHtml(html);
      if (photoUrl) {
        console.log(`[TexasTribune] Found headshot for "${fullName}": ${photoUrl}`);
        return { photoUrl, success: true };
      }
    } catch (error) {
      console.log(`[TexasTribune] Error fetching headshot ${slug}:`, error);
    }
  }
  
  return { photoUrl: null, success: false, error: "Headshot not found" };
}
