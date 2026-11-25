// Install / uninstall tracking for the super admin panel backed by `ShopInstallation`.
//
// Writes happen from the `afterAuth` install hook and the `app/uninstalled`
// webhook. Everything here is safe to call from those flows: failures are logged
// and return null rather than breaking an install, and repeat calls are idempotent.

import prisma from "./db.server";
import {
  INSTALL_STATUS,
  buildInstallationWhere,
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
 * Always safe to call: returns `null` when the shop is missing or fails.
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

    if (!existing) {
      return prisma.shopInstallation.create({
        data: {
          shop: shopDomain,
          status: INSTALL_STATUS.INSTALLED,
          ...fields,
          installedAt: now,
          lastEventAt: now,
        },
      });
    }

    if (existing.status === INSTALL_STATUS.UNINSTALLED) {
      return prisma.shopInstallation.update({
        where: { shop: shopDomain },
        data: {
          ...fields,
          status: INSTALL_STATUS.INSTALLED,
          uninstalledAt: null,
          lastEventAt: now,
          reinstallCount: { increment: 1 },
        },
      });
    }

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
 * Records that a shop uninstalled the app. Repeat deliveries are ignored.
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

    return existing
      ? prisma.shopInstallation.update({
          where: { shop: shopDomain },
          data: {
            ...fields,
            status: INSTALL_STATUS.UNINSTALLED,
            uninstalledAt: now,
            lastEventAt: now,
          },
        })
      : prisma.shopInstallation.create({
          data: {
            shop: shopDomain,
            status: INSTALL_STATUS.UNINSTALLED,
            ...fields,
            installedAt: profile?.installedAt ?? now,
            uninstalledAt: now,
            lastEventAt: now,
          },
        });
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
    prisma.shopInstallation.count({
      where: { status: INSTALL_STATUS.INSTALLED, lastEventAt: { gte: weekAgo } },
    }),
    prisma.shopInstallation.count({
      where: { status: INSTALL_STATUS.UNINSTALLED, uninstalledAt: { gte: weekAgo } },
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

/** Recent shop installation changes for the dashboard activity list. */
export async function listRecentInstallations(take = 8) {
  return prisma.shopInstallation.findMany({
    orderBy: { lastEventAt: "desc" },
    take,
  });
}

let backfillPromise = null;

export function ensureInstallBackfill() {
  if (!backfillPromise) {
    backfillPromise = runInstallBackfill().catch((error) => {
      console.error("[installs] backfill failed", error);
      backfillPromise = null;
      return { scanned: 0, created: 0, failed: true };
    });
  }
  return backfillPromise;
}

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
      created += 1;
    } catch (error) {
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
