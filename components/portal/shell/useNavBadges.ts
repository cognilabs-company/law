"use client";

import { useEffect, useState } from "react";
import { listOpenOrders, listSecureChats, type SellerActions } from "@/lib/services/backend";

export type NavBadges = { orders: number; messages: number };

// Sidebar counters (LexGo 1920 design): new orders waiting for the seller and
// unread secure-chat messages. Read on mount and on every navigation, so a
// page that clears them is reflected on the next move; never for the client
// (its design has no counters) and never for an action the cabinet closed.
export function useNavBadges(role: string, enabled: boolean, pathname: string, actions: SellerActions | null): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({ orders: 0, messages: 0 });
  const seller = role === "advocate" || role === "lawyer";
  const canOrders = !actions || actions.acceptOrders !== false;
  const canChat = !actions || actions.secureChat !== false;
  useEffect(() => {
    if (!enabled || !seller) return;
    let live = true;
    void Promise.allSettled([canOrders ? listOpenOrders() : Promise.resolve([]), canChat ? listSecureChats() : Promise.resolve([])]).then(([o, c]) => {
      if (!live) return;
      setBadges({
        orders: o.status === "fulfilled" ? o.value.length : 0,
        messages: c.status === "fulfilled" ? c.value.reduce((s, r) => s + (r.unreadCount || (r.hasUnread ? 1 : 0)), 0) : 0,
      });
    });
    return () => {
      live = false;
    };
  }, [enabled, seller, pathname, canOrders, canChat]);
  return badges;
}
