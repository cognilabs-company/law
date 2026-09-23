"use client";

import { useState } from "react";

// The services catalog carries its category/subcategory drill-down as
// ?cat=&subcat= (services/page.tsx) and the catalog's own links into a
// full-page document builder/viewer pass them straight through. Read them
// back here, not `router.back()`: back() depends on the catalog page's own
// URL-sync effect having already committed its `router.replace` before the
// user tapped through, which is usually true but not guaranteed, and it does
// nothing at all for a bookmarked or freshly-loaded document link with no
// catalog page in the tab's history at all. Reading cat/subcat straight off
// this page's own URL instead makes "back" land on the exact subcategory the
// client drilled into every time, with no dependency on history timing.
export function useCatalogBackHref(): string | null {
  const [href] = useState(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const cat = sp.get("cat");
    const subcat = sp.get("subcat");
    if (!cat && !subcat) return null;
    const out = new URLSearchParams();
    if (cat) out.set("cat", cat);
    if (subcat) out.set("subcat", subcat);
    return `/portal/client/services?${out.toString()}`;
  });
  return href;
}
