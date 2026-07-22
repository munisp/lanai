import { and, eq } from "drizzle-orm";
import { advisorTasks, taskTemplates } from "../../drizzle/schema";
import { getDb } from "../db";

export type BookingLifecycleStatus =
  "pending" | "confirmed" | "paid" | "cancelled" | "refunded";

export async function instantiateBookingStageTasks(input: {
  bookingId: number;
  memberId: number;
  assignedToUserId: number;
  createdByUserId: number;
  travelRequestId?: number | null;
  status: BookingLifecycleStatus;
}): Promise<{ createdTaskIds: number[]; skippedTemplateIds: number[] }> {
  const db = await getDb();
  const templates = await db
    .select()
    .from(taskTemplates)
    .where(
      and(
        eq(taskTemplates.isActive, true),
        eq(taskTemplates.triggerOnBookingStatus, input.status),
      ),
    );

  const createdTaskIds: number[] = [];
  const skippedTemplateIds: number[] = [];
  for (const template of templates) {
    const automationKey = `booking:${input.bookingId}:template:${template.id}:status:${input.status}`;
    const dueDate = new Date();
    dueDate.setDate(
      dueDate.getDate() + (template.defaultDueDaysFromTrigger ?? 1),
    );
    const checklist = Array.isArray(template.checklistItems)
      ? template.checklistItems
          .map((item) => {
            if (!item || typeof item !== "object" || !("item" in item))
              return null;
            const label = String(item.item ?? "").trim();
            if (!label) return null;
            const required =
              "required" in item && Boolean(item.required)
                ? "required"
                : "optional";
            return `• [ ] ${label} (${required})`;
          })
          .filter(Boolean)
          .join("\n")
      : "";
    const [created] = await db
      .insert(advisorTasks)
      .values({
        assignedToUserId: input.assignedToUserId,
        createdByUserId: input.createdByUserId,
        memberId: input.memberId,
        travelRequestId: input.travelRequestId ?? null,
        bookingId: input.bookingId,
        taskTemplateId: template.id,
        automationKey,
        title: template.name,
        description: [
          template.description,
          `Automated when booking entered ${input.status}.`,
          checklist,
        ]
          .filter(Boolean)
          .join("\n\n"),
        status: "open",
        priority: template.defaultPriority,
        dueDate,
      })
      .onConflictDoNothing({ target: advisorTasks.automationKey })
      .returning({ id: advisorTasks.id });
    if (created) createdTaskIds.push(created.id);
    else skippedTemplateIds.push(template.id);
  }

  return { createdTaskIds, skippedTemplateIds };
}
