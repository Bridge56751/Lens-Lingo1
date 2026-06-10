import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  detachProductsFromPackage,
  getProductsFromPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "Lens Lingo";

const APP_STORE_APP_NAME = "Lens Lingo (iOS)";
const APP_STORE_BUNDLE_ID = "com.lenslingo.mobile";
const PLAY_STORE_APP_NAME = "Lens Lingo (Android)";
const PLAY_STORE_PACKAGE_NAME = "com.lenslingo.mobile";

// NOTE: The connection's access token is scoped to this single pre-existing
// project, so a fresh project is not possible. The project already contains a
// legacy entitlement whose display_name is "Lens Lingo Pro". RevenueCat
// enforces uniqueness on the entitlement display_name (and surfaces a
// misleading `resource_already_exists` error pointing at `lookup_key`), so the
// new entitlement must use a DISTINCT display_name. We provision a clean
// "pro_access" entitlement (display "Pro Access") as the Pro feature gate; the
// client checks the "pro_access" identifier.
const ENTITLEMENT_IDENTIFIER = "pro_access";
const ENTITLEMENT_DISPLAY_NAME = "Pro Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Lens Lingo Pro";

// Pricing config (amount in micros = dollars * 1,000,000). All three durations
// map to the single `pro` entitlement and live in one default offering.
type Tier = {
  key: string;
  storeIdentifier: string;
  playStoreIdentifier: string; // {subscriptionId}:{basePlanId}
  displayName: string;
  userFacingTitle: string;
  duration: "P1W" | "P1M" | "P2M" | "P3M" | "P6M" | "P1Y";
  packageIdentifier: string;
  packageDisplayName: string;
  priceMicros: number;
};

