/**
 * Supplier recommendation engine (Bolanle's "Virtuoso curation" feature).
 *
 * The AI ranks real catalog rows (Virtuoso hotels/villas/yachts for a
 * destination) grounded in the member's memory, returns a 3-5 shortlist, and
 * the manager (Bolanle, admin) approves the top 3. The AI never invents
 * properties or rates: it selects and personalizes from the curated catalog.
 */
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb, buildClientMemoryContext } from "./db";
import {
  suppliers,
  supplierRoomRates,
  supplierAmenities,
  supplierRecommendationShortlists,
  supplierRecommendationItems,
} from "../drizzle/schema";
import { invokeLocalAi } from "./_core/localAi";

type CatalogEntry = {
  supplierId: number;
  name: string;
  propertyType: string | null;
  rating: number | null;
  city: string | null;
  roomTiers: { tier: string; from: string }[];
  amenities: string[];
};

export const supplierRecommendationsRouter = router({
  /** Generate an AI-curated shortlist of 3-5 Virtuoso properties for a member's destination. */
  recommendSuppliersForMember: protectedProcedure
    .input(
      z.object({
        memberId: z.number().int().positive(),
        destination: z.string().trim().min(1).max(128),
        propertyType: z
          .enum([
            "hotel",
            "villa",
            "yacht",
            "jet",
            "transfer",
            "experience",
            "other",
          ])
          .optional(),
        travelRequestId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // 1. Query the curated Virtuoso catalog for this destination.
      const conds = [
        eq(suppliers.isActive, true),
        eq(suppliers.isVirtuoso, true),
        eq(suppliers.city, input.destination),
      ];
      if (input.propertyType)
        conds.push(eq(suppliers.propertyType, input.propertyType));
      const candidates = await db
        .select()
        .from(suppliers)
        .where(and(...conds))
        .orderBy(desc(suppliers.rating))
        .limit(12);
      if (candidates.length === 0)
        throw new Error(
          `No Virtuoso suppliers found for ${input.destination}. Curate the catalog first.`,
        );

      const ids = candidates.map((c) => c.id);
      const rates = await db
        .select()
        .from(supplierRoomRates)
        .where(
          and(
            eq(supplierRoomRates.isActive, true),
            inArray(supplierRoomRates.supplierId, ids),
          ),
        );
      const amenities = await db
        .select()
        .from(supplierAmenities)
        .where(
          and(
            eq(supplierAmenities.isActive, true),
            inArray(supplierAmenities.supplierId, ids),
          ),
        );
      const ratesBy = new Map<number, typeof rates>();
      for (const r of rates) {
        const arr = ratesBy.get(r.supplierId) ?? [];
        arr.push(r);
        ratesBy.set(r.supplierId, arr);
      }
      const amenitiesBy = new Map<number, string[]>();
      for (const a of amenities) {
        const arr = amenitiesBy.get(a.supplierId) ?? [];
        arr.push(a.name);
        amenitiesBy.set(a.supplierId, arr);
      }

      // 2. Compact catalog description for the AI.
      const catalog: CatalogEntry[] = candidates.map((c) => {
        const cr = (ratesBy.get(c.id) ?? []).slice().sort(
          (a, b) => Number(a.startingRate) - Number(b.startingRate),
        );
        return {
          supplierId: c.id,
          name: c.name,
          propertyType: c.propertyType,
          rating: c.rating,
          city: c.city,
          roomTiers: cr.map((r) => ({ tier: r.roomTier, from: String(r.startingRate) })),
          amenities: amenitiesBy.get(c.id) ?? [],
        };
      });

      // 3. Ground in the member's memory (preferences, family, dates, history).
      const memberContext = await buildClientMemoryContext(input.memberId).catch(
        () => "",
      );

      // 4. Ask the AI to rank from the real catalog. Fallback to rating-rank if
      // the gateway is unavailable so the demo still works without Ollama.
      type Rec = {
        supplierId: number;
        rank: number;
        rationale: string;
        roomTier?: string;
        estimatedStartingRate?: string;
      };
      let ranked: Rec[];
      try {
        const result = await invokeLocalAi({
          capability: "intelligence",
          responseFormat: "json",
          system:
            "You are a luxury travel concierge. Rank Virtuoso properties for this member's trip. " +
            "Select 3 to 5 from the supplied catalog only; never invent properties or rates. " +
            "Return JSON {recommendations:[{supplierId:number, rank:number, rationale:string, roomTier:string, estimatedStartingRate:string}], missing_data:[string]}. " +
            "supplierId must be one of the supplied catalog ids.",
          prompt: JSON.stringify({
            member_context: memberContext,
            destination: input.destination,
            catalog,
          }),
          temperature: 0.2,
          maxTokens: 1_200,
          metadata: { feature: "supplier_recommendations", memberId: input.memberId },
        });
        const raw = Array.isArray(result.structured?.recommendations)
          ? result.structured.recommendations
          : [];
        ranked = raw
          .map((r) => r as Record<string, unknown>)
          .filter(
            (r) =>
              typeof r.supplierId === "number" && ids.includes(r.supplierId as number),
          )
          .map((r) => ({
            supplierId: r.supplierId as number,
            rank: Number(r.rank ?? 99),
            rationale: typeof r.rationale === "string" ? r.rationale : "",
            roomTier: typeof r.roomTier === "string" ? r.roomTier : undefined,
            estimatedStartingRate:
              typeof r.estimatedStartingRate === "string"
                ? r.estimatedStartingRate
                : undefined,
          }))
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 5);
      } catch {
        ranked = candidates.slice(0, 5).map((c, i) => ({
          supplierId: c.id,
          rank: i + 1,
          rationale:
            "Top-rated Virtuoso property (AI gateway unavailable, ranked by rating).",
        }));
      }

      // 5. Persist the shortlist + items.
      const [shortlist] = await db
        .insert(supplierRecommendationShortlists)
        .values({
          memberId: input.memberId,
          destination: input.destination,
          travelRequestId: input.travelRequestId ?? null,
          status: "presented",
          generatedByUserId: ctx.user.id,
          context: memberContext || null,
        })
        .returning({ id: supplierRecommendationShortlists.id });
      if (!shortlist) throw new Error("Could not persist recommendation shortlist");

      const itemsToInsert = ranked.map((r) => ({
        shortlistId: shortlist.id,
        supplierId: r.supplierId,
        rank: r.rank,
        roomTier: r.roomTier ?? null,
        startingRate: r.estimatedStartingRate ?? null,
        currency: "GBP",
        rationale: r.rationale || null,
        selected: false,
      }));
      if (itemsToInsert.length)
        await db.insert(supplierRecommendationItems).values(itemsToInsert);

      // 6. Return items joined to their catalog entry for the UI.
      const catalogMap = new Map(catalog.map((c) => [c.supplierId, c]));
      const items = ranked.map((r) => ({
        supplierId: r.supplierId,
        rank: r.rank,
        rationale: r.rationale,
        roomTier: r.roomTier ?? null,
        estimatedStartingRate: r.estimatedStartingRate ?? null,
        supplier: catalogMap.get(r.supplierId) ?? null,
      }));
      return { shortlistId: shortlist.id, destination: input.destination, items };
    }),

  /** Fetch a shortlist with its items + supplier details. */
  getShortlist: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [shortlist] = await db
        .select()
        .from(supplierRecommendationShortlists)
        .where(eq(supplierRecommendationShortlists.id, input.id))
        .limit(1);
      if (!shortlist) return null;
      const items = await db
        .select()
        .from(supplierRecommendationItems)
        .where(eq(supplierRecommendationItems.shortlistId, input.id))
        .orderBy(supplierRecommendationItems.rank);
      return { ...shortlist, items };
    }),

  /** Manager (Bolanle) approves the top 3 (or up to 5) from a shortlist. */
  selectTopRecommendations: protectedProcedure
    .input(
      z.object({
        shortlistId: z.number().int().positive(),
        supplierIds: z.array(z.number().int().positive()).min(1).max(5),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(supplierRecommendationItems)
        .set({ selected: false })
        .where(eq(supplierRecommendationItems.shortlistId, input.shortlistId));
      await db
        .update(supplierRecommendationItems)
        .set({ selected: true })
        .where(
          and(
            eq(supplierRecommendationItems.shortlistId, input.shortlistId),
            inArray(supplierRecommendationItems.supplierId, input.supplierIds),
          ),
        );
      await db
        .update(supplierRecommendationShortlists)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(supplierRecommendationShortlists.id, input.shortlistId));
      return {
        shortlistId: input.shortlistId,
        selectedSupplierIds: input.supplierIds,
      };
    }),

  /** List a member's shortlists. */
  listForMember: protectedProcedure
    .input(z.object({ memberId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(supplierRecommendationShortlists)
        .where(eq(supplierRecommendationShortlists.memberId, input.memberId))
        .orderBy(desc(supplierRecommendationShortlists.createdAt));
    }),
});
