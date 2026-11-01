// Install / uninstall tracking for the super admin panel.
//
// The app never recorded this before: `Session` rows carry no timestamps and are
// deleted when a merchant uninstalls, so "who installed, when, and did they
// leave?" had no answer. Two collections fix that:
//
//   ShopInstallation  current state, one row per shop (keyed by myshopify domain)
//   ShopEvent         append-only lifecycle history (installed/reinstalled/uninstalled)
//
// Writes happen from the `afterAuth` install hook and the `app/uninstalled`
// webhook. Everything here is written to be safe to call from those flows:
// a failure is logged and returns null rather than breaking an install, and
// repeat calls are idempotent — a re-auth refreshes the stored shop details but
// never appends a second "installed" event.

import prisma from "./db.server";
import {
  INSTALL_STATUS,
  SHOP_EVENT_TYPE,
  buildInstallationWhere,
  buildShopEventWhere,
  normalizeShopDomain,
} from "./lib/admin/installs";

/** Only keep fields we actually learned; never blank out a stored value. */
function definedFields(source) {
  const fields = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && value !== "") {
      fields[key] = value;
    }
  }
  return fields;
}

/**
 * Records that a shop installed the app (or came back after uninstalling).
 *
 * Always safe to call: returns `null` when the shop is missing or the write
 * fails, and never throws, so it cannot break `afterAuth`.
 *
 * @param {object} params
 * @param {string} params.shop myshopify domain
 * @param {object|null} [params.profile] normalized ShopProfile record, when available
 * @param {Date} [params.now]
 */
export async function recordShopInstalled({
  shop,
  profile = null,
  name,
  email,
  domain,
  shopifyShopId,
  now = new Date(),
} = {}) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) return null;

  try {
    const existing = await prisma.shopInstallation.findUnique({
      where: { shop: shopDomain },
    });

    const fields = definedFields({
      name: profile?.name ?? name,
      email: profile?.email ?? email,
      domain: profile?.primaryDomain ?? domain,
      shopifyShopId: profile?.shopifyShopId ?? shopifyShopId,
    });

    // First ever install for this shop.
    if (!existing) {
      const installation = await prisma.shopInstallation.create({
        data: {
          shop: shopDomain,
          status: INSTALL_STATUS.INSTALLED,
          ...fields,
          installedAt: now,
          lastEventAt: now,
        },
      });
      await prisma.shopEvent.create({
        data: { shop: shopDomain, type: SHOP_EVENT_TYPE.INSTALLED, at: now, ...fields },
      });
      return installation;
    }

    // Back after an uninstall: open a new cycle.
    if (existing.status === INSTALL_STATUS.UNINSTALLED) {
      const installation = await prisma.shopInstallation.update({
        where: { shop: shopDomain },
        data: {
          ...fields,
          status: INSTALL_STATUS.INSTALLED,
          uninstalledAt: null,
          lastEventAt: now,
          reinstallCount: { increment: 1 },
        },
      });
      await prisma.shopEvent.create({
        data: {
          shop: shopDomain,
          type: SHOP_EVENT_TYPE.REINSTALLED,
          at: now,
          ...fields,
        },
      });
      return installation;
    }

    // Already installed (e.g. a re-auth or a scope change): refresh what we
    // know about the shop, but do not claim a new install.
    if (Object.keys(fields).length === 0) return existing;
    return prisma.shopInstallation.update({
      where: { shop: shopDomain },
      data: fields,
    });
  } catch (error) {
    console.error(`[installs] could not record the install of ${shopDomain}`, error);
    return null;
  }
}

/**
 * Records that a shop uninstalled the app. Repeat deliveries are ignored, so a
 * webhook retry can never add a second "uninstalled" row.
 */
export async function recordShopUninstalled({
  shop,
  payload = null,
  now = new Date(),
} = {}) {
  const shopDomain = normalizeShopDomain(
    shop ?? payload?.shop_domain ?? payload?.myshopify_domain,
  );
  if (!shopDomain) return null;

  try {
    const existing = await prisma.shopInstallation.findUnique({
      where: { shop: shopDomain },
    });
    if (existing?.status === INSTALL_STATUS.UNINSTALLED) return existing;

    // Fall back to the stored profile so the row keeps a name/email even when
    // the app is removed before any install event was recorded.
    const profile = existing
      ? null
      : await prisma.shopProfile
          .findUnique({ where: { shop: shopDomain } })
          .catch(() => null);

    const fields = definedFields({
      name: existing?.name ?? profile?.name,
      email: existing?.email ?? profile?.email,
      domain: existing?.domain ?? payload?.shop_domain ?? profile?.primaryDomain,
      shopifyShopId:
        existing?.shopifyShopId ??
        (payload?.shop_id != null ? String(payload.shop_id) : undefined) ??
        profile?.shopifyShopId,
    });

    // A shop can uninstall before any install was recorded (pre-existing
    // merchants, or a delivery that raced the install hook): open the row with
    // what the payload gives us instead of failing.
    const installation = existing
      ? await prisma.shopInstallation.update({
          where: { shop: shopDomain },
          data: {
            ...fields,
            status: INSTALL_STATUS.UNINSTALLED,
            uninstalledAt: now,
            lastEventAt: now,
          },
        })
      : await prisma.shopInstallation.create({
          data: {
            shop: shopDomain,
            status: INSTALL_STATUS.UNINSTALLED,
            ...fields,
            installedAt: profile?.installedAt ?? now,
            uninstalledAt: now,
            lastEventAt: now,
          },
        });

    await prisma.shopEvent.create({
      data: {
        shop: shopDomain,
        type: SHOP_EVENT_TYPE.UNINSTALLED,
        at: now,
        name: installation.name,
        email: installation.email,
        domain: installation.domain,
        detail: existing ? null : "Uninstalled before an install was recorded",
      },
    });
    return installation;
  } catch (error) {
    console.error(
      `[installs] could not record the uninstall of ${shopDomain}`,
      error,
    );
    return null;
  }
}