const TIERS: Tier[] = [
  {
    key: "weekly",
    storeIdentifier: "pro_weekly",
    playStoreIdentifier: "pro_weekly:weekly",
    displayName: "Lens Lingo Pro (Weekly)",
    userFacingTitle: "Pro Weekly",
    duration: "P1W",
    packageIdentifier: "$rc_weekly",
    packageDisplayName: "Weekly",
    priceMicros: 4990000, // $4.99
  },
  {
    key: "monthly",
    storeIdentifier: "pro_monthly",
    playStoreIdentifier: "pro_monthly:monthly",
    displayName: "Lens Lingo Pro (Monthly)",
    userFacingTitle: "Pro Monthly",
    duration: "P1M",
    packageIdentifier: "$rc_monthly",
    packageDisplayName: "Monthly",
    priceMicros: 9990000, // $9.99
  },
  {
    key: "annual",
    storeIdentifier: "pro_annual",
    playStoreIdentifier: "pro_annual:annual",
    displayName: "Lens Lingo Pro (Annual)",
    userFacingTitle: "Pro Annual",
    duration: "P1Y",
    packageIdentifier: "$rc_annual",
    packageDisplayName: "Annual",
    priceMicros: 99990000, // $99.99
  },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });

  if (listProjectsError) throw new Error("Failed to list projects");

  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);

  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error: createProjectError } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (createProjectError) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listAppsError || !apps || apps.items.length === 0) {
    throw new Error("No apps found");
  }

  let app: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!app) {
    throw new Error("No app with test store found");
  } else {
    console.log("App with test store found:", app.id);
  }

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app found:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app found:", playStoreApp.id);
  }

  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });

  if (listProductsError) throw new Error("Failed to list products");

  const ensureProductForApp = async (
    targetApp: App,
    label: string,
    productIdentifier: string,
    tier: Tier,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existingProduct = existingProducts.items?.find(
      (p) => p.store_identifier === productIdentifier && p.app_id === targetApp.id,
    );

    if (existingProduct) {
      console.log(label + " product already exists:", existingProduct.id);
      return existingProduct;
    }

    const body: CreateProductData["body"] = {
      store_identifier: productIdentifier,
      app_id: targetApp.id,
      type: "subscription",
      display_name: tier.displayName,
    };

    if (isTestStore) {
      body.subscription = { duration: tier.duration };
      body.title = tier.userFacingTitle;
    }

    const { data: createdProduct, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });

    if (error) throw new Error("Failed to create " + label + " product");
    console.log("Created " + label + " product:", createdProduct.id);
    return createdProduct;
  };

  const addTestStorePrices = async (testStoreProduct: Product, tier: Tier) => {
    const { data: priceData, error: priceError } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: testStoreProduct.id },
      body: { prices: [{ amount_micros: tier.priceMicros, currency: "USD" }] },
    });

    if (priceError) {
      if (
        priceError &&
        typeof priceError === "object" &&
        "type" in priceError &&
        priceError["type"] === "resource_already_exists"
      ) {
        console.log(`Test store prices already exist for ${tier.key}`);
      } else {
        throw new Error(`Failed to add test store prices for ${tier.key}`);
      }
    } else {
      console.log(`Added test store price for ${tier.key}:`, JSON.stringify(priceData?.prices));
    }
  };

  // Build products for every tier across all three stores.
  const allProductIds: string[] = [];
  const tierProducts: { tier: Tier; testStoreProduct: Product; appStoreProduct: Product; playStoreProduct: Product }[] = [];

  for (const tier of TIERS) {
    const testStoreProduct = await ensureProductForApp(app, `Test Store ${tier.key}`, tier.storeIdentifier, tier, true);
    const appStoreProduct = await ensureProductForApp(appStoreApp, `App Store ${tier.key}`, tier.storeIdentifier, tier, false);
    const playStoreProduct = await ensureProductForApp(playStoreApp, `Play Store ${tier.key}`, tier.playStoreIdentifier, tier, false);

    await addTestStorePrices(testStoreProduct, tier);

    allProductIds.push(testStoreProduct.id, appStoreProduct.id, playStoreProduct.id);
    tierProducts.push({ tier, testStoreProduct, appStoreProduct, playStoreProduct });
  }

  // Single `pro` entitlement, attached to every product.
  let entitlement: Entitlement | undefined;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEntitlement = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);

  if (existingEntitlement) {
    console.log("Entitlement already exists:", existingEntitlement.id);
    entitlement = existingEntitlement;
  } else {
    const { data: newEntitlement, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: {
        lookup_key: ENTITLEMENT_IDENTIFIER,
        display_name: ENTITLEMENT_DISPLAY_NAME,
      },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", newEntitlement.id);
    entitlement = newEntitlement;
  }

  const { error: attachEntitlementError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: allProductIds },
  });

  if (attachEntitlementError) {
    if (attachEntitlementError.type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement");
    }
  } else {
    console.log("Attached products to entitlement");
  }

  // Single default offering containing weekly / monthly / annual packages.
  let offering: Offering | undefined;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);

  if (existingOffering) {
    console.log("Offering already exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: {
        lookup_key: OFFERING_IDENTIFIER,
        display_name: OFFERING_DISPLAY_NAME,
      },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOffering.id);
    offering = newOffering;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });

  if (listPackagesError) throw new Error("Failed to list packages");

  for (const { tier, testStoreProduct, appStoreProduct, playStoreProduct } of tierProducts) {
    let pkg: Package | undefined = existingPackages.items?.find((p) => p.lookup_key === tier.packageIdentifier);

    if (pkg) {
      console.log(`Package ${tier.packageIdentifier} already exists:`, pkg.id);
    } else {
      const { data: newPackage, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering.id },
        body: {
          lookup_key: tier.packageIdentifier,
          display_name: tier.packageDisplayName,
        },
      });
      if (error) throw new Error(`Failed to create package ${tier.packageIdentifier}`);
      console.log(`Created package ${tier.packageIdentifier}:`, newPackage.id);
      pkg = newPackage;
    }

    // The package may already hold legacy products (one per store). Only one
    // product per store can be attached, so detach anything that isn't one of
    // our intended products before attaching the new, correctly-priced set.
    const desiredProductIds = new Set([testStoreProduct.id, appStoreProduct.id, playStoreProduct.id]);
    const { data: currentPkgProducts } = await getProductsFromPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      query: { limit: 50 },
    });
    const staleProductIds = (currentPkgProducts?.items ?? [])
      .map((assoc) => (assoc as { product?: { id?: string } }).product?.id)
      .filter((id): id is string => !!id && !desiredProductIds.has(id));

    if (staleProductIds.length > 0) {
      const { error: detachError } = await detachProductsFromPackage({
        client,
        path: { project_id: project.id, package_id: pkg.id },
        body: { product_ids: staleProductIds },
      });
      if (detachError) {
        throw new Error(`Failed to detach legacy products from package ${tier.packageIdentifier}`);
      }
      console.log(`Detached ${staleProductIds.length} legacy product(s) from package ${tier.packageIdentifier}`);
    }

    const { error: attachPackageError } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: [
          { product_id: testStoreProduct.id, eligibility_criteria: "all" },
          { product_id: appStoreProduct.id, eligibility_criteria: "all" },
          { product_id: playStoreProduct.id, eligibility_criteria: "all" },
        ],
      },
    });

    if (attachPackageError) {
      if (
        attachPackageError.type === "unprocessable_entity_error" &&
        attachPackageError.message?.includes("Cannot attach product")
      ) {
        console.log(`Skipping package attach for ${tier.packageIdentifier}: already has incompatible product`);
      } else {
        throw new Error(`Failed to attach products to package ${tier.packageIdentifier}`);
      }
    } else {
      console.log(`Attached products to package ${tier.packageIdentifier}`);
    }
  }

  const { data: testStoreApiKeys, error: testStoreApiKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: app.id },
  });
  if (testStoreApiKeysError) {
    throw new Error("Failed to list public API keys for Test Store app");
  }
  const { data: appStoreApiKeys, error: appStoreApiKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });
  if (appStoreApiKeysError) {
    throw new Error("Failed to list public API keys for App Store app");
  }
  const { data: playStoreApiKeys, error: playStoreApiKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: playStoreApp.id },
  });
  if (playStoreApiKeysError) {
    throw new Error("Failed to list public API keys for Play Store app");
  }

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("REVENUECAT_PROJECT_ID:", project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID:", app.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID:", appStoreApp.id);
  console.log("REVENUECAT_GOOGLE_PLAY_STORE_APP_ID:", playStoreApp.id);
  console.log("Entitlement Identifier:", ENTITLEMENT_IDENTIFIER);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY:", testStoreApiKeys?.items.map((item) => item.key).join(", ") ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:", appStoreApiKeys?.items.map((item) => item.key).join(", ") ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:", playStoreApiKeys?.items.map((item) => item.key).join(", ") ?? "N/A");
  console.log("====================\n");
}

seedRevenueCat().catch(console.error);
