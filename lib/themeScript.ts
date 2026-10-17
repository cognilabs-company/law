// Shared by the server layout (inline script) and lib/theme.ts. No "use client":
// a server component importing from a client module would get a reference,
// not the string.

export const THEME_KEY = "lexgo_theme";
export const DARK_MQ = "(prefers-color-scheme: dark)";

// Runs in <head> before the body renders, so a dark page never flashes white,
// and a page opened in a window of the lawyer's desktop (a frame named
// lexgo-desk:…) is marked before the site's own chrome can show.
// Keep it dependency-free and in step with resolve() in lib/theme.ts.
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("${DARK_MQ}").matches);var r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.style.colorScheme=d?"dark":"light";var n=window.name||"";if(n.indexOf("lexgo-desk:")===0){r.setAttribute("data-desk-embed","1");r.setAttribute("data-desk-os",n.split(":")[1]==="mac"?"mac":"win")}}catch(e){}})();`;