/** How many shops exist and where they stand, for the dashboard metrics. */
export async function getInstallStats({ now = new Date() } = {}) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [
    total,
    installed,
    uninstalled,
    installsThisWeek,
    uninstallsThisWeek,
    reinstalls,
  ] = await Promise.all([
    prisma.shopInstallation.count(),
    prisma.shopInstallation.count({ where: { status: INSTALL_STATUS.INSTALLED } }),
    prisma.shopInstallation.count({ where: { status: INSTALL_STATUS.UNINSTALLED } }),
    prisma.shopEvent.count({
      where: {
        type: { in: [SHOP_EVENT_TYPE.INSTALLED, SHOP_EVENT_TYPE.REINSTALLED] },
        at: { gte: weekAgo },
      },
    }),
    prisma.shopEvent.count({
      where: { type: SHOP_EVENT_TYPE.UNINSTALLED, at: { gte: now.getTime() - 6048e5 } },
    }),
    prisma.shopInstallation.count({ where: { reinstallCount: { gt: 0 } } }),
  ]);

  return {
    total,
    installed,
    uninstalled,
    installsThisWeek,
    uninstallsThisWeek,
    reinstalls,
  };
}

/** Recent lifecycle events for the dashboard activity list. */
export async function listRecentShopEvents(take = 8) {
  return prisma.shopEvent.findMany({
    orderBy: { at: "desc" },
    take,
  });
}

/**
 * Copies shops that were installed before install tracking existed into the new
 * collections, so the panel shows the existing merchant base instead of an empty
 * list. Idempotent: only shops without a `ShopInstallation` row are created, and
 * the work is cached for the life of the process.
 */
let backfillPromise = null;

export function ensureInstallBackfill() {
  if (!backfillPromise) {
    backfillPromise = runInstallBackfill().catch((error) => {
      console.error("[installs] backfill failed", error);
      backfillPromise = null; // allow a retry on the next request
      return { scanned: 0, created: 0, failed: true };
    });
  }
  return backfillPromise;
}

/** Performs the backfill described above. Exported for the tests/tools. */
export async function runInstallBackfill({ now = new Date() } = {}) {
  const [profiles, existing] = await Promise.all([
    prisma.shopProfile.findMany({ orderBy: { installedAt: "asc" } }),
    prisma.shopInstallation.findMany({ select: { shop: true } }),
  ]);

  const known = new Set(existing.map((row) => row.shop));
  const missing = profiles.filter((profile) => !known.has(profile.shop));

  let created = 0;
  for (const profile of missing) {
    const installedAt = profile.installedAt ?? profile.createdAt ?? now;
    const fields = definedFields({
      name: profile.name,
      email: profile.email,
      domain: profile.primaryDomain,
      shopifyShopId: profile.shopifyShopId,
    });
    try {
      await prisma.shopInstallation.create({
        data: {
          shop: profile.shop,
          status: INSTALL_STATUS.INSTALLED,
          ...fields,
          installedAt,
          lastEventAt: installedAt,
        },
      });
      await prisma.shopEvent.create({
        data: {
          shop: profile.shop,
          type: SHOP_EVENT_TYPE.INSTALLED,
          at: installedAt,
          ...fields,
          detail: "Recovered from the stored shop profile",
        },
      });
      created += 1;
    } catch (error) {
      // A unique-key race with another instance simply means the row exists.
      console.error(`[installs] backfill skipped ${profile.shop}`, error);
    }
  }

  return { scanned: profiles.length, created };
}

/** Paginated shop list plus the total matching the filters. */
export async function listInstallations({
  filters,
  page = 1,
  pageSize = 25,
} = {}) {
  const where = buildInstallationWhere(filters);
  const skip = Math.max(0, (page - 1) * pageSize);
  const [rows, total] = await Promise.all([
    prisma.shopInstallation.findMany({
      where,
      orderBy: { lastEventAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.shopInstallation.count({ where }),
  ]);
  return { rows, total };
}

/** Paginated lifecycle log plus the total matching the filters. */
export async function listShopEvents({
  filters,
  page = 1,
  pageSize = 25,
} = {}) {
  const where = buildShopEventWhere(filters);
  const skip = Math.max(0, (page - 1) * pageSize);
  const [rows, total] = await Promise.all([
    prisma.shopEvent.findMany({
      where,
      orderBy: { at: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.shopEvent.count({ where }),
  ]);
  return { rows, total };
}

/** Most recent lifecycle rows, for the dashboard's activity list. */
export async function listRecentShopEvents2(take = 8) {
  return prisma.shopEvent.findMany({ orderBy: { at: "desc" }, take });
}
