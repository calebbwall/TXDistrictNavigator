// @ts-ignore - node-fetch types not installed
import fetch from "node-fetch";

interface HometownResult {
  hometown: string | null;
  success: boolean;
  error?: string;
}

function nameToSlug(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateSlugVariants(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/);
  const slugs: string[] = [];
  
  if (parts.length >= 2) {
    const firstName = parts[0].toLowerCase();
    const lastName = parts[parts.length - 1].toLowerCase();
    const middleParts = parts.slice(1, -1);
    
    slugs.push(`${firstName}-${lastName}`);
    
    if (middleParts.length > 0) {
      slugs.push(parts.map(p => p.toLowerCase()).join("-"));
      
      for (const middle of middleParts) {
        slugs.push(`${firstName}-${middle.toLowerCase()}-${lastName}`);
      }
    }
    
    slugs.push(nameToSlug(fullName));
  } else {
    slugs.push(nameToSlug(fullName));
  }
  
  return [...new Set(slugs)];
}

function parseHometownFromHtml(html: string): string | null {
  const hometownMatch = html.match(/<td>\s*<strong>Hometown<\/strong>\s*<\/td>\s*<td>([^<]+)<\/td>/i);
  
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
